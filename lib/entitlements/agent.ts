// lib/entitlements/agent.ts
//
// The entitlement agent: an outbound-only polling loop, same shape and same
// reasoning as lib/updates/agent.ts. It polls out over HTTPS on a long
// interval; nothing binds a port, nothing changes the box's network posture.
//
// It runs here rather than checking at request time so that sending a
// WhatsApp confirmation never waits on xenithpulse.com being reachable —
// fire-order/route.ts only ever reads the cached result.

import { getEntitlementSettings, isEntitlementsEnabled } from "./config";
import { fetchEntitlements, EntitlementError } from "./check";
import { getSiteIdentity } from "../updates/identity";
import { patchState, readState, type EntitlementState } from "./state";

/** How long after startup the first check runs — same value as the update
 *  agent, for the same reason: well clear of boot, nothing here is urgent. */
const FIRST_CHECK_DELAY_MS = 5 * 60 * 1000;

/** Spread checks out so a fleet of sites doesn't hit the host in lockstep. */
const JITTER_MS = 10 * 60 * 1000;

let started = false;
let checking = false;
let lastReachable: boolean | null = null;

function log(message: string): void {
  console.log(`[entitlements] ${message}`);
}

/**
 * Run one check. Never throws — this runs on a timer inside the POS process,
 * and an unhandled rejection here would be an unhandled rejection in the till.
 */
export async function checkEntitlements(): Promise<EntitlementState> {
  const settings = getEntitlementSettings();
  if (!isEntitlementsEnabled(settings)) return readState();

  if (checking) return readState();
  checking = true;

  try {
    const identity = await getSiteIdentity();
    const now = new Date().toISOString();

    let result;
    try {
      result = await fetchEntitlements(settings.entitlementsUrl, identity.siteId);
    } catch (err) {
      const unreachable = err instanceof EntitlementError && err.unreachable;
      const message = err instanceof Error ? err.message : String(err);

      // An offline site is the expected case, not a fault — log the
      // transition only, same as the update agent.
      if (!unreachable || lastReachable !== false) {
        log(unreachable ? `no internet - entitlement check skipped (${message})` : `check failed: ${message}`);
      }
      lastReachable = !unreachable;

      // Deliberately do NOT touch the cached `whatsapp` field here — its
      // staleness relative to graceDays is exactly what status.ts measures.
      return await patchState({ lastCheckAt: now, reachable: !unreachable });
    }

    lastReachable = true;
    return await patchState({
      lastCheckAt: now,
      reachable: true,
      whatsapp: { active: result.whatsapp.active, checkedAt: now },
    });
  } catch (err) {
    log(`unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    return readState();
  } finally {
    checking = false;
  }
}

/**
 * Start the agent. Safe to call more than once; only the first call does
 * anything. Returns immediately — everything real happens on a timer minutes
 * later, unref'd so it can never hold the process open.
 */
export function startEntitlementAgent(): void {
  if (started) return;
  started = true;

  const settings = getEntitlementSettings();
  if (!isEntitlementsEnabled(settings)) {
    // Silent. No POS_ENTITLEMENTS_URL means this site isn't on the
    // subscription-gated WhatsApp scheme, which is the default and the
    // common case until xenithpulse.com's billing side exists.
    return;
  }

  const intervalMs = settings.checkIntervalHours * 60 * 60 * 1000;
  const firstDelay = FIRST_CHECK_DELAY_MS + Math.floor(Math.random() * JITTER_MS);

  log(`enabled, checking every ${settings.checkIntervalHours}h (grace ${settings.graceDays}d)`);

  const first = setTimeout(() => {
    void checkEntitlements();
    const repeating = setInterval(() => void checkEntitlements(), intervalMs);
    repeating.unref?.();
  }, firstDelay);
  first.unref?.();
}
