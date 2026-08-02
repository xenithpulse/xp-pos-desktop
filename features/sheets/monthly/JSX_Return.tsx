"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useReactToPrint } from "react-to-print";
import { Loader2 } from "lucide-react";

import YearHeader from "./YearHeader";
import MonthGrid from "./MonthGrid";
import PreviewPanel from "./PreviewPanel";
import PrintModal from "./PrintModal";
import MonthlyReportToPrint from "./ReportTemp";
import { IntegrityCheckModal } from "./IntegrityCheck";
import { MonthSummary, MonthlySheet, LoadingStep } from "./types";

export default function AnnualView() {
  // Data states
  const [years, setYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [monthSummaries, setMonthSummaries] = useState<MonthSummary[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<MonthSummary | null>(null);
  const [fullMonthData, setFullMonthData] = useState<MonthlySheet | null>(null);

  // Loading states
  const [isLoadingYears, setIsLoadingYears] = useState(true);
  const [isLoadingMonth, setIsLoadingMonth] = useState(false);
  const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([]);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showIntegrityModal, setShowIntegrityModal] = useState(false);

  const componentRef = useRef<HTMLDivElement>(null);

  // Fetch year summaries
  const fetchYearData = useCallback(async (year?: number) => {
    setIsLoadingYears(true);
    try {
      const url = year
        ? `/api/monthly-sheets/summary?year=${year}`
        : "/api/monthly-sheets/summary";
      const res = await fetch(url);
      const data = await res.json();

      if (data.success) {
        setYears(data.years || []);
        setMonthSummaries(data.data || []);
        if (!year && data.selectedYear) {
          setSelectedYear(data.selectedYear);
        }
      }
    } catch (error) {
      console.error("Failed to fetch monthly summaries:", error);
    } finally {
      setIsLoadingYears(false);
    }
  }, []);

  // Fetch full month data with step loader
  const fetchFullMonthData = useCallback(async (monthId: string) => {
    setIsLoadingMonth(true);

    const steps: LoadingStep[] = [
      { id: "connect", label: "Connecting to database", completed: false, active: true },
      { id: "fetch", label: "Fetching month data", completed: false, active: false },
      { id: "process", label: "Processing daily sheets", completed: false, active: false },
      { id: "calculate", label: "Calculating totals", completed: false, active: false },
      { id: "ready", label: "Report ready", completed: false, active: false },
    ];
    setLoadingSteps([...steps]);

    try {
      await new Promise((r) => setTimeout(r, 400));
      steps[0].completed = true;
      steps[0].active = false;
      steps[1].active = true;
      setLoadingSteps([...steps]);

      const res = await fetch(`/api/monthly-sheets/${monthId}`);
      const data = await res.json();

      await new Promise((r) => setTimeout(r, 300));
      steps[1].completed = true;
      steps[1].active = false;
      steps[2].active = true;
      setLoadingSteps([...steps]);

      await new Promise((r) => setTimeout(r, 500));
      steps[2].completed = true;
      steps[2].active = false;
      steps[3].active = true;
      setLoadingSteps([...steps]);

      await new Promise((r) => setTimeout(r, 300));
      steps[3].completed = true;
      steps[3].active = false;
      steps[4].active = true;
      setLoadingSteps([...steps]);

      await new Promise((r) => setTimeout(r, 200));
      steps[4].completed = true;
      steps[4].active = false;
      setLoadingSteps([...steps]);

      if (data.success) {
        setFullMonthData(data.data);
      }
    } catch (error) {
      console.error("Failed to fetch full month data:", error);
    } finally {
      setIsLoadingMonth(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchYearData();
  }, [fetchYearData]);

  // When year changes
  useEffect(() => {
    if (selectedYear) {
      setSelectedMonth(null);
      setFullMonthData(null);
      fetchYearData(selectedYear);
    }
  }, [selectedYear, fetchYearData]);

  // When month selected
  useEffect(() => {
    if (selectedMonth) {
      fetchFullMonthData(selectedMonth._id);
    } else {
      setFullMonthData(null);
    }
  }, [selectedMonth, fetchFullMonthData]);

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    documentTitle: `Monthly_Report_${fullMonthData?.monthLabel.replace(/\s/g, "_")}`,
    pageStyle: "@page { size: A4; margin: 12mm; }",
  });

  return (
    <div className="min-h-[60vh] text-zinc-100">
      <YearHeader
        years={years}
        selectedYear={selectedYear}
        setSelectedYear={setSelectedYear}
        monthSummaries={monthSummaries}
        isLoading={isLoadingYears}
      />

      <div className="mx-auto max-w-9xl px-4 py-8 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {isLoadingYears && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-24"
            >
              <Loader2 className="h-6 w-6 animate-spin text-zinc-500" />
              <p className="mt-4 text-[12px] text-zinc-500">Loading financial data…</p>
            </motion.div>
          )}
        </AnimatePresence>

        {!isLoadingYears && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-4 lg:gap-8"
          >
            {/* Month cards */}
            <div className="lg:col-span-3">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                    Monthly Sheets
                  </h2>
                  <p className="mt-0.5 text-[11px] text-zinc-600">
                    Tap a card to preview totals on the right
                  </p>
                </div>
                <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-400">
                  {monthSummaries.length} {monthSummaries.length === 1 ? "record" : "records"}
                </span>
              </div>

              <MonthGrid
                monthSummaries={monthSummaries}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                onSelectMonth={setSelectedMonth}
              />
            </div>

            {/* Preview */}
            <div className="lg:col-span-1">
              <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
                Preview
              </h2>

              <PreviewPanel
                selectedMonth={selectedMonth}
                fullMonthData={fullMonthData}
                isLoading={isLoadingMonth}
                loadingSteps={loadingSteps}
                onClose={() => setSelectedMonth(null)}
                onPrint={() => setShowPrintModal(true)}
                onCheckIntegrity={() => setShowIntegrityModal(true)}
              />
            </div>
          </motion.div>
        )}
      </div>

      {/* Print modal */}
      <AnimatePresence>
        {showPrintModal && (
          <PrintModal
            isOpen={showPrintModal}
            fullMonthData={fullMonthData}
            onClose={() => setShowPrintModal(false)}
            onPrint={handlePrint}
          />
        )}
      </AnimatePresence>

      {/* Integrity check modal */}
      <AnimatePresence>
        {showIntegrityModal && selectedMonth && (
          <IntegrityCheckModal
            isOpen={showIntegrityModal}
            onClose={() => setShowIntegrityModal(false)}
            monthLabel={selectedMonth.monthLabel}
          />
        )}
      </AnimatePresence>

      {/* Hidden print template */}
      {fullMonthData && (
        <div style={{ display: "none" }}>
          <MonthlyReportToPrint data={fullMonthData} ref={componentRef} />
        </div>
      )}
    </div>
  );
}
