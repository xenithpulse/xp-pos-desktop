// app/api/system/ping/route.ts
//
// "Does this address actually work from the device I am holding?"
//
// The connect screen is served from one address and needs to test a DIFFERENT
// one - it shows the permanent name while being viewed over the numeric IP, or
// the other way round. That makes the test a cross-origin request, so this
// endpoint carries permissive CORS headers. Nothing else in the POS does.
//
// WHY THIS TEST EXISTS. A public DNS record holding a private IP is blocked by
// a minority of routers as DNS-rebinding protection. That is a real failure
// mode with no server-side symptom whatsoever: registration succeeds, the
// record is correct, and the tablet still cannot resolve it. The only place the
// truth is visible is on the device itself - so the device is what asks.
//
// WHY THE RESPONSE IS EMPTY. `Access-Control-Allow-Origin: *` means any web
// page a staff tablet visits can call this and learn a POS is at this address.
// That is unavoidable for a reachability probe and acceptable only because the
// answer discloses nothing: no version, no hostname, no site identifier, no
// configuration. Do not add fields here. Anything put in this response is
// readable by any website open on any device on the network.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "no-store",
} as const;

export async function GET() {
  return NextResponse.json({ ok: true }, { headers: CORS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
