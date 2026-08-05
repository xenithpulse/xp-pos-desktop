// lib/net/localName.ts
//
// One fixed address for the machine the POS is installed on:
//
//     http://pos.xenithpulse.local:<port>
//
// ── WHY A HOSTS ENTRY AND NOT DNS ────────────────────────────────────────────
// The owner should never have to find out what their own IP is. Every other
// answer to that makes it somebody's job to keep a record up to date:
//
//   A per-site public DNS record   needs XenithPulse to run a registration
//                                  service, needs the site to have internet,
//                                  and needs onboarding per customer. That is
//                                  hardcoding something for every client.
//   A DNS server on the box        makes the POS a single point of failure for
//                                  the whole network's browsing, and needs
//                                  every router's DHCP reconfigured.
//   mDNS                           already here, and genuinely useful - but it
//                                  is link-local, so it is a bonus rather than
//                                  a guarantee. See mdns.ts.
//
// A line in the hosts file needs none of that. It is local to this machine, it
// cannot be moved by DHCP, it works with the network cable unplugged, it works
// before the network comes up at boot, and it never needs updating - which is
// exactly the property the IP does not have.
//
// ── WHY IT POINTS AT LOOPBACK ────────────────────────────────────────────────
// 127.0.0.1, not the LAN IP, and deliberately. Caddy binds :<port> on every
// interface, loopback included, so the POS answers there. Pointing this at the
// LAN address instead would put us back in the business of rewriting it every
// time DHCP moves - the exact problem this exists to end.
//
// ── THE SCOPE, STATED HONESTLY ───────────────────────────────────────────────
// This name works on THIS COMPUTER. It is not, and cannot be, the address for
// staff tablets: nothing on another device reads this file. Other devices get
// the address by scanning the QR code on Server Management -> Connect Devices,
// which carries the live IP and port. Anything in the UI that implies otherwise
// is a bug.

import { promises as fs } from "fs";
import path from "path";
import { execFile } from "child_process";

/** The name this machine answers to locally. Kept in step with the mDNS
 *  responder in lib/net/mdns.ts and with installer/scripts/connect-card.ps1. */
export const LOCAL_NAME = "pos.xenithpulse.local";

// The block is fenced so it can be found, replaced and removed without touching
// anything else in a file that other software also writes to. Never edit a
// hosts file by rewriting it wholesale.
const BEGIN = "# >>> XP POS (managed - do not edit this block) >>>";
const END = "# <<< XP POS (managed) <<<";

function hostsPath(): string {
  const root = process.env.SystemRoot || process.env.windir || "C:\\Windows";
  return path.join(root, "System32", "drivers", "etc", "hosts");
}

/** The block as it should appear. CRLF because every other line in this file
 *  has it and mixed endings confuse some parsers that read it. */
function managedBlock(): string {
  return [BEGIN, `127.0.0.1\t${LOCAL_NAME}`, END].join("\r\n");
}

/**
 * Strip any previously written block, leaving the rest of the file untouched.
 *
 * Tolerant of a missing END marker: an interrupted write, or somebody deleting
 * half the block by hand, must not leave an orphaned fragment that accumulates
 * a duplicate entry on every boot.
 */
function withoutManagedBlock(content: string): string {
  const start = content.indexOf(BEGIN);
  if (start === -1) return content;

  const endIdx = content.indexOf(END, start);
  const cut = endIdx === -1 ? content.length : endIdx + END.length;
  return (content.slice(0, start) + content.slice(cut)).replace(/(\r?\n){3,}/g, "\r\n\r\n");
}

export interface LocalNameResult {
  ok: boolean;
  /** True when the file was actually written. False when it was already right. */
  changed: boolean;
  name: string;
  reason?: string;
}

/**
 * Make sure the hosts entry is present and correct.
 *
 * Called at install time by provision.ps1 and again on every app start, so a
 * hosts file cleaned up by an antivirus product, or a machine that was imaged
 * from another, repairs itself without a site visit.
 *
 * Fails soft in every case. A POS that will not start is worse than a POS
 * without a convenience alias, and this legitimately cannot work on a developer
 * workstation where the app is not running elevated.
 */
export async function ensureLocalName(): Promise<LocalNameResult> {
  const result: LocalNameResult = { ok: false, changed: false, name: LOCAL_NAME };

  if (process.platform !== "win32") {
    return { ...result, reason: "Not Windows." };
  }

  const file = hostsPath();
  let current = "";
  try {
    current = await fs.readFile(file, "utf8");
  } catch (err) {
    // A missing hosts file is legal - Windows recreates it. Treat it as empty
    // rather than refusing to act.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      return { ...result, reason: `Could not read the hosts file: ${String(code ?? err)}` };
    }
  }

  const rest = withoutManagedBlock(current);
  const desired = `${rest.replace(/\s+$/, "")}\r\n\r\n${managedBlock()}\r\n`;

  // Only write when something is actually wrong. This runs on every boot, and a
  // needless write to the hosts file is exactly the sort of thing that makes an
  // antivirus product take an interest in the process doing it.
  if (current === desired) {
    return { ok: true, changed: false, name: LOCAL_NAME };
  }

  try {
    await fs.writeFile(file, desired, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    return {
      ...result,
      reason:
        code === "EACCES" || code === "EPERM"
          ? "The hosts file is not writable. The installed POS runs as LocalSystem and can write it; a development instance cannot."
          : `Could not write the hosts file: ${String(code ?? err)}`,
    };
  }

  // The DNS Client caches negative answers, so a name that was looked up before
  // this ran stays broken until the cache is dropped. Best-effort: the entry is
  // correct either way, and the cache expires on its own.
  await flushDnsCache();

  console.log(`[localname] ${LOCAL_NAME} -> 127.0.0.1`);
  return { ok: true, changed: true, name: LOCAL_NAME };
}

function flushDnsCache(): Promise<void> {
  return new Promise((resolve) => {
    execFile("ipconfig.exe", ["/flushdns"], { timeout: 5000, windowsHide: true }, () => resolve());
  });
}

/** Whether the entry is currently in place, for diagnostics. Reads only. */
export async function isLocalNameInstalled(): Promise<boolean> {
  if (process.platform !== "win32") return false;
  try {
    const content = await fs.readFile(hostsPath(), "utf8");
    return content.includes(BEGIN) && content.includes(LOCAL_NAME);
  } catch {
    return false;
  }
}
