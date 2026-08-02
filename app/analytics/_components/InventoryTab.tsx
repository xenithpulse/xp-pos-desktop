'use client';

// app/analytics/_components/InventoryTab.tsx
// Reuses the existing inventory endpoints: /api/inventory/summary (valuation,
// tiers, alerts, top consumers) and /api/inventory/analytics (delta trends).

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Boxes, Wallet, AlertTriangle, PackageX } from 'lucide-react';
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

interface SummaryResponse {
  counts: { total: number; ingredients: number; supplies: number; lowStock: number; outOfStock: number };
  capital: { stockValue: number; cashInHand: number; totalCapital: number };
  tiers: { high: { count: number; value: number }; medium: { count: number; value: number }; low: { count: number; value: number } };
  byCategory: { category: string; count: number; value: number }[];
  lowStockItems: { _id: string; name: string; unit: string; stock: number; lowStockThreshold: number; value: number }[];
  outOfStockItems: { _id: string; name: string; unit: string; value: number }[];
  topConsumers: { _id: string; name: string; unit: string; totalConsumed: number }[];
}
interface AnalyticsResponse {
  days: number;
  series: { date: string; consumed: number; restocked: number; wasted: number }[];
  byReason: { reason: string; qty: number; count: number }[];
}

export default function InventoryTab({ days, active }: { days: number; tz: string; active: boolean }) {
  const { fmtMoney, fmtCompact } = useCurrency();
  const summary = useAnalyticsFetch<SummaryResponse>('/api/inventory/summary', active);
  const analytics = useAnalyticsFetch<AnalyticsResponse>(`/api/inventory/analytics?days=${days}`, active);

  const error = summary.error || analytics.error;
  const loading = summary.loading || analytics.loading;
  const retry = () => {
    summary.refetch();
    analytics.refetch();
  };

  if (error) return <ErrorBar message={error} onRetry={retry} />;
  if (loading && (!summary.data || !analytics.data)) return <TabSkeleton />;
  if (!summary.data) return null;

  const s = summary.data;
  const maxCat = s.byCategory[0]?.value || 1;
  const maxConsumer = s.topConsumers[0]?.totalConsumed || 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <KpiCard icon={<Boxes size={18} />} label="Items" value={s.counts.total.toLocaleString()} sub={`${s.counts.ingredients} ingredients · ${s.counts.supplies} supplies`} accent={C.blue} />
        <KpiCard icon={<Wallet size={18} />} label="Stock Value" value={fmtMoney(s.capital.stockValue)} accent={C.aqua} />
        <KpiCard icon={<Wallet size={18} />} label="Total Capital" value={fmtMoney(s.capital.totalCapital)} sub={`incl. ${fmtCompact(s.capital.cashInHand)} cash`} accent={C.violet} />
        <KpiCard icon={<AlertTriangle size={18} />} label="Low Stock" value={s.counts.lowStock.toLocaleString()} accent={STATUS.warning} />
        <KpiCard icon={<PackageX size={18} />} label="Out of Stock" value={s.counts.outOfStock.toLocaleString()} accent={STATUS.critical} />
      </div>

      {/* Consumption trend */}
      <Panel title="Stock movement" subtitle={`Consumed vs restocked vs wasted · last ${days} days`}>
        {analytics.data && analytics.data.series.some((d) => d.consumed || d.restocked || d.wasted) ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={analytics.data.series} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: C.grid }} minTickGap={24} />
              <YAxis tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip content={<ChartTooltip labelFmt={(l) => longDate(l as string)} rows={[
                { key: 'consumed', label: 'Consumed', color: C.blue, fmt: (n) => `${Math.round(n)}` },
                { key: 'restocked', label: 'Restocked', color: C.aqua, fmt: (n) => `${Math.round(n)}` },
                { key: 'wasted', label: 'Wasted', color: STATUS.critical, fmt: (n) => `${Math.round(n)}` },
              ]} />} />
              <Area type="monotone" dataKey="consumed" stroke={C.blue} strokeWidth={2} fillOpacity={0.12} fill={C.blue} />
              <Area type="monotone" dataKey="restocked" stroke={C.aqua} strokeWidth={2} fillOpacity={0.1} fill={C.aqua} />
              <Area type="monotone" dataKey="wasted" stroke={STATUS.critical} strokeWidth={2} fillOpacity={0.1} fill={STATUS.critical} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No stock movement recorded in this period." />
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
          <Legend color={C.blue} label="Consumed" />
          <Legend color={C.aqua} label="Restocked" />
          <Legend color={STATUS.critical} label="Wasted" />
        </div>
      </Panel>

      {/* Value by category + top consumers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Stock value by category" subtitle="Where capital is tied up">
          {s.byCategory.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-3">
              {s.byCategory.slice(0, 8).map((cat) => (
                <RankedBar key={cat.category} name={cat.category} suffix={`${cat.count} items`} value={fmtCompact(cat.value)} max={(cat.value / maxCat) * 100} color={C.aqua} />
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Top consumed ingredients" subtitle="By total quantity consumed">
          {s.topConsumers.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="space-y-3">
              {s.topConsumers.map((it, i) => (
                <RankedBar key={it._id} rank={i + 1} name={it.name} suffix={it.unit} value={`${Math.round(it.totalConsumed).toLocaleString()}`} max={(it.totalConsumed / maxConsumer) * 100} color={C.blue} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {/* Alerts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Low stock alerts" subtitle={`${s.counts.lowStock} items at or below threshold`}>
          {s.lowStockItems.length === 0 ? (
            <EmptyState message="Nothing running low. 👍" />
          ) : (
            <ul className="divide-y divide-gray-50">
              {s.lowStockItems.slice(0, 10).map((it) => (
                <li key={it._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate font-medium text-gray-900">{it.name}</span>
                  <span className="shrink-0 tabular-nums" style={{ color: STATUS.warning }}>
                    {it.stock} / {it.lowStockThreshold} {it.unit}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Out of stock" subtitle={`${s.counts.outOfStock} items need reordering`}>
          {s.outOfStockItems.length === 0 ? (
            <EmptyState message="Everything is in stock. 👍" />
          ) : (
            <ul className="divide-y divide-gray-50">
              {s.outOfStockItems.slice(0, 10).map((it) => (
                <li key={it._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate font-medium text-gray-900">{it.name}</span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold" style={{ backgroundColor: `${STATUS.critical}1a`, color: STATUS.critical }}>
                    Out
                  </span>
                </li>
              ))}
            </ul>
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
