// app/api/admin/server-config/updates/install/route.ts
//
// Install the downloaded update now. This is the one endpoint in Server
// Management that runs a program as Administrator and takes the POS down.
//
// It REQUIRES AN ADMIN SESSION, unlike the rest of this dashboard.
//
// The dashboard is public by design — it is a recovery and handover surface,
// and everything else on it either reads state or changes a setting that can be
// changed back. This endpoint launches an installer that replaces every binary
// on the box and restarts three services mid-restaurant. Leaving it on the
// public surface would mean any device on the restaurant's WiFi could restart
// the till during service, and that is not a trade the recovery argument
// covers.
//
// Every safety gate lives in assessReadiness(), not here: verified hash,
// trusted signature, no open orders, no install already running. This route
// re-runs that assessment immediately before launching rather than trusting
// what the dashboard showed the operator a minute ago.

import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/auth";
import { readState } from "@/lib/updates/state";
import { assessReadiness, launchInstall } from "@/lib/updates/install";

export const dynamic = "force-dynamic";

export async function POST() {
  const denied = await isAdminRequest();
  if (denied) return denied;

  try {
    const state = await readState();
    const downloaded = state.downloaded;

    // Re-assessed here, not taken from the last GET. Orders can open, and a
    // payload can change on disk, between rendering the button and pressing it.
    const readiness = await assessReadiness(downloaded, false);
    if (!readiness.ready) {
      return NextResponse.json(
        { started: false, blockers: readiness.blockers, warnings: readiness.warnings },
        { status: 409 }
      );
    }

    // downloaded is non-null whenever readiness.ready is true; assessReadiness
    // makes "no verified update" its first blocker.
    await launchInstall(downloaded!);

    return NextResponse.json({
      started: true,
      version: downloaded!.version,
      warnings: readiness.warnings,
      message:
        "The installer has been started. The POS will stop responding for a few " +
        "minutes and come back on the new version. Do not power the box off.",
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Could not start the installer" },
      { status: 500 }
    );
  }
}
