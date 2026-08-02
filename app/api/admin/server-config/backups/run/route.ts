// app/api/admin/server-config/backups/run/route.ts
//
// "Run Backup Now" — records a manual backup request. The XP Thermal Service
// backup subsystem (running on the Windows box) polls the main config, sees
// this request, performs the dump/copy, and reports back via ../report.

import { NextResponse } from "next/server";
import { getOrCreateServerConfig } from "@/lib/serverConfig";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const { config } = await getOrCreateServerConfig();
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    config.backupRunRequestedAt = new Date();
    config.backupRunRequestId = requestId;
    await config.save();
    return NextResponse.json({
      success: true,
      requestId,
      requestedAt: config.backupRunRequestedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to request backup" },
      { status: 500 }
    );
  }
}
