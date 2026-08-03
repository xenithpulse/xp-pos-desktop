// lib/licensing/registry.ts
//
// The second place trial state lives.
//
// The point of this file is that deleting C:\ProgramData\XP POS must not hand
// somebody a fresh 30-day trial. The registry key is outside the install tree,
// outside the data root, and - importantly - is NOT created by setup.iss, so
// Inno Setup's uninstaller never removes it. provision.ps1 writes it, this
// module maintains it, and an uninstall/reinstall cycle finds the original
// trial start still sitting there.
//
// HKLM\SOFTWARE\XenithPulse\XP POS, and reg.exe rather than a native module for
// the same reason lib/updates/identity.ts uses reg.exe: the appliance bundles a
// plain node.exe, and one string is not worth a native dependency that has to
// survive every future Node major.
//
// The app service runs as LocalSystem, so it can write here. Everything fails
// soft: a box where the key cannot be written still has the file and the
// database to fall back on, and it still runs.

import { execFile } from "child_process";

const KEY_PATH = "HKLM\\SOFTWARE\\XenithPulse\\XP POS";
const TIMEOUT_MS = 5000;

/** Values kept here. Names are stable - a rename resets trials in the field. */
export type RegistryValue = "TrialStartedAt" | "HighWaterAt" | "LicenseSerial";

function run(args: string[]): Promise<{ ok: boolean; stdout: string }> {
  if (process.platform !== "win32") return Promise.resolve({ ok: false, stdout: "" });
  return new Promise((resolve) => {
    execFile("reg.exe", args, { timeout: TIMEOUT_MS, windowsHide: true }, (err, stdout) => {
      resolve({ ok: !err, stdout: stdout ?? "" });
    });
  });
}

export async function readRegistryValue(name: RegistryValue): Promise<string | null> {
  const { ok, stdout } = await run(["query", KEY_PATH, "/v", name]);
  if (!ok) return null;
  // reg.exe prints:  <name>    REG_SZ    <value>
  const m = new RegExp(`${name}\\s+REG_SZ\\s+(.+)`, "i").exec(stdout);
  const value = m?.[1]?.trim();
  return value ? value : null;
}

/**
 * Write a value, creating the key if needed.
 *
 * Returns false rather than throwing. A managed box can have HKLM locked down
 * by group policy, and "the registry backstop is unavailable" is a reason to
 * lean on the other two sources, not a reason to stop the POS.
 */
export async function writeRegistryValue(name: RegistryValue, value: string): Promise<boolean> {
  const { ok } = await run(["add", KEY_PATH, "/v", name, "/t", "REG_SZ", "/d", value, "/f"]);
  return ok;
}
