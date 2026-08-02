// app/api/admin/server-config/health/route.ts
//
// System health for the Server Management dashboard: DB latency, memory, and
// disk usage measured live, then persisted onto the config document.

import { NextResponse } from "next/server";
import os from "os";
import { promises as fs } from "fs";
import { getOrCreateServerConfig } from "@/lib/serverConfig";

export const dynamic = "force-dynamic";

async function measureDiskPercent(): Promise<number | null> {
  try {
    // fs.statfs is available on Node 18.15+ (the appliance runs Node 20).
    const statfs = (fs as unknown as {
      statfs?: (p: string) => Promise<{ blocks: number; bfree: number; bsize: number }>;
    }).statfs;
    if (!statfs) return null;
    const s = await statfs(process.platform === "win32" ? "C:\\" : "/");
    const total = s.blocks * s.bsize;
    const free = s.bfree * s.bsize;
    if (!total) return null;
    return Math.round(((total - free) / total) * 100);
  } catch {
    return null;
  }
}

async function runHealthCheck() {
  const { conn, config } = await getOrCreateServerConfig();

  // Database latency via a ping.
  let dbOk = false;
  let latency = -1;
  try {
    const start = Date.now();
    await conn.db?.command({ ping: 1 });
    latency = Date.now() - start;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  // Memory.
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memPercent = totalMem ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;

  // Disk.
  const diskPercent = await measureDiskPercent();
  const threshold = config.diskUsageThresholdPercent ?? 80;

  const checks = {
    database: dbOk,
    diskSpace: diskPercent == null ? true : diskPercent < threshold,
    memory: memPercent < 90,
    ports: true,
  };

  const overallStatus: "healthy" | "warning" | "critical" = !dbOk
    ? "critical"
    : !checks.diskSpace || !checks.memory
    ? "warning"
    : "healthy";

  // Persist the outcome.
  config.lastHealthCheck = new Date();
  config.systemStatus = overallStatus;
  await config.save();

  return {
    checks,
    database: { status: dbOk, latency },
    diskUsage: { percent: diskPercent ?? 0, threshold },
    memory: { percent: memPercent, available: freeMem },
    systemStatus: overallStatus,
    overallStatus,
  };
}

export async function GET() {
  try {
    return NextResponse.json(await runHealthCheck());
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Health check failed" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    return NextResponse.json(await runHealthCheck());
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Health check failed" },
      { status: 500 }
    );
  }
}
