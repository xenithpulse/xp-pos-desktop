// app/api/monthly-sheets/summary/route.ts
import { NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { MonthlySheetModel } from "@/models/factories/MonthlySheet";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = searchParams.get("year");

    const conn = await mongooseConnect();
    const MonthlySheet = MonthlySheetModel(conn);

    // Build query - filter by year if provided
    const query: Record<string, unknown> = {};
    if (year) {
      const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
      const endOfYear = new Date(`${year}-12-31T23:59:59.999Z`);
      query.startDate = { $gte: startOfYear, $lte: endOfYear };
    }

    // Fetch only summary fields (no dailySummaries)
    const sheets = await MonthlySheet.find(query)
      .select("_id monthLabel startDate endDate openingBalance closingBalance totalIncome totalExpense isClosed")
      .sort({ startDate: -1 })
      .lean();

    // Get all unique years for year selector
    const allYears = await MonthlySheet.aggregate([
      {
        $group: {
          _id: { $year: "$startDate" },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    const years = allYears.map((y) => y._id);

    return NextResponse.json({
      success: true,
      data: sheets,
      years,
      selectedYear: year ? parseInt(year) : years[0] || new Date().getFullYear(),
    });
  } catch (error) {
    console.error("Error fetching monthly sheets summary:", error);
    return NextResponse.json(
      { success: false, message: String(error) },
      { status: 500 }
    );
  }
}
