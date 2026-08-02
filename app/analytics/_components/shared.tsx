'use client';

// app/analytics/_components/shared.tsx
// Shared primitives, palette, formatters and hooks for the analytics tabs.

import { useCallback, useEffect, useState } from 'react';

// ── Palette (dataviz reference, light mode) ──────────────────────────────────
export const C = {
  blue: '#2a78d6',
  aqua: '#1baf7a',
  yellow: '#eda100',
  green: '#008300',
  violet: '#4a3aa7',
  red: '#e34948',
  magenta: '#e87ba4',
  orange: '#eb6834',
  grid: '#e1e0d9',
  axis: '#898781',
  ink: '#0b0b0b',
  inkSoft: '#52514e',
};
// Fixed categorical order — assigned by entity, never cycled.
export const CAT = [C.blue, C.aqua, C.yellow, C.green, C.violet, C.red, C.magenta, C.orange];

// Status hues (reserved — never reused as a series color)
export const STATUS = {
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
};

// ── Currency ─────────────────────────────────────────────────────────────────
export function useCurrency() {
  const [symbol, setSymbol] = useState('Rs.');

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s?.currencySymbol) setSymbol(s.currencySymbol);
      })
      .catch(() => {});
  }, []);

  const fmtMoney = useCallback(
    (n: number) => `${symbol} ${Math.round(n).toLocaleString()}`,
    [symbol]
  );
  const fmtCompact = useCallback(
    (n: number) => {
      const abs = Math.abs(n);
      if (abs >= 1_000_000) return `${symbol} ${(n / 1_000_000).toFixed(1)}M`;
      if (abs >= 1_000) return `${symbol} ${(n / 1_000).toFixed(1)}k`;
      return `${symbol} ${Math.round(n)}`;
    },
    [symbol]
  );

  return { symbol, fmtMoney, fmtCompact };
}

// ── Data fetch hook (shared shape for every tab) ─────────────────────────────
export function useAnalyticsFetch<T>(url: string, enabled: boolean) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      setData(await res.json());
    } catch (e) {
      console.error('Analytics fetch failed:', url, e);
      setError((e as Error).message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    if (enabled) fetchData();
  }, [enabled, fetchData]);

  return { data, loading, error, refetch: fetchData };
}

// ── Presentational pieces ────────────────────────────────────────────────────

export function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          {icon}
        </span>
        <span className="text-sm font-medium text-gray-500">{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold tracking-tight text-gray-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:p-5 ${className}`}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

export interface TooltipRow {
  key: string;
  label: string;
  color?: string;
  fmt: (n: number) => string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
  label?: string | number;
  labelFmt?: (l: unknown) => string;
  rows: TooltipRow[];
  nameKey?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelFmt,
  rows,
  nameKey,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0].payload as Record<string, unknown>;
  const heading = nameKey
    ? String(datum[nameKey])
    : labelFmt
      ? labelFmt(label)
      : String(label);
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold text-gray-900">{heading}</div>
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 text-gray-600">
          {r.color && (
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: r.color }} />
          )}
          <span>{r.label}:</span>
          <span className="font-semibold tabular-nums text-gray-900">
            {r.fmt(Number(datum[r.key] ?? 0))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ message = 'No data in this period.' }: { message?: string }) {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-gray-400">{message}</div>
  );
}

export function ErrorBar({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message} —{' '}
      <button onClick={onRetry} className="font-semibold underline">
        retry
      </button>
    </div>
  );
}

export function TabSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-200" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-gray-200" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl bg-gray-200" />
        <div className="h-72 animate-pulse rounded-xl bg-gray-200" />
      </div>
    </div>
  );
}

/** Horizontal ranked bar row (used by top-items / category lists). */
export function RankedBar({
  rank,
  name,
  suffix,
  value,
  max,
  color,
}: {
  rank?: number;
  name: string;
  suffix?: string;
  value: string;
  max: number;
  color: string;
  /** current numeric value used to size the bar */
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
        <span className="flex min-w-0 items-center gap-2 text-gray-700">
          {rank !== undefined && (
            <span className="w-4 shrink-0 text-right font-semibold tabular-nums text-gray-400">
              {rank}
            </span>
          )}
          <span className="truncate font-medium text-gray-900">{name}</span>
          {suffix && <span className="shrink-0 text-xs text-gray-400">{suffix}</span>}
        </span>
        <span className="shrink-0 font-semibold tabular-nums text-gray-900">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(2, max)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
export function longDate(iso: string): string {
  const dt = new Date(`${iso}T00:00:00`);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
export function fmtHour(h: number): string {
  if (h === 0) return '12a';
  if (h === 12) return '12p';
  return h < 12 ? `${h}a` : `${h - 12}p`;
}
export function fmtHourLong(h: number): string {
  return `${fmtHour(h)}–${fmtHour((h + 1) % 24)}`;
}

export function useClientTz(): string {
  const [tz, setTz] = useState('Asia/Karachi');
  useEffect(() => {
    setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Karachi');
  }, []);
  return tz;
}
