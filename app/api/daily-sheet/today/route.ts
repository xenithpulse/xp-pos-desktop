// app/api/daily-sheet/route.ts  (or wherever your route lives)
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { Types, Document } from 'mongoose';
import { IVoucher } from '@/models/schemas/voucher.schema';
import { DailySheetModel } from '@/models/factories/DailySheet';
import { syncDailyToMonthlyByDailySheet } from '@/utils/monthlySync';
import { findActiveSheet } from '@/utils/dailySheetOpening';


export interface ISlipEntry {
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description: string;
}

export interface IExpenseEntry {
  _id: Types.ObjectId | string | undefined;
  category: string;
  description: string;
  amount: number;
  isExpPosted: boolean;
  expID: string;
  postedCopyNumber: string;
  postedUniqueNumber: string;
}

export interface IDailySheet {
  _id: Types.ObjectId | string | undefined;
  date: Date;
  slipEntries: ISlipEntry[];
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  openingBalance: number;
  notes?: string;
  entries: IExpenseEntry[];
  voucherRef: IVoucher['_id'];
  isPosted: boolean;
}

function safeNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toObjectIdIfValid(id: unknown): Types.ObjectId | string | undefined {
  if (typeof id === 'string' && Types.ObjectId.isValid(id)) return new Types.ObjectId(id);
  if (id instanceof Types.ObjectId) return id;
  if (typeof id === 'string' && id.length > 0) return id;
  return undefined;
}

function normalizeClientEntry(ce: unknown): Partial<IExpenseEntry> {
  if (!ce || typeof ce !== 'object') {
    return {
      category: '',
      description: '',
      amount: 0,
      isExpPosted: false,
      expID: '',
      postedCopyNumber: '',
      postedUniqueNumber: '',
    };
  }
  const obj = ce as Record<string, unknown>;
  const id = toObjectIdIfValid(obj._id);
  return {
    _id: id ?? undefined,
    category: typeof obj.category === 'string' ? obj.category : '',
    description: typeof obj.description === 'string' ? obj.description : '',
    amount: safeNum(obj.amount ?? 0),
    isExpPosted: typeof obj.isExpPosted === 'boolean' ? obj.isExpPosted : Boolean(obj.isExpPosted ?? false),
    expID: typeof obj.expID === 'string' ? obj.expID : (obj.expID == null ? '' : String(obj.expID)),
    postedCopyNumber: typeof obj.postedCopyNumber === 'string' ? obj.postedCopyNumber : '',
    postedUniqueNumber: typeof obj.postedUniqueNumber === 'string' ? obj.postedUniqueNumber : '',
  };
}

export async function GET(req: NextRequest) {
  const conn = await mongooseConnect();

  // ?targetDate=YYYY-MM-DD → that day's sheet (backdate view). Without it, the
  // active sheet is the currently OPEN one, whatever calendar day it belongs to
  // — so a day that has rolled past midnight keeps loading until it's closed.
  const { searchParams } = new URL(req.url);
  const qDate = searchParams.get('targetDate');

  const sheet = (await findActiveSheet(conn, qDate)) as
    | (Document & IDailySheet & { entries: IExpenseEntry[] })
    | null;

  return NextResponse.json(sheet || null);
}

