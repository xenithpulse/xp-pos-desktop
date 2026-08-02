import { Types, type Model } from 'mongoose';
import type { IDailySheet } from '@/models/schemas/dailySheet.schema';
import { computeDailyTotals, type DailyTotals } from '@/utils/dailySheetTotals';
import { syncDailyToMonthlyByDailySheet } from '@/utils/monthlySync';

/**
 * Recompute a daily sheet's combined + per-method totals from its authoritative
 * slip/expense arrays and persist them with a targeted `$set` (never a full
 * document save — that would clobber a concurrent `$push`/`$pull`). Then roll
 * the fresh figures up into the open monthly sheet.
 *
 * Returns the re-read document and the computed totals, or null if the sheet
 * vanished.
 */
export async function persistDailyTotalsAndSync(
  DailySheet: Model<IDailySheet>,
  sheetId: unknown,
): Promise<{ doc: IDailySheet; totals: DailyTotals } | null> {
  const _id = sheetId as Types.ObjectId | string;
  const fresh = await DailySheet.findById(_id);
  if (!fresh) return null;

  const totals = computeDailyTotals({
    slipEntries: fresh.slipEntries ?? [],
    entries: fresh.entries ?? [],
    openingBalance: fresh.openingBalance,
    cashOpeningBalance: fresh.cashOpeningBalance,
    onlineOpeningBalance: fresh.onlineOpeningBalance,
  });

  await DailySheet.updateOne(
    { _id },
    {
      $set: {
        totalIncome: totals.totalIncome,
        totalExpense: totals.totalExpense,
        closingBalance: totals.closingBalance,
        cashClosingBalance: totals.cashClosingBalance,
        onlineClosingBalance: totals.onlineClosingBalance,
      },
    },
  );

  const synced = await DailySheet.findById(_id);
  if (synced) {
    try {
      await syncDailyToMonthlyByDailySheet(synced);
    } catch (err) {
      console.error('[dailySheetPersist] monthly sync failed (non-fatal):', err);
    }
    return { doc: synced, totals };
  }
  return { doc: fresh, totals };
}
