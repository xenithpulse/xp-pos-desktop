// lib/entitlements/status.ts
//
// The single function call sites use — everything else in this module is
// implementation detail for keeping this answer cheap and offline-tolerant.

import { getEntitlementSettings, isEntitlementsEnabled } from "./config";
import { readState } from "./state";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Is this site currently entitled to send WhatsApp confirmations?
 *
 *   1. Entitlements not configured at all (POS_ENTITLEMENTS_URL blank) →
 *      true. A box that isn't on this billing scheme must behave exactly as
 *      it did before this feature existed, not silently stop sending.
 *   2. Configured, but no successful check has ever landed (fresh install,
 *      first check hasn't run yet) → false. Fails closed until proven
 *      otherwise — low stakes, since WhatsApp already fails silently and the
 *      first check lands within ~15 minutes of boot.
 *   3. Otherwise → the last known-good "active" value, valid for graceDays
 *      since it was last CONFIRMED (checkedAt) — not since the last check
 *      attempt. A xenithpulse.com outage or an unreachable box just lets
 *      that value age; it does not clear it. Once graceDays elapses without
 *      a fresh confirmation, this returns false.
 */
export async function isWhatsAppEntitled(): Promise<boolean> {
  const settings = getEntitlementSettings();
  if (!isEntitlementsEnabled(settings)) return true;

  const state = await readState();
  if (!state.whatsapp) return false;

  if (!state.whatsapp.active) return false;

  const checkedAt = Date.parse(state.whatsapp.checkedAt);
  if (!Number.isFinite(checkedAt)) return false;

  const ageDays = (Date.now() - checkedAt) / MS_PER_DAY;
  return ageDays <= settings.graceDays;
}
