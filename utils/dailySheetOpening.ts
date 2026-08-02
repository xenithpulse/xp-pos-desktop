import type { Connection } from 'mongoose';
import { DailySheetModel } from '@/models/factories/DailySheet';
import { MonthlySheetModel } from '@/models/factories/MonthlySheet';

/**
 * Daily-sheet date + opening-balance helpers.
 *
 * Dates are keyed by the SERVER MACHINE's LOCAL calendar date — this is an
 * on-prem (non-cloud) system, so the server clock already reflects the
 * restaurant's regional timezone. A sheet's `date` is stored as local 00:00 of
 * its day (`new Date(y, m-1, d)`); "today" and day-ranges are computed the same
 * way. Keeping the convention in one place means the whole subsystem is
 * timezone-adaptive with no hard-coded offset.
 */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** True for a strict `YYYY-MM-DD` string. */
export function isYMD(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Local-midnight Date for the given `YYYY-MM-DD`. */
export function dayMidnight(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d); // local time
}

/** Today's LOCAL calendar date as `YYYY-MM-DD`. */
export function todayYMD(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** LOCAL calendar date (`YYYY-MM-DD`) of any Date-ish value. */
export function ymdFromDate(value: Date | string): string {
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `[start, end)` range covering the LOCAL calendar day `ymd` (DST-safe). */
export function dayRange(ymd: string): { start: Date; end: Date } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { start: new Date(y, m - 1, d), end: new Date(y, m - 1, d + 1) };
}

/**
 * Resolve the sheet a request should act on.
 *
 *  • With an explicit `targetYmd` → the sheet for that calendar day (backdate
 *    view / history).
 *  • Without one → the single OPEN (unposted) sheet, whatever its calendar day.
 *    A day only stops being "the active sheet" when the user closes it — so if
 *    midnight passes while a sheet is still open, work simply continues on that
 *    (now back-dated) sheet until it's closed. There is no auto-close.
 */
export async function findActiveSheet(conn: Connection, targetYmd?: string | null) {
  const DailySheet = DailySheetModel(conn);
  if (targetYmd && isYMD(targetYmd)) {
    const { start, end } = dayRange(targetYmd);
    return DailySheet.findOne({ date: { $gte: start, $lt: end } });
  }
  return DailySheet.findOne({ isPosted: false }).sort({ date: -1 });
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export interface OpeningBalanceBreakdown {
  combined: number;
  cash: number;
  online: number;
}

/**
 * Carry-forward opening balance for a day starting at `beforeDate` (00:00 PKT).
 *
 * Priority:
 *   1. The most recent daily sheet strictly before `beforeDate` → its closing
 *      balance becomes the opening. Per-method split is used when present;
 *      otherwise the whole amount collapses into `cash` (legacy documents have
 *      no per-method fields, and the client reconciles that collapsed form).
 *   2. Otherwise the active (open) monthly sheet's opening balance (cash-side).
 *   3. Otherwise zero.
 */
export async function deriveOpeningBalance(
  conn: Connection,
  beforeDate: Date,
): Promise<OpeningBalanceBreakdown> {
  const DailySheet = DailySheetModel(conn);
  const MonthlySheet = MonthlySheetModel(conn);

  const prior = await DailySheet.findOne({ date: { $lt: beforeDate } })
    .sort({ date: -1 })
    .lean();

  if (prior) {
    const combined = num(prior.closingBalance);
    const cashClose = num(prior.cashClosingBalance);
    const onlineClose = num(prior.onlineClosingBalance);
    const hasSplit = cashClose !== 0 || onlineClose !== 0;
    return {
      combined,
      cash: hasSplit ? cashClose : combined,
      online: hasSplit ? onlineClose : 0,
    };
  }

  const monthly = await MonthlySheet.findOne({ isClosed: false }).lean();
  const monthOpen = monthly ? num(monthly.openingBalance) : 0;
  return { combined: monthOpen, cash: monthOpen, online: 0 };
}
