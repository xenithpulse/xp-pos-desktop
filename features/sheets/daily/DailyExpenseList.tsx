// DailyExpenseList.tsx
"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import { useVoucherQueue, IExpenseEntry } from "./voucher-post/manage";
import { LiveIndicator, useActivityLog } from "./ExpListIndicators";
import { useDailySheet } from "./DailySheetContext";
import ExpenseLinesBreakdown from "./ExpenseLinesBreakdown";
import {
  CASH_WITHDRAWL_CATEGORY,
  pushCashWithdrawlSlipFromVoucher,
  removeCashWithdrawlSlipMirror,
} from "./ExpenseSheet/utils";

interface Props {
  currentUserId: string;
}

// Wave color for post/undo click feedback
type WaveType = 'post' | 'undo' | null;

// Inline button spinner — sized to match the Post / Undo button text height
// so swapping between text and spinner doesn't shift the button width.
function ButtonSpinner() {
  return (
    <span
      className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin"
      aria-hidden
    />
  );
}

// ── Glitch‑reveal scramble ────────────────────────────────────
const GLITCH_CHARS = '!<>-_\\/[]{}—=+*^?#ΞΔΦ';

/** Two‑pass glitch: scramble×3 → flash → scramble×3 → settle. Fires each time `counter` increments. */
function GlitchText({ children, counter }: { children: string; counter: number }) {
  const [display, setDisplay] = useState(children);
  const prevRef = useRef(0);
  const glitchingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (counter > 0 && counter !== prevRef.current) {
      prevRef.current = counter;
      glitchingRef.current = true;
      const target = children;
      const len = Math.max(target.length, 3);
      const scramble = () =>
        Array.from({ length: len }, () => GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]).join('');
      const frames = [scramble(), scramble(), scramble(), target, scramble(), scramble(), scramble(), target];
      let i = 0;
      const tick = () => {
        if (i < frames.length) {
          setDisplay(frames[i]);
          i++;
          timerRef.current = setTimeout(tick, i === 4 ? 70 : 35);
        } else {
          glitchingRef.current = false;
        }
      };
      tick();
    } else {
      prevRef.current = counter;
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); glitchingRef.current = false; };
  }, [counter, children]);

  // Sync display when children change without a glitch trigger
  useEffect(() => { if (!glitchingRef.current) setDisplay(children); }, [children]);

  return <span className="inline-block">{display}</span>;
}

// Module-scope tombstone Set: shared with `features/DailySheet/ExpenseSheet/utils.ts`
// (`syncExpenses`) so deleted ids continue to be filtered out of inbound
// server merges across the entire daily-sheet surface. The cap below keeps
// it from growing unbounded.
export const deletedExpenseIds = new Set<string>();
const MAX_DELETED_IDS = 100;

