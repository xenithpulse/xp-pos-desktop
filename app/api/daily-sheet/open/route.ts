// app/api/daily-sheet/open/route.ts
//
// Explicitly opens a daily sheet for a day (PKT), recording the cashier's
// opening balance. Replaces the previous "auto-create on first write" flow:
// a day must be deliberately opened (with an opening-balance count) before any
// slip or expense can be posted.
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { DailySheetModel } from '@/models/factories/DailySheet';
import { MonthlySheetModel } from '@/models/factories/MonthlySheet';
import { syncDailyToMonthlyByDailySheet } from '@/utils/monthlySync';
import {
  deriveOpeningBalance,
  isYMD,
  dayMidnight,
  todayYMD,
} from '@/utils/dailySheetOpening';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function POST(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);
  const MonthlySheet = MonthlySheetModel(conn);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const ymd = isYMD(body?.targetDate) ? (body.targetDate as string) : todayYMD();
  const date = dayMidnight(ymd);
  const nextDate = new Date(date.getTime() + 86_400_000);

  // A day can only be opened inside an active monthly stream — otherwise its
  // totals would have nowhere to roll up.
  const monthly = await MonthlySheet.findOne({ isClosed: false }).lean();
  if (!monthly) {
    return NextResponse.json(
      { error: 'NO_ACTIVE_MONTHLY', message: 'No active monthly sheet. Open the active month first.' },
      { status: 409 },
    );
  }

  // Idempotent: if the day is already opened, just return it (the client will
  // refresh onto it) rather than erroring.
  const existing = await DailySheet.findOne({ date: { $gte: date, $lt: nextDate } });
  if (existing) {
    return NextResponse.json(existing, { status: 200 });
  }

  // Only one open (unposted) sheet at a time. If an earlier day is still open,
  // surface it so the client can route the user to close it first.
  const otherOpen = await DailySheet.findOne({ isPosted: false, date: { $lt: date } })
    .sort({ date: -1 })
    .lean();
  if (otherOpen) {
    return NextResponse.json(
      {
        error: 'OPEN_SHEET_EXISTS',
        message: 'An earlier daily sheet is still open. Close it before opening a new day.',
        openSheetDate: otherOpen.date,
      },
      { status: 409 },
    );
  }

  // Opening balances: trust the cashier-provided values; default any omitted
  // side to the carried-forward amount from the prior day / active month.
  const carried = await deriveOpeningBalance(conn, date);
  const cashOpening = body?.cashOpeningBalance != null ? num(body.cashOpeningBalance) : carried.cash;
  const onlineOpening = body?.onlineOpeningBalance != null ? num(body.onlineOpeningBalance) : carried.online;
  const combined = body?.openingBalance != null ? num(body.openingBalance) : cashOpening + onlineOpening;

  const created = await DailySheet.create({
    date,
    slipEntries: [],
    entries: [],
    openingBalance: combined,
    cashOpeningBalance: cashOpening,
    onlineOpeningBalance: onlineOpening,
    // With no activity yet, closing == opening on each method.
    cashClosingBalance: cashOpening,
    onlineClosingBalance: onlineOpening,
    totalIncome: 0,
    totalExpense: 0,
    closingBalance: combined,
    isPosted: false,
    notes: typeof body?.notes === 'string' ? body.notes : '',
  });

  try {
    await syncDailyToMonthlyByDailySheet(created);
  } catch (err) {
    console.error('[daily-sheet open] monthly sync failed (non-fatal):', err);
  }

  return NextResponse.json(created, { status: 201 });
}
