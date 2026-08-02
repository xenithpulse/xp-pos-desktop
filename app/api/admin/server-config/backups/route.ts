// app/api/admin/server-config/backups/route.ts
//
// Backup-path CRUD for the Server Management dashboard.

import { NextResponse } from "next/server";
import { getOrCreateServerConfig } from "@/lib/serverConfig";

export const dynamic = "force-dynamic";

// Add a backup path.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const path = String(body?.path ?? "").trim();

    if (!path) {
      return NextResponse.json({ message: "path is required" }, { status: 400 });
    }

    const { config } = await getOrCreateServerConfig();

    if (config.backupPaths.some((b) => b.path === path)) {
      return NextResponse.json(
        { message: "This path is already configured" },
        { status: 409 }
      );
    }

    const retention = Number(body?.backupRetention) || 14;
    config.backupPaths.push({
      path,
      type: body?.type ?? "local",
      status: "active",
      storageUsed: 0,
      backupRetention: retention,
      notes: body?.notes ?? "",
    } as (typeof config.backupPaths)[number]);

    await config.save();
    return NextResponse.json(config.backupPaths);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to add backup path" },
      { status: 500 }
    );
  }
}

// Update a backup path (e.g. retention).
export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const path = String(body?.path ?? "").trim();

    if (!path) {
      return NextResponse.json({ message: "path is required" }, { status: 400 });
    }

    const { config } = await getOrCreateServerConfig();
    const entry = config.backupPaths.find((b) => b.path === path);
    if (!entry) {
      return NextResponse.json({ message: "Path not found" }, { status: 404 });
    }

    if (body?.backupRetention != null) {
      entry.backupRetention = Number(body.backupRetention) || entry.backupRetention;
    }
    if (typeof body?.type === "string") entry.type = body.type;
    if (typeof body?.notes === "string") entry.notes = body.notes;

    await config.save();
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to update backup path" },
      { status: 500 }
    );
  }
}

// Remove a backup path.
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const path = String(body?.path ?? "").trim();

    if (!path) {
      return NextResponse.json({ message: "path is required" }, { status: 400 });
    }

    const { config } = await getOrCreateServerConfig();
    config.backupPaths = config.backupPaths.filter(
      (b) => b.path !== path
    ) as typeof config.backupPaths;

    await config.save();
    return NextResponse.json(config.backupPaths);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to remove backup path" },
      { status: 500 }
    );
  }
}
