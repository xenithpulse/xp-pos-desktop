// lib/licensing/paths.ts
//
// Where licensing keeps its state on an appliance.
//
// The data root is NOT redefined here. lib/updates/paths.ts already answers
// "where may this box write", and it carries a long comment about why every
// path in it is a literal constant rather than something derived from
// process.cwd() - a path built that way made Next's file tracer copy the whole
// repository into the app bundle and tripled the installer. Licensing reuses
// that answer instead of arriving at its own, for the same reason it reuses the
// siteId: two subsystems that disagree about where the box keeps its state is a
// support incident waiting to happen.

import path from "path";
import { promises as fs } from "fs";
import { dataRoot } from "@/lib/updates/paths";

export { dataRoot };

/**
 * The licence itself. Named by the phase brief, and deliberately at the top of
 * the data root rather than in a subdirectory: a technician on the phone has to
 * be able to say "drop this file in C:\ProgramData\XP POS".
 *
 * The installer never touches C:\ProgramData\XP POS, so this survives an
 * upgrade. That is the whole reason it lives here.
 */
export function licensePath(): string {
  return path.join(dataRoot(), "license.dat");
}

/**
 * Trial and enforcement state: when the trial began, the highest timestamp this
 * box has ever seen, and what happened the last time a licence validated.
 *
 * Kept SEPARATE from license.dat. license.dat is issued by XenithPulse and is
 * never rewritten by the box; this file is written by the box and never by us.
 * One writer per file means a corrupt licence cannot be blamed on our own
 * bookkeeping, and a technician can delete this file to re-derive trial state
 * from the registry and the database without destroying a paid licence.
 */
export function licenseStatePath(): string {
  return path.join(dataRoot(), "license-state.json");
}

/** Create the data root if it is missing. Safe to call repeatedly. */
export async function ensureDataRoot(): Promise<string> {
  const dir = dataRoot();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
