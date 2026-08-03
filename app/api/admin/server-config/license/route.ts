// app/api/admin/server-config/license/route.ts
//
// Licence status for the Server Management dashboard and for the in-app banner.
//
// PUBLIC, like the rest of the dashboard's read endpoints, and for a reason
// specific to this one: the screen that tells a restaurant its trial has ended
// and shows the machine code needed to buy a licence must be reachable by
// somebody who is being refused everything else. Nothing here is a secret - the
// machine code is a set of truncated hashes, not a hardware inventory, and it
// is useless without the XenithPulse private key.
//
// Changing the licence is a different matter and needs an admin session; see
// ./activate/route.ts.

import { NextResponse } from "next/server";
import { getLicenseStatus } from "@/lib/licensing/status";

export const dynamic = "force-dynamic";

export async function GET() {
  // getLicenseStatus never throws - it fails open with a logged error - so the
  // only 500 reachable from here would be a genuine bug in serialisation.
  const status = await getLicenseStatus();
  return NextResponse.json(status);
}
