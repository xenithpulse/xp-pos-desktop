'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useSession } from 'next-auth/react';
import { subscribeRealtime } from '@/lib/realtime/wsClient';
import { DAILY_SHEET_EDIT_CONTEXT_EVENT } from '@/lib/realtime/types';
import type { ISlipEntry, IExpenseEntry, ICashSlip } from './ExpenseSheet/utils';

const TARGET_DATE_KEY = 'dailySheet_targetDate';
/* Per-tab id so we can ignore realtime echoes triggered by THIS tab's own PUT.
 * Other tabs/devices see a different id and update their state. */
const TAB_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/* ─── Types ─── */
/**
 * UI-facing per-payment-method buckets.
 *
 * The business treats deposited cheques as cash on hand for daily-sheet
 * reconciliation, so we intentionally collapse {cash, cheque, online} on
 * the server into {cash, online} here — any historical entry recorded
 * with paymentMethod='cheque' is added to the `cash` bucket.
 */
interface PerMethodTotals {
  cash: number;
  online: number;
}

/* ─── Global context-bar notification ───
 * A single "log" that the sticky Daily Sheet context bar flips over to reveal.
 * Success logs auto-flip back after `autoDismissMs`; error logs stay until the
 * user acts on the CTA or closes them — so a forgetful operator always gets the
 * exact reason a step failed and a one-click path to fix it. */
export interface BarNotificationCta {
  /** Button text, e.g. "Open Voucher Config". */
  label: string;
  /** Tab hash to navigate the daily-sheet page to, e.g. "vouchers". */
  targetHash?: string;
  /** Intent the destination reacts to, e.g. "open-voucher-config". */
  intent?: string;
}
export interface BarNotification {
  id: string;
  type: 'success' | 'error';
  title: string;
  message?: string;
  /** Shown only for errors — a guided next step. */
  cta?: BarNotificationCta;
  /** Success auto-dismiss delay (ms). Ignored for errors (they stay). */
  autoDismissMs?: number;
}

function genId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

interface DailySheetState {
  sheetId: string | null;
  /** ISO date string of the loaded sheet (YYYY-MM-DD in PKT), or null */
  sheetDate: string | null;
  /** Whether the loaded sheet has been explicitly closed by the user */
  isPosted: boolean;
  slipEntries: ISlipEntry[];
  expenses: IExpenseEntry[];
  openingBalance: number;
  cashOpeningBalance: number;
  onlineOpeningBalance: number;
  totalIncome: number;
  totalExpense: number;
  closingBalance: number;
  cashClosingBalance: number;
  onlineClosingBalance: number;
  /** Per-payment-method derived totals from authoritative entries */
  incomeByMethod: PerMethodTotals;
  expenseByMethod: PerMethodTotals;
  loading: boolean;
  /** Monotonic counter that increments on any slip mutation (add/revert).
   *  Sub-components (UnusedSlipsSection, slip picker) subscribe to this
   *  instead of blind refreshKey counters. */
  slipVersion: number;
  /** Available (unused) slips for the slip picker — shared so all consumers stay in sync */
  availableSlips: ICashSlip[];
  loadingSlips: boolean;
  /** When non-null, the context targets a backdated sheet instead of today */
  targetDate: string | null;
  /** Wall-clock timestamp of the last successful authoritative sync
   *  (refreshSheet OR poll-driven entries fetch). Drives the "Last synced…"
   *  indicator in the global context bar. */
  lastSyncedAt: Date | null;
  /** Active context-bar notification (the "flipped" log), or null. */
  notification: BarNotification | null;
}

