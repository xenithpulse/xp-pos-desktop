// app/api/daily-sheet/atomic-push/route.ts
//
// Single atomic write surface for the daily sheet. Adds a slip / expense to the
// open sheet with a `$push` (no read-modify-write race on the array), then
// recomputes the combined + per-method totals in a separate `$set`. Guards the
// sheet lifecycle so writes to a missing / closed / wrong-day sheet fail loudly
// with a machine-readable `error` code the client can act on.
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { DailySheetModel } from '@/models/factories/DailySheet';
import { persistDailyTotalsAndSync } from '@/utils/dailySheetPersist';
import { isYMD, dayRange } from '@/utils/dailySheetOpening';
import type { Model } from 'mongoose';
import type { IDailySheet } from '@/models/schemas/dailySheet.schema';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type SheetModel = Model<IDailySheet>;

/**
 * Resolve the sheet a write should target, enforcing lifecycle rules.
 * Returns either the open sheet or a ready-to-send 409 error response.
 */
async function resolveOpenSheet(
  DailySheet: SheetModel,
  ymd: string | null,
): Promise<{ sheet: IDailySheet } | { error: NextResponse }> {
  // No explicit backdate → act on the single currently-open sheet, whatever
  // calendar day it belongs to (a rolled-over day keeps working until closed).
  if (!ymd) {
    const open = await DailySheet.findOne({ isPosted: false }).sort({ date: -1 });
    if (open) return { sheet: open };
    return {
      error: NextResponse.json(
        { error: 'NO_SHEET_FOR_DATE', message: 'No open daily sheet. Open a day before posting.' },
        { status: 409 },
      ),
    };
  }

  const { start, end } = dayRange(ymd);
  const sheet = await DailySheet.findOne({ date: { $gte: start, $lt: end } });

  if (sheet) {
    if (sheet.isPosted) {
      return {
        error: NextResponse.json(
          { error: 'SHEET_CLOSED', message: 'This daily sheet is closed. Reopen the sheet or use the backdate flow.' },
          { status: 409 },
        ),
      };
    }
    return { sheet };
  }

  // No sheet for this date. If another day is still open, tell the client which
  // one so it can switch context; otherwise the day simply hasn't been opened.
  const otherOpen = await DailySheet.findOne({ isPosted: false }).sort({ date: -1 }).lean();
  if (otherOpen) {
    return {
      error: NextResponse.json(
        {
          error: 'OPEN_SHEET_EXISTS',
          message: 'An older sheet is still open. Close it before starting a new day.',
          openSheetDate: otherOpen.date,
        },
        { status: 409 },
      ),
    };
  }
  return {
    error: NextResponse.json(
      { error: 'NO_SHEET_FOR_DATE', message: 'No open daily sheet for this date. Open one before posting.' },
      { status: 409 },
    ),
  };
}

