import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { VoucherConfigModel } from "@/models/factories/VoucherConfig";
import { guardInjections } from "@/lib/injectionsGuard";

export async function GET(req: NextRequest) {
  const blocked = guardInjections(req);
  if (blocked) return blocked;
  try {
    const conn = await mongooseConnect();
    const VoucherConfig = VoucherConfigModel(conn);
    console.log("REQ URL ", req.url)

    const existing = await VoucherConfig.findOne();
    if (existing) {
      return NextResponse.json({ message: "SlipConfig already exists." });
    }

    const newConfig = await VoucherConfig.create({
      currentCopyNumber: "A01",
      uniqueNumberPrefix: "A4",
      start: 1,
      limit: 20,
    });

    return NextResponse.json({ message: "SlipConfig injected successfully.", config: newConfig });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to inject SlipConfig", details: (error as Error).message },
      { status: 500 }
    );
  }
}
