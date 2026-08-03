// lib/updates/download.ts
//
// Downloading an update payload, and refusing it when it is not exactly what
// the manifest promised.
//
// This is the most security-sensitive code in the product. What comes out of
// here is executed as Administrator on a restaurant's till. The rules:
//
//   - The hash is computed WHILE streaming, not by re-reading the file
//     afterwards. Re-reading leaves a window where the verified file and the
//     executed file are not provably the same one.
//   - The download lands on a ".part" file and is only renamed to its real name
//     after the hash matches. Nothing ever sees a half-downloaded installer
//     with a plausible name.
//   - A mismatch DELETES the file. Leaving a rejected payload on disk next to a
//     good one is how the wrong thing eventually gets run.
//   - The size cap is enforced against bytes actually received, not against the
//     Content-Length header, which the server controls.

import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { ensureUpdatesDir } from "./paths";
import type { AvailableUpdate } from "./state";

const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000; // a 118 MB installer over a bad ADSL line

export class DownloadError extends Error {
  readonly unreachable: boolean;
  constructor(message: string, unreachable = false) {
    super(message);
    this.name = "DownloadError";
    this.unreachable = unreachable;
  }
}

export interface DownloadResult {
  file: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * Where a verified payload for a given version lives.
 *
 * Named "XP-POS-Update-…", NOT "XP-POS-Setup-…" which is what build.ps1 emits
 * into installer\dist. Two reasons, and the second is not obvious:
 *
 *   1. A file in ProgramData that is byte-identical in name to a release
 *      artifact invites someone to confuse a half-managed download with a
 *      release they built.
 *   2. Next's file tracer resolves a dynamic path by globbing for the literal
 *      parts around it. With the Setup- prefix it globbed **\XP-POS-Setup-*.exe
 *      and traced every built installer in the repo INTO the app bundle -
 *      measured, hundreds of megabytes. Nothing in the repo matches Update-.
 *      See the note at the top of paths.ts.
 */
export function payloadPath(dir: string, version: string): string {
  // The version is validated as N.N.N(-tag) before it reaches here, so it
  // cannot contain a path separator. Basename it anyway: this string builds a
  // filesystem path, and defence in depth costs one call.
  return path.join(dir, `XP-POS-Update-${path.basename(version)}.exe`);
}

/**
 * Delete stale payloads and part-files, keeping only `keepVersion`.
 *
 * A 118 MB installer per release adds up, and an abandoned payload from a
 * superseded version is a file that can only ever be run by mistake.
 */
export async function pruneDownloads(dir: string, keepVersion: string | null): Promise<void> {
  const keep = keepVersion ? path.basename(payloadPath(dir, keepVersion)) : null;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const isPayload = /^XP-POS-Update-.*\.exe(\.part)?$/i.test(name);
    if (!isPayload || name === keep) continue;
    await fs.rm(path.join(dir, name), { force: true }).catch(() => {});
  }
}

/**
 * Download `update` and verify its sha256. Returns the verified file path.
 *
 * Throws DownloadError on any mismatch, and the file is gone by the time the
 * error is thrown.
 */
export async function downloadAndVerify(
  update: AvailableUpdate,
  maxDownloadBytes: number
): Promise<DownloadResult> {
  const dir = await ensureUpdatesDir();
  const finalPath = payloadPath(dir, update.version);
  const partPath = `${finalPath}.part`;

  // A previous interrupted attempt would otherwise be appended to.
  await fs.rm(partPath, { force: true }).catch(() => {});

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(update.url, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
  } catch (err) {
    clearTimeout(timer);
    throw new DownloadError(
      `Could not download the update: ${err instanceof Error ? err.message : String(err)}`,
      true
    );
  }

  try {
    if (!res.ok) {
      throw new DownloadError(`Update download returned HTTP ${res.status}.`);
    }
    if (!res.body) {
      throw new DownloadError("Update download returned an empty body.");
    }

    const hash = createHash("sha256");
    let received = 0;

    const handle = await fs.open(partPath, "w");
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        received += value.byteLength;
        // Measured bytes, not the Content-Length header: a hostile or broken
        // server can under-declare and stream forever.
        if (received > maxDownloadBytes) {
          throw new DownloadError(
            `Update exceeded the ${Math.round(maxDownloadBytes / 1024 / 1024)} MB limit - aborted.`
          );
        }
        hash.update(value);
        await handle.write(value);
      }
      // Flush to disk before the file is judged. Without this the rename can
      // beat the data onto a box that loses power moments later.
      await handle.sync().catch(() => {});
    } finally {
      await handle.close().catch(() => {});
    }

    const actual = hash.digest("hex");

    if (received !== update.sizeBytes) {
      throw new DownloadError(
        `Update size mismatch: manifest says ${update.sizeBytes} bytes, received ${received}.`
      );
    }
    if (actual !== update.sha256) {
      throw new DownloadError(
        `Update FAILED verification. Expected sha256 ${update.sha256}, got ${actual}. ` +
          `The download was corrupted or tampered with and has been deleted.`
      );
    }

    await fs.rename(partPath, finalPath);
    await pruneDownloads(dir, update.version);

    return { file: finalPath, sha256: actual, sizeBytes: received };
  } catch (err) {
    // Anything that did not verify must not survive this function.
    await fs.rm(partPath, { force: true }).catch(() => {});
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Re-check an already-downloaded payload against its recorded hash.
 *
 * Called immediately before an install is launched. The file has been sitting
 * on disk since it was verified, possibly for days, and this is cheap next to
 * running the wrong installer as Administrator.
 */
export async function verifyExistingPayload(file: string, expectedSha256: string): Promise<boolean> {
  try {
    const handle = await fs.open(file, "r");
    try {
      const hash = createHash("sha256");
      const buf = Buffer.allocUnsafe(1024 * 1024);
      for (;;) {
        const { bytesRead } = await handle.read(buf, 0, buf.length, null);
        if (bytesRead === 0) break;
        hash.update(buf.subarray(0, bytesRead));
      }
      return hash.digest("hex") === expectedSha256.toLowerCase();
    } finally {
      await handle.close().catch(() => {});
    }
  } catch {
    return false;
  }
}
