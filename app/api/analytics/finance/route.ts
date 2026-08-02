// app/api/analytics/finance/route.ts
// Finance analytics for the Daily-Sheet / Cash-Slip / Voucher subsystem.
// - Daily sheets → income / expense / net trend, totals, latest closing balance,
//   expense breakdown by category and by payment method.
// - Cash slips → count, amount, used vs unused (by createdAt within the window).
// - Vouchers  → count and total amount posted within the window.

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { DailySheetModel } from '@/models/factories/DailySheet';
import { CashSlipModel } from '@/models/factories/CashSlip';
import { VoucherModel } from '@/models/factories/Voucher';

function dayKeyInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

interface LeanSheet {
  date: Date;
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  entries?: { category?: string; amount?: number; paymentMethod?: string }[];
  slipEntries?: { amount?: number; paymentMethod?: string }[];
}

export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'view_reports' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const DailySheet = DailySheetModel(conn);
  const CashSlip = CashSlipModel(conn);
  const Voucher = VoucherModel(conn);

  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '30', 10)));
    const tz = searchParams.get('tz') || 'Asia/Karachi';

    const now = new Date();
    const since = new Date(now.getTime() - (days - 1) * 86_400_000);
    since.setHours(0, 0, 0, 0);

    const [sheets, cashAgg, voucherAgg] = await Promise.all([
      DailySheet.find({ date: { $gte: since } })
        .select('date totalIncome totalExpense closingBalance entries slipEntries')
        .sort({ date: 1 })
        .lean<LeanSheet[]>(),

      // Cash slips created in-window, split by used/unused
      CashSlip.aggregate([
        { $match: { createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $ifNull: ['$used', false] },
            count: { $sum: 1 },
            amount: { $sum: { $ifNull: ['$amount', 0] } },
          },
        },
      ]),

      // Vouchers posted in-window
      Voucher.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: { $ifNull: ['$amount', 0] } } } },
      ]),
    ]);

    // ── Daily-sheet trend + KPIs ────────────────────────────────────────────────
    const sheetMap = new Map<string, { income: number; expense: number }>();
    const expenseByCategory = new Map<string, { amount: number; count: number }>();
    const expenseByMethod = new Map<string, number>();
    const incomeByMethod = new Map<string, number>();

    let totalIncome = 0;
    let totalExpense = 0;

    for (const s of sheets) {
      const key = dayKeyInTz(new Date(s.date), tz);
      const prev = sheetMap.get(key) ?? { income: 0, expense: 0 };
      prev.income += s.totalIncome ?? 0;
      prev.expense += s.totalExpense ?? 0;
      sheetMap.set(key, prev);

      totalIncome += s.totalIncome ?? 0;
      totalExpense += s.totalExpense ?? 0;

      for (const e of s.entries ?? []) {
        const cat = e.category?.trim() || 'Uncategorized';
        const c = expenseByCategory.get(cat) ?? { amount: 0, count: 0 };
        c.amount += e.amount ?? 0;
        c.count += 1;
        expenseByCategory.set(cat, c);

        const m = e.paymentMethod || 'cash';
        expenseByMethod.set(m, (expenseByMethod.get(m) ?? 0) + (e.amount ?? 0));
      }

      for (const si of s.slipEntries ?? []) {
        const m = si.paymentMethod || 'cash';
        incomeByMethod.set(m, (incomeByMethod.get(m) ?? 0) + (si.amount ?? 0));
      }
    }

    // Continuous day axis
    const trend: { date: string; income: number; expense: number; net: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = dayKeyInTz(new Date(now.getTime() - i * 86_400_000), tz);
      const v = sheetMap.get(key) ?? { income: 0, expense: 0 };
      trend.push({ date: key, income: v.income, expense: v.expense, net: v.income - v.expense });
    }

    const latestClosing = sheets.length > 0 ? sheets[sheets.length - 1].closingBalance ?? 0 : 0;

    // ── Cash slips ──────────────────────────────────────────────────────────────
    let slipCount = 0;
    let slipAmount = 0;
    let usedCount = 0;
    let usedAmount = 0;
    for (const g of cashAgg as { _id: boolean; count: number; amount: number }[]) {
      slipCount += g.count;
      slipAmount += g.amount;
      if (g._id === true) {
        usedCount += g.count;
        usedAmount += g.amount;
      }
    }

    const voucher = (voucherAgg as { count: number; amount: number }[])[0] ?? { count: 0, amount: 0 };

    return NextResponse.json({
      range: { days, since: since.toISOString(), tz },
      kpis: {
        totalIncome,
        totalExpense,
        net: totalIncome - totalExpense,
        closingBalance: latestClosing,
        sheetCount: sheets.length,
      },
      trend,
      expenseByCategory: [...expenseByCategory.entries()]
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
      expenseByMethod: [...expenseByMethod.entries()].map(([method, amount]) => ({ method, amount })),
      incomeByMethod: [...incomeByMethod.entries()].map(([method, amount]) => ({ method, amount })),
      cashSlips: {
        count: slipCount,
        amount: slipAmount,
        usedCount,
        usedAmount,
        unusedCount: slipCount - usedCount,
        unusedAmount: slipAmount - usedAmount,
      },
      vouchers: { count: voucher.count, amount: voucher.amount },
    });
  } catch (e) {
    console.error('[Analytics API][Finance]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
