import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { DailySheetModel } from "@/models/factories/DailySheet";

export async function GET(req: NextRequest) {
  try {
    const conn = await mongooseConnect();
    const DailySheet = DailySheetModel(conn);

    // Get 'days' from query params, default to 3
    const { searchParams } = new URL(req.url);
    const days = parseInt(searchParams.get("days") || "3");

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const aggregationPipeline = [
      {
        // Filter for documents within the last X days
        $match: {
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalExpenseSum: { $sum: "$totalExpense" },
        },
      },
    ];

    const result = await DailySheet.aggregate(aggregationPipeline);
    const totalExpenseAmount = result.length > 0 ? result[0].totalExpenseSum : 0;

    return NextResponse.json({ totalExpenseAmount, daysUsed: days });
  } catch (error) {
    console.error("Failed to fetch total daily sheet expense:", error);
    return NextResponse.json(
      { error: "Failed to fetch total daily sheet expense", details: (error as Error).message },
      { status: 500 }
    );
  }
}