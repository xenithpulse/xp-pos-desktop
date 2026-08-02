"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  X,
  Check,
  Loader2,
  Printer,
  Layers,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { MonthSummary, MonthlySheet, LoadingStep, formatCurrency } from "./types";

interface PreviewPanelProps {
  selectedMonth: MonthSummary | null;
  fullMonthData: MonthlySheet | null;
  isLoading: boolean;
  loadingSteps: LoadingStep[];
  onClose: () => void;
  onPrint: () => void;
  onCheckIntegrity?: () => void;
}

export default function PreviewPanel({
  selectedMonth,
  fullMonthData,
  isLoading,
  loadingSteps,
  onClose,
  onPrint,
  onCheckIntegrity,
}: PreviewPanelProps) {
  return (
    <div className="lg:sticky lg:top-[120px]">
      <AnimatePresence mode="wait">
        {!selectedMonth ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-12 text-center"
          >
            <div className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-zinc-800 bg-zinc-900">
              <Eye className="h-4 w-4 text-zinc-500" />
            </div>
            <p className="mt-4 text-[13px] font-medium text-zinc-300">Select a month to preview</p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Tap any card on the left to see totals and export options.
            </p>
          </motion.div>
        ) : isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5"
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold tracking-tight text-white">
                {selectedMonth.monthLabel}
              </h3>
              <button
                onClick={onClose}
                className="grid h-7 w-7 place-items-center rounded-md border border-transparent text-zinc-500 transition hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {loadingSteps.map((step, i) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <div
                    className={`grid h-5 w-5 place-items-center rounded-full border text-[9px] transition ${
                      step.completed
                        ? "border-white/20 bg-white text-zinc-900"
                        : step.active
                        ? "border-zinc-700 bg-zinc-900"
                        : "border-zinc-800 bg-zinc-950"
                    }`}
                  >
                    {step.completed ? (
                      <Check className="h-2.5 w-2.5" />
                    ) : step.active ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-zinc-300" />
                    ) : null}
                  </div>
                  <span
                    className={`text-[13px] ${
                      step.completed
                        ? "text-zinc-200"
                        : step.active
                        ? "text-white"
                        : "text-zinc-500"
                    }`}
                  >
                    {step.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        ) : fullMonthData ? (
          <motion.div
            key="preview"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/70 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.02)]"
          >
            {/* Header */}
            <div className="border-b border-zinc-900 px-5 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold tracking-tight text-white">
                    {fullMonthData.monthLabel}
                  </h3>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {new Date(fullMonthData.startDate).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                    })}{" "}
                    –{" "}
                    {new Date(fullMonthData.endDate).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="grid h-7 w-7 place-items-center rounded-md border border-transparent text-zinc-500 transition hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200"
                  aria-label="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Stats */}
            <div className="space-y-4 p-5">
              {/* Highlight: closing balance */}
              <div className="rounded-xl border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950 p-4">
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  Closing balance
                </div>
                <div className="mt-1 truncate text-[22px] font-semibold tracking-tight text-white">
                  {formatCurrency(fullMonthData.closingBalance)}
                </div>
                <div className="mt-1 text-[11px] text-zinc-500">
                  Opening: {formatCurrency(fullMonthData.openingBalance)}
                </div>
              </div>

              {/* Income / expense */}
              <div className="grid grid-cols-2 gap-3">
                <Tile
                  label="Income"
                  value={`+${formatCurrency(fullMonthData.totalIncome)}`}
                  icon={<TrendingUp className="h-3 w-3" />}
                  tone="emerald"
                />
                <Tile
                  label="Expense"
                  value={`-${formatCurrency(fullMonthData.totalExpense)}`}
                  icon={<TrendingDown className="h-3 w-3" />}
                  tone="rose"
                />
              </div>

              {/* Daily sheets count */}
              <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[12px] text-zinc-400">
                  <Layers className="h-3.5 w-3.5" /> Daily sheets
                </div>
                <span className="text-[13px] font-semibold text-white">
                  {fullMonthData.dailySummaries.length}
                </span>
              </div>

              {/* Status */}
              <div
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-[12px] font-medium ${
                  fullMonthData.isClosed
                    ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300"
                    : "border-amber-900/60 bg-amber-950/40 text-amber-300"
                }`}
              >
                {fullMonthData.isClosed ? (
                  <>
                    <Check className="h-3 w-3" /> Month closed
                  </>
                ) : (
                  <>Month still open</>
                )}
              </div>

              {/* Primary action */}
              <button
                onClick={onPrint}
                className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-100"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-zinc-900/10 to-transparent transition-transform duration-700 group-hover:translate-x-full"
                />
                <Printer className="h-3.5 w-3.5" /> Generate Report
              </button>

              {onCheckIntegrity && (
                <button
                  onClick={onCheckIntegrity}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-[13px] font-medium text-zinc-200 transition hover:border-zinc-700 hover:bg-zinc-900"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> Check Integrity
                </button>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Tile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: "emerald" | "rose";
}) {
  const cls =
    tone === "emerald" ? "text-emerald-300" : "text-rose-300";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className={`flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}>
        {icon} {label}
      </div>
      <div className="mt-1 truncate text-[14px] font-semibold text-white">{value}</div>
    </div>
  );
}
