// lib/injectionsGuard.ts
//
// Guard for the one-time setup / injection endpoints under /api/injections/*.
// These seed an initial admin and baseline config on first run, so they are
// powerful (the seed-admin route creates a super_admin). They MUST be
// unreachable in normal operation.
//
// Behaviour:
//   • Disabled by default. Returns 404 (route appears not to exist) unless
//     ENABLE_SETUP_ENDPOINTS="true".
//   • When SETUP_TOKEN is also set, every request must additionally present a
//     matching token via the `x-setup-token` header or `?token=` query param,
//     or it gets 401.
//
// First-run procedure: temporarily set ENABLE_SETUP_ENDPOINTS=true (and ideally
// a SETUP_TOKEN), run the endpoints once, then set it back to false / remove it
// and restart. See README "First-run setup".

import { NextRequest, NextResponse } from "next/server";

/**
 * Returns a NextResponse to short-circuit the handler when access is denied,
 * or null when the request is allowed to proceed.
 */
export function guardInjections(req: NextRequest): NextResponse | null {
  if (process.env.ENABLE_SETUP_ENDPOINTS !== "true") {
    // Appear as if the route does not exist.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const expected = process.env.SETUP_TOKEN;
  if (expected) {
    const provided =
      req.headers.get("x-setup-token") ||
      req.nextUrl.searchParams.get("token") ||
      "";
    if (provided !== expected) {
      return NextResponse.json({ error: "Invalid setup token" }, { status: 401 });
    }
  }

  return null;
}
