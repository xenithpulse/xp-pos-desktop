"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, CalendarDays, TrendingUp, TrendingDown } from "lucide-react";
import { MonthSummary, formatLargeNumber } from "./types";

interface YearHeaderProps {
  years: number[];
  selectedYear: number;
  setSelectedYear: (year: number) => void;
  monthSummaries: MonthSummary[];
  isLoading: boolean;
}

export default function YearHeader({
  years,
  selectedYear,
  setSelectedYear,
  monthSummaries,
  isLoading,
}: YearHeaderProps) {
  const navigateYear = (direction: number) => {
    const currentIndex = years.indexOf(selectedYear);
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < years.length) {
      setSelectedYear(years[newIndex]);
    }
  };

  const yearStats = {
    totalIncome: monthSummaries.reduce((sum, m) => sum + m.totalIncome, 0),
    totalExpense: monthSummaries.reduce((sum, m) => sum + m.totalExpense, 0),
    get netProfit() {
      return this.totalIncome - this.totalExpense;
    },
  };

  const positive = yearStats.netProfit >= 0;

  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-[57px] z-10 border-b border-zinc-900/80 bg-black/60 backdrop-blur-md supports-[backdrop-filter]:bg-black/40"
    >
      <div className="mx-auto max-w-9xl px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Year navigator */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigateYear(1)}
              disabled={years.indexOf(selectedYear) === years.length - 1}
              className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Newer year"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>

            <div className="relative inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-zinc-500" />
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                className="cursor-pointer appearance-none bg-transparent pr-1 text-base font-semibold tracking-tight text-white outline-none"
              >
                {years.map((year) => (
                  <option key={year} value={year} className="bg-zinc-950 text-white">
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => navigateYear(-1)}
              disabled={years.indexOf(selectedYear) === 0}
              className="grid h-8 w-8 place-items-center rounded-lg border border-zinc-800 bg-zinc-950 text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Older year"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Year totals */}
          {!isLoading && monthSummaries.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-2"
            >
              <Stat
                tone="income"
                label="Income"
                value={formatLargeNumber(yearStats.totalIncome)}
                icon={<TrendingUp className="h-3 w-3" />}
              />
              <Stat
                tone="expense"
                label="Expense"
                value={formatLargeNumber(yearStats.totalExpense)}
                icon={<TrendingDown className="h-3 w-3" />}
              />
              <Stat
                tone={positive ? "net-pos" : "net-neg"}
                label="Net"
                value={`${positive ? "+" : ""}${formatLargeNumber(yearStats.netProfit)}`}
                emphasize
              />
            </motion.div>
          )}
        </div>
      </div>
    </motion.header>
  );
}

function Stat({
  label,
  value,
  icon,
  tone,
  emphasize,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tone: "income" | "expense" | "net-pos" | "net-neg";
  emphasize?: boolean;
}) {
  const palette: Record<typeof tone, string> = {
    income: "text-emerald-300",
    expense: "text-rose-300",
    "net-pos": "text-white",
    "net-neg": "text-amber-300",
  };
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
        emphasize
          ? "border-white/10 bg-gradient-to-b from-zinc-900 to-zinc-950"
          : "border-zinc-800 bg-zinc-950/60"
      }`}
    >
      <span className={`hidden sm:inline ${palette[tone]}`}>{icon}</span>
      <div className="leading-tight">
        <div className="text-[9px] uppercase tracking-wider text-zinc-500">{label}</div>
        <div className={`text-[12.5px] font-semibold ${palette[tone]}`}>{value}</div>
      </div>
    </div>
  );
}