interface DailySheetActions {
  /** Full refresh: re-fetches today's sheet + opening balance + available slips */
  refreshSheet: () => Promise<void>;
  /** Explicitly create a new daily sheet for today PKT (no auto-create on writes) */
  openSheet: (input?: {
    openingBalance?: number;
    cashOpeningBalance?: number;
    onlineOpeningBalance?: number;
    notes?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  /** Explicitly close (post) the active daily sheet */
  closeSheet: (sheetId?: string) => Promise<{ ok: boolean; error?: string }>;
  /** Called after form adds an expense — pushes server-authoritative entries */
  setExpensesFromServer: (entries: IExpenseEntry[]) => void;
  /** Called by the list when it mutates expenses (edit/delete) */
  setExpenses: React.Dispatch<React.SetStateAction<IExpenseEntry[]>>;
  /** Called after slips are added/reverted — updates slipEntries + totalIncome */
  setSlipEntries: (slips: ISlipEntry[]) => void;
  /** Fetch opening balance from dedicated API (returns combined + per-method breakdown) */
  fetchOpeningBalance: () => Promise<{ combined: number; cash: number; online: number }>;
  /** Reload only available (unused) slips */
  reloadAvailableSlips: () => Promise<void>;
  /** Optimistically update available slips (e.g. remove a slip after adding it) */
  setAvailableSlips: React.Dispatch<React.SetStateAction<ICashSlip[]>>;
  /** Notify all slip consumers that a mutation happened (add/revert) */
  notifySlipMutation: () => void;
  /** Switch to a backdated sheet (YYYY-MM-DD) or back to today (null) */
  setTargetDate: (date: string | null) => void;
  /** Stamp lastSyncedAt = now. Called by the polling queue after each
   *  successful fetchDailyEntries so the bar reflects background sync. */
  markSynced: () => void;
  /** Raise a context-bar notification (flips the bar to reveal the log).
   *  A new notification replaces any currently-shown one. */
  notify: (n: Omit<BarNotification, 'id'> & { id?: string }) => void;
  /** Dismiss the current notification (flip the bar back). If `id` is passed,
   *  only dismisses when it matches — avoids a stale timer clearing a newer log. */
  dismissNotification: (id?: string) => void;
}

type DailySheetContextValue = DailySheetState & DailySheetActions;

const DailySheetContext = createContext<DailySheetContextValue | null>(null);

/* ─── Hook ─── */
export function useDailySheet() {
  const ctx = useContext(DailySheetContext);
  if (!ctx) throw new Error('useDailySheet must be used inside <DailySheetProvider>');
  return ctx;
}

/* ─── Provider ─── */
export function DailySheetProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetDate, setSheetDate] = useState<string | null>(null);
  const [isPosted, setIsPosted] = useState<boolean>(false);
  const [slipEntries, setSlipEntriesState] = useState<ISlipEntry[]>([]);
  const [expenses, setExpenses] = useState<IExpenseEntry[]>([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [cashOpeningBalance, setCashOpeningBalance] = useState(0);
  const [onlineOpeningBalance, setOnlineOpeningBalance] = useState(0);
  const [cashClosingBalance, setCashClosingBalance] = useState(0);
  const [onlineClosingBalance, setOnlineClosingBalance] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [loading, setLoading] = useState(true);
  const [slipVersion, setSlipVersion] = useState(0);
  const [availableSlips, setAvailableSlips] = useState<ICashSlip[]>([]);
  const [loadingSlips, setLoadingSlips] = useState(true);
  // Restore persisted backdate so tab-switches don't reset to "today"
  const [targetDate, setTargetDateState] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(TARGET_DATE_KEY) || null;
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [notification, setNotification] = useState<BarNotification | null>(null);
  const mountedRef = useRef(true);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);

  // Derived totals — computed from authoritative expenses array
  const totalExpense = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const closingBalance = openingBalance + totalIncome - totalExpense;

  /* ── Fetch opening balance (combined + per-method split) from dedicated API ──
   *  The endpoint also returns cashOpeningBalance / onlineOpeningBalance so
   *  the SummaryCard "Carried forward" pills are populated at mount, even
   *  before the user has explicitly opened today's daily sheet. */
  const fetchOpeningBalance = useCallback(async (): Promise<{ combined: number; cash: number; online: number }> => {
    try {
      const { data } = await axios.get<{
        openingBalance?: number;
        cashOpeningBalance?: number;
        onlineOpeningBalance?: number;
      }>('/api/daily-sheet/opening-balance');
      const val = Number(data?.openingBalance) || 0;
      const cashVal = Number(data?.cashOpeningBalance) || 0;
      const onlineVal = Number(data?.onlineOpeningBalance) || 0;
      if (mountedRef.current) {
        setOpeningBalance(val);
        setCashOpeningBalance(cashVal);
        setOnlineOpeningBalance(onlineVal);
      }
      return { combined: val, cash: cashVal, online: onlineVal };
    } catch {
      if (mountedRef.current) {
        setOpeningBalance(0);
        setCashOpeningBalance(0);
        setOnlineOpeningBalance(0);
      }
      return { combined: 0, cash: 0, online: 0 };
    }
  }, []);

  /* ── Load available (unused) slips ── */
  const reloadAvailableSlips = useCallback(async () => {
    if (mountedRef.current) setLoadingSlips(true);
    try {
      const { data: slips } = await axios.get<ICashSlip[]>('/api/cash-slips/isUsed/?used=false');
      if (mountedRef.current) setAvailableSlips(Array.isArray(slips) ? slips : []);
    } catch (err) {
      console.error('[DailySheetContext] reloadAvailableSlips failed:', err);
    } finally {
      if (mountedRef.current) setLoadingSlips(false);
    }
  }, []);

  /* ── Full refresh: today sheet + opening balance + available slips (parallel) ──
   *  Deduplicates: if a refresh is already in-flight, subsequent calls coalesce into the same promise */
  const _doRefresh = useCallback(async () => {
    if (mountedRef.current) setLoading(true);
    try {
      const sheetUrl = targetDate
        ? `/api/daily-sheet/today?targetDate=${targetDate}`
        : '/api/daily-sheet/today';
      const [sheetRes, apiOpening] = await Promise.all([
        axios.get(sheetUrl),
        fetchOpeningBalance(),
        reloadAvailableSlips(),
      ]);
      const sheet = sheetRes.data;
      if (sheet && mountedRef.current) {
        setSheetId(sheet._id ?? null);
        // Convert the sheet's UTC `date` to a PKT calendar-date string
        // (UTC+5). Without the shift a sheet stored as "2026-04-30T19:00:00Z"
        // (= May 1 00:00 PKT) would slice to "2026-04-30" and incorrectly
        // render as a backdate.
        setSheetDate(
          sheet.date
            ? (() => {
                // Local (regional) calendar date of the sheet — the server keys
                // sheets by its local day, so we read local date parts here.
                const d = new Date(sheet.date);
                const pad = (n: number) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
              })()
            : null,
        );
        setIsPosted(Boolean(sheet.isPosted));
        // Per-method OPENING balances — reconcile sheet doc against API:
        //   • If the sheet's stored split is the legacy "collapsed" form
        //     (online === 0 AND cash === combined opening) but the API has
        //     a real split from the active monthly's per-method openings,
        //     prefer the API values. This covers daily sheets created before
        //     atomic-push learned to honour the monthly split.
        //   • Otherwise prefer the sheet doc's own per-method values when
        //     they carry a real split, since the daily sheet is the
        //     authoritative carry-forward source once it exists.
        //   • If the sheet has no split at all, keep the API values written
        //     by the parallel `fetchOpeningBalance()` call.
        const sheetCashOpen = Number(sheet.cashOpeningBalance) || 0;
        const sheetOnlineOpen = Number(sheet.onlineOpeningBalance) || 0;
        const sheetCombined = Number(sheet.openingBalance) || (sheetCashOpen + sheetOnlineOpen);
        const sheetIsCollapsed =
          sheetOnlineOpen === 0 && sheetCashOpen > 0 && sheetCashOpen === sheetCombined;
        const apiHasSplit = apiOpening.online > 0 && apiOpening.cash + apiOpening.online > 0;
        const apiMatchesCombined =
          Math.abs(apiOpening.combined - sheetCombined) < 0.005;
        if (sheetIsCollapsed && apiHasSplit && apiMatchesCombined) {
          setCashOpeningBalance(apiOpening.cash);
          setOnlineOpeningBalance(apiOpening.online);
        } else if (sheetCashOpen + sheetOnlineOpen > 0) {
          setCashOpeningBalance(sheetCashOpen);
          setOnlineOpeningBalance(sheetOnlineOpen);
        }
        setCashClosingBalance(Number(sheet.cashClosingBalance) || 0);
        setOnlineClosingBalance(Number(sheet.onlineClosingBalance) || 0);
        const slips: ISlipEntry[] = Array.isArray(sheet.slipEntries) ? sheet.slipEntries : [];
        const entries: IExpenseEntry[] = Array.isArray(sheet.entries) ? sheet.entries : [];
        setSlipEntriesState(slips);
        setExpenses(entries);
        setTotalIncome(slips.reduce((s: number, x: ISlipEntry) => s + (Number(x.amount) || 0), 0));
        // In backdate mode, use the sheet's own opening balance (set by the backdate API)
        if (targetDate && typeof sheet.openingBalance === 'number') {
          setOpeningBalance(sheet.openingBalance);
        }
      } else if (mountedRef.current) {
        setSheetId(null);
        setSheetDate(null);
        setIsPosted(false);
        // Per-method OPENING values are NOT reset here — fetchOpeningBalance()
        // (which ran in parallel above) has already populated them from the
        // prior day's closing balances so the SummaryCard pills stay populated
        // even when today's sheet hasn't been opened yet.
        setCashClosingBalance(0);
        setOnlineClosingBalance(0);
        setSlipEntriesState([]);
        setExpenses([]);
        setTotalIncome(0);
      }
    } catch (err) {
      console.error('[DailySheetContext] refreshSheet failed:', err);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setLastSyncedAt(new Date());
      }
    }
  }, [targetDate, fetchOpeningBalance, reloadAvailableSlips]);

