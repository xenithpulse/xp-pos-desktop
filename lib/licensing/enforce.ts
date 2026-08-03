// lib/licensing/enforce.ts
//
// What "restricted" actually stops.
//
// ── The rule ────────────────────────────────────────────────────────────────
//
// An unlicensed POS goes READ-ONLY. It does not stop, it does not log anybody
// out, and it does not refuse to talk to the printer. Specifically:
//
//   ALLOWED   every GET; completing, editing, paying for and printing an order
//             that is already open; closing a table; the daily sheet; every
//             recovery surface in Server Management.
//   BLOCKED   creating a NEW order, and changes to the menu, staff accounts and
//             settings.
//
// That split is not arbitrary. The brief ranks "a paying customer locked out
// mid-service" as the worst thing this feature can do, and a restaurant that
// hits its trial end at 20:00 on a Friday still has fifteen tables mid-meal.
// Those tables can be closed, paid and printed. The sixteenth cannot be seated
// until somebody buys a licence, which is the point.
//
// ── Where the check goes ────────────────────────────────────────────────────
//
// Inside lib/auth.ts's isAdminRequest, opted into per route with
// `license: "write"`. Not in the browser: a check in the React bundle is
// removed with DevTools in a minute, and this one is on the server, behind the
// same call every one of those routes already makes to authenticate.
//
// It is opt-in rather than blanket because a blanket rule would have to guess
// which requests are "new business" and which are "finish what is open", and it
// would guess wrong in the direction that breaks a restaurant's evening.

import { NextResponse } from "next/server";
import { getLicenseStatus } from "./status";

/** HTTP 402 Payment Required. Rarely the right code; here it is exactly it. */
const LICENCE_REQUIRED = 402;

export interface LicenseDenial {
  error: string;
  licence: {
    state: string;
    headline: string;
    detail: string;
    machineCode: string;
  };
}

/**
 * Returns a 402 response when this box may not perform a business write, and
 * null when it may.
 *
 * Never throws: getLicenseStatus already fails open with a logged error, so an
 * internal fault here lets the request through rather than stopping a till.
 */
export async function licenseWriteGate(): Promise<NextResponse | null> {
  const status = await getLicenseStatus();
  if (!status.restricted) return null;

  const body: LicenseDenial = {
    error:
      status.state === "trial_expired"
        ? "The 30-day trial has ended. This POS is read-only until it is licensed."
        : "This POS is not licensed. It is read-only until a licence is activated.",
    licence: {
      state: status.state,
      headline: status.headline,
      detail: status.detail,
      machineCode: status.machineCode,
    },
  };
  return NextResponse.json(body, { status: LICENCE_REQUIRED });
}
