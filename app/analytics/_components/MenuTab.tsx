'use client';

// app/analytics/_components/MenuTab.tsx — most-ordered menu items (by qty & revenue).

import { useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts';
import { Utensils, Hash, Star } from 'lucide-react';
import {
  C,
  CAT,
  KpiCard,
  Panel,
  ChartTooltip,
  EmptyState,
  ErrorBar,
  TabSkeleton,
  RankedBar,
  useCurrency,
  useAnalyticsFetch,
} from './shared';

interface ItemRow { name: string; qty: number; revenue: number }
interface MenuResponse {
  range: { days: number };
  kpis: { itemsSold: number; distinctItems: number; revenue: number };
  topItemsByRevenue: ItemRow[];
  topItemsByQty: ItemRow[];
}

type SortMode = 'qty' | 'revenue';

export default function MenuTab({ days, tz, active }: { days: number; tz: string; active: boolean }) {
  const { fmtMoney, fmtCompact } = useCurrency();
  const [sort, setSort] = useState<SortMode>('qty');
  const { data, loading, error, refetch } = useAnalyticsFetch<MenuResponse>(
    `/api/analytics?days=${days}&tz=${encodeURIComponent(tz)}`,
    active
  );

  if (error) return <ErrorBar message={error} onRetry={refetch} />;
  if (loading && !data) return <TabSkeleton />;
  if (!data) return null;

  const list = sort === 'qty' ? data.topItemsByQty : data.topItemsByRevenue;
  const chartData = list.slice(0, 10).map((it) => ({
    name: it.name,
    value: sort === 'qty' ? it.qty : it.revenue,
    qty: it.qty,
    revenue: it.revenue,
  }));
  const maxRev = data.topItemsByRevenue[0]?.revenue || 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={<Utensils size={18} />} label="Items Sold" value={data.kpis.itemsSold.toLocaleString()} accent={C.orange} />
        <KpiCard icon={<Hash size={18} />} label="Distinct Items" value={data.kpis.distinctItems.toLocaleString()} accent={C.blue} />
        <KpiCard icon={<Star size={18} />} label="Top Seller" value={data.topItemsByQty[0]?.name ?? '—'} sub={data.topItemsByQty[0] ? `×${data.topItemsByQty[0].qty} sold` : undefined} accent={C.yellow} />
      </div>

      <Panel
        title="Most ordered menu items"
        subtitle={sort === 'qty' ? 'Top 10 by quantity sold' : 'Top 10 by revenue'}
      >
        <div className="mb-4 inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['qty', 'revenue'] as SortMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setSort(m)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                sort === m ? 'bg-cyan-500 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {m === 'qty' ? 'By quantity' : 'By revenue'}
            </button>
          ))}
        </div>

        {chartData.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(240, chartData.length * 34)}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={C.grid} horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => (sort === 'qty' ? `${v}` : fmtCompact(v))}
                tick={{ fill: C.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: C.grid }}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={140}
                tick={{ fill: C.inkSoft, fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                content={
                  <ChartTooltip
                    nameKey="name"
                    rows={[
                      { key: 'qty', label: 'Sold', fmt: (n) => `${n}` },
                      { key: 'revenue', label: 'Revenue', fmt: fmtMoney },
                    ]}
                  />
                }
              />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={CAT[i % CAT.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Full item ranking" subtitle="Revenue contribution across the top 15">
        {data.topItemsByRevenue.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-3">
            {data.topItemsByRevenue.map((it, i) => (
              <RankedBar
                key={it.name}
                rank={i + 1}
                name={it.name}
                suffix={`×${it.qty}`}
                value={fmtCompact(it.revenue)}
                max={(it.revenue / maxRev) * 100}
                color={C.blue}
              />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
