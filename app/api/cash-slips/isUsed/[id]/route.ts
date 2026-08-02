// app/api/cash-slips/isUsed/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";
import { CashSlipModel } from "@/models/factories/CashSlip";
import { extractId } from "@/utils/extractID";
import mongoose from 'mongoose';
import { DailySheetModel } from '@/models/factories/DailySheet';
import { ICashSlip } from '@/models/schemas/cashslip.schema';
import { IDailySheet, ISlipEntry } from '@/models/schemas/dailySheet.schema';
import { computeDailyTotals } from '@/utils/dailySheetTotals';
import { syncDailyToMonthlyByDailySheet } from '@/utils/monthlySync';

async function handleRevert(req: NextRequest) {
  await mongooseConnect();
  const authResult = await isAdminRequest({ requiredPerm: "manage_orders" });
  if (authResult) return authResult;
  const conn = await mongooseConnect();
  const CashSlip = CashSlipModel(conn);
  const DailySheet = DailySheetModel(conn);

  const idOrUnique = extractId(req, 4).trim();
  if (!idOrUnique) return NextResponse.json({ error: 'No id provided' }, { status: 400 });

  // Build slip query: if looks like ObjectId include objectId condition, else fallback to uniqueNumber only
  const isObjectId = mongoose.Types.ObjectId.isValid(idOrUnique);
  const slipQuery = isObjectId
    ? { $or: [{ _id: new mongoose.Types.ObjectId(idOrUnique) }, { uniqueNumber: idOrUnique }] }
    : { uniqueNumber: idOrUnique };

  console.log('[cash-slips/isUsed] revert attempt for:', idOrUnique);
  console.log('[cash-slips/isUsed] slipQuery:', JSON.stringify(slipQuery));

  const session = await mongoose.startSession();
  let usedTransaction = false;

  try {
    const foundSlip = (await CashSlip.findOne(slipQuery).lean()) as (ICashSlip & { _id: string }) | null;
    if (!foundSlip) {
      return NextResponse.json({ error: 'Slip not found', tried: { idOrUnique, slipQuery } }, { status: 404 });
    }

    const slipId = foundSlip._id;
    const slipUnique = foundSlip.uniqueNumber;

    // Build DailySheet query to find the doc that contains this slip entry
    const dsOrConditions: Array<Record<string, unknown>> = [];
    if (isObjectId) {
      try {
        dsOrConditions.push({ 'slipEntries._id': new mongoose.Types.ObjectId(String(slipId)) });
      } catch {
        // ignore invalid ObjectId
      }
    }
    dsOrConditions.push({ 'slipEntries._id': String(slipId) });
    if (slipUnique) dsOrConditions.push({ 'slipEntries.uniqueNumber': slipUnique });

    const dsQuery = { $or: dsOrConditions };

    try {
      session.startTransaction();
      usedTransaction = true;
    } catch {
      usedTransaction = false;
    }

    let updatedSlip: (ICashSlip & { _id: string }) | null = null;
    let updatedDaily: (IDailySheet & { _id: string }) | null = null;

    if (usedTransaction) {
      updatedSlip = (await CashSlip.findOneAndUpdate(
        slipQuery,
        { $set: { used: false, usedBy: null, usedAt: null } },
        { new: true, session }
      ).lean()) as (ICashSlip & { _id: string }) | null;

      const daily = (await DailySheet.findOne(dsQuery).session(session).lean()) as (IDailySheet & { _id: string }) | null;

      if (daily) {
        const newSlipEntries = (daily.slipEntries || []).filter((entry: ISlipEntry & { _id?: string }) => {
          const entryId = entry._id ? String(entry._id) : '';
          if (slipUnique && entry.uniqueNumber === slipUnique) return false;
          if (String(slipId) && entryId === String(slipId)) return false;
          return true;
        });

        const totals = computeDailyTotals({
          slipEntries: newSlipEntries,
          entries: daily.entries ?? [],
          openingBalance: daily.openingBalance,
          cashOpeningBalance: daily.cashOpeningBalance,
          onlineOpeningBalance: daily.onlineOpeningBalance,
        });

        updatedDaily = (await DailySheet.findByIdAndUpdate(
          daily._id,
          {
            $set: {
              slipEntries: newSlipEntries,
              totalIncome: totals.totalIncome,
              totalExpense: totals.totalExpense,
              closingBalance: totals.closingBalance,
              cashClosingBalance: totals.cashClosingBalance,
              onlineClosingBalance: totals.onlineClosingBalance,
              updatedAt: new Date(),
            },
          },
          { new: true, session }
        ).lean()) as (IDailySheet & { _id: string }) | null;
      }

      await session.commitTransaction();
    } else {
      updatedSlip = (await CashSlip.findOneAndUpdate(
        slipQuery,
        { $set: { used: false, usedBy: null, usedAt: null } },
        { new: true }
      ).lean()) as (ICashSlip & { _id: string }) | null;

      const daily = (await DailySheet.findOne(dsQuery).lean()) as (IDailySheet & { _id: string }) | null;

      if (daily) {
        const newSlipEntries = (daily.slipEntries || []).filter((entry: ISlipEntry & { _id?: string }) => {
          const entryId = entry._id ? String(entry._id) : '';
          if (slipUnique && entry.uniqueNumber === slipUnique) return false;
          if (String(slipId) && entryId === String(slipId)) return false;
          return true;
        });

        const totals = computeDailyTotals({
          slipEntries: newSlipEntries,
          entries: daily.entries ?? [],
          openingBalance: daily.openingBalance,
          cashOpeningBalance: daily.cashOpeningBalance,
          onlineOpeningBalance: daily.onlineOpeningBalance,
        });

        updatedDaily = (await DailySheet.findByIdAndUpdate(
          daily._id,
          {
            $set: {
              slipEntries: newSlipEntries,
              totalIncome: totals.totalIncome,
              totalExpense: totals.totalExpense,
              closingBalance: totals.closingBalance,
              cashClosingBalance: totals.cashClosingBalance,
              onlineClosingBalance: totals.onlineClosingBalance,
              updatedAt: new Date(),
            },
          },
          { new: true }
        ).lean()) as (IDailySheet & { _id: string }) | null;
      }
    }

    if (usedTransaction) session.endSession();

    // Roll the reduced income back up into the open monthly sheet. Best-effort —
    // the revert itself already committed; a monthly-sync hiccup is non-fatal.
    if (updatedDaily) {
      try {
        await syncDailyToMonthlyByDailySheet(updatedDaily);
      } catch (syncErr) {
        console.error('[cash-slips/isUsed revert] monthly sync failed (non-fatal):', syncErr);
      }
    }

    return NextResponse.json(
      { message: 'Slip reverted successfully', slip: updatedSlip, dailySheet: updatedDaily ?? null },
      { status: 200 }
    );
  } catch (err) {
    console.error('PATCH/PUT /api/cash-slips/isUsed/[id] error:', err);
    try {
      if (usedTransaction) await session.abortTransaction();
      session.endSession();
    } catch {
      // ignore
    }
    return NextResponse.json({ error: 'Failed to revert slip and update daily sheet' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  return handleRevert(req);
}
export async function PUT(req: NextRequest) {
  return handleRevert(req);
}
