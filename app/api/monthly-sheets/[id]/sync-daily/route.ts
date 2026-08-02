// app/api/monthly-sheets/[id]/sync-daily/route.ts
import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import mongoose from "mongoose";
import { extractId } from "@/utils/extractID";
import { IDailySummary } from "@/models/schemas/monthlySheet.schema";
import { MonthlySheetModel } from "@/models/factories/MonthlySheet";


export async function POST(req: NextRequest) {
  const conn = await mongooseConnect();
  const MonthlySheet = MonthlySheetModel(conn);
  const monthlyId = extractId(req, 3);
  if (!mongoose.Types.ObjectId.isValid(monthlyId)) {
    return NextResponse.json({ error: "Invalid monthly id" }, { status: 400 });
  }

  const body: IDailySummary = await req.json();
  const {
    dailySheetId,
    date,
    totalIncome = 0,
    totalExpense = 0,
    closingBalance = 0,
    slipEntries = [],
    entries = [],
  } = body;

  if (!dailySheetId || !date) {
    return NextResponse.json(
      { error: "dailySheetId and date required" },
      { status: 400 }
    );
  }

  const monthly = await MonthlySheet.findById(monthlyId);
  if (!monthly) {
    return NextResponse.json(
      { error: "Monthly sheet not found" },
      { status: 404 }
    );
  }
  if (monthly.isClosed) {
    return NextResponse.json(
      { error: "Monthly sheet is closed" },
      { status: 409 }
    );
  }

  const dayIdStr = String(dailySheetId);

  // check date is within range
  const d = new Date(date);
  if (d < monthly.startDate || d > monthly.endDate) {
    return NextResponse.json(
      { error: "Daily date outside monthly range" },
      { status: 400 }
    );
  }

  // upsert daily summary
  const idx = monthly.dailySummaries.findIndex(
    (ds: IDailySummary) => String(ds.dailySheetId) === dayIdStr
  );
  const summary: IDailySummary = {
    dailySheetId,
    date: d,
    totalIncome: Number(totalIncome) || 0,
    totalExpense: Number(totalExpense) || 0,
    closingBalance: Number(closingBalance) || 0,
    slipEntries,
    entries,
  };

  if (idx >= 0) {
    monthly.dailySummaries[idx] = summary;
  } else {
    monthly.dailySummaries.push(summary);
  }

  // recalc totals server-side for accuracy
  monthly.totalIncome = monthly.dailySummaries.reduce(
    (s: number, x: IDailySummary) => s + (x.totalIncome || 0),
    0
  );
  monthly.totalExpense = monthly.dailySummaries.reduce(
    (s: number, x: IDailySummary) => s + (x.totalExpense || 0),
    0
  );
  monthly.closingBalance =
    monthly.openingBalance + monthly.totalIncome - monthly.totalExpense;

  await monthly.save();
  return NextResponse.json(monthly, { status: 200 });
}
