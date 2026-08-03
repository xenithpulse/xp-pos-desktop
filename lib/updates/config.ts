// lib/updates/config.ts
//
// Update-channel settings, read from the site's .env.
//
// Two rules shape every default here:
//
//   1. OFF unless configured. POS_UPDATE_URL blank means the agent never
//      starts. Most boxes have no internet, and a restaurant that will never
//      see the internet must not get a warning banner, a retry loop, or an
//      error in a log nobody reads.
//
//   2. NOTIFY, never install by itself. A POS that restarts mid-service is a
//      disaster. Auto-install exists but is opt-in AND further gated on a
//      maintenance window plus a no-open-orders check, and it refuses an
//      unsigned payload outright.

export interface UpdateSettings {
  /** Manifest URL. Empty string means the whole feature is disabled. */
  manifestUrl: string;
  /** Which channel inside the manifest to read (e.g. "stable"). */
  channel: string;
  /** Hours between checks. */
  checkIntervalHours: number;
  /** Opt-in unattended install. Still gated by window + open orders. */
  autoInstall: boolean;
  /** Maintenance window, local time, when an auto-install may start. */
  window: { startMinutes: number; endMinutes: number } | null;
  /** Substring the Authenticode signer subject must contain. */
  expectedPublisher: string;
  /**
   * Permit installing a payload with no valid Authenticode signature.
   * Exists ONLY so the update path can be exercised before the Phase 9
   * certificate is purchased. It is a deliberate hole and is reported as one.
   */
  allowUnsigned: boolean;
  /** Hard ceiling on a download, bytes. Stops a hostile manifest filling C:. */
  maxDownloadBytes: number;
}

const DEFAULT_CHECK_HOURS = 6;
const DEFAULT_MAX_MB = 512;

function num(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function bool(raw: string | undefined): boolean {
  return raw?.trim().toLowerCase() === "true";
}

/**
 * Parse "HH:MM-HH:MM" into minutes-from-midnight.
 *
 * A window that wraps past midnight (22:00-02:00) is legitimate for a
 * restaurant and is handled by isWithinWindow rather than by normalising here.
 * An unparseable value yields null, which makes autoInstall refuse to run —
 * failing closed is the only safe direction for "when may this box restart".
 */
function parseWindow(raw: string | undefined): UpdateSettings["window"] {
  if (!raw) return null;
  const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(raw);
  if (!m) return null;
  const [sh, sm, eh, em] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  const startMinutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  if (startMinutes === endMinutes) return null; // zero-length is a typo, not "always"
  return { startMinutes, endMinutes };
}

export function getUpdateSettings(): UpdateSettings {
  const manifestUrl = process.env.POS_UPDATE_URL?.trim() ?? "";
  return {
    manifestUrl,
    channel: process.env.POS_UPDATE_CHANNEL?.trim() || "stable",
    checkIntervalHours: num(process.env.POS_UPDATE_CHECK_HOURS, DEFAULT_CHECK_HOURS, 1, 168),
    autoInstall: bool(process.env.POS_UPDATE_AUTO_INSTALL),
    window: parseWindow(process.env.POS_UPDATE_WINDOW ?? "04:00-05:00"),
    expectedPublisher: process.env.POS_UPDATE_PUBLISHER?.trim() || "XenithPulse",
    allowUnsigned: bool(process.env.POS_UPDATE_ALLOW_UNSIGNED),
    maxDownloadBytes: num(process.env.POS_UPDATE_MAX_MB, DEFAULT_MAX_MB, 32, 4096) * 1024 * 1024,
  };
}

/** True when the update channel is configured at all. */
export function isUpdateChannelEnabled(s: UpdateSettings = getUpdateSettings()): boolean {
  return s.manifestUrl.length > 0;
}

/** Is `now` inside the configured maintenance window? Wrapping windows work. */
export function isWithinWindow(
  window: UpdateSettings["window"],
  now: Date = new Date()
): boolean {
  if (!window) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const { startMinutes, endMinutes } = window;
  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }
  // Wraps past midnight: inside if after the start OR before the end.
  return minutes >= startMinutes || minutes < endMinutes;
}

export function formatWindow(window: UpdateSettings["window"]): string {
  if (!window) return "not set";
  const fmt = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${fmt(window.startMinutes)}-${fmt(window.endMinutes)}`;
}
