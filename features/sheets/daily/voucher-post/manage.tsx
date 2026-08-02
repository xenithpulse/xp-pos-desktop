// src/lib/useVoucherQueue.ts
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import type React from "react";

/**
 * Build a human-readable message from an axios error / unknown thrown value.
 * Walks several known shapes so the user sees the actual server message
 * (e.g. "Voucher copy book is full", "Vendor not found", validation details)
 * instead of a generic "See console" line. Falls back to status + statusText
 * + Error.message in that order.
 */
function describeAxiosError(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as
      | {
          error?: string;
          message?: string;
          details?: string | string[] | Record<string, unknown>;
          requiresNewConfig?: boolean;
        }
      | string
      | undefined;

    // String body (some routes return text/plain)
    if (typeof data === "string" && data.trim()) {
      return status ? `[${status}] ${data}` : data;
    }

    // Narrow `data` to the object form for the property accesses below.
    const objData =
      data && typeof data === "object" ? data : undefined;

    const primary = objData?.error || objData?.message;
    let detailStr: string | undefined;
    if (objData?.details) {
      if (typeof objData.details === "string") detailStr = objData.details;
      else if (Array.isArray(objData.details)) detailStr = objData.details.join("; ");
      else {
        try { detailStr = JSON.stringify(objData.details); } catch { /* ignore */ }
      }
    }

    if (primary) {
      const tail = detailStr && detailStr !== primary ? ` — ${detailStr}` : "";
      return status ? `[${status}] ${primary}${tail}` : `${primary}${tail}`;
    }

    if (status) {
      return `[${status}] ${err.response?.statusText || err.message || fallback}`;
    }
    if (err.code === "ERR_NETWORK") return "Network error — server unreachable.";
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

/* Types (extended to match new DailySheet schema) */
export interface IExpenseLine {
  groupName?: string;
  subCategory?: string;
  unit?: string;
  quantity?: number;
  rate?: number;
  amount: number;
  description?: string;
}

export interface IExpenseBookingRef {
  bookingId?: string;
  bookingUniqueId?: string;
  eventDate?: string;
  clientName?: string;
  sourceUpdateCount?: number;
  source?: string;
}

export interface IExpenseEntry {
  _id: string;
  category: string;
  description: string;
  amount: number;
  paymentMethod?: 'cash' | 'cheque' | 'online';
  isExpPosted?: boolean;
  expID?: string | null; // server voucher _id or pending-<expenseId>
  postedCopyNumber?: string | null;
  postedUniqueNumber?: string | null;
  // ── Phase 2 (optional) ──
  lines?: IExpenseLine[];
  vendorId?: string | null;
  vendorName?: string | null;
  /** Present when auto-imported from a booking's Event Profitability. */
  bookingRef?: IExpenseBookingRef;
  // transient UI flag
  sanity?: boolean | undefined;
}

/** Payload passed to onAfterPost / onAfterUndo callbacks for downstream side effects
 *  (e.g. mirroring "Cash Withdrawl" vouchers into slipEntries). */
export interface VoucherPostContext {
  expense: IExpenseEntry;
  voucher: IVoucher;
}

export interface IVoucherConfig {
  _id: string;
  currentCopyNumber: string;
  uniqueNumberPrefix: string;
  start: number;
  limit: number;
}

export interface IVoucher {
  _id: string;
  uniqueNumber?: string;
  copyNumber?: string;
  expenseEntry?: string;
}

export function useVoucherQueue(opts: {
  currentUserId: string;
  // new: ref to a Set of deleting IDs so sync can ignore them
  deletingIdsRef?: React.MutableRefObject<Set<string>>;
  getExpenses: () => IExpenseEntry[];
  setExpenses: (updater: (prev: IExpenseEntry[]) => IExpenseEntry[] | IExpenseEntry[]) => void;
  initialLoad?: boolean;
  /** When non-null, operations target a backdated sheet instead of today */
  targetDate?: string | null;
  /** Optional callback invoked after every successful authoritative load
   *  (`loadAll`). Used by the global context bar to stamp a "Last synced"
   *  indicator. Polling has been removed; this fires only on explicit loads. */
  onSync?: () => void;
  /** Raise a global context-bar notification (the flip log). Success posts
   *  flip a green log that auto-dismisses; failures flip a red log that stays,
   *  carrying the exact reason and — for a full copy book — a CTA that routes
   *  to Voucher Config. */
  onNotify?: (n: {
    type: 'success' | 'error';
    title: string;
    message?: string;
    cta?: { label: string; targetHash?: string; intent?: string };
    autoDismissMs?: number;
  }) => void;
  /** Fires after a voucher has been successfully created AND the daily-sheet
   *  entry has been updated. Used to mirror "Cash Withdrawl" vouchers into
   *  slipEntries. Errors thrown here are swallowed so a side-effect failure
   *  never rolls back the post itself. */
  onAfterPost?: (ctx: VoucherPostContext) => void | Promise<void>;
  /** Fires after a voucher has been successfully deleted (undo). */
  onAfterUndo?: (ctx: { expense: IExpenseEntry; voucherId: string; copyNumber?: string | null; uniqueNumber?: string | null }) => void | Promise<void>;
  /**
   * Optional source of the next predicted voucher number. When present,
   * `optimisticMarkPosting` uses it as the placeholder copy/unique fields
   * instead of "—", so the user sees the real number immediately on click.
   * The server response still wins; if it differs (rare race), the UI just
   * updates from FEB471 → FEB472 once.
   */
  getNextNumberHint?: () => { copyNumber?: string | null; uniqueNumber?: string | null } | null;
}) {
  const {
    currentUserId,
    deletingIdsRef = { current: new Set<string>() } as React.MutableRefObject<Set<string>>,
    getExpenses,
    setExpenses,
    initialLoad = true,
    targetDate = null,
    onSync,
    onNotify,
    onAfterPost,
    onAfterUndo,
    getNextNumberHint,
  } = opts;

  const [postingIds, setPostingIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const fetchVouchersForToday = async (): Promise<IVoucher[]> => {
    try {
      const refDate = targetDate
        ? new Date(targetDate + 'T00:00:00') // local midnight of the backdated day
        : (() => {
            // Local midnight for non-backdate mode.
            const d = new Date();
            d.setHours(0, 0, 0, 0);
            return d;
          })();
      const res = await axios.get("/api/vouchers", { params: { page: 1, limit: 500, createdAfter: refDate.toISOString() } });
      const vouchers: IVoucher[] = res.data?.vouchers || res.data || [];
      return vouchers;
    } catch (err) {
      console.warn("fetchVouchersForToday failed", err);
      return [] as IVoucher[];
    }
  };

  const fetchDailyEntries = async (): Promise<IExpenseEntry[]> => {
    const url = targetDate
      ? `/api/daily-sheet/today/entries?targetDate=${targetDate}`
      : "/api/daily-sheet/today/entries";
    const res = await axios.get<IExpenseEntry[]>(url);
    return res.data || [];
  };

  // ---------- Load / Sync ----------
  const loadAll = async (opts: { fetchVouchers?: boolean } = { fetchVouchers: true }) => {
    const isInitialLoad = !getExpenses().length && initialLoad;
    if (isInitialLoad) setLoading(true);
    setError(undefined);
    try {
      // Fire entries + vouchers in parallel. Vouchers are only used to
      // augment posted-fields on entries; if the entries fetch returns
      // nothing, the vouchers result is harmless to discard.
      const [entries, vouchers] = await Promise.all([
        fetchDailyEntries(),
        opts.fetchVouchers ? fetchVouchersForToday() : Promise.resolve<IVoucher[]>([]),
      ]);

      if (vouchers.length && entries.length) {
        const voucherByEntry = new Map<string, IVoucher>();
        for (const v of vouchers) {
          if (v.expenseEntry) voucherByEntry.set(String(v.expenseEntry), v);
        }
        const merged = entries.map((en) => {
          const v = voucherByEntry.get(String(en._id));
          if (!v) return { ...en };
          return {
            ...en,
            expID: String(v._id),
            isExpPosted: true,
            postedCopyNumber: v.copyNumber ?? en.postedCopyNumber,
            postedUniqueNumber: v.uniqueNumber ?? en.postedUniqueNumber,
          };
        });
        setExpenses(() => merged);
      } else {
        setExpenses(() => entries.map((en) => ({ ...en })));
      }
    } catch (e) {
      console.error("loadAll error:", e);
      if (e instanceof Error) setError(e.message);
      else setError("An unexpected error occurred during load.");
    } finally {
      if (isInitialLoad) setLoading(false);
      // Successful authoritative fetch — stamp last-synced timestamp.
      // Log if the callback throws so silent freezes of the Last-Synced
      // indicator don't go unnoticed in production.
      try { onSync?.(); } catch (e) { console.error("useVoucherQueue.onSync (loadAll) failed:", e); }
    }
  };
  
  // ── Polling removed ──
  // The DailySheetContext owns optimistic state. Authoritative reconciliation
  // is handled by:
  //   • `loadAll` on mount and on tab-visible / online events
  //   • explicit `refreshSheet()` calls from DailySheetContext after each
  //     mutation (post / undo / delete)
  // No periodic interval is started, so the server isn't hit on a schedule.

  // ---------- Optimistic helpers ----------
  const optimisticMarkPosting = (expenseId: string) => {
    setPostingIds((p) => ({ ...p, [expenseId]: true }));
    // Pull the predicted next voucher number from the consumer's prefetch
    // cache, if available. Falls back to "—" when unset (first click before
    // the prefetch has resolved, or peek endpoint failed).
    const hint = getNextNumberHint?.() ?? null;
    const hintedCopy = hint?.copyNumber ?? "—";
    const hintedUnique = hint?.uniqueNumber ?? "—";
    // inject pending expID and (best-effort) real numbers to keep UI stable
    setExpenses((prev) =>
      prev.map((e) =>
        e._id === expenseId
          ? {
              ...e,
              isExpPosted: true,
              expID: `pending-${expenseId}`,
              postedCopyNumber: hintedCopy,
              postedUniqueNumber: hintedUnique,
            }
          : e
      )
    );
  };

  const revertOptimistic = (expenseId: string) => {
    setPostingIds((p) => {
      const copy = { ...p };
      delete copy[expenseId];
      return copy;
    });
    setExpenses((prev) =>
      prev.map((e) =>
        e._id === expenseId
          ? {
              ...e,
              isExpPosted: false,
              expID: undefined,
              postedCopyNumber: undefined,
              postedUniqueNumber: undefined,
              sanity: undefined,
            }
          : e
      )
    );
  };

  // ---------- Post entry ----------
  const postEntry = async (exp: IExpenseEntry) => {
    const expenses = getExpenses();
    const found = expenses.find((e) => e._id === exp._id);
    if (!found) return;
    if (found.isExpPosted || postingIds[exp._id]) return;

    optimisticMarkPosting(exp._id);

    try {
      const postedAtDate = targetDate
        ? new Date(targetDate + 'T12:00:00').toISOString() // local noon of the backdated day
        : new Date().toISOString();
      const payload = {
        amount: exp.amount,
        description: exp.description,
        expenseEntry: exp._id,
        postedAt: postedAtDate,
        postedBy: currentUserId,
        paymentMethod: exp.paymentMethod ?? 'cash',
        // ── Phase 2: forward optional multi-line items + vendor selection ──
        // Server validates lines sum vs amount and writes RawExpenseLedger
        // debits per line. When vendorId is present, server auto-posts the
        // voucher to the vendor's ledger as a credit (idempotent).
        ...(Array.isArray(exp.lines) && exp.lines.length > 0
          ? { lines: exp.lines }
          : {}),
        ...(exp.vendorId ? { vendorId: exp.vendorId } : {}),
        ...(targetDate && {
          isBackdated: true,
          createdAt: new Date(targetDate + 'T12:00:00').toISOString(), // local noon
        }),
      };

      // Create voucher AND mark the daily-sheet entry as posted in a single
      // round-trip. Server now returns:
      //   { ...voucherDoc, updatedEntry?, totals? }
      // so the previous follow-up PUT /api/daily-sheet/today/entries call
      // is no longer necessary — that used to nearly double the perceived
      // post latency (~600ms POST + ~900ms PUT).
      const res = await axios.post("/api/vouchers", payload, { headers: { "Idempotency-Key": `expense-${exp._id}` } });
      const responseData = res.data as IVoucher & {
        updatedEntry?: {
          _id: string;
          isExpPosted: boolean;
          expID: string | null;
          postedCopyNumber: string | null;
          postedUniqueNumber: string | null;
        } | null;
        totals?: { totalExpense: number; closingBalance: number } | null;
      };
      const voucher: IVoucher = responseData;

      if (!voucher || !voucher._id) {
        throw new Error("Voucher creation failed (no id returned).");
      }

      const updated = responseData.updatedEntry;
      setExpenses((prev) =>
        prev.map((e) =>
          e._id === exp._id
            ? {
                ...e,
                isExpPosted: updated ? Boolean(updated.isExpPosted) : true,
                expID: String(voucher._id),
                postedCopyNumber: updated?.postedCopyNumber ?? voucher.copyNumber ?? null,
                postedUniqueNumber: updated?.postedUniqueNumber ?? voucher.uniqueNumber ?? null,
                // Server already verified the voucher exists (it just wrote it),
                // so the sanity bit is implicitly true on this path.
                sanity: true,
              }
            : e
        )
      );

      // remove posting flag
      setPostingIds((p) => {
        const copy = { ...p };
        delete copy[exp._id];
        return copy;
      });

      // Success log — flip the context bar green, then auto-flip back.
      {
        const num = [
          responseData.updatedEntry?.postedCopyNumber ?? voucher.copyNumber,
          responseData.updatedEntry?.postedUniqueNumber ?? voucher.uniqueNumber,
        ]
          .filter(Boolean)
          .join('-');
        onNotify?.({
          type: 'success',
          title: 'Expense posted to voucher',
          message: `${num ? `${num} · ` : ''}${exp.description || 'Expense'} — ${Number(exp.amount).toLocaleString()}`,
        });
      }

      // Side-effect hook (e.g. mirror "Cash Withdrawl" voucher into slipEntries).
      // Wrapped in try/catch so a downstream failure can never roll back the post.
      if (onAfterPost) {
        try {
          await onAfterPost({ expense: { ...found, ...exp }, voucher });
        } catch (sideErr) {
          console.error("onAfterPost callback failed:", sideErr);
        }
      }

      // Authoritative reconciliation happens via the next visibility/online
      // event or an explicit refreshSheet() from the calling component.
    } catch (err) {
      console.error("postEntry failed:", err);
      revertOptimistic(exp._id);
      // Specifically surface the "copy book is full" condition so the user
      // knows they need to set a new copyNumber + prefix in Voucher Config
      // instead of retrying blindly.
      const ax = err as { response?: { status?: number; data?: { requiresNewConfig?: boolean; error?: string; message?: string } } };
      const data = ax?.response?.data;
      if (data?.requiresNewConfig) {
        const reason = data.error || data.message || "Voucher copy book is full.";
        setError(
          `${reason} Open Voucher Config and set a new Copy Number and Prefix to continue posting.`,
        );
        // Flip the bar red and give the operator a one-click path to the fix:
        // the current voucher book's number limit is exhausted, so they must
        // create a new config (Copy Number + Prefix + Limit) before posting more.
        onNotify?.({
          type: 'error',
          title: 'Voucher book is full',
          message: `${reason} Create a new voucher config (Copy Number, Prefix & Limit) to keep posting.`,
          cta: { label: 'Open Voucher Config', targetHash: 'vouchers', intent: 'open-voucher-config' },
        });
      } else {
        const reason = describeAxiosError(err, "Failed to post voucher.");
        setError(reason);
        onNotify?.({ type: 'error', title: "Couldn't post expense to voucher", message: reason });
      }
    }
  };

  // ---------- Undo (delete voucher + update daily-sheet entry) ----------
  const undoEntry = async (exp: IExpenseEntry) => {
    if (!exp) return;

    const vid = exp.expID;
    if (!vid || !String(vid).startsWith("pending-") && !vid) {
      // If no expID known, try best-effort find voucher by expenseEntry via server later
      if (!vid) {
        setError("No voucher reference found to undo.");
        return;
      }
    }

    // Snapshot posted fields for revert on failure
    const prevCopyNumber = exp.postedCopyNumber;
    const prevUniqueNumber = exp.postedUniqueNumber;
    const prevExpID = exp.expID;

    setPostingIds((p) => ({ ...p, [exp._id]: true }));
    // optimistic flip
    setExpenses((prev) => prev.map((e) => (e._id === exp._id ? { ...e, isExpPosted: false, postedCopyNumber: undefined, postedUniqueNumber: undefined, expID: undefined } : e)));

    try {
      // If exp.expID is a pending marker - there is nothing server-side created yet, so simply clear
      if (typeof vid === "string" && vid.startsWith("pending-")) {
        // clear server state by calling daily-sheet entry update to clear posted fields (safe)
        try {
          const undoPendingUrl = targetDate
            ? `/api/daily-sheet/today/entries?targetDate=${targetDate}`
            : "/api/daily-sheet/today/entries";
          await axios.put(undoPendingUrl, {
            _id: exp._id,
            isExpPosted: false,
            postedCopyNumber: null,
            postedUniqueNumber: null,
            // expID not set server-side for pending so nothing else to delete
          });
        } catch (e) {
          console.warn("Failed to clear pending entry on server (likely fine).", e);
        }

        // authoritative sync
        await loadAll({ fetchVouchers: true });
      } else {
        // vid is a real voucher id. Single round-trip: DELETE /api/vouchers/:id
        // with ?clearEntry=<entryId> tells the server to also flip the
        // daily-sheet entry's posted fields and recalc totals atomically.
        // Returns { success, deleted, updatedEntry, totals } so we can
        // apply the authoritative state without a follow-up PUT or refetch.
        let undoResp: {
          updatedEntry?: {
            _id: string;
            isExpPosted: boolean;
            expID: string | null;
            postedCopyNumber: string | null;
            postedUniqueNumber: string | null;
          } | null;
          totals?: { totalExpense: number; closingBalance: number } | null;
        } | null = null;
        try {
          const dateParam = targetDate ? `&targetDate=${targetDate}` : '';
          const delRes = await axios.delete(
            `/api/vouchers/${vid}?clearEntry=${encodeURIComponent(exp._id)}${dateParam}`,
          );
          undoResp = delRes.data ?? null;
        } catch (e) {
          // Fallback: legacy two-call path if the merged endpoint isn't
          // available (e.g. older deploy) or the voucher id route 404s.
          // We tolerate the voucher already being gone.
          console.warn("Merged DELETE failed, falling back to legacy path", e);
          try {
            await axios.delete(`/api/vouchers/${vid}`);
          } catch (e1) {
            try {
              await axios.delete("/api/vouchers", { params: { id: vid } });
            } catch (e2) {
              console.warn("Delete voucher failed by both endpoints", e2);
              throw e2;
            }
          }
          try {
            const undoRealUrl = targetDate
              ? `/api/daily-sheet/today/entries?targetDate=${targetDate}`
              : "/api/daily-sheet/today/entries";
            await axios.put(undoRealUrl, {
              _id: exp._id,
              isExpPosted: false,
              postedCopyNumber: null,
              postedUniqueNumber: null,
            });
          } catch (entryUpdateErr) {
            console.warn("Failed to update daily-sheet entry after voucher deletion", entryUpdateErr);
          }
        }

        // Apply authoritative entry state from the merged response when present.
        if (undoResp?.updatedEntry) {
          const u = undoResp.updatedEntry;
          setExpenses((prev) =>
            prev.map((e) =>
              e._id === exp._id
                ? {
                    ...e,
                    isExpPosted: Boolean(u.isExpPosted),
                    expID: u.expID ?? undefined,
                    postedCopyNumber: u.postedCopyNumber ?? null,
                    postedUniqueNumber: u.postedUniqueNumber ?? null,
                    sanity: true,
                  }
                : e
            )
          );
        }

        // Side-effect hook (e.g. remove the mirrored "Cash Withdrawl" slip entry).
        // Pass the snapshot we took above so the consumer has the original
        // copy/unique numbers before the optimistic UI cleared them.
        if (onAfterUndo) {
          try {
            await onAfterUndo({
              expense: exp,
              voucherId: String(vid),
              copyNumber: prevCopyNumber ?? null,
              uniqueNumber: prevUniqueNumber ?? null,
            });
          } catch (sideErr) {
            console.error("onAfterUndo callback failed:", sideErr);
          }
        }

        // Authoritative reconciliation: only run loadAll if the merged
        // endpoint did NOT give us an updatedEntry (fallback path).
        if (!undoResp?.updatedEntry) {
          await loadAll({ fetchVouchers: true });
        }
      }
    } catch (err) {
      console.error("Undo failed:", err);
      // revert optimistic — restore all snapshot fields
      setExpenses((prev) => prev.map((e) => (e._id === exp._id ? { ...e, isExpPosted: true, postedCopyNumber: prevCopyNumber, postedUniqueNumber: prevUniqueNumber, expID: prevExpID } : e)));
      setError(describeAxiosError(err, "Failed to undo voucher."));
    } finally {
      setPostingIds((p) => {
        const copy = { ...p };
        delete copy[exp._id];
        return copy;
      });
    }
  };

  // ---------- Initial load only (polling removed) ----------
  // We still re-fetch when the tab becomes visible after being hidden so the
  // user sees fresh state on return — but at most once per visibility flip,
  // not on a periodic interval.
  useEffect(() => {
    if (initialLoad) void loadAll({ fetchVouchers: true });

    const onVisibility = () => {
      if (!document.hidden) void loadAll({ fetchVouchers: true });
    };
    const onOnline = () => { void loadAll({ fetchVouchers: true }); };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    postEntry,
    undoEntry,
    postingIds,
    loadAll,
    loading,
    error,
  };
}
