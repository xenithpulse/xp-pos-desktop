// app/api/admin/server-config/router/route.ts
//
// MAC whitelist CRUD for the Server Management dashboard.

import { NextResponse } from "next/server";
import { getOrCreateServerConfig } from "@/lib/serverConfig";

export const dynamic = "force-dynamic";

const norm = (mac: string) => mac.trim().toUpperCase();

// Add a device to the whitelist.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const macAddress = norm(String(body?.macAddress ?? ""));
    const deviceName = String(body?.deviceName ?? "").trim();

    if (!macAddress || !deviceName) {
      return NextResponse.json(
        { message: "macAddress and deviceName are required" },
        { status: 400 }
      );
    }

    const { config } = await getOrCreateServerConfig();

    if (config.routerMacWhitelist.some((d) => norm(d.macAddress) === macAddress)) {
      return NextResponse.json(
        { message: "This device is already on the whitelist" },
        { status: 409 }
      );
    }

    config.routerMacWhitelist.push({
      macAddress,
      deviceName,
      deviceType: body?.deviceType ?? "laptop",
      notes: body?.notes ?? "",
      status: "active",
      addedBy: "server-management",
      addedAt: new Date(),
    } as (typeof config.routerMacWhitelist)[number]);

    await config.save();
    return NextResponse.json(config.routerMacWhitelist);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to add device" },
      { status: 500 }
    );
  }
}

// Update a device's status (active / blocked / inactive).
export async function PATCH(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const macAddress = norm(String(body?.macAddress ?? ""));
    const status = body?.status;

    if (!macAddress || !["active", "blocked", "inactive"].includes(status)) {
      return NextResponse.json(
        { message: "macAddress and a valid status are required" },
        { status: 400 }
      );
    }

    const { config } = await getOrCreateServerConfig();
    const entry = config.routerMacWhitelist.find(
      (d) => norm(d.macAddress) === macAddress
    );
    if (!entry) {
      return NextResponse.json({ message: "Device not found" }, { status: 404 });
    }

    entry.status = status;
    await config.save();
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to update device" },
      { status: 500 }
    );
  }
}

// Remove a device from the whitelist.
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const macAddress = norm(String(body?.macAddress ?? ""));

    if (!macAddress) {
      return NextResponse.json(
        { message: "macAddress is required" },
        { status: 400 }
      );
    }

    const { config } = await getOrCreateServerConfig();
    config.routerMacWhitelist = config.routerMacWhitelist.filter(
      (d) => norm(d.macAddress) !== macAddress
    ) as typeof config.routerMacWhitelist;

    await config.save();
    return NextResponse.json(config.routerMacWhitelist);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "Failed to remove device" },
      { status: 500 }
    );
  }
}
