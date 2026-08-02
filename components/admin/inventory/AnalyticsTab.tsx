// components/admin/inventory/AnalyticsTab.tsx
// Consumption/restock trends and movement breakdown (recharts, dark surface).
// Palette: validated dark categorical hues — blue/orange/red is a CVD-safe trio
// (green+red avoided). A legend is always present so identity is never color-alone.

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { BarChart3, RefreshCw } from 'lucide-react';
import type { DeltaReason } from '@/models/schemas/ingredient.schema';
import { REASON_LABELS } from './shared';

// Validated dark-surface categorical hues (see references/palette.md)
const C = {
  restocked: '#3987e5', // blue
  consumed: '#d95926', // orange
  wasted: '#e66767', // red
  bar: '#3987e5', // single-series blue
  axis: '#898781',
  grid: '#2c2c2a',
  ink: '#c3c2b7',
};

interface Series {
  date: string;
  consumed: number;
  restocked: number;
  wasted: number;
}
interface ByReason {
  reason: DeltaReason;
  qty: number;
  count: number;
}

const DAYS = [
  { v: 7, l: '7d' },
  { v: 30, l: '30d' },
  { v: 90, l: '90d' },
];

export default function AnalyticsTab() {
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState<Series[]>([]);
  const [byReason, setByReason] = useState<ByReason[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory/analytics?days=${days}`);
      if (res.ok) {
        const data = await res.json();
        setSeries(data.series || []);
        setByReason(data.byReason || []);
      }
    } catch (e) {
      console.error('Failed to load analytics:', e);
    } finally {
      setIsLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const reasonData = byReason.map((r) => ({ ...r, label: REASON_LABELS[r.reason] }));
  const fmtDay = (d: string) => d.slice(5); // MM-DD

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <BarChart3 size={18} /> Analytics
          </h2>
          <p className="text-[#888] text-sm">Stock movement trends over time</p>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex bg-[#111] border border-white/[0.08] rounded-lg p-0.5">
            {DAYS.map((d) => (
              <button
                key={d.v}
                onClick={() => setDays(d.v)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${days === d.v ? 'bg-white/[0.1] text-white' : 'text-[#888] hover:text-white'}`}
              >
                {d.l}
              </button>
            ))}
          </div>
          <button onClick={fetchData} className="p-2 bg-[#111] border border-white/[0.08] rounded-lg text-[#888] hover:text-white hover:border-white/20 transition-colors" title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Trend */}
          <div className="bg-[#111] border border-white/[0.06] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Consumption vs Restock</h3>
            <div style={{ width: '100%', height: 300 }}>
              <ResponsiveContainer>
                <AreaChart data={series} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gConsumed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.consumed} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.consumed} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gRestocked" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.restocked} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={C.restocked} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={fmtDay} stroke={C.axis} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={{ stroke: C.grid }} minTickGap={24} />
                  <YAxis stroke={C.axis} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip content={<DarkTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12, color: C.ink }} />
                  <Area type="monotone" dataKey="restocked" name="Restocked" stroke={C.restocked} strokeWidth={2} fill="url(#gRestocked)" />
                  <Area type="monotone" dataKey="consumed" name="Consumed" stroke={C.consumed} strokeWidth={2} fill="url(#gConsumed)" />
                  <Area type="monotone" dataKey="wasted" name="Wasted" stroke={C.wasted} strokeWidth={2} fill="none" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Movement by reason */}
          <div className="bg-[#111] border border-white/[0.06] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Movement by Reason <span className="text-[#666] font-normal">(total qty, {days}d)</span></h3>
            {reasonData.length === 0 ? (
              <p className="text-xs text-[#555] py-8 text-center">No movement recorded in this range</p>
            ) : (
              <div style={{ width: '100%', height: 260 }}>
                <ResponsiveContainer>
                  <BarChart data={reasonData} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="label" stroke={C.axis} tick={{ fontSize: 10, fill: C.axis }} tickLine={false} axisLine={{ stroke: C.grid }} interval={0} angle={-15} textAnchor="end" height={50} />
                    <YAxis stroke={C.axis} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} width={44} />
                    <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                    <Bar dataKey="qty" name="Quantity" fill={C.bar} radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {reasonData.map((_, i) => <Cell key={i} fill={C.bar} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Dark-surface tooltip
function DarkTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-[#0a0a0a] border border-white/[0.15] rounded-lg px-3 py-2 shadow-xl">
      <div className="text-[11px] text-[#888] mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-[#ccc]">{p.name}</span>
          <span className="ml-auto font-mono text-white">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
}