export async function PUT(req: NextRequest) {
  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);
  const bodyRaw = await req.json().catch(() => ({}));
  const body = typeof bodyRaw === 'object' && bodyRaw !== null ? (bodyRaw as Record<string, unknown>) : {};

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // find today's sheet (mutable doc)
  let sheet = (await DailySheet.findOne({
    date: {
      $gte: today,
      $lt: new Date(today.getTime() + 86400000),
    },
  }).exec()) as (Document & IDailySheet & { entries: IExpenseEntry[] }) | null;

  const willReplace = body.replaceEntries === true;
  const clientEntriesRaw = Array.isArray(body.entries) ? body.entries : [];
  const deletedEntryIdsRaw = Array.isArray(body.deletedEntryIds) ? body.deletedEntryIds : [];

  if (!sheet) {
    const newSheet = new DailySheet({
      date: today,
      openingBalance: safeNum(body.openingBalance ?? 0),
      totalIncome: safeNum(body.totalIncome ?? 0),
      totalExpense: 0,
      closingBalance: 0,
      notes: typeof body.notes === 'string' ? body.notes : '',
      entries: [],
    });

    // newSheet.save() returns a Document
    sheet = (await newSheet.save()) as Document & IDailySheet & { entries: IExpenseEntry[] };
  }

  // --- deletions (atomic where possible) ---
  if (deletedEntryIdsRaw.length > 0) {
    const objIds = deletedEntryIdsRaw
      .filter(Boolean)
      .map((id) => toObjectIdIfValid(id) ?? id)
      .filter(Boolean);

    try {
      await DailySheet.updateOne({ _id: sheet._id }, { $pull: { entries: { _id: { $in: objIds } } } }).exec();
    } catch (pullErr) {
      console.warn('atomic $pull failed for deletedEntryIds, falling back to doc-remove:', pullErr);
      sheet.entries = (sheet.entries || []).filter((e) => !objIds.some((id) => String(e._id) === String(id)));
    }

    // reload authoritative sheet
    sheet = (await DailySheet.findById(sheet._id).exec()) as (Document & IDailySheet & { entries: IExpenseEntry[] }) | null;
    if (!sheet) {
      return NextResponse.json({ message: 'Daily sheet disappeared after deletion.' }, { status: 500 });
    }
  }

  // Build existing map keyed by string id
  const existingMap = new Map<string, IExpenseEntry>();
  (sheet.entries || []).forEach((ex) => {
    if (ex && ex._id) existingMap.set(String(ex._id), ex);
  });

  // Normalize client entries
  const clientEntries = clientEntriesRaw.map(normalizeClientEntry);

  if (willReplace) {
    const newEntries = clientEntries.map((ce) => {
      const entry: Partial<IExpenseEntry> = {
        category: ce.category ?? '',
        description: ce.description ?? '',
        amount: safeNum(ce.amount ?? 0),
        isExpPosted: Boolean(ce.isExpPosted ?? false),
        expID: ce.expID ?? '',
        postedCopyNumber: ce.postedCopyNumber ?? '',
        postedUniqueNumber: ce.postedUniqueNumber ?? '',
      };
      if (ce._id) {
        const maybeObjId = toObjectIdIfValid(ce._id);
        if (maybeObjId) entry._id = maybeObjId;
      }
      return entry;
    });

    sheet.entries = newEntries as unknown as IExpenseEntry[];
  } else {
    // Merge mode: update existing or append new entries
    for (const ce of clientEntries) {
      if (ce._id) {
        const sub = (sheet.entries || []).find((e) => String(e._id) === String(ce._id));
        if (sub) {
          if (typeof ce.category !== 'undefined') sub.category = ce.category ?? sub.category;
          if (typeof ce.description !== 'undefined') sub.description = ce.description ?? sub.description;
          if (typeof ce.amount !== 'undefined') sub.amount = safeNum(ce.amount);
          if (typeof ce.isExpPosted !== 'undefined') sub.isExpPosted = Boolean(ce.isExpPosted);
          if (typeof ce.expID !== 'undefined') sub.expID = ce.expID ?? sub.expID;
          if (typeof ce.postedCopyNumber !== 'undefined') sub.postedCopyNumber = ce.postedCopyNumber ?? sub.postedCopyNumber;
          if (typeof ce.postedUniqueNumber !== 'undefined') sub.postedUniqueNumber = ce.postedUniqueNumber ?? sub.postedUniqueNumber;
          existingMap.delete(String(ce._id));
        } else {
          // unknown id from client: append as new
          const doc: Partial<IExpenseEntry> = {
            category: ce.category ?? '',
            description: ce.description ?? '',
            amount: safeNum(ce.amount ?? 0),
            isExpPosted: Boolean(ce.isExpPosted ?? false),
            expID: ce.expID ?? '',
            postedCopyNumber: ce.postedCopyNumber ?? '',
            postedUniqueNumber: ce.postedUniqueNumber ?? '',
          };
          const maybeObjId = toObjectIdIfValid(ce._id);
          if (maybeObjId) doc._id = maybeObjId;
          sheet.entries.push(doc as IExpenseEntry);
        }
      } else {
        // new entry
        const doc: Partial<IExpenseEntry> = {
          category: ce.category ?? '',
          description: ce.description ?? '',
          amount: safeNum(ce.amount ?? 0),
          isExpPosted: Boolean(ce.isExpPosted ?? false),
          expID: ce.expID ?? '',
          postedCopyNumber: ce.postedCopyNumber ?? '',
          postedUniqueNumber: ce.postedUniqueNumber ?? '',
        };
        sheet.entries.push(doc as IExpenseEntry);
      }
    }
    // leftover existingMap entries are preserved
  }

  // Recompute totals server-side
  const totalExpense = (sheet.entries || []).reduce((s, en) => s + safeNum((en as IExpenseEntry).amount), 0);
  const totalIncome = safeNum(body.totalIncome ?? (sheet.totalIncome ?? 0));
  const openingBalance = safeNum(body.openingBalance ?? (sheet.openingBalance ?? 0));

  sheet.totalExpense = totalExpense;
  sheet.closingBalance = openingBalance + totalIncome - totalExpense;

  if (typeof body.notes !== 'undefined') sheet.notes = typeof body.notes === 'string' ? body.notes : sheet.notes;
  if (typeof body.openingBalance !== 'undefined') sheet.openingBalance = openingBalance;
  if (typeof body.totalIncome !== 'undefined') sheet.totalIncome = totalIncome;

  const saved = await sheet.save();

  // best-effort monthly sync
  try {
    await syncDailyToMonthlyByDailySheet(saved);
    console.log('[daily-sheet PUT] synced daily to monthly successfully.');
  } catch (err) {
    console.error('[daily-sheet PUT] failed to sync daily to monthly:', err);
  }

  return NextResponse.json(saved);
}
