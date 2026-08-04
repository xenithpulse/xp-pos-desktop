// lib/entitlements/check.ts
//
// Fetching and validating the entitlements response from xenithpulse.com.
//
// Same posture as lib/updates/manifest.ts: every field is validated before
// it is trusted, because the result of this call decides whether a paid
// feature runs. Unlike the update manifest, this GET DOES carry identity —
// siteId is how xenithpulse.com looks up which Stripe subscription this box
// belongs to — but nothing else. See lib/updates/identity.ts for why siteId
// itself is treated as non-secret.
//
// Expected response:
//
//   { "schema": 1, "whatsapp": { "active": true } }

const FETCH_TIMEOUT_MS = 20_000;

export class EntitlementError extends Error {
  /** True when we never reached the host — offline, DNS, timeout, refused.
   *  The agent treats this as "can't confirm right now", not as a fault,
   *  and leans on the cached grace window instead of erroring loudly. */
  readonly unreachable: boolean;
  constructor(message: string, unreachable = false) {
    super(message);
    this.name = "EntitlementError";
    this.unreachable = unreachable;
  }
}

export interface EntitlementsResult {
  whatsapp: { active: boolean };
}

/**
 * HTTPS-only, with the same loopback exception lib/updates/manifest.ts has —
 * lets the entitlements path be exercised end to end against a local test
 * server without opening anything a real deployment could reach.
 */
function isAcceptableUrl(raw: string): boolean {
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

/**
 * Fetch and validate the entitlements result for one site.
 *
 * Timeouts and network failures are surfaced as EntitlementError with
 * `unreachable = true` so the caller can fall back to the cached grace-window
 * value instead of treating an offline box as "subscription inactive".
 */
export async function fetchEntitlements(entitlementsUrl: string, siteId: string): Promise<EntitlementsResult> {
  if (!isAcceptableUrl(entitlementsUrl)) {
    throw new EntitlementError("POS_ENTITLEMENTS_URL is not HTTPS. Refusing to call it.");
  }

  const url = new URL(entitlementsUrl);
  url.searchParams.set("siteId", siteId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
      headers: { accept: "application/json" },
    });
  } catch (err) {
    throw new EntitlementError(
      err instanceof Error && err.name === "AbortError"
        ? "Timed out reaching the entitlements server."
        : `Could not reach the entitlements server: ${err instanceof Error ? err.message : String(err)}`,
      true
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // Reached a server, got an HTTP error — a configuration problem, not an
    // offline box. Still not fatal to the caller: it just doesn't refresh
    // the cached value.
    throw new EntitlementError(`Entitlements server returned HTTP ${res.status}.`);
  }

  let doc: unknown;
  try {
    doc = await res.json();
  } catch {
    throw new EntitlementError("Entitlements response is not valid JSON.");
  }

  const root = doc as Record<string, unknown>;
  if (root?.schema !== 1) {
    throw new EntitlementError(`Unsupported entitlements schema (${String(root?.schema)}).`);
  }

  const whatsapp = root.whatsapp;
  if (!whatsapp || typeof whatsapp !== "object" || typeof (whatsapp as Record<string, unknown>).active !== "boolean") {
    throw new EntitlementError('Entitlements response has no valid "whatsapp.active" boolean.');
  }

  return { whatsapp: { active: (whatsapp as Record<string, unknown>).active as boolean } };
}
