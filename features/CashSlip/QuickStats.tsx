// components/CashSlipQuickStatsRow.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Users, AlertTriangle, X, RefreshCw, BarChart3, Loader2 } from "lucide-react";
import CashSlipSearchModal from "./Search"; // your search trigger component
import UnlinkedSlipsModal from "./UnlinkedSlipModal";
import type { SlipSummary } from "./UnlinkedSlipModal";

type CreatorEntry = {
  createdBy: string;
  count: number;
  amount: number;
  slips: SlipSummary[];
};

type PostSlipProp = { _id: string; amount: number; copyNumber: string; uniqueNumber: string };

function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(1);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const from = 1;
    const to = Math.max(1, Math.floor(target));
    if (to <= from) {
      setValue(to);
      return;
    }
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOut cubic
      const v = Math.round(from + (to - from) * eased);
      setValue(v);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

export default function CashSlipQuickStatsRow({ currentUser }: { currentUser?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [perCreator, setPerCreator] = useState<CreatorEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [forUser, setForUser] = useState<CreatorEntry | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // UI state
  const [unlinkedModalOpen, setUnlinkedModalOpen] = useState(false);
  const [selectedSlipForPost, setSelectedSlipForPost] = useState<PostSlipProp | null>(null);

  // New: selected creator (string or null for "all")
  const [selectedCreator, setSelectedCreator] = useState<string | null>(null);

  async function fetchStats() {
    try {
      setLoading(true);
      setError(null);
      const qs = currentUser ? `?createdBy=${encodeURIComponent(currentUser)}` : "";
      const res = await fetch(`/api/cash-slips/stats${qs}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || res.statusText || "Failed to fetch stats");
      }
      const json = await res.json();
      setPerCreator(json.perCreator || []);
      setTotalCount(json.totalUnlinkedCount || 0);
      setTotalAmount(json.totalUnlinkedAmount || 0);
      setForUser(json.forUser || null);
      setHasFetched(true);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  }

  // Animated values
  const animatedCount = useCountUp(totalCount || 0, 700);
  const animatedAmount = useCountUp(totalAmount || 0, 900);

  // compact top offenders (limit to 3 for row)
  const top3 = useMemo(() => perCreator.slice(0, 3), [perCreator]);

  // helper: get slips to show in modal based on selectedCreator
  function slipsForSelectedCreator() {
    if (!selectedCreator) {
      return perCreator.flatMap((c) => c.slips);
    }
    const entry = perCreator.find((c) => c.createdBy === selectedCreator);
    return entry ? entry.slips : [];
  }

  // helper: normalize SlipSummary -> PostSlipProp (safe, no undefined)
  function toPostSlip(s: SlipSummary): PostSlipProp {
    return {
      _id: String(s._id),
      amount: typeof s.amount === "number" ? s.amount : 0,
      copyNumber: s.copyNumber ?? "",
      uniqueNumber: s.uniqueNumber ?? "",
    };
  }

  // Initial state - show Load Stats button
  if (!hasFetched) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full bg-linear-to-r from-slate-50 to-white rounded-lg shadow-sm border border-black/10 p-4"
      >
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-100">
              <BarChart3 size={22} className="text-indigo-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-slate-700">Cash Slip Statistics</div>
              <div className="text-xs text-slate-500">Load stats to view unlinked slips summary</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <CashSlipSearchModal />
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={fetchStats}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-60"
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <BarChart3 size={16} />
              )}
              {loading ? "Loading..." : "Load Stats"}
            </motion.button>
          </div>
        </div>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 text-sm text-red-500 flex items-center gap-2"
          >
            <AlertTriangle size={14} /> {error}
          </motion.div>
        )}
      </motion.div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="w-full bg-white rounded-lg shadow-sm border border-black/10 p-4">
        <div className="flex items-center justify-center gap-3 py-4">
          <Loader2 size={20} className="animate-spin text-indigo-600" />
          <span className="text-sm text-slate-600">Loading statistics...</span>
        </div>
      </div>
    );
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full bg-white text-black rounded-lg shadow-sm border border-black/10 p-4"
    >
      <div className="flex items-center gap-4 justify-between flex-wrap">
        {/* Total card */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 min-w-45"
        >
          <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-100">
            <FileText size={20} className="text-amber-600" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Unlinked Total</div>
            <div className="text-xl font-bold text-slate-800">
              PKR <span className="text-amber-600">{animatedAmount.toLocaleString()}</span>
            </div>
            <div className="text-xs text-slate-400">{animatedCount} slip(s)</div>
          </div>
        </motion.div>

        {/* Creator selector + Top offenders - condensed */}
        <div className="flex items-center gap-3 min-w-65 overflow-hidden">
          {/* creator select (space conscious) */}
          <div className="hidden sm:flex items-center gap-2">
            <label className="text-xs text-slate-500 font-medium">Filter:</label>
            <div className="relative">
              <select
                value={selectedCreator ?? ""}
                onChange={(e) => setSelectedCreator(e.target.value || null)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all"
                aria-label="Select creator"
              >
                <option value="">All creators</option>
                {perCreator.map((c) => (
                  <option key={c.createdBy} value={c.createdBy}>
                    {c.createdBy} — PKR {c.amount.toLocaleString()} ({c.count})
                  </option>
                ))}
              </select>
              {selectedCreator && (
                <button
                  onClick={() => setSelectedCreator(null)}
                  className="absolute right-1 top-1 p-1 rounded hover:bg-slate-100 transition-colors"
                  aria-label="Clear selection"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* compact chips for top3 creators (clickable) */}
          <div className="flex items-center gap-2 overflow-auto">
            <AnimatePresence>
              {top3.map((c, i) => {
                const isSelected = c.createdBy === selectedCreator;
                return (
                  <motion.button
                    key={c.createdBy}
                    onClick={() => setSelectedCreator((prev) => (prev === c.createdBy ? null : c.createdBy))}
                    className={`flex items-center gap-2 px-3 py-2 bg-white border rounded-lg text-left min-w-30 transition-all hover:shadow-md ${
                      isSelected 
                        ? "ring-2 ring-indigo-400 border-indigo-300 bg-indigo-50" 
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                  >
                    <div className={`p-1.5 rounded-lg ${isSelected ? "bg-indigo-100" : "bg-slate-50"} border border-black/5`}>
                      <Users size={14} className={isSelected ? "text-indigo-600" : "text-slate-600"} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.createdBy}</div>
                      <div className="text-xs text-slate-500">PKR {c.amount.toLocaleString()} • {c.count}</div>
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>

        {/* Action area */}
        <div className="flex items-center gap-2 ml-auto">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setUnlinkedModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-700 text-sm font-medium transition-colors"
            title="View all unlinked slips for selected creator (or all if none selected)"
          >
            <AlertTriangle size={16} /> View All
          </motion.button>

          <CashSlipSearchModal />

          <motion.button
            whileHover={{ scale: 1.02, rotate: 15 }}
            whileTap={{ scale: 0.98 }}
            onClick={fetchStats}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium transition-colors disabled:opacity-50"
            title="Refresh stats"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </motion.button>
        </div>
      </div>

      {/* show selected creator badge under row (mobile-friendly) */}
      <AnimatePresence>
        {selectedCreator && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 flex items-center gap-2"
          >
            <div className="text-xs text-slate-500 font-medium">Showing:</div>
            <div className="px-2.5 py-1 text-sm bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-700 font-medium">
              {selectedCreator}
            </div>
            <button 
              className="ml-2 text-xs text-slate-500 hover:text-slate-700 underline transition-colors" 
              onClick={() => setSelectedCreator(null)}
            >
              Clear filter
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 text-sm text-red-500 flex items-center gap-2 bg-red-50 px-3 py-2 rounded-lg"
        >
          <AlertTriangle size={14} /> {error}
        </motion.div>
      )}

      {/* Unlinked modal: we pass slips for selected creator only */}
      <UnlinkedSlipsModal
        open={unlinkedModalOpen}
        onClose={() => setUnlinkedModalOpen(false)}
        slips={slipsForSelectedCreator()}
        onPostClick={(s) => {
          // normalize and set selectedSlipForPost which matches PostToContractModal expected prop
          const normalized = toPostSlip(s);
          setSelectedSlipForPost(normalized);
        }}
      />
    </motion.div>
  );
}
