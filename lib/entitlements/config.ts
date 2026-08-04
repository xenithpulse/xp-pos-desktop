// lib/entitlements/config.ts
//
// Entitlement-check settings, read from the site's .env.
//
// Same rule as lib/updates/config.ts: OFF unless configured. POS_ENTITLEMENTS_URL
// blank means the agent never starts and isWhatsAppEntitled() always returns
// true — a box that doesn't use this billing scheme (most of them, until
// xenithpulse.com's subscription side exists) must behave exactly as Phase 13
// built it, not silently stop sending.

export interface EntitlementSettings {
  /** Entitlements endpoint base. Empty string means the whole feature is disabled. */
  entitlementsUrl: string;
  /** Hours between checks. */
  checkIntervalHours: number;
  /**
   * How long a cached "active" result stays valid once xenithpulse.com becomes
   * unreachable, or once checks simply stop running. Shorter than licensing's
   * 14-day GRACE_DAYS (lib/licensing/status.ts) on purpose — this gates one
   * optional feature, not the whole product, so a lapsed subscription can be
   * enforced sooner without risking a paying restaurant's core POS.
   */
  graceDays: number;
}

const DEFAULT_CHECK_HOURS = 6;
const DEFAULT_GRACE_DAYS = 7;

function num(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) return fallback;
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function getEntitlementSettings(): EntitlementSettings {
  return {
    entitlementsUrl: process.env.POS_ENTITLEMENTS_URL?.trim() ?? "",
    checkIntervalHours: num(process.env.POS_ENTITLEMENTS_CHECK_HOURS, DEFAULT_CHECK_HOURS, 1, 168),
    graceDays: num(process.env.POS_ENTITLEMENTS_GRACE_DAYS, DEFAULT_GRACE_DAYS, 0, 90),
  };
}

/** True when the entitlements check is configured at all. */
export function isEntitlementsEnabled(s: EntitlementSettings = getEntitlementSettings()): boolean {
  return s.entitlementsUrl.length > 0;
}
