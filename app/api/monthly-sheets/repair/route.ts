import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";

import { MonthlySheetModel } from "@/models/factories/MonthlySheet";
import { DailySheetModel } from "@/models/factories/DailySheet";

/* ================= TYPES ================= */

interface RepairDiff {
  field: string;
  before: number | null;
  after: number | null;
}

interface DailyRepairAudit {
  dailySheetId: string;
  date: Date;
  diffs: RepairDiff[];
}

interface RepairAudit {
  mode: "daily" | "month";
  dryRun: boolean;
  monthLabel: string;
  dailyAudits: DailyRepairAudit[];
  totals?: RepairDiff[];
}

/* ================= ROUTE ================= */

export async function POST(req: NextRequest) {
  const auth = await isAdminRequest({ requiredPerm: "manage_staff" });
  if (auth) return auth;

  const { monthLabel, dryRun = true } = await req.json();

  if (!monthLabel) {
    return NextResponse.json({ message: "monthLabel required" }, { status: 400 });
  }

  const conn = await mongooseConnect();
  const MonthlySheet = MonthlySheetModel(conn);
  const DailySheet = DailySheetModel(conn);

  const monthly = await MonthlySheet.findOne({ monthLabel });
  if (!monthly) {
    return NextResponse.json({ message: "MonthlySheet not found" }, { status: 404 });
  }

  const dailySheets = await DailySheet.find({
    date: { $gte: monthly.startDate, $lte: monthly.endDate },
  })
    .sort({ date: 1 })
    .lean();

  const audit: RepairAudit = {
    mode: "month",
    dryRun,
    monthLabel,
    dailyAudits: [],
    totals: [],
  };

  let recomputedIncome = 0;
  let recomputedExpense = 0;
  let recomputedClosing = 0;
  let firstDayOpening: number | null = null;

  for (const ds of dailySheets) {
    const dailyDiffs: RepairDiff[] = [];
    const summaryDiffs: RepairDiff[] = [];

    const sumSlip =
      ds.slipEntries?.reduce((a, s) => a + Number(s.amount ?? 0), 0) ?? 0;

    const sumExpense =
      ds.entries?.reduce((a, e) => a + Number(e.amount ?? 0), 0) ?? 0;

    if (sumSlip !== ds.totalIncome) {
      dailyDiffs.push({
        field: "totalIncome",
        before: ds.totalIncome,
        after: sumSlip,
      });
    }

    if (sumExpense !== ds.totalExpense) {
      dailyDiffs.push({
        field: "totalExpense",
        before: ds.totalExpense,
        after: sumExpense,
      });
    }

    const expectedClosing =
      Number(ds.openingBalance ?? 0) + sumSlip - sumExpense;

    if (expectedClosing !== ds.closingBalance) {
      dailyDiffs.push({
        field: "closingBalance",
        before: ds.closingBalance,
        after: expectedClosing,
      });
    }

    recomputedIncome += sumSlip;
    recomputedExpense += sumExpense;
    recomputedClosing = expectedClosing;

    // capture first day's opening balance for monthly openingBalance
    if (firstDayOpening === null) firstDayOpening = Number(ds.openingBalance ?? 0);

    // Prepare a daily summary object to sync into MonthlySheet.dailySummaries
    const dailySummary = {
      dailySheetId: ds._id,
      date: ds.date,
      totalIncome: sumSlip,
      totalExpense: sumExpense,
      closingBalance: expectedClosing,
      slipEntries: ds.slipEntries || [],
      entries: ds.entries || [],
    } as any;

    // Compare against existing monthly summary (if present) to detect SUMMARY_* mismatches
    let existingIdx = -1;
    try {
      existingIdx = monthly.dailySummaries.findIndex((m: any) => m.dailySheetId?.toString() === ds._id.toString());
    } catch (e) {
      existingIdx = -1;
    }

    if (existingIdx === -1) {
      // summary missing
      summaryDiffs.push({ field: "SUMMARY_PRESENT", before: 0, after: 1 });
    } else {
      const existing = monthly.dailySummaries[existingIdx] as any;
      if (Number(existing.totalIncome ?? 0) !== sumSlip) {
        summaryDiffs.push({ field: "SUMMARY_INCOME_MATCH", before: Number(existing.totalIncome ?? 0), after: sumSlip });
      }
      if (Number(existing.totalExpense ?? 0) !== sumExpense) {
        summaryDiffs.push({ field: "SUMMARY_EXPENSE_MATCH", before: Number(existing.totalExpense ?? 0), after: sumExpense });
      }
      if (Number(existing.closingBalance ?? 0) !== expectedClosing) {
        summaryDiffs.push({ field: "SUMMARY_CLOSING_MATCH", before: Number(existing.closingBalance ?? 0), after: expectedClosing });
      }
      // slip entries count comparison
      if ((existing.slipEntries?.length ?? 0) !== (ds.slipEntries?.length ?? 0)) {
        summaryDiffs.push({ field: "SUMMARY_SLIPS_MATCH", before: Number(existing.slipEntries?.length ?? 0), after: Number(ds.slipEntries?.length ?? 0) });
      }
    }

    const diffs = [...dailyDiffs, ...summaryDiffs];

    // Update or replace the daily summary into the monthly document (AUTHORITATIVE: DailySheet)
    try {
      if (existingIdx >= 0) {
        // replace entirely to ensure monthly reflects DailySheet authority
        monthly.dailySummaries[existingIdx] = dailySummary;
      } else {
        monthly.dailySummaries = monthly.dailySummaries || [];
        monthly.dailySummaries.push(dailySummary);
      }
    } catch (e) {
      monthly.dailySummaries = monthly.dailySummaries || [];
      monthly.dailySummaries.push(dailySummary);
    }

    if (diffs.length > 0) {
      audit.dailyAudits.push({
        dailySheetId: ds._id.toString(),
        date: ds.date,
        diffs,
      });
    }

    /* APPLY FIX: only mutate DailySheet when its internal totals are wrong (dailyDiffs) */
    if (!dryRun && dailyDiffs.length > 0) {
      await DailySheet.updateOne(
        { _id: ds._id },
        {
          $set: {
            totalIncome: sumSlip,
            totalExpense: sumExpense,
            closingBalance: expectedClosing,
          },
        }
      );
    }
  }

  /* MONTHLY TOTAL DIFFS */
  if (monthly.totalIncome !== recomputedIncome) {
    audit.totals?.push({
      field: "monthly.totalIncome",
      before: monthly.totalIncome,
      after: recomputedIncome,
    });
  }

  if (monthly.totalExpense !== recomputedExpense) {
    audit.totals?.push({
      field: "monthly.totalExpense",
      before: monthly.totalExpense,
      after: recomputedExpense,
    });
  }

  if (monthly.closingBalance !== recomputedClosing) {
    audit.totals?.push({
      field: "monthly.closingBalance",
      before: monthly.closingBalance,
      after: recomputedClosing,
    });
  }

  if (!dryRun) {
    monthly.totalIncome = recomputedIncome;
    monthly.totalExpense = recomputedExpense;
    monthly.closingBalance = recomputedClosing;
    // update opening balance from the first daily sheet if available
    if (firstDayOpening !== null) {
      monthly.openingBalance = firstDayOpening;
    }
    await monthly.save();
  }

  return NextResponse.json(audit, { status: 200 });
}
