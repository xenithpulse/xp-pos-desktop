// utils.ts
import axios from 'axios';
import { deletedExpenseIds } from '../DailyExpenseList';
import { IDailySheet } from '@/models/schemas/dailySheet.schema';
import { Types } from 'mongoose';

export type SlipPaymentMethod = 'cash' | 'cheque' | 'online';

/**
 * Special expense category that, when posted as a voucher, ALSO mirrors itself
 * into the daily sheet's `slipEntries` (income side) using the voucher's
 * copy/unique numbers. Models a "cash withdrawal from bank" event where the
 * money exits the bank (expense) and immediately enters the cash drawer (income).
 */
export const CASH_WITHDRAWL_CATEGORY = 'Cash Withdrawl';
export const CASH_WITHDRAWL_DESCRIPTION = 'cash withdrawl from bank';

/** Booking summary attached to a slip (mirrors CashSlip.addedToContract entries) */
export interface ISlipBookingLink {
  bookingId?: string;
  clientName?: string;
  bookingUniqueId?: string;
  eventTimeAndDate?: string;
  hallArea?: string;
  guest?: number;
}

export interface ICashSlip {
  _id: string;
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description: string;
  used: boolean;
  usedBy: string;
  usedAt: string;
  /** Source slip's payment method ('Cash' | 'Cheque' | 'Online' on the server) */
  paymentMethod?: string;
  /** Source slip's booking links (`addedToContract`) */
  addedToContract?: ISlipBookingLink[];
}

export interface ISlipEntry {
  _id: string;
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description: string;
  /** Payment method copied from the source CashSlip */
  paymentMethod?: SlipPaymentMethod;
  /** Snapshot of CashSlip.addedToContract at the time of usage */
  bookings?: ISlipBookingLink[];
}

export interface IExpenseLine {
  groupName?: string;
  subCategory?: string;
  unit?: string;
  quantity?: number;
  rate?: number;
  amount: number;
  description?: string;
}

/** Booking trace on an event-profitability-imported expense (see server
 *  IExpenseBookingRef). Snapshot only — read for display / dedup. */
export interface IExpenseBookingRef {
  bookingId?: string;
  bookingUniqueId?: string;
  eventDate?: string;
  clientName?: string;
  sourceUpdateCount?: number;
  source?: string;
}

export interface IExpenseEntry {
  _id?: string | Types.ObjectId;
  category: string;
  description?: string;
  amount: number;
  paymentMethod?: 'cash' | 'cheque' | 'online';
  isExpPosted?: boolean;
  expID?: string | null;
  postedCopyNumber?: string | null;
  postedUniqueNumber?: string | null;
  // ── Phase 2 (optional) ──
  lines?: IExpenseLine[];
  vendorId?: string | null;
  vendorName?: string | null;
  /** Present when auto-imported from a booking's Event Profitability. */
  bookingRef?: IExpenseBookingRef;
}

// small local type for server-side entry shape (adjust optional fields as needed)
type ServerEntry = {
  _id: string | { toString?: () => string } | number;
  category?: string | null;
  description?: string | null;
  amount?: number | null;
  paymentMethod?: 'cash' | 'cheque' | 'online' | null;
  isExpPosted?: boolean | null;
  expID?: string | null;
  postedCopyNumber?: string | null;
  postedUniqueNumber?: string | null;
  lines?: IExpenseLine[] | null;
  vendorId?: string | null;
  vendorName?: string | null;
};


interface Entry {
  category: string;
  description: string;
  amount: number;
}

interface DailySheet {
  _id: string;
  date: string;
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  openingBalance: number;
  notes?: string;
  slipEntries?: ISlipEntry[];
  entries: Entry[];
}

/* -------- Logger helpers -------- */
const now = () => new Date().toISOString();
const logSuccess = (title: string, payload?: unknown) => {
  console.log(`[DailySheet][SUCCESS] ${now()} - ${title}`, payload ?? null);
};
const logError = (title: string, err?: unknown) => {
  console.error(`[DailySheet][ERROR] ${now()} - ${title}`, err ?? null);
};

/* -------- Helpers -------- */
const safeNum = (v: string | number | undefined) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Trio returned by /api/daily-sheet/opening-balance — combined opening
 *  plus the per-method (cash / online) split carried forward from the
 *  prior day's closing balances. */
export interface IOpeningBalanceBreakdown {
  openingBalance: number;
  cashOpeningBalance: number;
  onlineOpeningBalance: number;
}

