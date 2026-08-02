"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FileText } from "lucide-react";
import { MonthSummary } from "./types";
import MonthCard from "./MonthCard";

interface MonthGridProps {
  monthSummaries: MonthSummary[];
  selectedYear: number;
  selectedMonth: MonthSummary | null;
  onSelectMonth: (month: MonthSummary) => void;
}

export default function MonthGrid({
  monthSummaries,
  selectedYear,
  selectedMonth,
  onSelectMonth,
}: MonthGridProps) {
  if (monthSummaries.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-16 text-center"
      >
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl border border-zinc-800 bg-zinc-900">
          <FileText className="h-5 w-5 text-zinc-600" />
        </div>
        <p className="mt-4 text-[14px] font-medium text-zinc-300">No monthly sheets for {selectedYear}</p>
        <p className="mt-1 text-[12px] text-zinc-500">Closed months will appear here once you finalize them.</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
    >
      <AnimatePresence mode="popLayout">
        {[...monthSummaries].reverse().map((month, index) => (
          <MonthCard
            key={month._id}
            month={month}
            index={index}
            isSelected={selectedMonth?._id === month._id}
            onSelect={() => onSelectMonth(month)}
          />
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
