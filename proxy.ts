import { NextRequest, NextResponse } from "next/server";

/**
 * Edge proxy: rate-limit credential auth attempts.
 *
 * (Next 16 renamed `middleware.ts` → `proxy.ts`. Same Edge runtime, same
 * `NextRequest` API; only the file name and exported function name changed.)
 *
 * Scope:
 *   - POST /api/auth/callback/credentials  (NextAuth credentials sign-in)
 *
 * Strategy:
 *   - In-memory Map keyed by client IP.
 *   - 5 attempts per 15-minute rolling window per IP.
 *   - Per-instance only (Vercel may run multiple instances). Acceptable for
 *     this scale because each tenant gets its own deployment, and serious
 *     attacks would still be slowed substantially before scaling out.
 *
 * Rationale: prevents trivial credential-stuffing without adding a Redis
 * dependency. Upgrade to @upstash/ratelimit if a tenant grows past one
 * instance under sustained load.
 */

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;
const buckets = new Map<string, Bucket>();

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

function checkRateLimit(ip: string): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = buckets.get(ip);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > MAX_ATTEMPTS) {
    return { ok: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfterSec: 0 };
}

// Periodic GC to keep the Map bounded. Runs lazily on requests rather than
// timers because Edge runtime can recycle workers without notice.
function maybeSweep() {
  if (buckets.size < 1000) return;
  const now = Date.now();
  for (const [ip, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(ip);
  }
}

export function proxy(req: NextRequest) {
  // Only enforce on the credentials sign-in callback. Other auth routes
  // (session, providers, csrf) are read-only and don't need limiting.
  const isAuthCallback =
    req.method === "POST" &&
    req.nextUrl.pathname === "/api/auth/callback/credentials";

  if (!isAuthCallback) return NextResponse.next();

  maybeSweep();
  const ip = clientIp(req);
  const { ok, retryAfterSec } = checkRateLimit(ip);

  if (ok) return NextResponse.next();

  return new NextResponse(
    JSON.stringify({
      error: "TOO_MANY_ATTEMPTS",
      message: `Too many sign-in attempts. Try again in ${retryAfterSec}s.`,
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfterSec),
      },
    },
  );
}

// Restrict middleware to just the auth route to keep edge invocations cheap.
export const config = {
  matcher: ["/api/auth/callback/:path*"],
};
