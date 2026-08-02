// app/api/daily-sheet/today/entries/route.ts
//
// Per-entry operations on a daily sheet (defaults to today PKT; ?targetDate=
// selects a backdated sheet):
//   GET    — list entries (new shape: paymentMethod / lines / vendor / bookingRef)
//   PUT    — edit one entry, then recompute combined + per-method totals
//   DELETE — remove one entry, cascade its vouchers, recompute totals, and
//            return the full remaining entry list so the client needs no refetch
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { DailySheetModel } from '@/models/factories/DailySheet';
import { VoucherModel } from '@/models/factories/Voucher';
import { persistDailyTotalsAndSync } from '@/utils/dailySheetPersist';
import { isYMD, dayRange } from '@/utils/dailySheetOpening';
import { Types } from 'mongoose';
import type { IDailySheet, IExpenseEntry } from '@/models/schemas/dailySheet.schema';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// ?targetDate=YYYY-MM-DD → that day's sheet; otherwise the currently OPEN sheet
// (whatever calendar day it belongs to), so a rolled-over day keeps working.
async function findSheet(req: NextRequest) {
  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);
  const q = new URL(req.url).searchParams.get('targetDate');
  const sheet = isYMD(q)
    ? await (async () => {
        const { start, end } = dayRange(q);
        return DailySheet.findOne({ date: { $gte: start, $lt: end } });
      })()
    : await DailySheet.findOne({ isPosted: false }).sort({ date: -1 });
  return { conn, DailySheet, sheet };
}

/** Serialize an entry subdoc into the client's expected shape. */
function serializeEntry(en: IExpenseEntry & { _id?: unknown }) {
  return {
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
    bookingRef: en.bookingRef,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { sheet } = await findSheet(req);
    if (!sheet || !Array.isArray(sheet.entries)) {
      return NextResponse.json([], { status: 200 });
    }
    return NextResponse.json(sheet.entries.map(serializeEntry), { status: 200 });
  } catch (err) {
    console.error('[daily-sheet entries GET] failed:', err);
    return NextResponse.json({ message: "Failed to fetch today's expenses." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
    if (authResult) return authResult;

    const payload = (await req.json()) as Partial<IExpenseEntry> & { _id?: string };
    const entryId = payload._id;
    if (!entryId) {
      return NextResponse.json({ message: 'Missing entry ID' }, { status: 400 });
    }

    const { conn, DailySheet, sheet } = await findSheet(req);
    if (!sheet) {
      return NextResponse.json({ message: 'No daily sheet found for this date' }, { status: 404 });
    }

    const entry = sheet.entries.id(entryId);
    if (!entry) {
      return NextResponse.json({ message: 'Entry not found' }, { status: 404 });
    }

    // Sanity check: if posted voucher fields are supplied, the voucher must exist.
    if (typeof payload.postedCopyNumber !== 'undefined' && typeof payload.postedUniqueNumber !== 'undefined') {
      const copy = payload.postedCopyNumber;
      const unique = payload.postedUniqueNumber;
      const vID = payload.expID;
      if (copy && unique && vID) {
        const Voucher = VoucherModel(conn);
        const matched = await Voucher.findOne({ copyNumber: copy, uniqueNumber: unique, _id: vID }).lean().exec();
        if (!matched) {
          return NextResponse.json(
            { sanity: false, message: 'Provided copy/unique or V-ID do not match any Voucher. Update rejected.' },
            { status: 422 },
          );
        }
      }
    }

    // Apply editable fields.
    if (typeof payload.category !== 'undefined') entry.category = payload.category ?? entry.category;
    if (typeof payload.description !== 'undefined') entry.description = payload.description ?? entry.description;
    if (typeof payload.amount !== 'undefined') entry.amount = num(payload.amount);
    if (typeof payload.paymentMethod !== 'undefined') entry.paymentMethod = payload.paymentMethod ?? entry.paymentMethod;
    if (typeof payload.isExpPosted !== 'undefined') entry.isExpPosted = Boolean(payload.isExpPosted);
    if (typeof payload.expID !== 'undefined') entry.expID = payload.expID ?? '';
    if (typeof payload.postedCopyNumber !== 'undefined') entry.postedCopyNumber = payload.postedCopyNumber ?? '';
    if (typeof payload.postedUniqueNumber !== 'undefined') entry.postedUniqueNumber = payload.postedUniqueNumber ?? '';

    await sheet.save();

    const persisted = await persistDailyTotalsAndSync(DailySheet, sheet._id);
    const updatedEntry = persisted?.doc.entries.id(entryId) ?? entry;

    return NextResponse.json(
      {
        sanity: true,
        updatedEntry: serializeEntry(updatedEntry),
        totals: {
          totalExpense: persisted?.totals.totalExpense ?? 0,
          closingBalance: persisted?.totals.closingBalance ?? 0,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[daily-sheet entries PUT] failed:', err);
    return NextResponse.json({ message: 'Failed to update entry.' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
    if (authResult) return authResult;

    const { searchParams } = new URL(req.url);
    const entryId = searchParams.get('id');
    if (!entryId) {
      return NextResponse.json({ message: 'Missing entry ID' }, { status: 400 });
    }

    const { conn, DailySheet, sheet } = await findSheet(req);
    if (!sheet) {
      return NextResponse.json({ message: 'No daily sheet for this date' }, { status: 404 });
    }

    const entryObjectId = Types.ObjectId.isValid(entryId) ? new Types.ObjectId(entryId) : null;
    const found = (sheet.entries as unknown as Array<IExpenseEntry & { _id?: unknown }>).find(
      (e) => String(e._id) === entryId,
    );
    if (!found) {
      return NextResponse.json({ message: 'Entry not found' }, { status: 404 });
    }

    // Remove the entry atomically.
    await DailySheet.updateOne(
      { _id: sheet._id },
      { $pull: { entries: { _id: entryObjectId ?? entryId } } },
    );

    // Cascade any vouchers created from this entry.
    const Voucher = VoucherModel(conn);
    const voucherCriteria = entryObjectId
      ? { $or: [{ expenseEntry: entryId }, { expenseEntry: entryObjectId }] }
      : { expenseEntry: entryId };
    const vouchers = await Voucher.find(voucherCriteria).lean<{ _id: Types.ObjectId | string }[]>().exec();
    const deletedVoucherIds = vouchers.map((v) => String(v._id));
    if (deletedVoucherIds.length > 0) {
      await Voucher.deleteMany(voucherCriteria);
    }

    const persisted = await persistDailyTotalsAndSync(DailySheet, sheet._id);
    const updatedEntries = (persisted?.doc.entries ?? []).map(serializeEntry);

    return NextResponse.json(
      {
        success: true,
        removedEntryId: entryId,
        deletedVoucherIds,
        updatedEntries,
        updatedTotals: {
          totalExpense: persisted?.totals.totalExpense ?? null,
          closingBalance: persisted?.totals.closingBalance ?? null,
        },
      },
      { status: 200 },
    );
  } catch (err) {
    console.error('[daily-sheet entries DELETE] failed:', err);
    return NextResponse.json({ message: 'Failed to delete entry.' }, { status: 500 });
  }
}
