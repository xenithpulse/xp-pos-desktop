import { mongooseConnect } from "@/lib/mongoose";
import { MonthlySheetModel } from "@/models/factories/MonthlySheet";
import { DailySheetModel } from "@/models/factories/DailySheet";
import Types, { Document } from "mongoose";
import { IVoucher } from "@/models/schemas/voucher.schema";
import mongoose from "mongoose";

export interface ISlipEntry {
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description: string;
}

export interface IExpenseEntry {
  category: string;
  description: string;
  amount: number;
  paymentMethod?: 'cash' | 'cheque' | 'online';
}

export interface IDailySheetForSync {
  _id: mongoose.Types.ObjectId | string;
  date: Date | string;
  slipEntries?: ISlipEntry[];
  totalIncome?: number;
  totalExpense?: number;
  closingBalance?: number;
  notes?: string;
  entries?: IExpenseEntry[];
  voucherRef?: IVoucher["_id"];
  isPosted?: boolean;
}

export interface IDailySummary {
  dailySheetId: mongoose.Types.ObjectId;
  date: Date; // PKT-midnight for the day (stored with +05:00)
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  slipEntries: ISlipEntry[];
  entries: IExpenseEntry[];
}

export interface IMonthlySheetDocument extends Document {
  _id: mongoose.Types.ObjectId;
  monthLabel: string;
  startDate: Date;
  endDate: Date;
  openingBalance: number;
  closingBalance: number;
  totalIncome: number;
  totalExpense: number;
  isClosed: boolean;
  dailySummaries: IDailySummary[];
  notes?: string;
}

function tsPK() {
  return new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi" }) + " (PKT)";
}

function ymdInTZ(date: Date | string, timeZone = "Asia/Karachi"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function dateFromYmdInPKT(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+05:00`);
}

function normalizeDailySheet(input: IDailySheetForSync | (Document & object)): IDailySheetForSync {
  const obj = (typeof (input as Document).toObject === "function"
    ? (input as Document & { toObject: () => object }).toObject()
    : input) as Partial<IDailySheetForSync>;

  return {
    ...obj,
    _id: obj._id?.toString?.() || String(obj._id),
    date: obj.date as Date | string,
    slipEntries: Array.isArray(obj.slipEntries) ? obj.slipEntries : [],
    entries: Array.isArray(obj.entries) ? obj.entries : [],
    totalIncome: Number(obj.totalIncome ?? 0),
    totalExpense: Number(obj.totalExpense ?? 0),
    closingBalance: Number(obj.closingBalance ?? 0),
    notes: obj.notes,
    voucherRef: obj.voucherRef,
    isPosted: obj.isPosted,
  };
}

export async function syncDailyToMonthlyByDailySheet(
  dailySheetDoc: IDailySheetForSync | (Document & object)
): Promise<IMonthlySheetDocument | null> {
  if (!dailySheetDoc) {
    console.warn(`[${tsPK()}] [monthlySync] called with empty dailySheetDoc → nothing to sync`);
    return null;
  }

  const daily = normalizeDailySheet(dailySheetDoc);

  const conn = await mongooseConnect();
  const MonthlySheet = MonthlySheetModel(conn);
  const DailySheet = DailySheetModel(conn);
  console.info(`[${tsPK()}] [monthlySync] syncing DailySheet ${daily._id} (${String(daily.date)})`);

  const monthly = (await MonthlySheet.findOne({ isClosed: false })) as IMonthlySheetDocument | null;
  if (!monthly) {
    console.info(`[${tsPK()}] [monthlySync] no open MonthlySheet found → skipping sync`);
    return null;
  }

  try {
    const dailyDate = new Date(daily.date);

    // derive YMD strings in PKT for stable calendar comparison
    const dailyYMD = ymdInTZ(dailyDate, "Asia/Karachi");
    const monthStartYMD = ymdInTZ(new Date(monthly.startDate), "Asia/Karachi");
    const monthEndYMD = ymdInTZ(new Date(monthly.endDate), "Asia/Karachi");

    if (dailyYMD < monthStartYMD || dailyYMD > monthEndYMD) {
      console.warn(
        `[${tsPK()}] [monthlySync] daily ${dailyYMD} (PKT) is outside monthly range ${monthStartYMD} -> ${monthEndYMD} (PKT) -> skipping`
      );
      return null;
    }

    let normalizedDailyId: mongoose.Types.ObjectId;
    try {
      // Access ObjectId directly from the imported Types
      normalizedDailyId = new mongoose.Types.ObjectId(daily._id as string);
    } catch (err) {
      console.error(`[${tsPK()}] [monthlySync] invalid dailySheet _id:`, err, "and", daily._id);
      throw new Error("Invalid dailySheet _id");
    }

    // Build summary.date as the PKT-midnight Date object (explicit +05:00)
    const pkMidnight = dateFromYmdInPKT(dailyYMD);

    const summary: IDailySummary = {
      dailySheetId: normalizedDailyId,
      date: pkMidnight,
      totalIncome: daily.totalIncome ?? 0,
      totalExpense: daily.totalExpense ?? 0,
      closingBalance: daily.closingBalance ?? 0,
      slipEntries: daily.slipEntries ?? [],
      entries: daily.entries ?? [],
    };

    const idx = monthly.dailySummaries.findIndex(
      (ds: IDailySummary) => String(ds.dailySheetId) === String(summary.dailySheetId)
    );

    if (idx >= 0) {
      monthly.dailySummaries[idx] = summary;
      console.info(`[${tsPK()}] [monthlySync] replaced existing daily summary for ${summary.dailySheetId}`);
    } else {
      monthly.dailySummaries.push(summary);
      console.info(`[${tsPK()}] [monthlySync] appended new daily summary for ${summary.dailySheetId}`);
    }

    monthly.totalIncome = monthly.dailySummaries.reduce((s, x) => s + (Number(x.totalIncome) || 0), 0);
    monthly.totalExpense = monthly.dailySummaries.reduce((s, x) => s + (Number(x.totalExpense) || 0), 0);
    monthly.closingBalance = Number(monthly.openingBalance || 0) + monthly.totalIncome - monthly.totalExpense;

    await monthly.save();
    console.info(
      `[${tsPK()}] [monthlySync] saved monthly (${monthly._id}). totals => income: ${monthly.totalIncome}, expense: ${monthly.totalExpense}, closing: ${monthly.closingBalance}`
    );
    return monthly;
  } catch (err) {
    console.error(`[${tsPK()}] [monthlySync] error while syncing dailySheet ${daily._id}:`, err);
    throw err;
  }
}

/**
 * Convenience: given a dailySheetId, fetch the DailySheet and call sync.
 */
export async function syncDailyToMonthlyByDailySheetId(
  dailySheetId: string
): Promise<IMonthlySheetDocument | null> {
  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);
  const daily = await DailySheet.findById(dailySheetId).lean<IDailySheetForSync | null>();
  if (!daily) {
    console.warn(`[${tsPK()}] [monthlySync] dailySheet ${dailySheetId} not found -> nothing to sync`);
    return null;
  }
  return syncDailyToMonthlyByDailySheet(daily as IDailySheetForSync);
}
