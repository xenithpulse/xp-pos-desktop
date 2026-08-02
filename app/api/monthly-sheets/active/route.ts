// app/api/monthly-sheets/active/route.ts
import { NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { MonthlySheetModel } from '@/models/factories/MonthlySheet';

export async function GET() {
  const conn = await mongooseConnect();
  const MonthlySheet = MonthlySheetModel(conn);
  const active = await MonthlySheet.findOne({ isClosed: false }).lean();
  if (!active) return NextResponse.json(null, { status: 200 });
  return NextResponse.json(active, { status: 200 });
}
