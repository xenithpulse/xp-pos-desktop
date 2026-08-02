"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle,
  XCircle,
  Loader2,
  Wrench,
  History,
  ArrowUpRight,
  ArrowDownLeft,
  Search,
  Hash,
  ChevronRight,
  AlertCircle,
  X,
  Shield,
  Activity,
} from "lucide-react";
import { useMemo, useState } from "react";

import { useIntegrityCheck } from "./useIntegrityCheck";
import type { DailyValidationResult, RuleResult } from "./types";

interface IntegrityCheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthLabel: string;
}

export default function IntegrityCheckModal({
  isOpen,
  onClose,
  monthLabel,
}: IntegrityCheckModalProps) {
  const {
    status,
    progress,
    total,
    dailyResults,
    selectedDay,
    audit,
    repairing,
    error,
    startValidation,
    selectDay,
    runRepair,
    reset,
    failedDays,
    hasIssues,
  } = useIntegrityCheck({ monthLabel });

  const [rightPanelTab, setRightPanelTab] = useState<"preview" | "repair">("preview");
  const [searchTerm, setSearchTerm] = useState("");

  const percent = total ? Math.round((progress / total) * 100) : 0;

  // Filtered Ledger Preview
  const filteredLedger = useMemo(() => {
    if (!selectedDay) return { slips: [], entries: [] };
    const s = searchTerm.toLowerCase();
    return {
      slips: selectedDay.slipEntries.filter(
        (t) =>
          t.uniqueNumber?.toLowerCase().includes(s) ||
          t.note?.toLowerCase().includes(s) ||
          t.description?.toLowerCase().includes(s)
      ),
      entries: selectedDay.entries.filter(
        (t) =>
          t.note?.toLowerCase().includes(s) ||
          t.category?.toLowerCase().includes(s) ||
          t.description?.toLowerCase().includes(s)
      ),
    };
  }, [selectedDay, searchTerm]);

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", duration: 0.5 }}
          className="w-full max-w-7xl h-[90vh] bg-neutral-950 border border-white/10 rounded-2xl overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <header className="p-6 border-b border-white/5 flex items-center justify-between bg-white/2">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                <Shield className="text-white/40" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">
                  Integrity Check
                </h2>
                <p className="text-xs text-white/40 font-medium">{monthLabel}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {status === "IDLE" && (
                <button
                  onClick={startValidation}
                  className="bg-white text-black px-6 py-2.5 rounded-lg text-xs font-bold hover:bg-neutral-200 transition-all flex items-center gap-2"
                >
                  <Activity size={14} />
                  Start Audit
                </button>
              )}

              {status === "RUNNING" && (
                <div className="flex items-center gap-3 text-white/60">
                  <Loader2 className="animate-spin" size={16} />
                  <span className="text-xs font-medium">Analyzing...</span>
                </div>
              )}

              {(status === "PASSED" || status === "FAILED") && (
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold ${
                    status === "PASSED"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-red-500/10 text-red-400"
                  }`}
                >
                  {status === "PASSED" ? (
                    <CheckCircle size={14} />
                  ) : (
                    <XCircle size={14} />
                  )}
                  {status}
                </div>
              )}

              <button
                onClick={handleClose}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors"
              >
                <X size={18} className="text-white/40" />
              </button>
            </div>
          </header>

          {/* Error Display */}
          {error && (
            <div className="mx-6 mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Main Content Grid */}
          <div className="flex-1 grid grid-cols-12 gap-4 p-4 overflow-hidden">
            {/* Column 1: Daily Stream */}
            <div className="col-span-12 md:col-span-3 border border-white/10 rounded-xl bg-white/2 overflow-hidden flex flex-col">
              <div className="p-4 border-b border-white/5 flex justify-between items-center bg-white/2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">
                  Daily Stream
                </h3>
                <div className="text-[10px] font-mono text-white/20">
                  {dailyResults.length} / {total || "—"}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar">
                {dailyResults.length === 0 && status === "IDLE" && (
                  <div className="h-full flex flex-col items-center justify-center text-white/20 p-6 text-center">
                    <History size={32} strokeWidth={1} className="mb-3 opacity-50" />
                    <p className="text-[10px] uppercase tracking-widest">
                      Click &quot;Start Audit&quot; to begin
                    </p>
                  </div>
                )}

                <AnimatePresence initial={false}>
                  {dailyResults.map((d) => {
                    const isFailed = d.rules.some((r) => !r.passed);
                    const isSelected = selectedDay?.dailySheetId === d.dailySheetId;
                    return (
                      <motion.div
                        key={d.dailySheetId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={() => selectDay(d)}
                        className={`group relative p-4 border-b border-white/5 cursor-pointer transition-all ${
                          isSelected
                            ? "bg-white/10 text-white"
                            : "hover:bg-white/5"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-gray-400 font-bold tracking-tight">
                            {new Date(d.date)
                              .toLocaleDateString(undefined, {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                              .toUpperCase()}
                          </span>
                          {isFailed ? (
                            <AlertCircle
                              size={14}
                              className={isSelected ? "text-white" : "text-red-500"}
                            />
                          ) : (
                            <CheckCircle
                              size={14}
                              className={
                                isSelected ? "text-white" : "text-emerald-500"
                              }
                            />
                          )}
                        </div>
                        <p
                          className={`text-[9px] font-mono uppercase tracking-tighter ${
                            isSelected ? "text-white/40" : "text-white/20"
                          }`}
                        >
                          ID: {d.dailySheetId.slice(-8)}
                        </p>
                        {isSelected && (
                          <motion.div
                            layoutId="active-day"
                            className="absolute left-0 top-0 bottom-0 w-1 bg-white/30"
                          />
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              {/* Progress Bar */}
              {status === "RUNNING" && (
                <div className="p-4 bg-black border-t border-white/10">
                  <div className="flex justify-between text-[10px] font-bold mb-2 opacity-40 uppercase tracking-widest">
                    <span>Progress</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-white"
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Summary */}
              {status !== "IDLE" && status !== "RUNNING" && (
                <div className="p-4 bg-black border-t border-white/10 space-y-2">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-white/40">Passed</span>
                    <span className="text-emerald-400 font-bold">
                      {dailyResults.length - failedDays.length}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-white/40">Failed</span>
                    <span className="text-red-400 font-bold">{failedDays.length}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Column 2: Rule Inspector */}
            <div className="col-span-12 md:col-span-5 border border-white/10 rounded-xl bg-white/2 flex flex-col overflow-hidden">
              <div className="p-4 border-b border-white/5 bg-white/2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">
                  Audit Rules
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                {!selectedDay ? (
                  <div className="h-full flex flex-col items-center justify-center opacity-20 text-center">
                    <History size={48} strokeWidth={0.5} />
                    <p className="text-[10px] mt-4 uppercase tracking-[0.3em] font-light">
                      Select a day to inspect
                    </p>
                  </div>
                ) : (
                  selectedDay.rules.map((rule, idx) => (
                    <RuleCard key={rule.key} rule={rule} delay={idx * 0.02} />
                  ))
                )}
              </div>
            </div>

            {/* Column 3: Preview / Repair */}
            <div className="col-span-12 md:col-span-4 border border-white/10 rounded-xl bg-black flex flex-col overflow-hidden">
              {/* Tabs */}
              <div className="flex border-b border-white/5 bg-white/2">
                <button
                  onClick={() => setRightPanelTab("preview")}
                  className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-[0.15em] transition-all border-r border-white/5 ${
                    rightPanelTab === "preview"
                      ? "bg-white/10 text-white"
                      : "text-white/30 hover:text-white/60"
                  }`}
                >
                  Ledger Preview
                </button>
                <button
                  onClick={() => setRightPanelTab("repair")}
                  className={`flex-1 py-4 text-[10px] font-bold uppercase tracking-[0.15em] transition-all ${
                    rightPanelTab === "repair"
                      ? "bg-white/10 text-white"
                      : "text-white/30 hover:text-white/60"
                  }`}
                >
                  Repair
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <AnimatePresence mode="wait">
                  {rightPanelTab === "preview" ? (
                    <motion.div
                      key="preview"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-6"
                    >
                      {!selectedDay ? (
                        <div className="h-64 flex flex-col items-center justify-center opacity-20">
                          <Search size={32} strokeWidth={1} />
                          <p className="text-[10px] mt-3 uppercase font-bold">
                            Select a day to preview
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Search */}
                          <div className="relative">
                            <Search
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20"
                              size={14}
                            />
                            <input
                              type="text"
                              placeholder="Search ledger..."
                              value={searchTerm}
                              onChange={(e) => setSearchTerm(e.target.value)}
                              className="w-full bg-white/5 border border-white/10 rounded-lg py-2.5 pl-10 pr-4 text-[11px] font-mono focus:outline-none focus:border-white/30"
                            />
                          </div>

                          {/* Income */}
                          <section>
                            <div className="flex items-center gap-2 mb-3 opacity-50">
                              <ArrowDownLeft size={14} className="text-emerald-400" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">
                                Income ({filteredLedger.slips.length})
                              </span>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                              {filteredLedger.slips.map((slip, i) => (
                                <div
                                  key={i}
                                  className="bg-white/2 border border-white/5 p-3 rounded-lg flex justify-between items-center font-mono"
                                >
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-white font-bold block">
                                      <Hash className="inline mb-0.5" size={9} />{" "}
                                      {slip.uniqueNumber || "MANUAL"}
                                    </span>
                                    <span className="text-[9px] text-white/30 truncate max-w-32 block">
                                      {slip.note || slip.description || "—"}
                                    </span>
                                  </div>
                                  <span className="text-sm text-emerald-400 font-bold">
                                    +{slip.amount.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </section>

                          {/* Expenses */}
                          <section>
                            <div className="flex items-center gap-2 mb-3 opacity-50">
                              <ArrowUpRight size={14} className="text-red-400" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">
                                Expenses ({filteredLedger.entries.length})
                              </span>
                            </div>
                            <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                              {filteredLedger.entries.map((ent, i) => (
                                <div
                                  key={i}
                                  className="bg-white/2 border border-white/5 p-3 rounded-lg flex justify-between items-center font-mono"
                                >
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] text-white font-bold block truncate max-w-36">
                                      {ent.note || ent.description || "EXPENSE"}
                                    </span>
                                    <span className="text-[9px] text-white/30 block">
                                      {ent.category || "MISC"}
                                    </span>
                                  </div>
                                  <span className="text-sm text-red-400 font-bold">
                                    -{ent.amount.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </section>
                        </>
                      )}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="repair"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="space-y-6"
                    >
                      {/* Repair Actions */}
                      <div className="p-4 bg-white/3 border border-white/5 rounded-xl space-y-3">
                        <p className="text-[11px] text-white/50 leading-relaxed">
                          Repair engine syncs Daily Sheets with Monthly Summary and
                          resolves arithmetic drifts in balances.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => runRepair(true)}
                            disabled={repairing || !monthLabel || status === "RUNNING"}
                            className="flex-1 bg-white/5 border border-white/10 text-[10px] font-bold py-3 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-20 uppercase tracking-widest"
                          >
                            {repairing ? (
                              <Loader2 className="animate-spin mx-auto" size={14} />
                            ) : (
                              "Dry Run"
                            )}
                          </button>
                          <button
                            onClick={() => runRepair(false)}
                            disabled={repairing || !monthLabel || status === "RUNNING"}
                            className="flex-1 bg-red-600 text-white text-[10px] font-bold py-3 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-20 uppercase tracking-widest"
                          >
                            Apply Fixes
                          </button>
                        </div>
                      </div>

                      {/* Repair Results */}
                      {repairing ? (
                        <div className="h-40 flex flex-col items-center justify-center gap-3 text-white/30">
                          <Loader2 className="animate-spin" size={24} />
                          <span className="text-[10px] uppercase tracking-widest">
                            Processing...
                          </span>
                        </div>
                      ) : audit ? (
                        <div className="space-y-4">
                          {/* Dry run indicator */}
                          {audit.dryRun && (
                            <div className="text-[10px] text-amber-400 bg-amber-500/10 px-3 py-2 rounded-lg text-center font-medium">
                              Preview Mode — No changes applied
                            </div>
                          )}

                          {/* Monthly Totals */}
                          {audit.totals && audit.totals.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-[9px] font-bold uppercase text-white/30 tracking-widest">
                                Monthly Adjustments
                              </h4>
                              {audit.totals.map((t, i) => (
                                <div
                                  key={i}
                                  className="flex justify-between items-center text-[10px] p-3 bg-white/3 border border-white/5 rounded-lg font-mono"
                                >
                                  <span className="text-white/50">{t.field}</span>
                                  <div className="flex items-center gap-2">
                                    <span className="opacity-30 line-through">
                                      {t.before?.toLocaleString()}
                                    </span>
                                    <ChevronRight size={10} className="text-white/20" />
                                    <span className="text-emerald-400 font-bold">
                                      {t.after?.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Daily Fixes */}
                          {audit.dailyAudits.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-[9px] font-bold uppercase text-white/30 tracking-widest">
                                Daily Fixes ({audit.dailyAudits.length})
                              </h4>
                              <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2">
                                {audit.dailyAudits.map((d) => (
                                  <div
                                    key={d.dailySheetId}
                                    className="border-l-2 border-white/10 pl-3 py-2"
                                  >
                                    <p className="text-[10px] font-bold mb-1 text-white/70">
                                      {new Date(d.date).toLocaleDateString()}
                                    </p>
                                    {d.diffs.map((df, i) => (
                                      <p
                                        key={i}
                                        className="text-[9px] font-mono text-white/40 flex justify-between"
                                      >
                                        <span>{df.field}</span>
                                        <span className="text-amber-400">
                                          {df.before} → {df.after}
                                        </span>
                                      </p>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {audit.dailyAudits.length === 0 &&
                            (!audit.totals || audit.totals.length === 0) && (
                              <div className="h-32 flex flex-col items-center justify-center text-emerald-400/60">
                                <CheckCircle size={24} />
                                <p className="text-[10px] mt-2 uppercase font-bold">
                                  No issues found
                                </p>
                              </div>
                            )}
                        </div>
                      ) : (
                        <div className="h-40 flex flex-col items-center justify-center opacity-20 text-center">
                          <Wrench size={32} strokeWidth={1} />
                          <p className="text-[10px] mt-3 uppercase font-bold max-w-40 leading-loose">
                            Run audit first to see repair options
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.15);
        }
      `}</style>
    </AnimatePresence>
  );
}

// Rule Card Component
function RuleCard({ rule, delay }: { rule: RuleResult; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white/3 border border-white/5 p-4 rounded-xl hover:border-white/15 transition-all"
    >
      <div className="flex justify-between items-start mb-3">
        <div className="space-y-0.5">
          <span className="text-[11px] font-bold text-white/80 uppercase tracking-tight block">
            {rule.label}
          </span>
          <span className="text-[9px] font-mono text-white/25 uppercase tracking-widest">
            {rule.key}
          </span>
        </div>
        <span
          className={`text-[9px] font-bold px-2 py-1 rounded ${
            rule.passed
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-red-500/10 text-red-400"
          }`}
        >
          {rule.passed ? "PASS" : "FAIL"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/5 font-mono">
        <div>
          <p className="text-[9px] text-white/25 uppercase mb-0.5">Actual</p>
          <p
            className={`text-sm ${!rule.passed ? "text-red-400" : "text-white"}`}
          >
            {rule.actual?.toLocaleString?.() ?? rule.actual}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[9px] text-white/25 uppercase mb-0.5">Expected</p>
          <p className="text-sm text-white/60">
            {rule.expected?.toLocaleString?.() ?? rule.expected}
          </p>
        </div>
      </div>

      {/* Details Section */}
      {rule.details && Object.keys(rule.details).length > 0 && (
        <DetailsSection details={rule.details} passed={rule.passed} />
      )}
    </motion.div>
  );
}

// Details Section Component
function DetailsSection({
  details,
  passed,
}: {
  details: Record<string, any>;
  passed: boolean;
}) {
  const hasUnmatched = details.unmatched && details.unmatched.length > 0;

  return (
    <div className="mt-3 p-3 bg-white/2 rounded-lg border border-white/5 space-y-2">
      <p className="text-[9px] text-white/30 font-bold uppercase">Details</p>

      {/* Numeric fields */}
      {(details.openingBalance !== undefined ||
        details.sumSlip !== undefined ||
        details.sumExp !== undefined) && (
        <div className="font-mono text-[10px] text-white/50 space-y-1">
          {details.openingBalance !== undefined && (
            <div className="flex justify-between">
              <span>Opening:</span>
              <span>{details.openingBalance?.toLocaleString?.()}</span>
            </div>
          )}
          {details.sumSlip !== undefined && (
            <div className="flex justify-between">
              <span>Slips Sum:</span>
              <span className="text-emerald-400">
                +{details.sumSlip?.toLocaleString?.()}
              </span>
            </div>
          )}
          {details.sumExp !== undefined && (
            <div className="flex justify-between">
              <span>Expense Sum:</span>
              <span className="text-red-400">
                -{details.sumExp?.toLocaleString?.()}
              </span>
            </div>
          )}
          {details.expectedClosing !== undefined && (
            <div className="flex justify-between font-bold">
              <span>Expected Closing:</span>
              <span>{details.expectedClosing?.toLocaleString?.()}</span>
            </div>
          )}
        </div>
      )}

      {/* Previous closing for continuity */}
      {details.prevClosing !== undefined && (
        <div className="font-mono text-[10px] text-white/50 space-y-1">
          <div className="flex justify-between">
            <span>Previous Closing:</span>
            <span>{details.prevClosing?.toLocaleString?.()}</span>
          </div>
          <div className="flex justify-between">
            <span>Opening Actual:</span>
            <span className={passed ? "text-emerald-400" : "text-red-400"}>
              {details.openingActual?.toLocaleString?.()}
            </span>
          </div>
        </div>
      )}

      {/* Unmatched items */}
      {hasUnmatched && (
        <div className="mt-2 p-2 bg-red-500/5 border border-red-500/10 rounded">
          <p className="text-[9px] text-red-400 font-bold uppercase mb-1">
            Unmatched ({details.unmatched.length})
          </p>
          <div className="space-y-1 text-[9px] font-mono text-red-300/70 max-h-20 overflow-y-auto">
            {details.unmatched.slice(0, 5).map((u: any, i: number) => (
              <div key={i} className="flex justify-between">
                <span className="truncate max-w-28">
                  {u.description ?? u.category ?? u.uniqueNumber ?? "—"}
                </span>
                <span>{u.amount?.toLocaleString?.()}</span>
              </div>
            ))}
            {details.unmatched.length > 5 && (
              <p className="text-white/30 text-center">
                +{details.unmatched.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
