// lib/licensing/store.ts
//
// Reading and writing the two files licensing owns.
//
//   license.dat         issued by XenithPulse, written by activation, then
//                       treated as read-only. Never rewritten by the box.
//   license-state.json  written by the box: when the trial started, the highest
//                       timestamp it has ever seen, what happened last time a
//                       licence validated.
//
// Writes are atomic (temp file + rename), for the same reason lib/updates does
// it: a power cut mid-write would otherwise leave truncated JSON, and the
// recovery path for "the POS cannot read its own trial state" is a site visit.

import { promises as fs } from "fs";
import path from "path";
import { ensureDataRoot, licensePath, licenseStatePath, dataRoot } from "./paths";

/**
 * license.dat as XenithPulse issues it.
 *
 * JSON with one meaningful field, on purpose. A technician may be given the
 * file OR the key string down a phone, and both paths have to end in the same
 * bytes being checked - so the file is a thin wrapper around exactly the key
 * that would have been typed. The extra fields are for the human who opens it
 * in Notepad wondering what it is; nothing reads them, and nothing may, because
 * they are not covered by the signature.
 */
export interface LicenseFile {
  schema: 1;
  key: string;
  /** Free text from the issuer: customer name, order reference. NOT trusted. */
  issuedTo?: string;
  issuedAt?: string;
  note?: string;
  /** Written by the box when it activated this key. */
  activatedAt?: string;
}

export interface LicenseState {
  schema: 1;
  /**
   * When this installation's trial began, as resolved from the oldest of the
   * three sources. Written back here so the answer is stable.
   */
  trialStartedAt?: string;
  /**
   * The highest timestamp this box has ever observed.
   *
   * Time is allowed to stand still (a dead CMOS battery on an offline LAN is a
   * real thing) but it is never allowed to go backwards for the purpose of
   * counting trial days. See trial.ts.
   */
  highWaterAt?: string;
  /** Serial of the licence that last validated ON THIS BOX. */
  lastValidSerial?: string;
  lastValidAt?: string;
  /** Set when a previously valid licence stopped validating. */
  graceStartedAt?: string;
  graceReason?: string;
}

const EMPTY_STATE: LicenseState = { schema: 1 };

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await ensureDataRoot();
  const tmp = path.join(dataRoot(), `.${path.basename(file)}.${process.pid}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/**
 * Read license.dat.
 *
 * Tolerates the file being the raw key string rather than JSON. A technician
 * who pasted a key into Notepad and saved it as license.dat has done something
 * entirely reasonable, and refusing that is a support call for no benefit -
 * the signature check downstream is what decides whether the contents are real.
 */
export async function readLicenseFile(): Promise<LicenseFile | null> {
  const file = licensePath();
  let text: string;
  try {
    text = await fs.readFile(file, "utf8");
  } catch {
    return null;
  }

  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    const parsed = await readJson<LicenseFile>(file);
    if (parsed && typeof parsed.key === "string" && parsed.key.trim()) {
      return { ...parsed, schema: 1, key: parsed.key.trim() };
    }
    return null;
  }

  return { schema: 1, key: trimmed };
}

export async function writeLicenseFile(value: LicenseFile): Promise<void> {
  await writeJsonAtomic(licensePath(), value);
}

/** Remove the licence. Used by "remove licence" in the dashboard, nothing else. */
export async function deleteLicenseFile(): Promise<void> {
  await fs.rm(licensePath(), { force: true });
}

export async function readLicenseState(): Promise<LicenseState> {
  const parsed = await readJson<LicenseState>(licenseStatePath());
  if (parsed && parsed.schema === 1) return parsed;
  return { ...EMPTY_STATE };
}

export async function writeLicenseState(state: LicenseState): Promise<void> {
  await writeJsonAtomic(licenseStatePath(), { ...state, schema: 1 });
}

/**
 * Read, patch, write.
 *
 * Not concurrency-safe across processes, and does not need to be: only the app
 * process writes this file, and only from the single resolve path in status.ts.
 * An `undefined` in the patch CLEARS the field, which is how a grace period is
 * ended.
 */
export async function patchLicenseState(patch: Partial<LicenseState>): Promise<LicenseState> {
  const next: LicenseState = { ...(await readLicenseState()), ...patch, schema: 1 };
  const record = next as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete record[key];
  }
  await writeLicenseState(next);
  return next;
}
