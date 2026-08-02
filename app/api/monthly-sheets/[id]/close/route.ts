// app/api/monthly-sheets/[id]/close/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import mongoose from 'mongoose';
import { extractId } from '@/utils/extractID';
import { MonthlySheetModel } from '@/models/factories/MonthlySheet';
import { IDailySummary } from '@/models/schemas/monthlySheet.schema';

export async function POST(req: NextRequest) {
  const conn = await mongooseConnect();
  const MonthlySheet = MonthlySheetModel(conn);
  const monthlyId = extractId(req, 3);
  if (!mongoose.Types.ObjectId.isValid(monthlyId)) {
    return NextResponse.json({ error: 'Invalid monthly id' }, { status: 400 });
  }

  const monthly = await MonthlySheet.findById(monthlyId);
  if (!monthly) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (monthly.isClosed) {
    return NextResponse.json({ error: 'Already closed' }, { status: 409 });
  }

  monthly.totalIncome = monthly.dailySummaries.reduce(
    (sum: number, day: IDailySummary) => sum + (day.totalIncome || 0),
    0
  );
  monthly.totalExpense = monthly.dailySummaries.reduce(
    (sum: number, day: IDailySummary) => sum + (day.totalExpense || 0),
    0
  );
  monthly.closingBalance =
    monthly.openingBalance + monthly.totalIncome - monthly.totalExpense;
  monthly.isClosed = true;
  // Set endDate to now when closing the monthly sheet
  monthly.endDate = new Date();

  await monthly.save();

  return NextResponse.json({ success: true, monthly }, { status: 200 });
}
