// app/api/monthly-sheets/route.ts
import { NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { MonthlySheetModel } from "@/models/factories/MonthlySheet";

export async function GET() {
  try {
    const conn = await mongooseConnect();
    const MonthlySheet = MonthlySheetModel(conn);
    // Fetch all months, sort by startDate
    const sheets = await MonthlySheet.find()
      .sort({ startDate: 1 })
      .lean();

    return NextResponse.json({ success: true, data: sheets });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error },
      { status: 500 }
    );
  }
}