export const fetchOpeningBalanceBreakdown = async (): Promise<IOpeningBalanceBreakdown> => {
  try {
    const { data } = await axios.get<Partial<IOpeningBalanceBreakdown>>('/api/daily-sheet/opening-balance');
    const result: IOpeningBalanceBreakdown = {
      openingBalance: safeNum(data?.openingBalance),
      cashOpeningBalance: safeNum(data?.cashOpeningBalance),
      onlineOpeningBalance: safeNum(data?.onlineOpeningBalance),
    };
    logSuccess('Fetched opening balance breakdown (from dedicated API)', result);
    return result;
  } catch (err) {
    logError('fetchOpeningBalanceBreakdown failed', err);
    return { openingBalance: 0, cashOpeningBalance: 0, onlineOpeningBalance: 0 };
  }
};

const fetchOpeningBalanceValue = async (): Promise<number> => {
  const { openingBalance } = await fetchOpeningBalanceBreakdown();
  return openingBalance;
};

/* ------------------------- 4. Sync slip entry -------------------------
   Uses the atomic-push API to $push the slip in a single DB operation.
   Eliminates the read-modify-write race condition.
--------------------------------------------------------------------------- */
export const syncSlipEntry = async (newSlip: ISlipEntry, cachedOpeningBalance?: number, targetDate?: string) => {
  try {
    const openingBalance = cachedOpeningBalance ?? await fetchOpeningBalanceValue();

    const { data } = await axios.post("/api/daily-sheet/atomic-push", {
      action: "pushSlip",
      slip: {
        _id: newSlip._id,
        copyNumber: newSlip.copyNumber,
        uniqueNumber: newSlip.uniqueNumber,
        amount: newSlip.amount,
        description: newSlip.description,
        paymentMethod: newSlip.paymentMethod ?? 'cash',
        bookings: Array.isArray(newSlip.bookings) ? newSlip.bookings : [],
      },
      openingBalance,
      ...(targetDate && { targetDate }),
    });

    logSuccess("Synced slip entry (atomic push)", {
      totalIncome: data?.totalIncome,
      closingBalance: data?.closingBalance,
      openingBalance,
    });
  } catch (err) {
    logError("syncSlipEntry failed", err);
    throw err;
  }
};

/* ------------------------- Cash-withdrawl slip mirror -------------------------
   When a "Cash Withdrawl" voucher is posted, we mirror it onto slipEntries
   using the voucher's copy/unique numbers so the cash drawer income matches
   the bank withdrawal. There is NO underlying CashSlip — these helpers send
   a slip without an `_id`, so the server-side enrichment falls back to the
   client-supplied paymentMethod ('cash') and skips booking enrichment.
------------------------------------------------------------------------------ */
export const pushCashWithdrawlSlipFromVoucher = async (
  voucher: { copyNumber?: string | null; uniqueNumber?: string | null; amount: number; description?: string | null },
  cachedOpeningBalance?: number,
  targetDate?: string,
) => {
  const copyNumber = (voucher.copyNumber ?? '').toString().trim();
  const uniqueNumber = (voucher.uniqueNumber ?? '').toString().trim();
  if (!copyNumber || !uniqueNumber || !(voucher.amount > 0)) {
    throw new Error('pushCashWithdrawlSlipFromVoucher: missing copy/unique number or invalid amount');
  }

  try {
    const openingBalance = cachedOpeningBalance ?? await fetchOpeningBalanceValue();
    const { data } = await axios.post('/api/daily-sheet/atomic-push', {
      action: 'pushSlip',
      slip: {
        // No _id — this is a synthetic slip without a backing CashSlip document.
        copyNumber,
        uniqueNumber,
        amount: safeNum(voucher.amount),
        description: voucher.description ?? CASH_WITHDRAWL_DESCRIPTION,
        paymentMethod: 'cash',
        bookings: [],
      },
      openingBalance,
      ...(targetDate && { targetDate }),
    });
    logSuccess('Pushed cash-withdrawl slip mirror', {
      uniqueNumber,
      copyNumber,
      totalIncome: data?.totalIncome,
    });
    return data;
  } catch (err) {
    logError('pushCashWithdrawlSlipFromVoucher failed', err);
    throw err;
  }
};

export const removeCashWithdrawlSlipMirror = async (
  voucher: { copyNumber?: string | null; uniqueNumber?: string | null },
  targetDate?: string,
) => {
  const copyNumber = (voucher.copyNumber ?? '').toString().trim();
  const uniqueNumber = (voucher.uniqueNumber ?? '').toString().trim();
  if (!uniqueNumber) {
    logError('removeCashWithdrawlSlipMirror: missing uniqueNumber');
    return null;
  }

  try {
    const { data } = await axios.post('/api/daily-sheet/atomic-push', {
      action: 'pullSlip',
      uniqueNumber,
      ...(copyNumber && { copyNumber }),
      ...(targetDate && { targetDate }),
    });
    logSuccess('Removed cash-withdrawl slip mirror', { uniqueNumber, copyNumber });
    return data;
  } catch (err) {
    logError('removeCashWithdrawlSlipMirror failed', err);
    throw err;
  }
};

