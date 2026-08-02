// app/api/slip-config/route.ts
import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { SlipConfigModel } from "@/models/factories/SlipConfig";
import { isAdminRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const SlipConfig = SlipConfigModel(conn);
  const { currentCopyNumber, uniqueNumberPrefix, start = 1, limit = 20 } = await req.json();

  if (!currentCopyNumber || !uniqueNumberPrefix) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  await SlipConfig.deleteMany({});
  const config = await SlipConfig.create({ currentCopyNumber, uniqueNumberPrefix, start, limit });
  return NextResponse.json(config);
}

export async function GET() {
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const SlipConfig = SlipConfigModel(conn);

  const config = await SlipConfig.findOne().sort({ createdAt: -1 });

  if (!config) {
    return NextResponse.json({ error: "No config found" }, { status: 404 });
  }

  return NextResponse.json(config);
}

export async function PUT(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const SlipConfig = SlipConfigModel(conn);

  const { currentCopyNumber, uniqueNumberPrefix, start = 1, limit = 20 } = await req.json();

  const existing = await SlipConfig.findOne().sort({ createdAt: -1 });

  if (!existing) {
    return NextResponse.json({ error: "No existing config to update" }, { status: 404 });
  }

  existing.currentCopyNumber = currentCopyNumber;
  existing.uniqueNumberPrefix = uniqueNumberPrefix;
  existing.start = start;
  existing.limit = limit;

  await existing.save();

  return NextResponse.json(existing);
}
