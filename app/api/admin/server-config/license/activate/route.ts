// app/api/admin/server-config/license/activate/route.ts
//
// Activate a licence from a key string, entirely offline.
//
// REQUIRES AN ADMIN SESSION. The rest of the licence surface is public because
// it only reports; this one writes C:\ProgramData\XP POS\license.dat, and a
// dashboard reachable by every device on the restaurant's WiFi is not somewhere
// to leave a file-writing endpoint open.
//
// It must NOT be licence-gated. The whole purpose of this route is to be
// callable on a box that is currently restricted - gating it would produce a
// POS that can only be licensed while it is already licensed. `isAdminRequest`
// is therefore called without `license: "write"`, and that omission is
// load-bearing rather than an oversight.

import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { activateLicense, ActivationError } from "@/lib/licensing/activate";

export const dynamic = "force-dynamic";

/** Roughly four times a full key. Anything larger is not a mistyped licence. */
const MAX_KEY_CHARS = 1000;

export async function POST(request: Request) {
  const denied = await isAdminRequest();
  if (denied) return denied;

  let body: { key?: unknown; issuedTo?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ activated: false, message: "No licence key was sent." }, { status: 400 });
  }

  const key = typeof body.key === "string" ? body.key : "";
  if (key.length > MAX_KEY_CHARS) {
    return NextResponse.json(
      { activated: false, message: "That is not a licence key." },
      { status: 400 }
    );
  }

  try {
    const result = await activateLicense({
      key,
      issuedTo: typeof body.issuedTo === "string" ? body.issuedTo.slice(0, 200) : undefined,
      note: typeof body.note === "string" ? body.note.slice(0, 500) : undefined,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ActivationError) {
      // 400, not 500: the key was rejected, the box is fine. The hint is the
      // part a technician standing in a restaurant actually needs.
      return NextResponse.json(
        { activated: false, message: err.message, hint: err.hint ?? null },
        { status: 400 }
      );
    }
    return NextResponse.json(
      {
        activated: false,
        message: err instanceof Error ? err.message : "The licence could not be activated.",
      },
      { status: 500 }
    );
  }
}
