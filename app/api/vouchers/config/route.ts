import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { VoucherConfigModel } from "@/models/factories/VoucherConfig";

export async function POST(req: NextRequest) {
  const conn = await mongooseConnect();
  const VoucherConfig = VoucherConfigModel(conn);
  const { currentCopyNumber, uniqueNumberPrefix, start = 1, limit = 20 } = await req.json();

  if (!currentCopyNumber || !uniqueNumberPrefix) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Delete old config if only one allowed
  await VoucherConfig.deleteMany({}); // or modify logic if multiple versions allowed

  const config = await VoucherConfig.create({ currentCopyNumber, uniqueNumberPrefix, start, limit });
  return NextResponse.json(config);
}

// Fetch latest config
export async function GET() {
  const conn = await mongooseConnect();
  const VoucherConfig = VoucherConfigModel(conn);
  const config = await VoucherConfig.findOne().sort({ createdAt: -1 });

  if (!config) {
    return NextResponse.json({ error: "No config found" }, { status: 404 });
  }

  return NextResponse.json(config);
}

// Update latest config
export async function PUT(req: NextRequest) {
  const conn = await mongooseConnect();
  const VoucherConfig = VoucherConfigModel(conn);
  const { currentCopyNumber, uniqueNumberPrefix, start = 1, limit = 20 } = await req.json();

  const existing = await VoucherConfig.findOne().sort({ createdAt: -1 });

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