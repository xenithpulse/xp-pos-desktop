// app/api/monthly-sheets/open/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { MonthlySheetModel } from '@/models/factories/MonthlySheet';

export async function POST(req: NextRequest) {
  const conn = await mongooseConnect();
  const MonthlySheet = MonthlySheetModel(conn);
  const body = await req.json();
  const { monthLabel, startDate, endDate, openingBalance = 0, notes } = body;

  if (!monthLabel || !startDate || !endDate) {
    return NextResponse.json({ error: 'monthLabel/startDate/endDate required' }, { status: 400 });
  }

  // ensure no other open month
  const existingOpen = await MonthlySheet.findOne({ isClosed: false });
  if (existingOpen) {
    return NextResponse.json({ error: 'Another month is already open' }, { status: 409 });
  }

  const doc = await MonthlySheet.create({
    monthLabel,
    startDate: new Date(startDate),
    endDate: new Date(endDate),
    openingBalance: Number(openingBalance) || 0,
    totalIncome: 0,
    totalExpense: 0,
    closingBalance: Number(openingBalance) || 0,
    isClosed: false,
    notes,
    dailySummaries: [],
  });

  return NextResponse.json(doc, { status: 201 });
}
