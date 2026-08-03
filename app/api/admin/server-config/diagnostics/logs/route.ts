// app/api/admin/server-config/diagnostics/logs/route.ts
//
// Tail a service log. ADMIN ONLY.
//
// The diagnostics endpoint next to this one is public because it returns
// structured facts about the box and nothing else. This one returns the raw
// contents of a file written by mongod, Next and Caddy — a stack trace can
// carry a connection string, a query, a customer's details. So it needs a
// session, even though the index of log NAMES does not.
//
// The path is validated inside tailLog() against the resolved logs directory
// rather than by pattern-matching the input.

import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { tailLog, MAX_TAIL_BYTES } from "@/lib/diagnostics";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = await isAdminRequest();
  if (denied) return denied;

  const file = new URL(req.url).searchParams.get("file");
  if (!file) {
    return NextResponse.json(
      { message: "Pass ?file=<relative path from the diagnostics log index>" },
      { status: 400 }
    );
  }

  try {
    return NextResponse.json(await tailLog(file, MAX_TAIL_BYTES));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read that log";
    // A traversal attempt and a missing file both end here; neither gets a
    // different status code, so nothing is learned from probing.
    return NextResponse.json({ message }, { status: 404 });
  }
}
