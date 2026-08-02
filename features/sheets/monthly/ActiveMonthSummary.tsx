"use client";

// ──────────────────────────────────────────────────────────────────────────────
// ActiveMonthSummary
//
// Lightweight read-only widget that surfaces the currently *open* monthly
// sheet (the single document with `isClosed: false`).  Hits the dedicated
// `/api/monthly-sheets/active?summary=1` endpoint which projects only the
// header fields, so the heavy `dailySummaries` array never crosses the wire.
// ──────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  FileText,
  CalendarDays,
  PiggyBank,
  AlertCircle,
} from "lucide-react";

import { formatCurrency, formatLargeNumber } from "./types";
import type { MonthSummary } from "./types";

export default function ActiveMonthSummary() {
  const [active, setActive] = useState<MonthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/monthly-sheets/active?summary=1`, {
          signal: ctrl.signal,
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const data = (await res.json()) as MonthSummary | null;
        setActive(data);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  if (loading) return <SummarySkeleton />;

  if (error) {
    return (
      <EmptyState
        title="Couldn't load active month"
        message={error}
        icon={<AlertCircle className="h-5 w-5 text-rose-500" />}
      />
    );
  }

  if (!active) {
    return (
      <EmptyState
        title="No active monthly sheet"
        message="There is no open month right now. Open a new sheet from Backups & Records to start tracking."
        icon={<CalendarDays className="h-5 w-5 text-gray-500" />}
      />
    );
  }

  const net = active.totalIncome - active.totalExpense;
  const netPositive = net >= 0;
  const today = new Date();
  const start = new Date(active.startDate);
  const end = new Date(active.endDate);
  const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const elapsedDays = Math.min(
    totalDays,
    Math.max(1, Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1),
  );
  const progress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      {/* Header card ----------------------------------------------------- */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Active month
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">
              {active.monthLabel}
            </h2>
            <p className="flex items-center gap-1.5 text-xs text-gray-500">
              <CalendarDays className="h-3.5 w-3.5" />
              {start.toLocaleDateString()} → {end.toLocaleDateString()}
              <span className="ml-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                Day {elapsedDays}/{totalDays}
              </span>
            </p>
          </div>

          <Link
            href="/backups-records"
            className="inline-flex items-center gap-1.5 self-start rounded-lg bg-black px-4 py-2 text-xs font-medium text-white shadow-sm transition hover:bg-gray-800"
          >
            <FileText className="h-3.5 w-3.5" /> Full Report
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Progress bar */}
        <div className="px-5 pb-5">
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>Month progress</span>
            <span className="font-medium text-gray-700">{progress}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-gray-900"
            />
          </div>
        </div>
      </div>

      {/* KPI tiles ------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={<TrendingUp className="h-4 w-4 text-emerald-600" />}
          label="Income"
          value={formatLargeNumber(active.totalIncome)}
          fullValue={formatCurrency(active.totalIncome)}
          accent="emerald"
        />
        <Tile
          icon={<TrendingDown className="h-4 w-4 text-rose-600" />}
          label="Expenses"
          value={formatLargeNumber(active.totalExpense)}
          fullValue={formatCurrency(active.totalExpense)}
          accent="rose"
        />
        <Tile
          icon={<Wallet className="h-4 w-4 text-gray-700" />}
          label="Net"
          value={`${netPositive ? "+" : ""}${formatLargeNumber(net)}`}
          fullValue={formatCurrency(net)}
          accent={netPositive ? "emerald" : "rose"}
        />
        <Tile
          icon={<PiggyBank className="h-4 w-4 text-gray-100" />}
          label="Closing balance"
          value={formatLargeNumber(active.closingBalance)}
          fullValue={formatCurrency(active.closingBalance)}
          dark
        />
      </div>

      {/* Footer note ----------------------------------------------------- */}
      <div className="flex items-start gap-2 rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>
          Detailed monthly reports, integrity checks and printable templates have moved to{" "}
          <Link href="/backups-records" className="font-medium text-gray-900 underline underline-offset-2">
            Backups &amp; Records
          </Link>
          .
        </span>
      </div>
    </motion.div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SummarySkeleton() {
  return (
    <div className="space-y-5">
      <div className="h-32 animate-pulse rounded-2xl border border-gray-200 bg-gray-50" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl border border-gray-200 bg-gray-50" />
        ))}
      </div>
      <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading current month…
      </div>
    </div>
  );
}

function EmptyState({
  title,
  message,
  icon,
}: {
  title: string;
  message: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">{icon}</div>
      <div>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 max-w-sm text-xs text-gray-500">{message}</p>
      </div>
      <Link
        href="/backups-records"
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-black px-4 py-2 text-xs font-medium text-white hover:bg-gray-800"
      >
        Open Backups &amp; Records <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

type TileAccent = "emerald" | "rose" | "gray";

function Tile({
  icon,
  label,
  value,
  fullValue,
  dark = false,
  accent = "gray",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  fullValue?: string;
  dark?: boolean;
  accent?: TileAccent;
}) {
  const accentText = dark
    ? "text-white"
    : accent === "emerald"
    ? "text-emerald-600"
    : accent === "rose"
    ? "text-rose-600"
    : "text-gray-900";

  return (
    <div
      className={`group rounded-xl border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${
        dark ? "border-gray-900 bg-gray-900" : "border-gray-200 bg-white"
      }`}
      title={fullValue}
    >
      <div
        className={`flex items-center gap-1.5 text-[11px] uppercase tracking-wider ${
          dark ? "text-gray-400" : "text-gray-500"
        }`}
      >
        {icon} {label}
      </div>
      <div className={`mt-2 text-lg font-semibold ${accentText}`}>{value}</div>
      {fullValue && (
        <div className={`mt-0.5 text-[11px] ${dark ? "text-gray-500" : "text-gray-400"}`}>
          {fullValue}
        </div>
      )}
    </div>
  );
}