function safeMergeEntries(existingEntries: IExpenseEntry[], clientEntries: IExpenseEntry[]) {
  const existingMap = new Map<string, IExpenseEntry>();
  for (const ex of existingEntries || []) {
    if (ex && ex._id) existingMap.set(String(ex._id), ex);
  }

  const merged: IExpenseEntry[] = [];

  for (const ce of clientEntries) {
    if (ce._id) {
      const idStr = String(ce._id);

      // If this id is known deleted locally *and* not present on the server (existingMap),
      // skip re-adding it. This prevents stale client data from resurrecting deleted items.
      if (deletedExpenseIds.has(idStr) && !existingMap.has(idStr)) {
        // skip re-adding a recently deleted id
        continue;
      }

      const found = existingMap.get(idStr);
      if (found) {
        merged.push({
          _id: String(found._id),
          category: ce.category,
          description: ce.description ?? found.description ?? "",
          amount: Number(ce.amount ?? found.amount ?? 0),
          paymentMethod: ce.paymentMethod ?? found.paymentMethod ?? 'cash',
          isExpPosted: typeof found.isExpPosted !== "undefined" ? found.isExpPosted : ce.isExpPosted ?? false,
          expID: typeof found.expID !== "undefined" ? found.expID : ce.expID ?? null,
          postedCopyNumber: typeof found.postedCopyNumber !== "undefined" ? found.postedCopyNumber : ce.postedCopyNumber ?? null,
          postedUniqueNumber: typeof found.postedUniqueNumber !== "undefined" ? found.postedUniqueNumber : ce.postedUniqueNumber ?? null,
        });
        existingMap.delete(idStr);
      } else {
        merged.push({
          _id: idStr,
          category: ce.category,
          description: ce.description ?? "",
          amount: Number(ce.amount ?? 0),
          paymentMethod: ce.paymentMethod ?? 'cash',
          isExpPosted: ce.isExpPosted ?? false,
          expID: ce.expID ?? null,
          postedCopyNumber: ce.postedCopyNumber ?? null,
          postedUniqueNumber: ce.postedUniqueNumber ?? null,
        });
      }
    } else {
      // client-generated new entry (no _id) => treat as new
      merged.push({
        category: ce.category,
        description: ce.description ?? "",
        amount: Number(ce.amount ?? 0),
        paymentMethod: ce.paymentMethod ?? 'cash',
        isExpPosted: ce.isExpPosted ?? false,
        expID: ce.expID ?? null,
        postedCopyNumber: ce.postedCopyNumber ?? null,
        postedUniqueNumber: ce.postedUniqueNumber ?? null,
      });
    }
  }

  // Push remaining server-side entries
  for (const leftover of existingMap.values()) {
    merged.push({
      _id: String(leftover._id),
      category: leftover.category ?? "",
      description: leftover.description ?? "",
      amount: Number(leftover.amount ?? 0),
      paymentMethod: leftover.paymentMethod ?? 'cash',
      isExpPosted: leftover.isExpPosted ?? false,
      expID: leftover.expID ?? null,
      postedCopyNumber: leftover.postedCopyNumber ?? null,
      postedUniqueNumber: leftover.postedUniqueNumber ?? null,
    });
  }

  return merged;
}
export const syncExpenses = async (updatedExpenses: IExpenseEntry[], cachedOpeningBalance?: number, targetDate?: string) => {
  try {
    const openingBalance = cachedOpeningBalance ?? await fetchOpeningBalanceValue();

    // filter out any client entries that are known-deleted locally
    const filteredClientEntries = (updatedExpenses || []).filter(
      (e) => !e._id || !deletedExpenseIds.has(String(e._id))
    );

    // Find entries without _id — these are the NEW entries to push atomically
    const newEntries = filteredClientEntries.filter((e) => !e._id);

    if (newEntries.length === 1) {
      // ── Fast path: single new expense → atomic $push (no read-modify-write) ──
      const entry = newEntries[0];
      const { data: pushResult } = await axios.post("/api/daily-sheet/atomic-push", {
        action: "pushExpense",
        expense: {
          category: entry.category,
          description: entry.description ?? "",
          amount: safeNum(entry.amount),
          paymentMethod: entry.paymentMethod ?? 'cash',
          // Phase 2 — forward optional multi-line + vendor selection.
          // Server validates lines sum vs. amount and rejects mismatches.
          ...(Array.isArray(entry.lines) && entry.lines.length > 0
            ? { lines: entry.lines }
            : {}),
          ...(entry.vendorId ? { vendorId: entry.vendorId } : {}),
          ...(entry.vendorName ? { vendorName: entry.vendorName } : {}),
        },
        openingBalance: safeNum(openingBalance),
        ...(targetDate && { targetDate }),
      });

      const authoritativeEntries = Array.isArray(pushResult?.entries)
        ? pushResult.entries.map((en: ServerEntry) => ({
            _id: String(en._id),
            category: en.category ?? "",
            description: en.description ?? "",
            amount: Number(en.amount ?? 0),
            paymentMethod: en.paymentMethod ?? 'cash',
            isExpPosted: Boolean(en.isExpPosted),
            expID: en.expID ?? null,
            postedCopyNumber: en.postedCopyNumber ?? null,
            postedUniqueNumber: en.postedUniqueNumber ?? null,
            lines: Array.isArray(en.lines) ? en.lines : undefined,
            vendorId: en.vendorId ?? null,
            vendorName: en.vendorName ?? null,
          }))
        : [];

      // Clean up deleted markers
      for (const id of Array.from(deletedExpenseIds)) {
        if (!authoritativeEntries.some((en: ServerEntry) => String(en._id) === id)) {
          deletedExpenseIds.delete(id);
        }
      }

      logSuccess("Synced expense (atomic push)", pushResult?.totals);
      return { entries: authoritativeEntries, totals: pushResult?.totals };
    }

    // ── Fallback path: bulk merge (multiple new entries or complex edit) ──
    const totalExpense = filteredClientEntries.reduce((sum, e) => sum + safeNum(e.amount), 0);
    const sheetUrl = targetDate ? `/api/daily-sheet/today?targetDate=${targetDate}` : '/api/daily-sheet/today';
    const todayRes = await axios.get(sheetUrl).catch(() => ({ data: null }));
    const todaySheet: IDailySheet | null = todayRes?.data ?? null;

    if (todaySheet && todaySheet._id) {
      // The Mongoose DocumentArray subdoc shape (vendorId: ObjectId) doesn't
      // structurally match our client-side IExpenseEntry (vendorId: string),
      // so we cast through unknown — safeMergeEntries only reads scalar fields
      // and stringifies _id, so the runtime shape is compatible.
      const existingEntries = (Array.isArray(todaySheet.entries)
        ? (todaySheet.entries as unknown as IExpenseEntry[])
        : []);
      const mergedEntries = safeMergeEntries(existingEntries, filteredClientEntries || []);

      const totalIncome = safeNum(todaySheet.totalIncome);
      const closingBalance = safeNum(openingBalance) + totalIncome - totalExpense;

      await axios.put(`/api/daily-sheet/today/${todaySheet._id}`, {
        entries: mergedEntries,
        openingBalance: safeNum(openingBalance),
        totalIncome,
        totalExpense,
        closingBalance,
        ...(targetDate && { targetDate }),
      });

      const fresh = await axios.get(sheetUrl).catch(() => ({ data: null }));
      const freshSheet = fresh?.data ?? null;
      const authoritativeEntries = Array.isArray(freshSheet?.entries)
        ? freshSheet.entries.map((en: ServerEntry) => ({
            _id: String(en._id),
            category: en.category ?? "",
            description: en.description ?? "",
            amount: Number(en.amount ?? 0),
            paymentMethod: en.paymentMethod ?? 'cash',
            isExpPosted: Boolean(en.isExpPosted),
            expID: en.expID ?? null,
            postedCopyNumber: en.postedCopyNumber ?? null,
            postedUniqueNumber: en.postedUniqueNumber ?? null,
            lines: Array.isArray(en.lines) ? en.lines : undefined,
            vendorId: en.vendorId ?? null,
            vendorName: en.vendorName ?? null,
          }))
        : [];

      for (const id of Array.from(deletedExpenseIds)) {
        if (!authoritativeEntries.some((en: ServerEntry) => String(en._id) === id)) {
          deletedExpenseIds.delete(id);
        }
      }

      logSuccess("Synced expenses (merged -> updated sheet)", { totalIncome, totalExpense, closingBalance, openingBalance });
      return { entries: authoritativeEntries, totals: { totalExpense, closingBalance, totalIncome, openingBalance } };
    } else {
      // Auto-create has been removed — surface a clear error so the UI can
      // prompt the user to explicitly Open a daily sheet first.
      const dateLabel = targetDate ?? 'today';
      const message = `No open daily sheet for ${dateLabel}. Open one before posting expenses.`;
      logError('syncExpenses: no sheet for date', { dateLabel });
      throw new Error(message);
    }
  } catch (err) {
    logError("syncExpenses failed", err);
    throw err;
  }
};