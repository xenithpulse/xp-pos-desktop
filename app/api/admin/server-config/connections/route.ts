// app/api/admin/server-config/connections/route.ts
//
// Active-connection tracking for the Server Management dashboard.

import { NextResponse } from "next/server";
import { getOrCreateServerConfig } from "@/lib/serverConfig";

export const dynamic = "force-dynamic";

// List active connections (with a small summary).
export async function GET() {
  try {
    const { config } = await getOrCreateServerConfig();
    const connections = config.activeConnections ?? [];
    return NextResponse.json({
      total: connections.length,
      active: connections.filter((c) => c.isActive).length,
      connections,
    });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to load connections" },
      { status: 500 }
    );
  }
}

// Record / touch a connection. `_id` is "<ip>-<loginTimestamp>".
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const ipAddress = String(body?.ipAddress ?? "").trim();
    const username = String(body?.username ?? "").trim();

    if (!ipAddress || !username) {
      return NextResponse.json(
        { message: "ipAddress and username are required" },
        { status: 400 }
      );
    }

    const { config } = await getOrCreateServerConfig();
    const now = new Date();
    const id = `${ipAddress}-${now.getTime()}`;

    config.activeConnections.push({
      _id: id,
      ipAddress,
      username,
      role: body?.role ?? "user",
      deviceName: body?.deviceName,
      macAddress: body?.macAddress,
      userAgent: body?.userAgent,
      loginTime: now,
      lastActivityTime: now,
      isActive: true,
    } as (typeof config.activeConnections)[number]);

    await config.save();
    return NextResponse.json({ _id: id });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to log connection" },
      { status: 500 }
    );
  }
}

// Update last-activity timestamp for a connection.
export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const connectionId = String(body?.connectionId ?? "");

    const { config } = await getOrCreateServerConfig();
    const conn = config.activeConnections.find((c) => c._id === connectionId);
    if (!conn) {
      return NextResponse.json({ message: "Connection not found" }, { status: 404 });
    }

    conn.lastActivityTime = new Date();
    await config.save();
    return NextResponse.json({ message: "Activity updated" });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to update connection" },
      { status: 500 }
    );
  }
}

// Terminate (remove) a connection.
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const connectionId = String(body?.connectionId ?? "");

    if (!connectionId) {
      return NextResponse.json(
        { message: "connectionId is required" },
        { status: 400 }
      );
    }

    const { config } = await getOrCreateServerConfig();
    config.activeConnections = config.activeConnections.filter(
      (c) => c._id !== connectionId
    ) as typeof config.activeConnections;

    await config.save();
    return NextResponse.json({ message: "Connection terminated" });
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to terminate connection" },
      { status: 500 }
    );
  }
}
