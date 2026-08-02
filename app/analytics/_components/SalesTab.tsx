'use client';

// app/analytics/_components/SalesTab.tsx — revenue, hours, order type, payments, staff.

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { TrendingUp, ShoppingBag, Receipt, Users, Wallet } from 'lucide-react';
import {
  C,
  CAT,
  KpiCard,
  Panel,
  ChartTooltip,
  EmptyState,
  ErrorBar,
  TabSkeleton,
  useCurrency,
  useAnalyticsFetch,
  shortDate,
  longDate,
  fmtHour,
  fmtHourLong,
} from './shared';

interface Kpis {
  revenue: number;
  collected: number;
  orders: number;
  guests: number;
  itemsSold: number;
  distinctItems: number;
  avgOrderValue: number;
}
interface TrendPoint { date: string; revenue: number; orders: number }
interface HourPoint { hour: number; revenue: number; orders: number }
interface ModeSlice { mode: string; label: string; revenue: number; orders: number }
interface PaymentSlice { label: string; revenue: number; orders: number }
interface ItemRow { name: string; qty: number; revenue: number }
interface StaffRow { name: string; revenue: number; orders: number }

interface SalesResponse {
  range: { days: number };
  kpis: Kpis;
  trend: TrendPoint[];
  byHour: HourPoint[];
  byMode: ModeSlice[];
  byPayment: PaymentSlice[];
  topItemsByRevenue: ItemRow[];
  topStaff: StaffRow[];
}

export default function SalesTab({
  days,
  tz,
  active,
}: {
  days: number;
  tz: string;
  active: boolean;
}) {
  const { fmtMoney, fmtCompact } = useCurrency();
  const { data, loading, error, refetch } = useAnalyticsFetch<SalesResponse>(
    `/api/analytics?days=${days}&tz=${encodeURIComponent(tz)}`,
    active
  );

  if (error) return <ErrorBar message={error} onRetry={refetch} />;
  if (loading && !data) return <TabSkeleton />;
  if (!data) return null;

  const collectedPct = data.kpis.revenue > 0
    ? Math.round((data.kpis.collected / data.kpis.revenue) * 100)
    : 0;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard icon={<TrendingUp size={18} />} label="Booked Revenue" value={fmtMoney(data.kpis.revenue)} accent={C.blue} />
        <KpiCard icon={<Wallet size={18} />} label="Collected" value={fmtMoney(data.kpis.collected)} sub={`${collectedPct}% of booked`} accent={C.green} />
        <KpiCard icon={<ShoppingBag size={18} />} label="Orders" value={data.kpis.orders.toLocaleString()} accent={C.aqua} />
        <KpiCard icon={<Receipt size={18} />} label="Avg Order" value={fmtMoney(data.kpis.avgOrderValue)} accent={C.violet} />
        <KpiCard icon={<Users size={18} />} label="Guests" value={data.kpis.guests.toLocaleString()} accent={C.magenta} />
      </div>

      {/* Revenue trend */}
      <Panel title="Revenue trend" subtitle={`Daily booked revenue · last ${days} days`}>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={data.trend} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.blue} stopOpacity={0.28} />
                <stop offset="100%" stopColor={C.blue} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.grid }} minTickGap={24} />
            <YAxis tickFormatter={fmtCompact} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<ChartTooltip labelFmt={(l) => longDate(l as string)} rows={[{ key: 'revenue', label: 'Revenue', color: C.blue, fmt: fmtMoney }, { key: 'orders', label: 'Orders', color: C.axis, fmt: (n) => `${n}` }]} />} />
            <Area type="monotone" dataKey="revenue" stroke={C.blue} strokeWidth={2} fill="url(#revFill)" activeDot={{ r: 4, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      {/* Hours + order type */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Busiest hours" subtitle="Revenue by hour of day">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.byHour} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="hour" tickFormatter={fmtHour} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.grid }} minTickGap={16} />
              <YAxis tickFormatter={fmtCompact} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<ChartTooltip labelFmt={(l) => fmtHourLong(l as number)} rows={[{ key: 'revenue', label: 'Revenue', color: C.aqua, fmt: fmtMoney }, { key: 'orders', label: 'Orders', color: C.axis, fmt: (n) => `${n}` }]} />} />
              <Bar dataKey="revenue" fill={C.aqua} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Sales by order type" subtitle="Share of revenue">
          {data.byMode.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <ResponsiveContainer width="100%" height={220} minWidth={200}>
                <PieChart>
                  <Pie data={data.byMode} dataKey="revenue" nameKey="label" cx="50%" cy="50%" innerRadius={58} outerRadius={88} paddingAngle={2} stroke="#fcfcfb" strokeWidth={2}>
                    {data.byMode.map((m, i) => (
                      <Cell key={m.mode} fill={CAT[i % CAT.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip nameKey="label" rows={[{ key: 'revenue', label: 'Revenue', fmt: fmtMoney }, { key: 'orders', label: 'Orders', fmt: (n) => `${n}` }]} />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="w-full space-y-2 sm:w-auto sm:min-w-[150px]">
                {data.byMode.map((m, i) => (
                  <li key={m.mode} className="flex items-center justify-between gap-3 text-sm">
                    <span className="flex items-center gap-2 text-gray-700">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CAT[i % CAT.length] }} />
                      {m.label}
                    </span>
                    <span className="font-semibold tabular-nums text-gray-900">{fmtCompact(m.revenue)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>
      </div>

      {/* Payment mix + staff */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Payment mix" subtitle="Booked revenue by payment status">
          {data.byPayment.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {data.byPayment.map((p, i) => (
                <div key={p.label} className="rounded-lg border border-gray-100 bg-gray-50/50 p-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CAT[i % CAT.length] }} />
                    <span className="text-sm font-medium text-gray-600">{p.label}</span>
                  </div>
                  <div className="mt-1.5 text-lg font-bold tabular-nums text-gray-900">{fmtCompact(p.revenue)}</div>
                  <div className="text-xs text-gray-400">{p.orders} orders</div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Staff leaderboard" subtitle="Booked revenue by order creator">
          {data.topStaff.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                    <th className="pb-2 font-medium">Staff</th>
                    <th className="pb-2 text-right font-medium">Orders</th>
                    <th className="pb-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topStaff.map((s) => (
                    <tr key={s.name} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 font-medium capitalize text-gray-900">{s.name}</td>
                      <td className="py-2 text-right tabular-nums text-gray-600">{s.orders}</td>
                      <td className="py-2 text-right font-semibold tabular-nums text-gray-900">{fmtCompact(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
