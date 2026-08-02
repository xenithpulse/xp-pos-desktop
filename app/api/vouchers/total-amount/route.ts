// app/api/vouchers/total-amount/route.ts
import { NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { VoucherModel } from "@/models/factories/Voucher";

export async function GET() {
  try {
    const conn = await mongooseConnect();
    const Voucher = VoucherModel(conn);
    // Aggregate total amount across all vouchers.
    // If some documents may not have `amount`, $ifNull ensures we treat them as 0.
    const [agg] = await Voucher.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: { $ifNull: ["$amount", 0] } },
        },
      },
    ]);

    const total = agg?.total ?? 0;
    const totalAmount = typeof total === "number" ? total : Number(total) || 0;

    return NextResponse.json({ success: true, totalAmount }, { status: 200 });
  } catch (err) {
    console.error("GET /api/vouchers/total-amount error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to compute voucher total" },
      { status: 500 }
    );
  }
}
