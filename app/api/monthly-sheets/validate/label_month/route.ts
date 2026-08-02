import { isAdminRequest } from "@/lib/auth";
import { mongooseConnect } from "@/lib/mongoose";
import { MonthlySheetModel } from "@/models/factories/MonthlySheet";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_staff" });
  if (authResult) return authResult;

  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("mode");

  const conn = await mongooseConnect();
  const MonthlySheet = MonthlySheetModel(conn);

  if (mode === "labels") {
    const labels = await MonthlySheet.find(
      {},
      { monthLabel: 1, _id: 0 }
    ).sort({ startDate: -1 });

    return NextResponse.json(
      labels.map(m => m.monthLabel),
      { status: 200 }
    );
  }
}
