// lib/updates/paths.ts
//
// Where the update agent is allowed to keep state on an appliance.
//
// Everything here resolves under the ProgramData root, never under
// "C:\Program Files\XP POS": that tree is ACL-restricted and an installer
// upgrade replaces it wholesale, so an update marker written there would be
// deleted by the very upgrade it is meant to survive.

import os from "os";
import path from "path";
import { promises as fs } from "fs";

// ── NOTHING HERE MAY DERIVE A PATH FROM process.cwd() ────────────────────────
//
// Next's file tracer decides which files each route needs by statically
// evaluating the code, and it CAN evaluate process.cwd() at build time. A path
// built from it, then handed to fs, makes the tracer conclude the route might
// read anything under the repo root — so it copies the repo into
// .next/standalone.
//
// Measured: an earlier version of this file used path.join(process.cwd(), …)
// and path.resolve(process.cwd(), "..") as its fallbacks. The installer payload
// went from 438 MB to 1,483 MB, because installer\payload and the previous
// installer\dist\*.exe were traced into the app bundle — every build packaging
// the output of the build before it.
//
// So the fallbacks below are literal constants. The real values arrive as
// environment variables, which the appliance already has a mechanism for:
// POS_DATA_DIR from the site's .env, and POS_INSTALL_DIR set from %BASE% in
// XPPOS-App.xml so it is exact even when the operator changed the install
// directory in the wizard. build.ps1 asserts the payload afterwards.

const DEFAULT_DATA_ROOT = "C:\\ProgramData\\XP POS";
const DEFAULT_INSTALL_DIR = "C:\\Program Files\\XP POS";

/**
 * The appliance data root (C:\ProgramData\XP POS on a native install).
 *
 * POS_DATA_DIR is the explicit setting, but it is NOT guaranteed to be present:
 * provision.ps1 never overwrites an existing .env, so a site that installed
 * before this variable existed has an .env without it until the key-merge step
 * in provisioning adds it. Deriving from UPLOAD_DIR is the fallback that works
 * on an upgraded box — UPLOAD_DIR has pointed at "<data root>/uploads" since
 * the native migration.
 *
 * On a developer workstation with neither set, this lands in the temp
 * directory. That is deliberate: `next dev` has no appliance data root, the
 * agent is disabled there anyway (no POS_UPDATE_URL), and it must not be the
 * repo — see the note above.
 */
export function dataRoot(): string {
  const explicit = process.env.POS_DATA_DIR;
  if (explicit) return path.normalize(explicit);

  const uploads = process.env.UPLOAD_DIR;
  if (uploads) return path.dirname(path.normalize(uploads));

  if (process.platform === "win32") return DEFAULT_DATA_ROOT;
  return path.join(os.tmpdir(), "xp-pos-appliance");
}

/** Directory holding update state and downloaded payloads. */
export function updatesDir(): string {
  return path.join(dataRoot(), "updates");
}

/** Persisted agent state (last check, what is available, last error). */
export function statePath(): string {
  return path.join(updatesDir(), "state.json");
}

/**
 * Written immediately before an installer is launched and removed once it
 * returns. Its presence at startup means the previous install attempt did not
 * finish — a power cut during an update is exactly this case, and it is the
 * only way the box can tell the difference afterwards.
 */
export function installMarkerPath(): string {
  return path.join(updatesDir(), "install-in-progress.json");
}

/**
 * Written by scripts\apply-update.ps1 when the installer returns.
 *
 * The app process is killed by its own installer, so it cannot observe the exit
 * code itself. This file is how the outcome gets back: the script owns it, the
 * app reads it once on the next startup and deletes it. Keeping it separate
 * from state.json avoids two writers on one file.
 */
export function installResultPath(): string {
  return path.join(updatesDir(), "install-result.json");
}

/** Stable per-site identifier, used here and by licence activation later. */
export function siteIdPath(): string {
  return path.join(dataRoot(), "site-id.json");
}

/** Service log root (C:\ProgramData\XP POS\logs). */
export function logsDir(): string {
  return path.join(dataRoot(), "logs");
}

/**
 * Program files root, needed to invoke scripts\apply-update.ps1.
 *
 * POS_INSTALL_DIR is set by XPPOS-App.xml from WinSW's %BASE%, so it is the
 * real install directory even when the operator chose a different one in the
 * wizard. The constant is only a last resort for a box provisioned before that
 * setting existed, and it is the installer's own default.
 */
export function installDir(): string {
  const explicit = process.env.POS_INSTALL_DIR;
  if (explicit) return path.normalize(explicit);
  return DEFAULT_INSTALL_DIR;
}

/** Create the updates directory if it is missing. Safe to call repeatedly. */
export async function ensureUpdatesDir(): Promise<string> {
  const dir = updatesDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
