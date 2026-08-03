// app/api/admin/server-config/updates/route.ts
//
// Update status for the Server Management dashboard.
//
// PUBLIC, like the rest of the dashboard's read endpoints: it reports what
// version the box is on and whether an update is waiting. It exposes no secret
// and changes nothing. The endpoints that CAN change the box (install) require
// an admin session — see ./install/route.ts.
//
// This must answer on an offline box exactly as calmly as on a connected one.
// "enabled: false" and "reachable: false" are normal states here, not errors.

import { NextResponse } from "next/server";
import { getUpdateSettings, isUpdateChannelEnabled, formatWindow } from "@/lib/updates/config";
import { getInstalledVersion } from "@/lib/updates/identity";
import { getInstallStatus } from "@/lib/updates/install";
import { describeSignature } from "@/lib/updates/verify";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = getUpdateSettings();
    const installedVersion = await getInstalledVersion();
    const { state, readiness, installRunning } = await getInstallStatus();

    const downloaded = state.downloaded;

    return NextResponse.json({
      enabled: isUpdateChannelEnabled(settings),
      installedVersion,
      channel: settings.channel,
      checkIntervalHours: settings.checkIntervalHours,
      autoInstall: settings.autoInstall,
      maintenanceWindow: formatWindow(settings.window),
      allowUnsigned: settings.allowUnsigned,

      lastCheckAt: state.lastCheckAt ?? null,
      lastCheckOk: state.lastCheckOk ?? null,
      // Deliberately not called an "error": on an offline site this is the
      // normal outcome and the dashboard renders it as "no internet".
      lastCheckDetail: state.lastCheckError ?? null,
      reachable: state.reachable ?? null,

      available: state.available ?? null,
      downloaded: downloaded
        ? {
            version: downloaded.version,
            sizeBytes: downloaded.sizeBytes,
            verifiedAt: downloaded.verifiedAt,
            signature: describeSignature(downloaded.signature, settings.expectedPublisher),
            signatureTrusted: downloaded.signature?.trusted ?? false,
          }
        : null,

      installRunning,
      readyToInstall: readiness.ready,
      blockers: readiness.blockers,
      warnings: readiness.warnings,
      lastInstall: state.lastInstall ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to read update status" },
      { status: 500 }
    );
  }
}
