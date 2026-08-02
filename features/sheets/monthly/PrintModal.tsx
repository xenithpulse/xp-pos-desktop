"use client";

import { motion } from "framer-motion";
import { FileText, Printer, X } from "lucide-react";
import { useEffect } from "react";
import { MonthlySheet, formatLargeNumber } from "./types";

interface PrintModalProps {
  isOpen: boolean;
  fullMonthData: MonthlySheet | null;
  onClose: () => void;
  onPrint: () => void;
}

export default function PrintModal({
  isOpen,
  fullMonthData,
  onClose,
  onPrint,
}: PrintModalProps) {
  // Esc to close.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen || !fullMonthData) return null;

  const netChange = fullMonthData.totalIncome - fullMonthData.totalExpense;
  const positive = netChange >= 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="print-modal-title"
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 12 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-b from-zinc-950 to-black p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)]"
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-md border border-transparent text-zinc-500 transition hover:border-zinc-800 hover:bg-zinc-900 hover:text-zinc-200"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-gradient-to-b from-zinc-800 to-zinc-900">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <h3 id="print-modal-title" className="mt-4 text-[18px] font-semibold tracking-tight text-white">
            {fullMonthData.monthLabel}
          </h3>
          <p className="mt-1 text-[12px] text-zinc-500">Monthly Financial Report</p>
        </div>

        {/* Highlight: closing balance */}
        <div className="mb-4 rounded-xl border border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950 p-4 text-center">
          <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Closing balance</div>
          <div className="mt-1 truncate text-[24px] font-semibold tracking-tight text-white">
            {formatLargeNumber(fullMonthData.closingBalance)}
          </div>
        </div>

        {/* Stats grid */}
        <div className="mb-6 grid grid-cols-3 gap-2">
          <Tile label="Income" value={`+${formatLargeNumber(fullMonthData.totalIncome)}`} tone="emerald" />
          <Tile label="Expense" value={`-${formatLargeNumber(fullMonthData.totalExpense)}`} tone="rose" />
          <Tile
            label="Net"
            value={`${positive ? "+" : ""}${formatLargeNumber(netChange)}`}
            tone={positive ? "white" : "amber"}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-[13px] font-medium text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onPrint();
              onClose();
            }}
            className="group relative inline-flex flex-1 items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/10 bg-white px-3 py-2.5 text-[13px] font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-100"
          >
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-zinc-900/10 to-transparent transition-transform duration-700 group-hover:translate-x-full"
            />
            <Printer className="h-3.5 w-3.5" /> Print Report
          </button>
        </div>

        <div className="mt-3 text-center text-[10px] text-zinc-600">
          Tip: press{" "}
          <kbd className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 font-mono text-[9px] text-zinc-300">
            Esc
          </kbd>{" "}
          to cancel
        </div>
      </motion.div>
    </motion.div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "white" | "amber";
}) {
  const cls =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "rose"
      ? "text-rose-300"
      : tone === "amber"
      ? "text-amber-300"
      : "text-white";
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 text-center">
      <div className="text-[9px] font-medium uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-1 truncate text-[13px] font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
