// app/api/monthly-sheets/validate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { mongooseConnect } from "@/lib/mongoose";
import { isAdminRequest } from "@/lib/auth";

import { MonthlySheetModel } from "@/models/factories/MonthlySheet";
import { DailySheetModel } from "@/models/factories/DailySheet";

const EPS = 0.01;
const log = console.log;

function closeEnough(a: number, b: number, eps = EPS) {
  return Math.abs((a ?? 0) - (b ?? 0)) <= eps;
}

function oidToStr(id: unknown): string | null {
  if (!id) return null;
  return typeof id === "string" ? id : (id as any).toString();
}

/**
 * GET:
 * - mode=labels -> returns array of monthLabel strings
 * - without mode -> starts SSE validator when monthLabel query param is present
 */
export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: "manage_staff" });
  if (authResult) return authResult;

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");
  const monthLabel = url.searchParams.get("monthLabel");

  const conn = await mongooseConnect();
  const MonthlySheet = MonthlySheetModel(conn);
  const DailySheet = DailySheetModel(conn);

  if (mode === "labels") {
    try {
      const labels = await MonthlySheet.find({}, { monthLabel: 1, _id: 0 })
        .sort({ startDate: -1 })
        .lean();
      const mapped = (labels || []).map((m: any) => m.monthLabel);
      return NextResponse.json(mapped, { status: 200 });
    } catch (e) {
      log("[Monthly Validate][labels] ", e);
      return NextResponse.json({ message: "Failed to fetch labels" }, { status: 500 });
    }
  }

  if (!monthLabel) {
    return NextResponse.json({ message: "monthLabel query param is required" }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        send("start", { monthLabel });

        const monthly = await MonthlySheet.findOne({ monthLabel }).lean();
        if (!monthly) {
          send("error", { message: `MonthlySheet not found for ${monthLabel}` });
          controller.close();
          return;
        }

        const dailySheets = await DailySheet.find({
          date: { $gte: monthly.startDate, $lte: monthly.endDate },
        }).sort({ date: 1 }).lean();

        let computedIncome = 0;
        let computedExpense = 0;
        let prevClosing: number | null = null;

        for (let i = 0; i < dailySheets.length; i++) {
          const ds = dailySheets[i];
          const dateStr = new Date(ds.date).toISOString().slice(0, 10);
          const dailyId = oidToStr(ds._id);

          // Calculate totals
          const sumSlip = (ds.slipEntries ?? []).reduce(
            (a: number, s: any) => a + Number(s.amount ?? 0),
            0
          );
          const sumExp = (ds.entries ?? []).reduce(
            (a: number, e: any) => a + Number(e.amount ?? 0),
            0
          );
          const expectedClosing = Number(ds.openingBalance ?? 0) + sumSlip - sumExp;

          // normalize daily slips and expenses for details and matching
          const dailySlips = (ds.slipEntries ?? []).map((s: any) => ({
            copyNumber: s.copyNumber ?? null,
            uniqueNumber: s.uniqueNumber ?? null,
            amount: Number(s.amount ?? 0),
            description: s.description ?? s.note ?? null,
          }));

          const dailyExpenses = (ds.entries ?? []).map((e: any) => ({
            category: e.category ?? null,
            description: e.description ?? e.note ?? null,
            amount: Number(e.amount ?? 0),
            isExpPosted: !!e.isExpPosted,
            expID: e.expID ?? null,
          }));

          // Find monthly summary if exists
          const ms = (monthly.dailySummaries || []).find((s: any) => {
            const sid = s.dailySheetId?.toString?.();
            if (sid && dailyId && sid === dailyId) return true;
            if (s.date && ds.date) {
              return new Date(s.date).toISOString().slice(0, 10) === dateStr;
            }
            return false;
          });

          // Build rule checks
          const rules: any[] = [];

          // RULE: TOTAL_INCOME
          rules.push({
            key: "TOTAL_INCOME",
            label: "Total Income equals sum of slip entries",
            expected: sumSlip,
            actual: Number(ds.totalIncome ?? 0),
            passed: closeEnough(sumSlip, Number(ds.totalIncome ?? 0)),
            details: { slips: dailySlips },
          });

          // RULE: TOTAL_EXPENSE
          rules.push({
            key: "TOTAL_EXPENSE",
            label: "Total Expense equals sum of expense entries",
            expected: sumExp,
            actual: Number(ds.totalExpense ?? 0),
            passed: closeEnough(sumExp, Number(ds.totalExpense ?? 0)),
            details: { entries: dailyExpenses },
          });

          // RULE: CLOSING_BALANCE
          rules.push({
            key: "CLOSING_BALANCE",
            label: "Closing balance arithmetic",
            expected: expectedClosing,
            actual: Number(ds.closingBalance ?? 0),
            passed: closeEnough(expectedClosing, Number(ds.closingBalance ?? 0)),
            details: { openingBalance: Number(ds.openingBalance ?? 0), sumSlip, sumExp, expectedClosing },
          });

          // RULE: OPENING_CONTINUITY
          const openingExpected = prevClosing;
          const openingActual = Number(ds.openingBalance ?? 0);
          rules.push({
            key: "OPENING_CONTINUITY",
            label: "Opening balance matches previous closing",
            expected: openingExpected ?? openingActual,
            actual: openingActual,
            passed: openingExpected === null ? true : closeEnough(openingExpected, openingActual),
            details: { prevClosing: openingExpected, openingActual },
          });

          // RULE: MONTHLY_SUMMARY_PRESENCE
          rules.push({
            key: "SUMMARY_PRESENT",
            label: "MonthlySheet.dailySummary exists for this day",
            expected: ms ? 1 : 0,
            actual: ms ? 1 : 0,
            passed: !!ms,
          });

          // RULE: SUMMARY_MATCHES_DAILY (if ms exists)
          if (ms) {
            rules.push({
              key: "SUMMARY_INCOME_MATCH",
              label: "Monthly summary totalIncome equals DailySheet.totalIncome",
              expected: Number(ds.totalIncome ?? 0),
              actual: Number(ms.totalIncome ?? 0),
              passed: closeEnough(Number(ds.totalIncome ?? 0), Number(ms.totalIncome ?? 0)),
              details: { monthlyValue: Number(ms.totalIncome ?? 0), dailyValue: Number(ds.totalIncome ?? 0) },
            });

            // prepare expense entry matching
            const monthlyExpenses = (ms.entries ?? []).map((e: any) => ({
              category: e.category ?? null,
              description: e.description ?? e.note ?? null,
              amount: Number(e.amount ?? 0),
              expID: e.expID ?? null,
            }));

            const unmatchedExpenses = monthlyExpenses.filter((mExp: any) =>
              !dailyExpenses.some(
                (dExp) =>
                  dExp.category === mExp.category &&
                  (dExp.description === mExp.description) &&
                  closeEnough(dExp.amount, mExp.amount)
              )
            );

            rules.push({
              key: "SUMMARY_EXPENSE_MATCH",
              label: "Monthly summary totalExpense equals DailySheet.totalExpense",
              expected: Number(ds.totalExpense ?? 0),
              actual: Number(ms.totalExpense ?? 0),
              passed: closeEnough(Number(ds.totalExpense ?? 0), Number(ms.totalExpense ?? 0)),
              details: { monthlyEntries: monthlyExpenses, dailyEntries: dailyExpenses, unmatched: unmatchedExpenses },
            });

            rules.push({
              key: "SUMMARY_CLOSING_MATCH",
              label: "Monthly summary closingBalance equals DailySheet.closingBalance",
              expected: Number(ds.closingBalance ?? 0),
              actual: Number(ms.closingBalance ?? 0),
              passed: closeEnough(Number(ds.closingBalance ?? 0), Number(ms.closingBalance ?? 0)),
              details: { monthlyClosing: Number(ms.closingBalance ?? 0), dailyClosing: Number(ds.closingBalance ?? 0) },
            });

            // RULE: SLIP ENTRY MATCH (vouchers)
            const monthlySlips = (ms.slipEntries ?? []).map((s: any) => ({
              copyNumber: s.copyNumber ?? null,
              uniqueNumber: s.uniqueNumber ?? null,
              amount: Number(s.amount ?? 0),
              description: s.description ?? null,
            }));

            const unmatchedSlips = monthlySlips.filter(
              (msSlip: any) =>
                !dailySlips.some(
                  (d) =>
                    d.copyNumber === msSlip.copyNumber &&
                    d.uniqueNumber === msSlip.uniqueNumber &&
                    closeEnough(d.amount, Number(msSlip.amount ?? 0))
                )
            );

            rules.push({
              key: "SUMMARY_SLIPS_MATCH",
              label: "Monthly summary slip entries exist in DailySheet",
              expected: dailySlips.length,
              actual: monthlySlips.length,
              passed: unmatchedSlips.length === 0,
              details: { monthlySlips, dailySlips, unmatched: unmatchedSlips },
            });
          }

          // Prepare payload for SSE
          const payload = {
            index: i + 1,
            total: dailySheets.length,
            date: ds.date,
            dailySheetId: dailyId,
            rules,
            slipEntries: ds.slipEntries ?? [],
            entries: ds.entries ?? [],
            monthlySummary: ms ?? null,
          };

          send("daily-progress", payload);

          computedIncome += Number(ds.totalIncome ?? 0);
          computedExpense += Number(ds.totalExpense ?? 0);
          prevClosing = Number(ds.closingBalance ?? 0);

          await new Promise((r) => setTimeout(r, 5));
        }

        // Monthly totals check
        if (!closeEnough(Number(monthly.totalIncome ?? 0), computedIncome)) {
          send("log", {
            scope: "monthly",
            field: "totalIncome",
            expected: computedIncome,
            actual: Number(monthly.totalIncome ?? 0),
          });
        }

        if (!closeEnough(Number(monthly.totalExpense ?? 0), computedExpense)) {
          send("log", {
            scope: "monthly",
            field: "totalExpense",
            expected: computedExpense,
            actual: Number(monthly.totalExpense ?? 0),
          });
        }

        send("done", {
          status:
            closeEnough(Number(monthly.totalIncome ?? 0), computedIncome) &&
            closeEnough(Number(monthly.totalExpense ?? 0), computedExpense)
              ? "PASSED"
              : "FAILED",
        });

        controller.close();
      } catch (err) {
        log("[Monthly Validate SSE] Error:", err);
        send("error", { message: String(err) });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
