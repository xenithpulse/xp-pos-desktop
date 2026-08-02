// components/CashSlipSearchModal.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Types } from "mongoose";

// Simple client-side DTO to avoid importing mongoose types
type CashSlipDTO = {
  _id: Types.ObjectId;
  copyNumber: string;
  uniqueNumber: string;
  amount: number;
  description: string;
  createdAt: string;
  createdBy: string;
  used?: boolean;
  usedBy?: string | null;
};

function useDebounced<T>(value: T, delay = 300) {
  const [deb, setDeb] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDeb(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return deb;
}

export default function CashSlipSearchModal() {
  const [open, setOpen] = useState(false);

  // query controls
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 300);
  const [partial, setPartial] = useState(true);

  // amount mode
  const [useAmountMode, setUseAmountMode] = useState(false);
  const [amountExactMode, setAmountExactMode] = useState(true); // exact vs range
  const [amountExactValue, setAmountExactValue] = useState<string>("");
  const [amountMin, setAmountMin] = useState<string>("");
  const [amountMax, setAmountMax] = useState<string>("");

  // results
  const [results, setResults] = useState<CashSlipDTO[]>([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlip, setSelectedSlip] = useState<CashSlipDTO | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // keyboard shortcut: Ctrl/Cmd+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().includes("MAC");
      if ((isMac && e.metaKey && e.key.toLowerCase() === "k") || (!isMac && e.ctrlKey && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        setOpen((s) => !s);
      }
      // Escape closes
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      // focus input on open
      setTimeout(() => inputRef.current?.focus(), 40);
      // reset state when opening fresh (optional)
      setResults([]);
      setPage(1);
      setTotalPages(1);
    }
  }, [open]);

  // Build the query params and fetch when debouncedQ or amount filters change
  useEffect(() => {
    if (!open) return;
    setPage(1);
    fetchResults(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, partial, useAmountMode, amountExactMode, amountExactValue, amountMin, amountMax, open]);

  async function fetchResults(requestPage = 1, append = false) {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (partial) params.set("partial", "true");

      // amount filters
      if (useAmountMode) {
        if (amountExactMode && amountExactValue) {
          params.set("amountExact", "true");
          params.set("amount", amountExactValue);
        } else {
          if (amountMin) params.set("amountMin", amountMin);
          if (amountMax) params.set("amountMax", amountMax);
        }
      }

      params.set("page", String(requestPage));
      params.set("limit", String(limit));
      params.set("sort", "createdAt:desc");

      const res = await fetch(`/api/cash-slips/search?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || res.statusText || "Search failed");
      }
      const json = await res.json();
      const data = json.data || [];
      const meta = json.meta || {};

      setResults((prev) => (append ? [...prev, ...data] : data));
      setTotalPages(meta.pages || 1);
      setPage(meta.page || requestPage);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (loading || page >= totalPages) return;
    const next = page + 1;
    await fetchResults(next, true);
  }

  // Animations: simple variants
  const overlayVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.18, ease: "easeOut" } },
  };
  const panelVariants: Variants = {
    hidden: { opacity: 0, y: -18, scale: 0.995 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: "easeOut" } },
    exit: { opacity: 0, y: -10, transition: { duration: 0.15, ease: "easeIn" } },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.03 } }),
    exit: { opacity: 0, y: 6, transition: { duration: 0.12 } },
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open search"
        className="justify-end gap-2 bg-black text-white items-center px-3 py-2 rounded-4xl"
      >
        <Search size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-50 flex items-start justify-center p-4"
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={overlayVariants}
            role="dialog"
            aria-modal="true"
          >
            {/* backdrop */}
            <motion.div
              className="absolute inset-0 bg-black/45 backdrop-blur-sm"
              onClick={() => setOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* panel */}
            <motion.div
              className="relative z-10 w-full max-w-5xl bg-white rounded-lg shadow-2xl overflow-hidden"
              variants={panelVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {/* header */}
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <div className="flex items-center gap-3">
                  <Search size={18} />
                  <h3 className="text-lg font-medium">Search Cash Slips</h3>
                  <div className="text-xs text-slate-500 ml-2">Ctrl/Cmd+K</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="text-sm px-2 py-1 rounded hover:bg-slate-100 "
                    onClick={() => {
                      // Reset filters quickly
                      setQ("");
                      setPartial(true);
                      setUseAmountMode(false);
                      setAmountExactMode(true);
                      setAmountExactValue("");
                      setAmountMin("");
                      setAmountMax("");
                      setResults([]);
                    }}
                    title="Reset filters"
                  >
                    Reset
                  </button>

                  <button
                    onClick={() => setOpen(false)}
                    className="p-2 rounded hover:bg-slate-100 "
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* body */}
              <div className="p-4 max-h-[72vh] overflow-auto">
                {/* search inputs */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                  <div className="col-span-2">
                    <input
                      ref={inputRef}
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search description, unique number (A41), copy number (20), or amount..."
                      className="w-full px-3 py-2 rounded border focus:outline-none focus:ring"
                    />
                    <div className="mt-2 flex items-center gap-3 text-sm text-slate-500">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
                        Partial matches
                      </label>
                      <span>•</span>
                      <span>Results update after you stop typing</span>
                    </div>
                  </div>

                  <div className="col-span-1 flex flex-col gap-2">
                    <label className="flex items-center justify-between text-sm">
                      <span>Use Amount Mode</span>
                      <input type="checkbox" checked={useAmountMode} onChange={(e) => setUseAmountMode(e.target.checked)} />
                    </label>

                    {useAmountMode && (
                      <div className="bg-slate-50 p-3 rounded">
                        <div className="flex items-center gap-3 mb-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="radio" checked={amountExactMode} onChange={() => setAmountExactMode(true)} />
                            Exact
                          </label>
                          <label className="flex items-center gap-2 text-sm">
                            <input type="radio" checked={!amountExactMode} onChange={() => setAmountExactMode(false)} />
                            Range
                          </label>
                        </div>

                        {amountExactMode ? (
                          <input
                            value={amountExactValue}
                            onChange={(e) => setAmountExactValue(e.target.value)}
                            placeholder="Exact amount e.g. 1500"
                            inputMode="numeric"
                            className="w-full px-2 py-1 rounded border text-sm"
                          />
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={amountMin}
                              onChange={(e) => setAmountMin(e.target.value)}
                              placeholder="Min"
                              inputMode="numeric"
                              className="w-full px-2 py-1 rounded border text-sm"
                            />
                            <input
                              value={amountMax}
                              onChange={(e) => setAmountMax(e.target.value)}
                              placeholder="Max"
                              inputMode="numeric"
                              className="w-full px-2 py-1 rounded border text-sm"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* status */}
                {loading && <div className="text-sm text-slate-500 mb-3">Searching...</div>}
                {error && <div className="text-sm text-red-500 mb-3">{error}</div>}
                {!loading && !results.length && (debouncedEmpty(q, useAmountMode, amountExactMode, amountExactValue, amountMin, amountMax) === false) && (
                  <div className="text-sm text-slate-500 mb-3">No slips found.</div>
                )}

                {/* results list */}
                <ul className="space-y-3">
                  <AnimatePresence>
                    {results.map((slip, idx) => (
                      <motion.li
                        key={String(slip._id)}
                        custom={idx}
                        initial="hidden"
                        animate="visible"
                        exit="exit"
                        variants={itemVariants}
                        className="border rounded p-3 bg-white shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div>
                                {slip.createdBy}
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-sm text-slate-4600">
                                {slip.copyNumber} • {slip.uniqueNumber}
                              </div>
                              <div className="text-sm font-medium">PKR {slip.amount.toLocaleString()}</div>
                            </div>

                            <p className="text-sm text-slate-600">{slip.description}</p>

                            <div className="text-xs text-slate-500">
                              Created: {new Date(slip.createdAt).toLocaleString()} • Used: {slip.used ? `Yes (${slip.usedBy ?? "—"})` : "No"}
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2">
                            <button
                              onClick={() => setSelectedSlip(slip)}
                              className="px-3 py-1 rounded bg-indigo-600 text-white text-sm hover:bg-indigo-700"
                            >
                              Post
                            </button>
                          </div>
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>

                {/* load more */}
                <div className="mt-4 flex justify-center">
                  {page < totalPages ? (
                    <button
                      onClick={loadMore}
                      disabled={loading}
                      className="px-4 py-2 rounded border"
                    >
                      {loading ? "Loading..." : "Load more"}
                    </button>
                  ) : null}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// helper to detect "empty search" (show placeholder 'no slips' only when user did search)
function debouncedEmpty(q: string, useAmountMode: boolean, amountExactMode: boolean, amountExactValue: string, amountMin: string, amountMax: string) {
  const hasTextQuery = q.trim().length > 0;
  const hasAmountQuery = useAmountMode && (amountExactMode ? amountExactValue.trim().length > 0 : (amountMin.trim().length > 0 || amountMax.trim().length > 0));
  return !(hasTextQuery || hasAmountQuery);
}
