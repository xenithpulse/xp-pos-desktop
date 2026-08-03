// lib/updates/version.ts
//
// Version comparison, with no dependency added for it.
//
// The whole update decision rests on "is the offered version newer than the
// installed one", so this is deliberately strict: anything that is not a plain
// dotted numeric version (optionally with a -prerelease tag) is rejected rather
// than coerced. A manifest that says "latest" or "v2" must fail the check, not
// quietly compare as equal and either never update or update forever.

const VERSION_RE = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:-([0-9A-Za-z.-]{1,32}))?$/;

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
}

export function parseVersion(raw: string): ParsedVersion | null {
  const m = VERSION_RE.exec(raw.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  };
}

export function isValidVersion(raw: string): boolean {
  return parseVersion(raw) !== null;
}

/**
 * Returns <0 if a < b, 0 if equal, >0 if a > b. Throws on an unparseable
 * version — callers must have validated first, and silently treating garbage
 * as "not newer" would hide a broken manifest forever.
 *
 * Prerelease ordering follows semver: 1.2.0-beta.1 is OLDER than 1.2.0, so a
 * box on a release build is never offered a prerelease of the same number.
 */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa) throw new Error(`Unparseable version: ${a}`);
  if (!pb) throw new Error(`Unparseable version: ${b}`);

  if (pa.major !== pb.major) return pa.major - pb.major;
  if (pa.minor !== pb.minor) return pa.minor - pb.minor;
  if (pa.patch !== pb.patch) return pa.patch - pb.patch;

  if (pa.prerelease === pb.prerelease) return 0;
  if (pa.prerelease === null) return 1; // a is the release, b a prerelease
  if (pb.prerelease === null) return -1;
  return pa.prerelease < pb.prerelease ? -1 : 1;
}

/** True when `candidate` is strictly newer than `installed`. */
export function isNewer(candidate: string, installed: string): boolean {
  return compareVersions(candidate, installed) > 0;
}