  const refreshSheet = useCallback(async () => {
    // If a refresh is already running, coalesce into that promise
    if (refreshInFlightRef.current) return refreshInFlightRef.current;
    const promise = _doRefresh().finally(() => { refreshInFlightRef.current = null; });
    refreshInFlightRef.current = promise;
    return promise;
  }, [_doRefresh]);

  /* ── Slip entries setter — recalculates totalIncome ── */
  const setSlipEntries = useCallback((slips: ISlipEntry[]) => {
    setSlipEntriesState(slips);
    setTotalIncome(slips.reduce((s, x) => s + (Number(x.amount) || 0), 0));
  }, []);

  /* ── Authoritative entries setter (from form submit or sync) ── */
  const setExpensesFromServer = useCallback((entries: IExpenseEntry[]) => {
    setExpenses(entries);
  }, []);

  /* ── Slip mutation notification — increments version so all slip consumers react ── */
  const notifySlipMutation = useCallback(() => {
    setSlipVersion((v) => v + 1);
  }, []);

  /* ── Mark a successful background sync (called by polling consumers) ── */
  const markSynced = useCallback(() => {
    if (mountedRef.current) setLastSyncedAt(new Date());
  }, []);

  /* ── Context-bar notifications (the flip log) ── */
  const notify = useCallback((n: Omit<BarNotification, 'id'> & { id?: string }) => {
    if (!mountedRef.current) return;
    setNotification({ ...n, id: n.id ?? genId() });
  }, []);

