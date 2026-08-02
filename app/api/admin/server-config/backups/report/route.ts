// app/api/admin/server-config/backups/report/route.ts
//
// Ingest point for backup results posted by the XP Thermal Service backup
// subsystem. Updates per-path status/size/time, overall last-backup status,
// and appends a capped history so the dashboard reflects reality.

import { NextResponse } from "next/server";
import { getOrCreateServerConfig } from "@/lib/serverConfig";

export const dynamic = "force-dynamic";

interface ReportedPath {
  path: string;
  status?: "active" | "error";
  sizeBytes?: number;
  lastBackupTime?: string;
  error?: string;
}

interface BackupReport {
  requestId?: string;
  startedAt?: string;
  finishedAt?: string;
  status?: "success" | "partial" | "error";
  message?: string;
  totalBytes?: number;
  paths?: ReportedPath[];
}

const HISTORY_LIMIT = 20;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as BackupReport;
    const { config } = await getOrCreateServerConfig();

    const reported = body.paths ?? [];

    // Update each configured path that the service reported on.
    for (const rp of reported) {
      const entry = config.backupPaths.find((p) => p.path === rp.path);
      if (!entry) continue;
      entry.status = rp.status === "error" ? "error" : "active";
      if (typeof rp.sizeBytes === "number") entry.storageUsed = rp.sizeBytes;
      if (rp.lastBackupTime) entry.lastBackupTime = new Date(rp.lastBackupTime);
      entry.lastError = rp.error;
    }

    const pathsTotal = reported.length;
    const pathsOk = reported.filter((p) => p.status !== "error").length;
    const status = body.status ?? (pathsOk === pathsTotal ? "success" : pathsOk ? "partial" : "error");

    config.lastBackupAt = new Date(body.finishedAt ?? Date.now());
    config.lastBackupStatus = status;
    config.lastBackupMessage = body.message ?? "";

    config.backupHistory.unshift({
      at: config.lastBackupAt,
      status,
      message: body.message ?? "",
      totalBytes: body.totalBytes ?? 0,
      pathsOk,
      pathsTotal,
    } as (typeof config.backupHistory)[number]);
    if (config.backupHistory.length > HISTORY_LIMIT) {
      config.backupHistory.splice(HISTORY_LIMIT);
    }

    // Acknowledge the manual request this report fulfils, so the dashboard
    // stops showing it as pending.
    if (body.requestId && body.requestId === config.backupRunRequestId) {
      config.backupRunRequestedAt = undefined;
      config.backupRunRequestId = undefined;
    }

    await config.save();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to record backup report" },
      { status: 500 }
    );
  }
}
