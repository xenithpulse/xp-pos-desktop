// lib/entitlements/paths.ts
//
// Where the entitlement agent keeps state on an appliance.
//
// Reuses dataRoot() from lib/updates/paths.ts rather than deriving a second
// copy of it — same reasoning as identity.ts sharing one siteId: one root,
// one place every subsystem's state lives under ProgramData.

import path from "path";
import { promises as fs } from "fs";
import { dataRoot } from "../updates/paths";

/** Directory holding entitlement agent state. */
export function entitlementsDir(): string {
  return path.join(dataRoot(), "entitlements");
}

/** Persisted agent state (last check, cached whatsapp entitlement). */
export function statePath(): string {
  return path.join(entitlementsDir(), "state.json");
}

/** Create the entitlements directory if it is missing. Safe to call repeatedly. */
export async function ensureEntitlementsDir(): Promise<string> {
  const dir = entitlementsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}