export default function DailyExpenseList({ currentUserId }: Props) {
  // --- shared context (bridge with form) ---
  const { expenses: contextExpenses, setExpenses: setContextExpenses, refreshSheet, targetDate, markSynced, openingBalance, notifySlipMutation, notify } = useDailySheet();

  // --- hooks / state (always at top) ---
  const [expenses, setExpensesLocal] = useState<IExpenseEntry[]>([]);
  const [loadingLocal, setLoadingLocal] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  // Keep track of ids being deleted so sync ignores them briefly
  const deletingIdsRef = useRef<Set<string>>(new Set());

  // Bridge: when context expenses change (form added entry), update local state
  useEffect(() => {
    if (contextExpenses && contextExpenses.length > 0) {
      setExpensesLocal((prev) => {
        // Merge context entries with local posted-status enrichments
        const localMap = new Map(prev.map((e) => [e._id, e]));
        return contextExpenses.map((ce) => {
          const local = localMap.get(ce._id as string);
          if (local) {
            // Preserve local voucher enrichment fields if server hasn't provided them yet
            return {
              ...ce,
              _id: String(ce._id),
              isExpPosted: local.isExpPosted ?? ce.isExpPosted ?? false,
              expID: local.expID ?? ce.expID ?? null,
              postedCopyNumber: local.postedCopyNumber ?? ce.postedCopyNumber ?? null,
              postedUniqueNumber: local.postedUniqueNumber ?? ce.postedUniqueNumber ?? null,
            } as IExpenseEntry;
          }
          return { ...ce, _id: String(ce._id) } as IExpenseEntry;
        });
      });
      if (loadingLocal) setLoadingLocal(false);
    }
  }, [contextExpenses, loadingLocal]);

  const [editValues, setEditValues] = useState<{ category: string; description: string; amount: number; paymentMethod: 'cash' | 'cheque' | 'online' }>({
    category: "",
    description: "",
    amount: 0,
    paymentMethod: 'cash',
  });

  // activity log (replaces toast)
  const { activity, log: logActivity } = useActivityLog();

  type ExpensesUpdater = IExpenseEntry[] | ((prev: IExpenseEntry[]) => IExpenseEntry[]);

  const getExpenses = () => expenses;
  const setExpenses = (updater: ExpensesUpdater) => {
    if (typeof updater === 'function') {
      setExpensesLocal((prev) => (updater as (prev: IExpenseEntry[]) => IExpenseEntry[])(prev));
    } else {
      setExpensesLocal(updater);
    }
  };

  // Also push authoritative changes back to context so the form's totals stay in sync
  const pushToContext = (entries: IExpenseEntry[]) => {
    setContextExpenses(entries as unknown as import('./ExpenseSheet/utils').IExpenseEntry[]);
  };

  // ── Predicted-next-voucher-number prefetch ──
  // Stores the number GET /api/vouchers/next-number returned. Used by the
  // queue hook's `getNextNumberHint` so that on click the row immediately
  // displays the real FEB### instead of "—". The server response still
  // wins authoritatively; if a parallel writer beats us to that number,
  // the UI just updates from FEB471 → FEB472 once. The prefetch refreshes
  // on mount and after any expense's posted state flips, so the cache
  // stays one step ahead of the user.
  const nextNumberRef = useRef<{ copyNumber?: string | null; uniqueNumber?: string | null } | null>(null);
  const prefetchInFlightRef = useRef<Promise<void> | null>(null);
  const prefetchNextVoucherNumber = useCallback(async () => {
    if (prefetchInFlightRef.current) return prefetchInFlightRef.current;
    const p = (async () => {
      try {
        const res = await axios.get<{ copyNumber?: string; uniqueNumber?: string; requiresNewConfig?: boolean }>(
          "/api/vouchers/next-number",
        );
        if (res.data && !res.data.requiresNewConfig) {
          nextNumberRef.current = {
            copyNumber: res.data.copyNumber ?? null,
            uniqueNumber: res.data.uniqueNumber ?? null,
          };
        }
      } catch (err) {
        // Silent: hint failure just means optimistic UI falls back to "—".
        console.debug("prefetchNextVoucherNumber failed:", err);
      } finally {
        prefetchInFlightRef.current = null;
      }
    })();
    prefetchInFlightRef.current = p;
    return p;
  }, []);

const { postEntry, undoEntry, postingIds, loadAll, loading: queueLoading, error: queueError } =
  useVoucherQueue({
    currentUserId,
    deletingIdsRef,           // <- pass it here
    getExpenses,
    setExpenses,
    initialLoad: false,
    targetDate,
    onSync: markSynced,
    onNotify: notify,
    getNextNumberHint: () => nextNumberRef.current,
    // ── "Cash Withdrawl" mirror ──
    // After a Cash Withdrawl voucher posts, copy it onto slipEntries (income)
    // using the voucher's copy/unique numbers and 'cash' payment method.
    onAfterPost: async ({ expense, voucher }) => {
      if (expense.category !== CASH_WITHDRAWL_CATEGORY) return;
      if (!voucher.copyNumber || !voucher.uniqueNumber) {
        console.warn("Cash Withdrawl mirror skipped: voucher missing copy/unique number", voucher);
        return;
      }
      try {
        await pushCashWithdrawlSlipFromVoucher(
          {
            copyNumber: voucher.copyNumber,
            uniqueNumber: voucher.uniqueNumber,
            amount: expense.amount,
            description: expense.description,
          },
          openingBalance,
          targetDate ?? undefined,
        );
        await refreshSheet();
        notifySlipMutation();
      } catch (err) {
        console.error("Failed to mirror Cash Withdrawl voucher to slipEntries:", err);
      }
    },
    // On undo, remove the mirrored slip entry by uniqueNumber + copyNumber.
    onAfterUndo: async ({ expense, copyNumber, uniqueNumber }) => {
      if (expense.category !== CASH_WITHDRAWL_CATEGORY) return;
      if (!uniqueNumber) return;
      try {
        await removeCashWithdrawlSlipMirror(
          { copyNumber, uniqueNumber },
          targetDate ?? undefined,
        );
        await refreshSheet();
        notifySlipMutation();
      } catch (err) {
        console.error("Failed to remove Cash Withdrawl slip mirror:", err);
      }
    },
  });

  // --- Wave animation + glitch state ---
  const [waveIds, setWaveIds] = useState<Record<string, WaveType>>({});
  const waveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [glitchCounters, setGlitchCounters] = useState<Record<string, number>>({});

  const triggerGlitch = useCallback((id: string) => {
    setGlitchCounters(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  }, []);

  const triggerWave = useCallback((id: string, type: WaveType) => {
    if (waveTimers.current[id]) clearTimeout(waveTimers.current[id]);
    setWaveIds(prev => ({ ...prev, [id]: type }));
    triggerGlitch(id);
    waveTimers.current[id] = setTimeout(() => {
      setWaveIds(prev => { const n = { ...prev }; delete n[id]; return n; });
      delete waveTimers.current[id];
    }, 700);
  }, [triggerGlitch]);

  // track confirmed animation per id (short-lived)
  const [confirmedIds, setConfirmedIds] = useState<Record<string, boolean>>({});
  const prevExpensesRef = useRef<IExpenseEntry[]>([]);

  // initial load only (polling has been removed; reconciliation is driven
  // by DailySheetContext.refreshSheet after each mutation, plus loadAll on
  // mount + tab-visible / online events handled inside useVoucherQueue).
  useEffect(() => {
    const run = async () => {
      setLoadingLocal(true);
      setError(undefined);
      try {
        await loadAll({ fetchVouchers: true });
      } catch (e) {
        console.error("Component loadAll failed", e);
        setError((e as Error)?.message || "Load failed");
      } finally {
        setLoadingLocal(false);
      }
    };
    void run();
    // Warm the predicted-next-voucher-number cache on mount.
    void prefetchNextVoucherNumber();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (queueError) setError(queueError);
  }, [queueError]);

  // watch for transitions: pending -> confirmed (Triggered by sync/polling update)
  useEffect(() => {
    const prev = prevExpensesRef.current;
    const prevMap = new Map(prev.map((p) => [p._id, p]));

    let postedFlipped = false;

    expenses.forEach((e) => {
      const p = prevMap.get(e._id);

      // Determine if it WAS pending (optimistic)
      const wasPending =
        !!(
          p &&
          (
            // optimistic marker on expID
            (typeof (p as IExpenseEntry).expID === "string" && String((p as IExpenseEntry).expID).startsWith("pending-")) ||
            // OR previously had placeholder posted fields while postingIds indicated an action
            ((typeof (p as IExpenseEntry).postedUniqueNumber === "string" && (p as IExpenseEntry).postedUniqueNumber === "—") ||
              (typeof (p as IExpenseEntry).postedCopyNumber === "string" && (p as IExpenseEntry).postedCopyNumber === "—")) ||
            // fallback: local postingIds indicated work in progress previously
            Boolean(postingIds[p._id])
          )
        );

      // Determine if it IS now confirmed (authoritative data from server)
      const nowConfirmed = !!(
        (e.isExpPosted ?? false) &&
        (
          // server provided postedUniqueNumber / postedCopyNumber (and not placeholder)
          (typeof (e as IExpenseEntry).postedUniqueNumber === "string" && (e as IExpenseEntry).postedUniqueNumber !== "—") ||
          (typeof (e as IExpenseEntry).postedCopyNumber === "string" && (e as IExpenseEntry).postedCopyNumber !== "—")
        )
      );

      // Check for transition: Pending -> Confirmed
      if (wasPending && nowConfirmed) {
        postedFlipped = true;
        // trigger glitch reveal + confirmation checkmark
        triggerGlitch(e._id);
        setConfirmedIds((s) => ({ ...s, [e._id]: true }));
        // clear after animation
        setTimeout(() => {
          setConfirmedIds((s) => {
            const copy = { ...s };
            delete copy[e._id];
            return copy;
          });
        }, 1200);

        // show tiny toast (use authoritative unique number if available)
        const unique = (e.postedUniqueNumber && e.postedUniqueNumber !== "—") ? e.postedUniqueNumber : "#";
        logActivity("success", `Voucher ${unique} assigned`, 2000);
      }

      // Also detect undo (was confirmed posted, now is not). Refreshing the
      // hint after an undo is critical because the freed FEB### is now
      // available again and the next click should display it.
      if (!postedFlipped) {
        const wasPosted = !!(p && p.isExpPosted);
        const nowUnposted = !(e.isExpPosted ?? false);
        if (wasPosted && nowUnposted) postedFlipped = true;
      }
    });

    prevExpensesRef.current = expenses;
    // Refresh the predicted-next-voucher cache whenever a post or undo
    // resolves. Cheap (one ~50ms GET) and keeps the next click instant.
    if (postedFlipped) void prefetchNextVoucherNumber();
    // include postingIds in deps so fast transitions are caught
  }, [expenses, postingIds, prefetchNextVoucherNumber, triggerGlitch, logActivity]);

  // small helpers for rendering / UX ---
  // getVoucherField: returns authoritative posted fields; falls back to pending placeholder if present; otherwise '—'
  const getVoucherField = (exp: IExpenseEntry, field: "copyNumber" | "uniqueNumber") => {
    const postedField = field === "copyNumber" ? (exp as IExpenseEntry).postedCopyNumber : (exp as IExpenseEntry).postedUniqueNumber;
    // if server provided a real value (not placeholder), return it
    if (typeof postedField === "string" && postedField !== "—") return postedField;
    // if a pending placeholder exists, show placeholder
    if (typeof postedField === "string" && postedField === "—") return "—";
    // if expID is pending (we might not have placeholder fields), show placeholder
    if (typeof (exp as IExpenseEntry).expID === "string" && String((exp as IExpenseEntry).expID).startsWith("pending-")) return "—";
    // nothing available
    return "—";
  };

  const getRowVisualState = (exp: IExpenseEntry) => {
    const authoritativePosted = Boolean(exp.isExpPosted ?? false);

    // hasPendingMarker: expID is the pending marker
    const hasPendingMarker = typeof exp.expID === "string" && String(exp.expID).startsWith("pending-");

    // postingActionInProgress: the queue hook reports the ID is currently being processed
    const postingActionInProgress = Boolean(postingIds[exp._id]);

    // Pending: Action initiated (pending marker or posting in progress) but not yet authoritative confirmed
    const pending = (hasPendingMarker || (postingActionInProgress && !authoritativePosted)) && !authoritativePosted;

    // Undoing: posting action in progress to remove an already authoritative-posted item
    const undoing = postingActionInProgress && authoritativePosted;

    // Confirmed: authoritative posted flag + posted numbers exist (and not placeholders)
    const confirmed =
      authoritativePosted &&
      (
        (typeof exp.postedUniqueNumber === "string" && exp.postedUniqueNumber !== "—") ||
        (typeof exp.postedCopyNumber === "string" && exp.postedCopyNumber !== "—")
      );

    return { pending, undoing, confirmed, postingActionInProgress };
  };

  // Wave cell style: CSS animation sweep from action column (right) → left
  const getWaveCellStyle = (expId: string, colIndex: number): React.CSSProperties => {
    const waveType = waveIds[expId];
    if (!waveType) return {};
    const delay = (8 - colIndex) * 40; // ripple from action column outward
    return {
      animation: `${waveType === 'post' ? 'waveSweepGreen' : 'waveSweepRed'} 400ms ease-out ${delay}ms both`,
    };
  };

  const deleteEntry = async (expId: string) => {
    const exp = getExpenses().find((e) => e._id === expId);
    if (!exp) return;

    // guard: already deleting locally?
    if (deletingIdsRef.current.has(exp._id)) return;

    const authoritativePosted = Boolean(exp.isExpPosted);
    if (authoritativePosted) {
      alert("Cannot delete a posted expense. Undo the voucher first.");
      return;
    }

    deletingIdsRef.current.add(exp._id);
    deletedExpenseIds.add(String(exp._id));
    // Safety cap: if the Set grows too large, prune oldest entries
    if (deletedExpenseIds.size > MAX_DELETED_IDS) {
      const iter = deletedExpenseIds.values();
      for (let i = 0; i < deletedExpenseIds.size - MAX_DELETED_IDS; i++) {
        deletedExpenseIds.delete(iter.next().value as string);
      }
    }

    // snapshot for revert
    const prevSnapshot = getExpenses();

    // optimistic UI
    setExpensesLocal((ex) => ex.filter((e) => e._id !== expId));
    logActivity("info", "Deleting…");

    // Polling has been removed, so there is no in-flight sync that can race
    // with this DELETE — we can fire it directly.

    try {
      // Use dedicated DELETE endpoint — atomically removes the entry,
      // cascades any associated vouchers, recalcs totals, AND now returns
      // the full remaining `updatedEntries` list. That eliminates the
      // previous extra GET /api/daily-sheet/today/entries refetch
      // (~600ms saved per delete).
      const dateParam = targetDate ? `&targetDate=${targetDate}` : '';
      const res = await axios.delete<{
        success: boolean;
        deletedVoucherIds?: string[];
        updatedEntries?: IExpenseEntry[];
        updatedTotals?: { totalExpense: number | null; closingBalance: number | null };
      }>(`/api/daily-sheet/today/entries?id=${encodeURIComponent(exp._id)}${dateParam}`);

      const resData = res.data;
      const serverEntries = Array.isArray(resData?.updatedEntries) ? resData.updatedEntries : [];

      const normalized: IExpenseEntry[] = serverEntries.map((se: IExpenseEntry) => ({
        _id: String(se._id),
        category: se.category ?? "",
        description: se.description ?? "",
        amount: Number(se.amount ?? 0),
        paymentMethod: se.paymentMethod ?? 'cash',
        isExpPosted: Boolean(se.isExpPosted ?? false),
        expID: se.expID ?? undefined,
        postedCopyNumber: se.postedCopyNumber ?? null,
        postedUniqueNumber: se.postedUniqueNumber ?? null,
        lines: Array.isArray(se.lines) ? se.lines : undefined,
        vendorName: se.vendorName ?? null,
        bookingRef: se.bookingRef,
      }));

      // replace local entries with authoritative server state
      setExpensesLocal(normalized);
      // Push to context so form totals update instantly
      pushToContext(normalized);
      // Refresh context to sync the closing balance per-method splits which
      // are NOT included in the DELETE response. This is intentionally kept
      // because cashClosingBalance / onlineClosingBalance drive UI pills
      // outside this component. The redundant GET above used to make this
      // refresh sequential — now it's the only post-delete network call.
      await refreshSheet();

      // Clean up deletion markers — server confirmed removal
      deletingIdsRef.current.delete(exp._id);
      deletedExpenseIds.delete(String(exp._id));

      const voucherCount = resData?.deletedVoucherIds?.length ?? 0;
      logActivity("success", voucherCount > 0 ? `Deleted (+ ${voucherCount} voucher${voucherCount > 1 ? 's' : ''})` : "Deleted");

    } catch (err) {
      console.error("Delete failed (sync):", err);

      // revert to authoritative snapshot we captured earlier
      setExpensesLocal(prevSnapshot);

      logActivity("error", "Delete failed", 2500);

      // clear deleting markers on failure
      deletingIdsRef.current.delete(exp._id);
      deletedExpenseIds.delete(String(exp._id));
    }
  };

  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const startEdit = (expId: string) => {
    const exp = expenses.find((e) => e._id === expId);
    if (!exp) return;
    if (exp.isExpPosted) {
      logActivity("error", "Cannot edit a posted expense. Undo first.", 2500);
      return;
    }
    setEditValues({ category: exp.category, description: exp.description, amount: exp.amount, paymentMethod: exp.paymentMethod ?? 'cash' });
    setEditId(expId);
  };
  const cancelEdit = () => setEditId(null);
  const saveEdit = async (expId: string) => {
    const exp = expenses.find((e) => e._id === expId);
    if (!exp) return;

    // Snapshot for rollback
    const previous = [...expenses];

    // Optimistic: apply edit immediately
    const optimistic = expenses.map((e) =>
      e._id === expId ? { ...e, ...editValues } : e
    );
    setExpensesLocal(optimistic);
    pushToContext(optimistic);
    setEditId(null);
    logActivity("success", "Saved");

    try {
      const editUrl = targetDate
        ? `/api/daily-sheet/today/entries?targetDate=${targetDate}`
        : `/api/daily-sheet/today/entries`;
      const res = await axios.put(editUrl, { ...editValues, _id: exp._id });
      // Apply authoritative server data
      const serverEntry = res.data?.updatedEntry;
      if (serverEntry) {
        const authoritative = expenses.map((e) =>
          e._id === expId ? { ...e, ...serverEntry } : e
        );
        setExpensesLocal(authoritative);
        pushToContext(authoritative);
      }
      // Refresh context to sync financial summary (opening/closing balance, totals)
      await refreshSheet();
    } catch (e) {
      console.error("Edit failed:", e);
      // Rollback optimistic change
      setExpensesLocal(previous);
      pushToContext(previous);
      logActivity("error", "Save failed — reverted", 2500);
    }
  };

  if (loadingLocal || queueLoading)
    return (
      <div className="flex items-center justify-center text-white">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-4 border-black border-t-transparent" />
          <p className="mt-4 text-lg text-black">Loading Expenses</p>
        </div>
      </div>
    );

  if (!expenses.length) return <div className="text-center justify-center text-gray-500 italic">No expenses recorded.</div>;

  const totalExpense = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const postedCount = expenses.filter((e) => Boolean(e.isExpPosted)).length;

  return (
    <div className="space-y-4">
      <LiveIndicator postedCount={postedCount} totalCount={expenses.length} activity={activity} />
      {/* Wave sweep keyframes */}
      <style>{`
        @keyframes waveSweepGreen {
          0%   { background-color: transparent; }
          20%  { background-color: rgba(16,185,129,0.32); }
          50%  { background-color: rgba(16,185,129,0.10); }
          100% { background-color: transparent; }
        }
        @keyframes waveSweepRed {
          0%   { background-color: transparent; }
          20%  { background-color: rgba(239,68,68,0.28); }
          50%  { background-color: rgba(239,68,68,0.08); }
          100% { background-color: transparent; }
        }
      `}</style>

      <table className="w-full table-auto border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100 text-sm">
            <th className="border px-3 py-2">#</th>
            <th className="border px-3 py-2">Category</th>
            <th className="border px-3 py-2">Description</th>
            <th className="border px-3 py-2">Amount</th>
            <th className="border px-3 py-2">Payment</th>
            <th className="border px-3 py-2">Status</th>
            <th className="border px-3 py-2">Copy</th>
            <th className="border px-3 py-2">Unique#</th>
            <th className="border px-3 py-2 w-[180px] min-w-[180px]">Actions</th>
          </tr>
        </thead>

        <tbody>
          {/* AnimatePresence wraps the list to handle entry/exit of rows (e.g., when deleting) */}
          <AnimatePresence initial={false}>
            {expenses.map((exp, i) => {
              const { pending, undoing, confirmed, postingActionInProgress: isPosting } = getRowVisualState(exp);

              // transient sanity flag (client-only) for small green/red dot UI
              const sanityFlag = (exp as IExpenseEntry).sanity as boolean | undefined;

              // Wave cell style shorthand (CSS animation per column)
              const wcs = (col: number) => getWaveCellStyle(exp._id, col);
              const gc = glitchCounters[exp._id] || 0;

              return (
                <React.Fragment key={exp._id}>
                <motion.tr
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm"
                >
                  <td className="border px-3 py-2 text-center" style={wcs(0)}>{i + 1}</td>

                  <td className="border px-3 py-2" style={wcs(1)}>
                    {editId === exp._id ? <input type="text" value={editValues.category} onChange={(e) => setEditValues((v) => ({ ...v, category: e.target.value }))} className="w-full border px-2 py-1 rounded" /> : exp.category}
                  </td>

                  <td className="border px-3 py-2" style={wcs(2)}>
                    {editId === exp._id ? (
                      <input type="text" value={editValues.description} onChange={(e) => setEditValues((v) => ({ ...v, description: e.target.value }))} className="w-full border px-2 py-1 rounded" />
                    ) : (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{exp.description}</span>
                        {Array.isArray(exp.lines) && exp.lines.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === exp._id ? null : exp._id)}
                            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-100"
                            title="Show line breakdown"
                          >
                            {exp.lines.length} lines {expandedId === exp._id ? '▴' : '▾'}
                          </button>
                        )}
                        {exp.vendorName && (
                          <span
                            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200"
                            title="Pre-selected vendor for the resulting voucher"
                          >
                            🏢 {exp.vendorName}
                          </span>
                        )}
                        {exp.bookingRef?.bookingUniqueId && (
                          <span
                            className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 ring-1 ring-violet-200"
                            title={`Imported from booking ${exp.bookingRef.bookingUniqueId}${
                              exp.bookingRef.clientName ? ` · ${exp.bookingRef.clientName}` : ''
                            }`}
                          >
                            🎪 Event · {exp.bookingRef.bookingUniqueId}
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  <td className="border px-3 py-2 text-center" style={wcs(3)}>{editId === exp._id ? <input type="number" value={editValues.amount} onChange={(e) => setEditValues((v) => ({ ...v, amount: +e.target.value }))} className="w-full border px-2 py-1 rounded text-right" /> : exp.amount.toLocaleString()}</td>

                  <td className="border px-3 py-2 text-center" style={wcs(4)}>
                    {editId === exp._id ? (
                      <select value={editValues.paymentMethod} onChange={(e) => setEditValues((v) => ({ ...v, paymentMethod: e.target.value as 'cash' | 'cheque' | 'online' }))} className="w-full border px-1 py-1 rounded text-xs">
                        <option value="cash">Cash</option>
                        <option value="cheque">Cheque</option>
                        <option value="online">Online</option>
                      </select>
                    ) : (
                      <span className="capitalize text-xs">{exp.paymentMethod ?? 'cash'}</span>
                    )}
                  </td>

                  <td className="border px-3 py-2 text-center min-w-[110px]" style={wcs(5)}>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs text-white transition-colors duration-300 ${confirmed ? "bg-green-600" : "bg-red-700"}`}>
                      <GlitchText counter={gc}>{confirmed ? "Posted" : "Not Posted"}</GlitchText>
                    </span>
                  </td>

                  <td className="border px-3 py-2 text-center min-w-[80px]" style={wcs(6)}>
                    <div className="flex items-center justify-center gap-1">
                      <div className="text-sm font-medium font-mono tabular-nums">
                        <GlitchText counter={gc}>{getVoucherField(exp, "copyNumber")}</GlitchText>
                      </div>
                    </div>
                  </td>

                  <td className="border px-3 py-2 text-center min-w-[90px]" style={wcs(7)}>
                    <div className="flex items-center justify-center gap-1">
                      <div className="text-sm font-mono tabular-nums">
                        <GlitchText counter={gc}>{getVoucherField(exp, "uniqueNumber")}</GlitchText>
                      </div>
                    </div>
                  </td>

                  <td className="border px-3 py-2 text-center w-[180px] min-w-[180px]" style={wcs(8)}>
                    <div className="relative flex justify-center items-center h-7 w-full">
                    {/*
                      Action column buttons share one strict design system so
                      the cell never reflows mid-row:
                        • Every button: h-7 (28px), text-xs, font-medium,
                          rounded, ring-on-focus, no margin (gap on parent).
                        • Widths are fixed per role so spinner ↔ text swap
                          is invisible (no width recompute).
                        • Confirmed (Undo) row reuses the same total inner
                          width as the unposted (Edit + Delete + Post) row
                          so AnimatePresence crossfade has no perceptible
                          shift — only color + label change.
                        • Transitions are 60ms opacity (no scale, no spring),
                          fast enough to feel instant.
                    */}
                    <AnimatePresence initial={false}>
                        {editId === exp._id ? (
                            // EDIT MODE — Save / Cancel
                            <motion.div
                              key="edit-buttons"
                              className="absolute inset-0 flex items-center justify-center gap-1.5"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.06 }}
                            >
                              <button
                                onClick={() => saveEdit(exp._id)}
                                className="inline-flex items-center justify-center w-[72px] h-7 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded ring-emerald-300 focus:outline-none focus:ring-2 transition-colors duration-75"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="inline-flex items-center justify-center w-[72px] h-7 text-xs font-medium text-white bg-gray-500 hover:bg-gray-600 active:bg-gray-700 rounded ring-gray-300 focus:outline-none focus:ring-2 transition-colors duration-75"
                              >
                                Cancel
                              </button>
                            </motion.div>
                        ) : confirmed ? (
                            // POSTED — Undo (single full-width button)
                            <motion.div
                              key="undo-button"
                              className="absolute inset-0 flex items-center justify-center"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.06 }}
                            >
                              <button
                                disabled={isPosting}
                                onClick={() => {
                                    triggerWave(exp._id, 'undo');
                                    undoEntry(exp);
                                }}
                                className={`inline-flex items-center justify-center w-[150px] h-7 text-xs font-medium text-white rounded ring-gray-400 focus:outline-none focus:ring-2 transition-colors duration-75 ${isPosting ? "bg-gray-700 cursor-wait" : "bg-black hover:bg-gray-800 active:bg-gray-900"}`}
                                aria-busy={isPosting}
                                aria-label={isPosting ? "Undoing…" : "Undo voucher"}
                              >
                                {isPosting ? <ButtonSpinner /> : "Undo"}
                              </button>
                            </motion.div>
                        ) : (
                            // UNPOSTED — Edit / Delete / Post
                            <motion.div
                              key="action-buttons"
                              className="absolute inset-0 flex items-center justify-center gap-1.5"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.06 }}
                            >
                              <button
                                disabled={isPosting}
                                onClick={() => startEdit(exp._id)}
                                className="inline-flex items-center justify-center w-[44px] h-7 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 active:bg-blue-700 rounded ring-blue-300 focus:outline-none focus:ring-2 transition-colors duration-75 disabled:opacity-60"
                              >
                                Edit
                              </button>
                              <button
                                disabled={isPosting}
                                onClick={() => deleteEntry(exp._id)}
                                className="inline-flex items-center justify-center w-[52px] h-7 text-xs font-medium text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded ring-red-300 focus:outline-none focus:ring-2 transition-colors duration-75 disabled:opacity-60"
                              >
                                Delete
                              </button>
                              <button
                                disabled={isPosting}
                                onClick={() => {
                                    triggerWave(exp._id, 'post');
                                    postEntry(exp);
                                }}
                                className={`inline-flex items-center justify-center w-[44px] h-7 text-xs font-medium text-white rounded ring-indigo-300 focus:outline-none focus:ring-2 transition-colors duration-75 ${isPosting ? "bg-indigo-400 cursor-wait" : "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800"}`}
                                aria-pressed={pending}
                                aria-busy={isPosting}
                                aria-label={isPosting ? "Posting…" : "Post voucher"}
                              >
                                {isPosting ? <ButtonSpinner /> : "Post"}
                              </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    </div>
                  </td>
                </motion.tr>
                {expandedId === exp._id && Array.isArray(exp.lines) && exp.lines.length > 0 && (
                  <motion.tr
                    key={exp._id + ':lines'}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="bg-gray-50/60"
                  >
                    <td colSpan={9} className="border px-3 py-3">
                      <ExpenseLinesBreakdown
                        lines={exp.lines}
                        total={exp.amount}
                        vendorName={exp.vendorName}
                        dense
                      />
                    </td>
                  </motion.tr>
                )}
              </React.Fragment>
            ); }) }
          </AnimatePresence>
        </tbody>

        <tfoot>
          <tr className="bg-gray-100 text-sm">
            <td colSpan={3} className="border px-3 py-2 text-right font-semibold">
              Total
            </td>
            <td className="border px-3 py-2 text-right font-semibold">{totalExpense.toLocaleString()}</td>
            <td colSpan={5} className="border px-3 py-2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}