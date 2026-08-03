// lib/updates/state.ts
//
// Persisted update-agent state.
//
// It lives on disk rather than in MongoDB on purpose: this is the one subsystem
// that must still be able to report something when the database is the thing
// that is broken, and it has to survive the app process being killed by its own
// installer mid-update.
//
// Writes are atomic (temp file + rename). A power cut during a write would
// otherwise leave truncated JSON, and the recovery path for "the updater cannot
// read its own state" is a site visit.

import { promises as fs } from "fs";
import path from "path";
import { ensureUpdatesDir, statePath } from "./paths";

export interface AvailableUpdate {
  version: string;
  url: string;
  sha256: string;
  sizeBytes: number;
  releasedAt?: string;
  notes?: string;
}

export interface SignatureInfo {
  /** What Get-AuthenticodeSignature reported: Valid, NotSigned, HashMismatch... */
  status: string;
  subject: string | null;
  trusted: boolean;
}

export interface DownloadedUpdate {
  version: string;
  file: string;
  sha256: string;
  sizeBytes: number;
  verifiedAt: string;
  signature: SignatureInfo | null;
}

export type InstallOutcome = "started" | "success" | "failed" | "interrupted";

export interface InstallRecord {
  version: string;
  startedAt: string;
  finishedAt?: string;
  outcome: InstallOutcome;
  detail?: string;
}

export interface UpdateState {
  schema: 1;
  lastCheckAt?: string;
  lastCheckOk?: boolean;
  /**
   * Why the last check failed. On an offline box this is populated and is NOT
   * an error condition — see `reachable`. Kept so a support call can tell
   * "no internet" apart from "the manifest is malformed", which look identical
   * from the dashboard otherwise.
   */
  lastCheckError?: string;
  /** False when the last check could not reach the manifest host at all. */
  reachable?: boolean;
  available?: AvailableUpdate;
  downloaded?: DownloadedUpdate;
  lastInstall?: InstallRecord;
}

const EMPTY: UpdateState = { schema: 1 };

export async function readState(): Promise<UpdateState> {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath(), "utf8")) as UpdateState;
    if (parsed && parsed.schema === 1) return parsed;
    return { ...EMPTY };
  } catch {
    // Missing on a fresh install, or unreadable. Either way, start clean rather
    // than propagating an error into the dashboard.
    return { ...EMPTY };
  }
}

export async function writeState(state: UpdateState): Promise<void> {
  const dir = await ensureUpdatesDir();
  const target = statePath();
  const tmp = path.join(dir, `.state.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, target);
}

/** Read, apply a patch, write back. Not concurrency-safe across processes —
 *  only the agent and the operator-triggered routes write, both in-process. */
export async function patchState(patch: Partial<UpdateState>): Promise<UpdateState> {
  const next = { ...(await readState()), ...patch, schema: 1 as const };
  await writeState(next);
  return next;
}
