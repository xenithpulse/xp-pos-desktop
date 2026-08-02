// app/api/admin/server-config/route.ts
//
// Main Server Management config endpoint. PUBLIC by design — see
// app/server-management/page.tsx for why (recovery/handover surface).

import { NextResponse } from "next/server";
import { getOrCreateServerConfig, detectRequestUrl } from "@/lib/serverConfig";

export const dynamic = "force-dynamic";

// Top-level scalar/array fields the dashboard is allowed to update directly.
// (Sub-collections like the MAC whitelist / backup paths have their own routes.)
const ALLOWED_FIELDS = new Set([
  "routerEnabled",
  "routerBlacklistEnabled",
  "routerBlockUnknownDevices",
  "allowedNetworks",
  "maxConcurrentConnections",
  "sessionTimeoutMinutes",
  "backupEnabled",
  "backupHour",
  "backupRetentionDays",
  "maxBackupConcurrency",
  "trackConnections",
  "connectionLogRetentionDays",
  "requireHttps",
  "enableRateLimiting",
  "rateLimitPerMinute",
  "enableAuditLog",
  "auditLogRetentionDays",
  "diskUsageThresholdPercent",
]);

export async function GET(req: Request) {
  try {
    const { config } = await getOrCreateServerConfig();
    const data = config.toObject() as unknown as Record<string, unknown>;
    // Surface the address the box is currently reachable at, derived from the
    // live request — proof that auth/URL now follows the network automatically.
    data.serverUrl = detectRequestUrl(req);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to load config" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { config } = await getOrCreateServerConfig();

    for (const [key, value] of Object.entries(body ?? {})) {
      if (ALLOWED_FIELDS.has(key)) {
        config.set(key, value);
      }
    }

    // Integrations is a nested object — merge rather than replace so a partial
    // update (e.g. only the DNS token) doesn't wipe the provider.
    if (body?.integrations && typeof body.integrations === "object") {
      config.integrations = {
        ...(config.integrations ?? {}),
        ...body.integrations,
      };
    }

    await config.save();
    return NextResponse.json(config.toObject());
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to update config" },
      { status: 500 }
    );
  }
}
