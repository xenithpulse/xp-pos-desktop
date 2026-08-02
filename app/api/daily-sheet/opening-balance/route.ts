// app/api/daily-sheet/opening-balance/route.ts
//
// Returns the carry-forward opening balance for a given day (defaults to today
// in PKT), split into cash / online. Consumed by the Daily Sheet context at
// mount so the "Carried forward" pills and the Open-Day prefill are populated
// even before a sheet exists for the day.
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import {
  deriveOpeningBalance,
  isYMD,
  dayMidnight,
  todayYMD,
} from '@/utils/dailySheetOpening';

export async function GET(req: NextRequest) {
  try {
    const conn = await mongooseConnect();

    const { searchParams } = new URL(req.url);
    const qDate = searchParams.get('targetDate');
    const ymd = isYMD(qDate) ? qDate : todayYMD();
    const dayStart = dayMidnight(ymd);

    const { combined, cash, online } = await deriveOpeningBalance(conn, dayStart);

    return NextResponse.json({
      openingBalance: combined,
      cashOpeningBalance: cash,
      onlineOpeningBalance: online,
    });
  } catch (err) {
    console.error('[daily-sheet opening-balance] failed:', err);
    // Non-fatal for the client (it falls back to 0), but report a 500 so the
    // failure is visible in logs/monitoring rather than silently masked.
    return NextResponse.json(
      { openingBalance: 0, cashOpeningBalance: 0, onlineOpeningBalance: 0 },
      { status: 500 },
    );
  }
}
