// app/api/cash-slips/meta/route.ts
import { NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { CashSlipModel } from "@/models/factories/CashSlip";

export async function GET() {
  try {
    const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
    if (authResult) return authResult;
    const conn = await mongooseConnect();
    const CashSlip = CashSlipModel(conn);
    // Single aggregation: group by copyNumber, compute stats, then keep only those with unused > 0
    const stats = await CashSlip.aggregate([
      {
        $group: {
          _id: "$copyNumber",
          minUnique: { $min: "$uniqueNumber" },
          maxUnique: { $max: "$uniqueNumber" },
          total: { $sum: 1 },
          unused: { $sum: { $cond: [{ $eq: ["$used", false] }, 1, 0] } },
        },
      },
      // remove copyBooks where all slips are used (unused === 0)
      { $match: { unused: { $gt: 0 } } },
      { $sort: { _id: 1 } },
    ]);

    const meta = stats.map((st) => ({
      copyNumber: String(st._id),
      minUnique: st.minUnique ?? null,
      maxUnique: st.maxUnique ?? null,
      total: st.total ?? 0,
      unused: st.unused ?? 0,
    }));

    return NextResponse.json({ success: true, meta }, { status: 200 });
  } catch (err) {
    console.error("GET /api/cash-slips/meta error:", err);
    return NextResponse.json(
      { success: false, message: "Failed to fetch cash slip metadata" },
      { status: 500 }
    );
  }
}
