// lib/updates/manifest.ts
//
// Fetching and validating the release manifest.
//
// The manifest is a static JSON file on a host XenithPulse controls. There is
// no XenithPulse-side application to run, which is the point: an update channel
// with no server has no server to be compromised, and a box with no internet
// simply fails to fetch a file and carries on.
//
// The check is an anonymous GET. It sends no siteId, no hostname, no version —
// nothing that turns "check for updates" into telemetry. Identity exists
// (identity.ts) for licence activation, and is not spent here.
//
// EVERY field is validated before it is used. The url and sha256 out of this
// file decide what gets downloaded and executed as Administrator on a
// restaurant's till, so "the manifest said so" is not a sufficient reason to
// trust anything in it.
//
// Format:
//
//   {
//     "schema": 1,
//     "channels": {
//       "stable": {
//         "version":    "1.2.0",
//         "url":        "https://updates.example.com/XP-POS-Setup-1.2.0.exe",
//         "sha256":     "<64 hex chars>",
//         "sizeBytes":  123456789,
//         "releasedAt": "2026-01-15T00:00:00Z",
//         "notes":      "What changed, shown to the site."
//       }
//     }
//   }

import { isValidVersion } from "./version";
import type { AvailableUpdate } from "./state";

/** Manifests are small. Anything larger is not a manifest. */
const MAX_MANIFEST_BYTES = 256 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

export class ManifestError extends Error {
  /** True when we never reached the host — offline, DNS, timeout, refused.
   *  The dashboard treats this as "no internet", not as a fault. */
  readonly unreachable: boolean;
  constructor(message: string, unreachable = false) {
    super(message);
    this.name = "ManifestError";
    this.unreachable = unreachable;
  }
}

const SHA256_RE = /^[0-9a-f]{64}$/i;

/**
 * Payload URLs must be HTTPS.
 *
 * The single exception is a loopback host, which exists so the update path can
 * be exercised end to end on a test VM with a local static server. A loopback
 * URL is not reachable from anywhere else, so it opens nothing.
 */
function isAcceptablePayloadUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return true;
  if (u.protocol !== "http:") return false;
  return u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]";
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/**
 * Validate one channel entry into the shape the rest of the agent uses.
 * Throws with a message naming the offending field — a broken manifest is a
 * XenithPulse-side mistake and the site's dashboard is where it will be seen.
 */
export function parseChannel(
  raw: unknown,
  channel: string,
  maxDownloadBytes: number
): AvailableUpdate {
  if (!raw || typeof raw !== "object") {
    throw new ManifestError(`Channel "${channel}" is not an object.`);
  }
  const c = raw as Record<string, unknown>;

  const version = asString(c.version);
  if (!version || !isValidVersion(version)) {
    throw new ManifestError(
      `Channel "${channel}" has an invalid version (${String(c.version)}). ` +
        `Expected a plain N.N.N version.`
    );
  }

  const url = asString(c.url);
  if (!url || !isAcceptablePayloadUrl(url)) {
    throw new ManifestError(
      `Channel "${channel}" has a url that is not HTTPS. Refusing to download it.`
    );
  }

  const sha256 = asString(c.sha256);
  if (!sha256 || !SHA256_RE.test(sha256)) {
    throw new ManifestError(`Channel "${channel}" has no valid sha256.`);
  }

  const sizeBytes = typeof c.sizeBytes === "number" ? c.sizeBytes : NaN;
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new ManifestError(`Channel "${channel}" has no valid sizeBytes.`);
  }
  if (sizeBytes > maxDownloadBytes) {
    throw new ManifestError(
      `Channel "${channel}" declares ${Math.round(sizeBytes / 1024 / 1024)} MB, ` +
        `above the ${Math.round(maxDownloadBytes / 1024 / 1024)} MB limit.`
    );
  }

  return {
    version,
    url,
    sha256: sha256.toLowerCase(),
    sizeBytes,
    releasedAt: asString(c.releasedAt),
    notes: asString(c.notes),
  };
}

/**
 * Fetch the manifest and return the requested channel.
 *
 * Timeouts and network failures are surfaced as ManifestError with
 * `unreachable = true` so the caller can stay silent on an offline box instead
 * of showing a restaurant an error about a service it does not use.
 */
export async function fetchChannel(
  manifestUrl: string,
  channel: string,
  maxDownloadBytes: number
): Promise<AvailableUpdate> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(manifestUrl, {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    throw new ManifestError(
      err instanceof Error && err.name === "AbortError"
        ? "Timed out reaching the update server."
        : `Could not reach the update server: ${err instanceof Error ? err.message : String(err)}`,
      true
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // An HTTP error means we DID reach a server. That is a configuration
    // problem worth reporting, not an offline box.
    throw new ManifestError(`Update server returned HTTP ${res.status}.`);
  }

  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_MANIFEST_BYTES) {
    throw new ManifestError("Manifest is implausibly large - refusing to read it.");
  }

  const text = await res.text();
  if (text.length > MAX_MANIFEST_BYTES) {
    throw new ManifestError("Manifest is implausibly large - refusing to parse it.");
  }

  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new ManifestError("Update manifest is not valid JSON.");
  }

  const root = doc as Record<string, unknown>;
  if (root?.schema !== 1) {
    throw new ManifestError(
      `Unsupported manifest schema (${String(root?.schema)}). This POS understands schema 1.`
    );
  }

  const channels = root.channels;
  if (!channels || typeof channels !== "object") {
    throw new ManifestError("Manifest has no channels object.");
  }

  const entry = (channels as Record<string, unknown>)[channel];
  if (!entry) {
    throw new ManifestError(`Manifest has no "${channel}" channel.`);
  }

  return parseChannel(entry, channel, maxDownloadBytes);
}
