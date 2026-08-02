'use client';

// app/analytics/_components/FinanceTab.tsx
// Daily-sheet income/expense, cash-slip usage and voucher totals.

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { TrendingUp, TrendingDown, Scale, PiggyBank, Ticket, ReceiptText } from 'lucide-react';
import {
  C,
  STATUS,
  KpiCard,
  Panel,
  ChartTooltip,
  EmptyState,
  ErrorBar,
  TabSkeleton,
  RankedBar,
  useCurrency,
  useAnalyticsFetch,
  shortDate,
  longDate,
} from './shared';

interface FinanceResponse {
  range: { days: number };
  kpis: { totalIncome: number; totalExpense: number; net: number; closingBalance: number; sheetCount: number };
  trend: { date: string; income: number; expense: number; net: number }[];
  expenseByCategory: { category: string; amount: number; count: number }[];
  expenseByMethod: { method: string; amount: number }[];
  incomeByMethod: { method: string; amount: number }[];
  cashSlips: { count: number; amount: number; usedCount: number; usedAmount: number; unusedCount: number; unusedAmount: number };
  vouchers: { count: number; amount: number };
}

export default function FinanceTab({ days, tz, active }: { days: number; tz: string; active: boolean }) {
  const { fmtMoney, fmtCompact } = useCurrency();
  const { data, loading, error, refetch } = useAnalyticsFetch<FinanceResponse>(
    `/api/analytics/finance?days=${days}&tz=${encodeURIComponent(tz)}`,
    active
  );

  if (error) return <ErrorBar message={error} onRetry={refetch} />;
  if (loading && !data) return <TabSkeleton />;
  if (!data) return null;

  const hasSheets = data.kpis.sheetCount > 0;
  const maxCat = data.expenseByCategory[0]?.amount || 1;
  const netColor = data.kpis.net >= 0 ? STATUS.good : STATUS.critical;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard icon={<TrendingUp size={18} />} label="Income" value={fmtMoney(data.kpis.totalIncome)} accent={C.aqua} />
        <KpiCard icon={<TrendingDown size={18} />} label="Expense" value={fmtMoney(data.kpis.totalExpense)} accent={C.orange} />
        <KpiCard icon={<Scale size={18} />} label="Net" value={fmtMoney(data.kpis.net)} accent={netColor} />
        <KpiCard icon={<PiggyBank size={18} />} label="Closing Balance" value={fmtMoney(data.kpis.closingBalance)} sub={`${data.kpis.sheetCount} daily sheets`} accent={C.violet} />
      </div>

      {/* Income vs expense */}
      <Panel title="Income vs expense" subtitle={`Daily sheet totals · last ${days} days`}>
        {hasSheets ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.trend} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.grid }} minTickGap={24} />
              <YAxis tickFormatter={fmtCompact} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<ChartTooltip labelFmt={(l) => longDate(l as string)} rows={[
                { key: 'income', label: 'Income', color: C.aqua, fmt: fmtMoney },
                { key: 'expense', label: 'Expense', color: C.orange, fmt: fmtMoney },
                { key: 'net', label: 'Net', color: C.axis, fmt: fmtMoney },
              ]} />} />
              <Bar dataKey="income" fill={C.aqua} radius={[3, 3, 0, 0]} />
              <Bar dataKey="expense" fill={C.orange} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No daily sheets recorded in this period." />
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
          <Legend color={C.aqua} label="Income" />
          <Legend color={C.orange} label="Expense" />
        </div>
      </Panel>

      {/* Cash slips + vouchers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Cash slips" subtitle={`Issued in last ${days} days`} className="lg:col-span-2">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <MiniStat icon={<ReceiptText size={16} />} label="Total slips" value={data.cashSlips.count.toLocaleString()} sub={fmtCompact(data.cashSlips.amount)} color={C.blue} />
            <MiniStat icon={<ReceiptText size={16} />} label="Used" value={data.cashSlips.usedCount.toLocaleString()} sub={fmtCompact(data.cashSlips.usedAmount)} color={STATUS.good} />
            <MiniStat icon={<ReceiptText size={16} />} label="Unused" value={data.cashSlips.unusedCount.toLocaleString()} sub={fmtCompact(data.cashSlips.unusedAmount)} color={STATUS.warning} />
          </div>
          {/* Usage bar */}
          {data.cashSlips.count > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-gray-400">
                <span>Slip usage</span>
                <span>{Math.round((data.cashSlips.usedCount / data.cashSlips.count) * 100)}% used</span>
              </div>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full" style={{ width: `${(data.cashSlips.usedCount / data.cashSlips.count) * 100}%`, backgroundColor: STATUS.good }} />
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Vouchers" subtitle={`Posted in last ${days} days`}>
          <div className="flex h-full flex-col justify-center">
            <div className="flex items-center gap-2 text-gray-500">
              <Ticket size={18} style={{ color: C.violet }} />
              <span className="text-sm font-medium">Total posted</span>
            </div>
            <div className="mt-2 text-3xl font-bold tracking-tight text-gray-900">{fmtMoney(data.vouchers.amount)}</div>
            <div className="mt-1 text-sm text-gray-400">{data.vouchers.count.toLocaleString()} vouchers</div>
          </div>
        </Panel>
      </div>

      {/* Expense breakdown */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Expense by category" subtitle="Where the money goes">
          {data.expenseByCategory.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-3">
              {data.expenseByCategory.map((cat, i) => (
                <RankedBar key={cat.category} rank={i + 1} name={cat.category} suffix={`${cat.count}×`} value={fmtCompact(cat.amount)} max={(cat.amount / maxCat) * 100} color={C.orange} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="By payment method" subtitle="Income &amp; expense split">
          {data.incomeByMethod.length === 0 && data.expenseByMethod.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="space-y-4">
              <MethodBreakdown title="Income" rows={data.incomeByMethod} color={C.aqua} fmt={fmtCompact} />
              <MethodBreakdown title="Expense" rows={data.expenseByMethod} color={C.orange} fmt={fmtCompact} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function MiniStat({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
      <div className="flex items-center gap-1.5 text-gray-500" style={{ color }}>
        {icon}
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <div className="mt-1 text-lg font-bold tabular-nums text-gray-900">{value}</div>
      <div className="text-xs text-gray-400">{sub}</div>
    </div>
  );
}

function MethodBreakdown({
  title,
  rows,
  color,
  fmt,
}: {
  title: string;
  rows: { method: string; amount: number }[];
  color: string;
  fmt: (n: number) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">{title}</div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.method} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 capitalize text-gray-700">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              {r.method}
            </span>
            <span className="font-semibold tabular-nums text-gray-900">{fmt(r.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
