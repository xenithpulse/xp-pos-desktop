"use client";

import { motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { MonthSummary, formatLargeNumber } from "./types";

interface MonthCardProps {
  month: MonthSummary;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

export default function MonthCard({ month, index, isSelected, onSelect }: MonthCardProps) {
  const netChange = month.totalIncome - month.totalExpense;
  const positive = netChange >= 0;

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.02, 0.2), duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      aria-pressed={isSelected}
      className={`group relative overflow-hidden rounded-xl border p-4 text-left transition ${
        isSelected
          ? "border-white/20 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_20px_40px_-20px_rgba(0,0,0,0.6)]"
          : "border-zinc-800 bg-zinc-950/60 hover:border-zinc-700 hover:bg-zinc-900/60"
      }`}
    >
      {/* Top hairline highlight when selected */}
      {isSelected && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"
        />
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className={`truncate text-[14px] font-semibold ${isSelected ? "text-white" : "text-zinc-100"}`}>
            {month.monthLabel}
          </h3>
          <div className="mt-1 flex items-center gap-1.5">
            {month.isClosed ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-zinc-400">
                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" /> Closed
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-900/60 bg-amber-950/40 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-amber-300">
                Open
              </span>
            )}
          </div>
        </div>

        <span
          aria-hidden
          className={`mt-1 h-2 w-2 rounded-full ${
            positive ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" : "bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.5)]"
          }`}
        />
      </div>

      {/* Stats */}
      <div className="mt-4 space-y-1.5">
        <Row label="Income" value={`+${formatLargeNumber(month.totalIncome)}`} tone="emerald" />
        <Row label="Expense" value={`-${formatLargeNumber(month.totalExpense)}`} tone="rose" />
      </div>

      {/* Closing balance */}
      <div className="mt-3 border-t border-zinc-800/80 pt-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium text-zinc-400">Closing</span>
          <span className="text-[14px] font-semibold tracking-tight text-white">
            {formatLargeNumber(month.closingBalance)}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "emerald" | "rose" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={`text-[12.5px] font-medium ${tone === "emerald" ? "text-emerald-300/90" : "text-rose-300/90"}`}>
        {value}
      </span>
    </div>
  );
}
