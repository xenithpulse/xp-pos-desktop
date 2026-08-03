// lib/licensing/fingerprint.ts
//
// "Which machine is this?", answered from several weak signals rather than one
// strong one.
//
// ── The failure this design exists to avoid ─────────────────────────────────
//
// Binding a licence to a disk serial is the obvious implementation and it is
// wrong: disks fail, get replaced, and a routine Saturday-morning repair then
// presents as a paying restaurant locked out of its own till. The same goes for
// a MAC address, which changes the moment somebody plugs the box into a
// docking station or a USB network adapter.
//
// So four signals are collected and only THREE have to still agree. That
// tolerates a replaced disk, a new dock, a swapped NIC or a BIOS update,
// without tolerating a licence file copied wholesale to a second restaurant -
// which would have to coincide on three of four independent values.
//
//   machine  Windows MachineGuid. Survives hardware changes; resets when the OS
//            is reimaged. The most stable of the four, and the same value
//            lib/updates/identity.ts already reads.
//   board    Motherboard serial. Survives an OS reinstall; changes when the
//            board is replaced, which is effectively a new machine.
//   cpu      ProcessorId. Same lifetime as the board in practice.
//   net      Primary physical NIC MAC. The weakest, and it is in the set
//            precisely because it is allowed to be the one that disagrees.
//
// Only a 4-byte digest of each signal is ever stored or transmitted. The
// licence carries digests, not serial numbers: a machine code read out over the
// phone should not be a hardware inventory of the customer's box.

import { createHash } from "crypto";
import { runPowerShellJson } from "@/lib/win/powershell";
import {
  BINDING_BYTES,
  DIGEST_BYTES,
  SIGNAL_SLOTS,
  encodeMachineCode,
  type SignalSlot,
} from "./format";

/**
 * Values a BIOS reports when the vendor never filled the field in.
 *
 * These appear on a genuinely large share of small-form-factor boxes, which is
 * the hardware a restaurant actually buys. Treating "To be filled by O.E.M." as
 * a serial number would bind every such machine to the same fingerprint - one
 * licence would then validate on all of them, which is precisely the leak this
 * module exists to close. A signal that reads like this is recorded as ABSENT.
 */
const JUNK_VALUES = new Set([
  "",
  "0",
  "00000000",
  "none",
  "n/a",
  "na",
  "null",
  "default string",
  "to be filled by o.e.m.",
  "to be filled by oem",
  "system serial number",
  "chassis serial number",
  "base board serial number",
  "not specified",
  "not applicable",
  "not available",
  "unknown",
  "invalid",
  "filled by oem",
  "oem",
  "xxxxxxx",
  "123456789",
  "00000000-0000-0000-0000-000000000000",
  "ffffffffffffffff",
  "0000000000000000",
]);

const SIGNAL_TIMEOUT_MS = 30_000;

export interface Fingerprint {
  /** The 16 bytes carried in a machine code and in a licence. */
  binding: Buffer;
  /** Which slots produced a usable value, for diagnostics. */
  present: SignalSlot[];
  /** The grouped code shown on the POS and read to XenithPulse. */
  machineCode: string;
}

interface RawSignals {
  machine?: unknown;
  board?: unknown;
  cpu?: unknown;
  net?: unknown;
}

/**
 * One PowerShell round trip for all four values.
 *
 * A single call rather than four: each PowerShell launch costs a second or so
 * on the low-end hardware these boxes are, and this runs on the path a request
 * can wait on the first time it is needed.
 *
 * Every lookup is individually tolerant of failure. A locked-down box where CIM
 * is unavailable should produce three signals and a licence that still works,
 * not an exception.
 */
const SIGNAL_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$machine = ''
$board   = ''
$cpu     = ''
$net     = ''

try { $machine = (Get-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid).MachineGuid } catch { }
try { $board   = (Get-CimInstance -ClassName Win32_BaseBoard | Select-Object -First 1).SerialNumber } catch { }
try { $cpu     = (Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1).ProcessorId } catch { }
try {
  # Physical adapters only, PCI-attached first. Hyper-V, WSL, VPN and Bluetooth
  # adapters all report a MAC and all come and go; preferring a PCI device and
  # then the lowest DeviceID lands on the onboard NIC on every box tested.
  $adapters = Get-CimInstance -ClassName Win32_NetworkAdapter -Filter 'PhysicalAdapter = true' |
    Where-Object { $_.MACAddress } |
    Sort-Object -Property @{ Expression = { if ($_.PNPDeviceID -like 'PCI\\*') { 0 } else { 1 } } },
                          @{ Expression = { [int]$_.DeviceID } }
  if ($adapters) { $net = @($adapters)[0].MACAddress }
} catch { }

