// lib/entitlements/state.ts
//
// Persisted entitlement-agent state.
//
// Same reasoning as lib/updates/state.ts: lives on disk, not MongoDB, so it
// can still be read when the database is down, and survives the app process
// being killed mid-write. Atomic writes (temp file + rename) for the same
// reason — a power cut must not leave truncated JSON behind.

import { promises as fs } from "fs";
import path from "path";
import { ensureEntitlementsDir, statePath } from "./paths";

export interface WhatsAppEntitlement {
  active: boolean;
  /** When this value was last confirmed by a successful check — the grace
   *  window in status.ts counts from here, not from lastCheckAt. */
  checkedAt: string;
}

export interface EntitlementState {
  schema: 1;
  lastCheckAt?: string;
  /** False when the last check could not reach the entitlements host at all. */
  reachable?: boolean;
  /**
   * The last known-good result. Deliberately NOT cleared when a later check
   * fails or is unreachable — that staleness is exactly what the grace
   * window in status.ts is measuring.
   */
  whatsapp?: WhatsAppEntitlement;
}

const EMPTY: EntitlementState = { schema: 1 };

export async function readState(): Promise<EntitlementState> {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath(), "utf8")) as EntitlementState;
    if (parsed && parsed.schema === 1) return parsed;
    return { ...EMPTY };
  } catch {
    // Missing on a fresh install, or unreadable. Start clean rather than
    // propagating an error into a request path.
    return { ...EMPTY };
  }
}

export async function writeState(state: EntitlementState): Promise<void> {
  const dir = await ensureEntitlementsDir();
  const target = statePath();
  const tmp = path.join(dir, `.state.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, target);
}

/** Read, apply a patch, write back. Not concurrency-safe across processes —
 *  only the agent writes, in-process. */
export async function patchState(patch: Partial<EntitlementState>): Promise<EntitlementState> {
  const next = { ...(await readState()), ...patch, schema: 1 as const };
  await writeState(next);
  return next;
}
