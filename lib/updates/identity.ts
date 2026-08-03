// lib/updates/identity.ts
//
// The site's identity: who this box is, and what it is running.
//
// This is deliberately NOT specific to updates. Phase 11 (licensing) needs the
// same answer — "which installation am I talking to" — and building a second,
// parallel identity scheme there would mean a box could be one site to the
// update channel and a different one to the licence server. One siteId, one
// place it is stored.
//
// What identity is made of, and why:
//
//   siteId      A random value generated ONCE and persisted under ProgramData.
//               It survives upgrades (Program Files is replaced, ProgramData is
//               not) and it survives a motherboard swap. This is the identifier
//               that means "this restaurant's install".
//
//   machineId   Windows' MachineGuid. Stable across reinstalls of the POS,
//               changes when the OS is reimaged. Best-effort and may be null.
//               Useful to licensing as a "has this moved to another machine?"
//               signal; it is NOT the primary key, because reimaging a box is a
//               support event, not a new customer.
//
// Nothing here is sent anywhere by itself. The update check is a plain GET of a
// static manifest and carries no identity at all — see manifest.ts.

import os from "os";
import path from "path";
import { promises as fs } from "fs";
import { randomBytes } from "crypto";
import { execFile } from "child_process";
import { dataRoot, siteIdPath } from "./paths";

export interface SiteIdentity {
  siteId: string;
  machineId: string | null;
  hostname: string;
  appVersion: string;
}

interface SiteIdFile {
  siteId: string;
  createdAt: string;
}

let cached: SiteIdentity | null = null;

/**
 * The installed app version.
 *
 * Baked in at build time by next.config.ts from package.json, so it is exactly
 * the version the installer shipped and cannot drift from it. This deliberately
 * does NOT read package.json at runtime: that means an fs call on a path built
 * from process.cwd(), which makes Next's file tracer copy the whole repo into
 * the bundle. See the note at the top of paths.ts — it cost 1 GB once already.
 *
 * "0.0.0" only appears if the build did not set it, and it is safe: every real
 * release compares greater, so the box is offered an update rather than being
 * silently stuck.
 */
function readAppVersion(): string {
  const version = process.env.POS_APP_VERSION;
  return typeof version === "string" && version ? version : "0.0.0";
}

/**
 * Windows MachineGuid, read straight out of the registry.
 *
 * reg.exe is used rather than a native module: the appliance bundles a plain
 * node.exe and adding a native dependency for one string would have to survive
 * every future Node major. Fails soft — on a non-Windows dev machine, or a box
 * where the key is locked down, identity simply has no machineId.
 */
function readMachineGuid(): Promise<string | null> {
  if (process.platform !== "win32") return Promise.resolve(null);

  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      { timeout: 5000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null);
        const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(stdout);
        resolve(m ? m[1].toLowerCase() : null);
      }
    );
  });
}

/**
 * Load the persisted siteId, generating and writing one on first call.
 *
 * POS_SITE_ID in .env wins when present, so an operator can pin a site to a
 * known identifier (re-installing a box for a customer who already has a
 * licence, for example) without editing a JSON file.
 *
 * A write failure is not fatal. The box keeps working with an ephemeral id
 * rather than refusing to run because it could not create a file.
 */
async function loadSiteId(): Promise<string> {
  const fromEnv = process.env.POS_SITE_ID?.trim();
  if (fromEnv) return fromEnv;

  const file = siteIdPath();
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8")) as SiteIdFile;
    if (typeof parsed.siteId === "string" && parsed.siteId.length >= 16) {
      return parsed.siteId;
    }
  } catch {
    // Missing or corrupt — fall through and write a fresh one.
  }

  const siteId = randomBytes(16).toString("hex");
  try {
    await fs.mkdir(dataRoot(), { recursive: true });
    await fs.writeFile(
      file,
      JSON.stringify({ siteId, createdAt: new Date().toISOString() } satisfies SiteIdFile, null, 2),
      "utf8"
    );
  } catch {
    // Read-only or missing data root (a dev workstation). The id is still
    // usable for this process; it just will not be the same one next boot.
  }
  return siteId;
}

/** Resolve the site identity once per process. */
export async function getSiteIdentity(): Promise<SiteIdentity> {
  if (cached) return cached;
  const [siteId, machineId] = await Promise.all([loadSiteId(), readMachineGuid()]);
  cached = {
    siteId,
    machineId,
    hostname: os.hostname(),
    appVersion: readAppVersion(),
  };
  return cached;
}

/** The installed version on its own — the common case for the update check. */
export async function getInstalledVersion(): Promise<string> {
  return readAppVersion();
}