export async function POST(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body?.action ?? '');
  const ymd = isYMD(body?.targetDate) ? (body.targetDate as string) : null;

  try {
    switch (action) {
      /* ── Add a cash-slip income entry ── */
      case 'pushSlip': {
        const slipRaw = (body?.slip ?? {}) as Record<string, unknown>;
        const newSlip = {
          copyNumber: String(slipRaw.copyNumber ?? ''),
          uniqueNumber: String(slipRaw.uniqueNumber ?? ''),
          amount: num(slipRaw.amount),
          description: String(slipRaw.description ?? ''),
          paymentMethod: (['cash', 'cheque', 'online'].includes(String(slipRaw.paymentMethod))
            ? String(slipRaw.paymentMethod)
            : 'cash') as 'cash' | 'cheque' | 'online',
          bookings: Array.isArray(slipRaw.bookings) ? slipRaw.bookings : [],
        };

        const resolved = await resolveOpenSheet(DailySheet, ymd);
        if ('error' in resolved) return resolved.error;

        const updated = await DailySheet.findOneAndUpdate(
          { _id: resolved.sheet._id, isPosted: false },
          { $push: { slipEntries: newSlip } },
          { new: true },
        );
        if (!updated) {
          return NextResponse.json(
            { error: 'SHEET_CLOSED', message: 'The sheet was closed before the slip could be added.' },
            { status: 409 },
          );
        }

        const result = await persistDailyTotalsAndSync(DailySheet, resolved.sheet._id);
        return NextResponse.json({
          totalIncome: result?.totals.totalIncome ?? 0,
          closingBalance: result?.totals.closingBalance ?? 0,
          slipEntries: updated.slipEntries,
        });
      }

      /* ── Remove a slip by unique/copy number (cash-withdrawl undo mirror) ── */
      case 'pullSlip': {
        const uniqueNumber = String(body?.uniqueNumber ?? '');
        const copyNumber = body?.copyNumber != null ? String(body.copyNumber) : undefined;
        if (!uniqueNumber) {
          return NextResponse.json({ error: 'BAD_REQUEST', message: 'uniqueNumber required' }, { status: 400 });
        }

        const resolved = await resolveOpenSheet(DailySheet, ymd);
        if ('error' in resolved) return resolved.error;

        const pullMatch: Record<string, string> = { uniqueNumber };
        if (copyNumber) pullMatch.copyNumber = copyNumber;

        await DailySheet.updateOne(
          { _id: resolved.sheet._id, isPosted: false },
          { $pull: { slipEntries: pullMatch } },
        );

        const result = await persistDailyTotalsAndSync(DailySheet, resolved.sheet._id);
        return NextResponse.json({
          totalIncome: result?.totals.totalIncome ?? 0,
          closingBalance: result?.totals.closingBalance ?? 0,
          slipEntries: result?.doc?.slipEntries ?? [],
        });
      }

      /* ── Add an expense entry ── */
      case 'pushExpense': {
        const expRaw = (body?.expense ?? {}) as Record<string, unknown>;
        const amount = num(expRaw.amount);
        const lines = Array.isArray(expRaw.lines) ? (expRaw.lines as Array<Record<string, unknown>>) : undefined;

        // If an itemized breakdown is supplied, its lines must sum to the amount.
        if (lines && lines.length > 0) {
          const lineSum = lines.reduce((s, l) => s + num(l?.amount), 0);
          if (Math.abs(lineSum - amount) > 0.5) {
            return NextResponse.json(
              { error: 'LINES_MISMATCH', message: `Line total (${lineSum}) does not match amount (${amount}).` },
              { status: 400 },
            );
          }
        }

        const newEntry = {
          category: String(expRaw.category ?? ''),
          description: String(expRaw.description ?? ''),
          amount,
          paymentMethod: (['cash', 'cheque', 'online'].includes(String(expRaw.paymentMethod))
            ? String(expRaw.paymentMethod)
            : 'cash') as 'cash' | 'cheque' | 'online',
          isExpPosted: false,
          expID: '',
          postedCopyNumber: '',
          postedUniqueNumber: '',
          ...(lines && lines.length > 0 ? { lines } : {}),
          ...(expRaw.vendorId ? { vendorId: expRaw.vendorId } : {}),
          ...(expRaw.vendorName ? { vendorName: String(expRaw.vendorName) } : {}),
        };

        const resolved = await resolveOpenSheet(DailySheet, ymd);
        if ('error' in resolved) return resolved.error;

        const updated = await DailySheet.findOneAndUpdate(
          { _id: resolved.sheet._id, isPosted: false },
          { $push: { entries: newEntry } },
          { new: true },
        );
        if (!updated) {
          return NextResponse.json(
            { error: 'SHEET_CLOSED', message: 'The sheet was closed before the expense could be added.' },
            { status: 409 },
          );
        }

        const result = await persistDailyTotalsAndSync(DailySheet, resolved.sheet._id);
        const entries = (result?.doc?.entries ?? updated.entries).map((en) => ({
          _id: String(en._id),
          category: en.category ?? '',
          description: en.description ?? '',
          amount: num(en.amount),
          paymentMethod: en.paymentMethod ?? 'cash',
          isExpPosted: Boolean(en.isExpPosted),
          expID: en.expID ?? null,
          postedCopyNumber: en.postedCopyNumber ?? null,
          postedUniqueNumber: en.postedUniqueNumber ?? null,
          lines: Array.isArray(en.lines) ? en.lines : undefined,
          vendorId: en.vendorId ? String(en.vendorId) : null,
          vendorName: en.vendorName ?? null,
        }));

        return NextResponse.json({
          entries,
          totals: {
            totalExpense: result?.totals.totalExpense ?? 0,
            totalIncome: result?.totals.totalIncome ?? 0,
            closingBalance: result?.totals.closingBalance ?? 0,
          },
        });
      }

      default:
        return NextResponse.json({ error: 'BAD_REQUEST', message: `Unknown action "${action}".` }, { status: 400 });
    }
  } catch (err) {
    console.error('[atomic-push] failed:', err);
    return NextResponse.json({ error: 'SERVER_ERROR', message: 'Atomic push failed.' }, { status: 500 });
  }
}
