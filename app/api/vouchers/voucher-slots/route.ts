// app/api/voucher-slots/route.ts
import { NextResponse, NextRequest } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { getNextSlots } from "@/lib/helpers/getNextVoucherSlot";
import { VoucherConfigModel } from "@/models/factories/VoucherConfig";

export async function GET(req: NextRequest) {
  const copy = req.nextUrl.searchParams.get("copy");
  if (!copy) {
    return NextResponse.json(
      { error: "Missing `copy` query param" },
      { status: 400 }
    );
  }

  const conn = await mongooseConnect();
  const VoucherConfig = VoucherConfigModel(conn);

  // 1) load the config document for this copy
  const config = await VoucherConfig.findOne({
    currentCopyNumber: copy,
  });
  if (!config) {
    return NextResponse.json(
      { error: `No VoucherConfig found for copy "${copy}"` },
      { status: 404 }
    );
  }

  const slots = await getNextSlots(config);

  return NextResponse.json(slots);
}
