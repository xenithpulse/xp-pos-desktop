// app/api/admin/server-config/diagnostics/route.ts
//
// Read-only box diagnostics: services, listeners, paths, log index, identity.
//
// Public, like the health endpoint next to it. It is the endpoint whose whole
// purpose is to answer "what is wrong with this box" when someone is on the
// phone to a restaurant, so putting it behind a login it may not be possible to
// reach — the login is served by the app that might be the broken thing — would
// defeat it.
//
// Nothing here returns a secret: no .env values beyond the HTTP port, no
// connection strings, no log CONTENT. Log content is a separate, admin-only
// endpoint (./logs) precisely because a log can contain anything.

import { NextResponse } from "next/server";
import { collectDiagnostics } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await collectDiagnostics());
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Diagnostics failed" },
      { status: 500 }
    );
  }
}