  const dismissNotification = useCallback((id?: string) => {
    setNotification((cur) => (cur == null || id == null || cur.id === id ? null : cur));
  }, []);

  /* ── Per-payment-method derived totals (cheque folded into cash) ── */
  const incomeByMethod = useMemo<PerMethodTotals>(() => {
    const acc: PerMethodTotals = { cash: 0, online: 0 };
    for (const s of slipEntries) {
      const pm = (s.paymentMethod ?? 'cash').toString().toLowerCase();
      const bucket: keyof PerMethodTotals = pm === 'online' ? 'online' : 'cash';
      acc[bucket] += Number(s.amount) || 0;
    }
    return acc;
  }, [slipEntries]);

  const expenseByMethod = useMemo<PerMethodTotals>(() => {
    const acc: PerMethodTotals = { cash: 0, online: 0 };
    for (const e of expenses) {
      const pm = (e.paymentMethod ?? 'cash').toString().toLowerCase();
      const bucket: keyof PerMethodTotals = pm === 'online' ? 'online' : 'cash';
      acc[bucket] += Number(e.amount) || 0;
    }
    return acc;
  }, [expenses]);

  /* ── Open / Close actions ── */
  const openSheet = useCallback(
    async (input?: {
      openingBalance?: number;
      cashOpeningBalance?: number;
      onlineOpeningBalance?: number;
      notes?: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        await axios.post('/api/daily-sheet/open', input ?? {});
        await refreshSheet();
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string; message?: string } } };
        const msg = e.response?.data?.message || e.response?.data?.error || 'Failed to open daily sheet';
        return { ok: false, error: msg };
      }
    },
    // refreshSheet stable via _doRefresh deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const closeSheet = useCallback(
    async (id?: string): Promise<{ ok: boolean; error?: string }> => {
      try {
        await axios.post('/api/daily-sheet/close', id ? { sheetId: id } : {});
        await refreshSheet();
        return { ok: true };
      } catch (err) {
        const e = err as { response?: { data?: { error?: string; message?: string } } };
        const msg = e.response?.data?.message || e.response?.data?.error || 'Failed to close daily sheet';
        return { ok: false, error: msg };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /* Apply targetDate locally + clear stale UI. Used by both the user-driven
   * setter AND the Pusher listener (which doesn't want to re-PUT to server). */
  const applyTargetDateLocal = useCallback((date: string | null) => {
    setTargetDateState(date);
    if (typeof window !== 'undefined') {
      if (date) sessionStorage.setItem(TARGET_DATE_KEY, date);
      else sessionStorage.removeItem(TARGET_DATE_KEY);
    }
    // Clear stale data immediately so the UI doesn't flash data from the previous date
    setSheetId(null);
    setSheetDate(null);
    setIsPosted(false);
    setSlipEntriesState([]);
    setExpenses([]);
    setTotalIncome(0);
    setLoading(true);
    // Invalidate in-flight refresh so the next one picks up the new date
    refreshInFlightRef.current = null;
  }, []);

  const setTargetDate = useCallback((date: string | null) => {
    applyTargetDateLocal(date);
    // Fire-and-forget server sync so other devices/sessions for the same
    // user get the same backdate context. Failure is non-fatal — local state
    // already updated; the next mount will re-hydrate from sessionStorage.
    void axios
      .put('/api/daily-sheet/edit-context', { targetDate: date, originTabId: TAB_ID })
      .catch((err) => {
        console.warn('[DailySheetContext] failed to persist edit context:', err);
      });
  }, [applyTargetDateLocal]);

  /* ── Initial load ── */
  useEffect(() => {
    mountedRef.current = true;
    void refreshSheet();
    return () => { mountedRef.current = false; };
  }, [refreshSheet]);

  /* ── Hydrate targetDate from the server on mount / login ──
   * Server is the source of truth for cross-device continuity. If the
   * server says the user was last editing 2026-04-29 (a backdated sheet
   * or an open multi-day continuation), restore that context regardless
   * of what sessionStorage on this device says. */
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await axios.get<{ targetDate: string | null }>(
          '/api/daily-sheet/edit-context',
        );
        if (cancelled || !mountedRef.current) return;
        const serverDate = data?.targetDate ?? null;
        // Only mutate if it actually differs from current state — avoids a
        // gratuitous refresh on every login.
        setTargetDateState((current) => {
          if (current === serverDate) return current;
          if (typeof window !== 'undefined') {
            if (serverDate) sessionStorage.setItem(TARGET_DATE_KEY, serverDate);
            else sessionStorage.removeItem(TARGET_DATE_KEY);
          }
          // Force the data effect to re-fire by clearing the in-flight cache
          refreshInFlightRef.current = null;
          return serverDate;
        });
      } catch (err) {
        console.warn('[DailySheetContext] hydrate edit context failed:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionStatus]);

  /* ── Realtime sync ──
   * When the same user changes their editing context on another device or
   * tab, the PUT endpoint sends DAILY_SHEET_EDIT_CONTEXT_EVENT to that user's
   * sockets. We apply the change without re-PUTting (originTabId guards
   * against echoing our own writes).
   *
   * NOTE: this replaces a Pusher block that had never executed in production.
   * It bailed out unless NEXT_PUBLIC_PUSHER_CLUSTER was set, and that variable
   * is deliberately empty on every appliance (the LAN build connects
   * same-origin, not to the Pusher cloud). It also pointed at an authEndpoint
   * '/api/pusher/auth' that does not exist anywhere in the repo. So backdating
   * has silently never synced across a user's tabs — this is a fix, not a
   * like-for-like port.
   *
   * No channel name and no username are needed now: the server records the
   * authenticated user on the socket at upgrade time and addresses the message
   * to them directly. We share the app-wide socket, so this adds no second
   * connection per browser. */
  useEffect(() => {
    if (sessionStatus !== 'authenticated') return;

    const unsubscribe = subscribeRealtime((message) => {
      if (!mountedRef.current) return;
      if (message.type !== DAILY_SHEET_EDIT_CONTEXT_EVENT) return;

      const payload = message as { targetDate?: string | null; originTabId?: string };
      // Ignore echoes from this tab's own PUT
      if (payload.originTabId && payload.originTabId === TAB_ID) return;
      const incoming = payload.targetDate ?? null;
      // Use the functional setter to compare without depending on stale closure
      setTargetDateState((current) => {
        if (current === incoming) return current;
        applyTargetDateLocal(incoming);
        return incoming;
      });
    });

    return unsubscribe;
  }, [sessionStatus, applyTargetDateLocal]);

  const value: DailySheetContextValue = {
    sheetId,
    sheetDate,
    isPosted,
    slipEntries,
    expenses,
    openingBalance,
    cashOpeningBalance,
    onlineOpeningBalance,
    totalIncome,
    totalExpense,
    closingBalance,
    cashClosingBalance,
    onlineClosingBalance,
    incomeByMethod,
    expenseByMethod,
    loading,
    slipVersion,
    availableSlips,
    loadingSlips,
    targetDate,
    lastSyncedAt,
    notification,
    refreshSheet,
    openSheet,
    closeSheet,
    setExpensesFromServer,
    setExpenses,
    setSlipEntries,
    fetchOpeningBalance,
    reloadAvailableSlips,
    setAvailableSlips,
    notifySlipMutation,
    setTargetDate,
    markSynced,
    notify,
    dismissNotification,
  };

  return (
    <DailySheetContext.Provider value={value}>
      {children}
    </DailySheetContext.Provider>
  );
}