[pscustomobject]@{ machine = "$machine"; board = "$board"; cpu = "$cpu"; net = "$net" } | ConvertTo-Json -Compress
`.trim();

function normalise(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (JUNK_VALUES.has(trimmed)) return null;
  // A value that is one repeated character carries no information whatever it
  // claims to be: "0000000", "FFFFFFFF", "........" are all the same non-answer.
  const compact = trimmed.replace(/[\s\-:._]/g, "");
  if (compact.length < 4) return null;
  if (/^(.)\1*$/.test(compact)) return null;
  return compact;
}

/** 4 bytes of sha256 over a slot-tagged value. Zero bytes mean "absent". */
function digest(slot: SignalSlot, value: string | null): Buffer {
  if (value === null) return Buffer.alloc(DIGEST_BYTES);
  return createHash("sha256")
    .update(`xppos-fp-v1|${slot}|${value}`)
    .digest()
    .subarray(0, DIGEST_BYTES);
}

let cached: Fingerprint | null = null;
let inFlight: Promise<Fingerprint> | null = null;

async function compute(): Promise<Fingerprint> {
  const raw =
    process.platform === "win32"
      ? await runPowerShellJson<RawSignals>(SIGNAL_SCRIPT, SIGNAL_TIMEOUT_MS)
      : null;

  const parts: Buffer[] = [];
  const present: SignalSlot[] = [];
  for (const slot of SIGNAL_SLOTS) {
    const value = normalise(raw ? raw[slot] : null);
    if (value !== null) present.push(slot);
    parts.push(digest(slot, value));
  }

  const binding = Buffer.concat(parts, BINDING_BYTES);
  return { binding, present, machineCode: encodeMachineCode(binding) };
}

/**
 * The fingerprint of this machine, computed once per process.
 *
 * A FAILED read is deliberately not cached. Hardware does not change while the
 * POS is running, so one successful answer is good for the life of the process
 * - but a transient CIM failure caching itself for a month would restrict a
 * paying customer until somebody restarted the service.
 */
export async function getFingerprint(): Promise<Fingerprint> {
  if (cached) return cached;
  if (inFlight) return inFlight;
  inFlight = compute()
    .then((fp) => {
      // Zero usable signals is not an answer, it is a failed read - see
      // status.ts, which refuses to restrict a licensed box on that basis.
      if (fp.present.length > 0) cached = fp;
      return fp;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export interface BindingMatch {
  matched: number;
  required: number;
  /** Slots this box can read at all right now. */
  available: number;
  ok: boolean;
}

/**
 * Compare a licence's binding against this machine.
 *
 * `required` scales with how many signals the ISSUING machine could read, so a
 * box that only ever had three usable signals is not held to a four-signal
 * standard it can never meet:
 *
 *   4 signals issued -> 3 must still match (one may change)
 *   3 signals issued -> 2 must still match
 *   2 signals issued -> 2 must still match (no tolerance; the issuing tool
 *                       refuses to issue against fewer than three, so this
 *                       only arises for a licence issued before that rule)
 */
function requiredMatches(issued: number): number {
  if (issued >= 4) return 3; // one signal may change
  if (issued === 3) return 2; // one signal may change
  return 2; // two or fewer: no tolerance, and one is unsatisfiable by design
}

export function compareBinding(licenceBinding: Buffer, current: Buffer): BindingMatch {
  const zero = Buffer.alloc(DIGEST_BYTES);
  let matched = 0;
  let issued = 0;
  let available = 0;

  for (let i = 0; i < SIGNAL_SLOTS.length; i++) {
    const a = licenceBinding.subarray(i * DIGEST_BYTES, (i + 1) * DIGEST_BYTES);
    const b = current.subarray(i * DIGEST_BYTES, (i + 1) * DIGEST_BYTES);
    const aPresent = !a.equals(zero);
    const bPresent = !b.equals(zero);
    if (aPresent) issued++;
    if (bPresent) available++;
    // An absent signal never matches an absent signal. Two boxes that both
    // fail to report a motherboard serial have not thereby proved they are the
    // same box.
    if (aPresent && bPresent && a.equals(b)) matched++;
  }

  return { matched, required: requiredMatches(issued), available, ok: matched >= requiredMatches(issued) };
}

/** Reset the cache. Test and diagnostics use only. */
export function resetFingerprintCache(): void {
  cached = null;
}
