'use client';

/**
 * DailySheetGlobalControls
 *
 * Compact context-bar segment that surfaces *all* lifecycle controls for the
 * Daily Sheet workflow:
 *   - Monthly stream status + Open / Close Month  (via <DailySheetMonthOpenClose />)
 *   - Per-day sheet status pill (Open / Closed / No Sheet)
 *   - Per-day Open / Close actions
 *   - Manual Refresh
 *   - Last-synced timestamp (auto-updates from the polling queue)
 *
 * Designed to live inside the page-level top bar in
 * `app/(pages)/daily-sheet/page.tsx`. The previous in-page top-bar (with
 * MonthManage + Refresh living above the slip picker in DailyExpenseInput)
 * has been retired in favour of this single source of truth.
 */
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { useDailySheet } from './DailySheetContext';
import DailySheetMonthOpenClose from './ExpenseSheet/MonthManage';

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function todayISO(): string {
  // Local (regional) calendar date — the server keys sheets by its local day.
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Convert any date-ish value to a LOCAL calendar-date YYYY-MM-DD string.
 * - Pass-through for already-formatted "YYYY-MM-DD" strings (per-user
 *   `targetDate` values).
 * - For Date / ISO timestamp values, use the browser's local date parts so the
 *   sheet renders on the same regional day the server stored it under.
 */
function toLocalDateISO(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Human "x s/min ago" relative formatting, refreshes via the parent's tick. */
function formatRelative(from: Date | null, now: number): string {
  if (!from) return 'never';
  const sec = Math.max(0, Math.floor((now - from.getTime()) / 1000));
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return from.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function DailySheetGlobalControls() {
  const {
    sheetId,
    sheetDate,
    isPosted,
    closingBalance,
    cashClosingBalance,
    onlineClosingBalance,
    targetDate,
    loading,
    lastSyncedAt,
    refreshSheet,
    closeSheet,
  } = useDailySheet();

  const [busy, setBusy] = useState<'close' | 'refresh' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  // Tick once a second so the "x s ago" indicator stays live without
  // forcing a context re-render every tick.
  const [tick, setTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const inBackdate = !!targetDate;
  const hasSheet = !!sheetId;

  const handleClose = async () => {
    setBusy('close');
    setError(null);
    const res = await closeSheet(sheetId ?? undefined);
    if (!res.ok) setError(res.error ?? 'Failed to close sheet');
    setBusy(null);
    setConfirmClose(false);
  };

  const handleRefresh = async () => {
    setBusy('refresh');
    setError(null);
    try {
      await refreshSheet();
    } finally {
      setBusy(null);
    }
  };

  // Color the sync dot by recency so users get an at-a-glance signal.
  const sinceMs = lastSyncedAt ? tick - lastSyncedAt.getTime() : Infinity;
  const syncTone =
    !lastSyncedAt
      ? { dot: 'bg-gray-400', ring: 'ring-gray-200', text: 'text-gray-500' }
      : sinceMs < 10_000
      ? { dot: 'bg-emerald-500', ring: 'ring-emerald-200', text: 'text-emerald-700' }
      : sinceMs < 60_000
      ? { dot: 'bg-emerald-500', ring: 'ring-emerald-200', text: 'text-gray-600' }
      : sinceMs < 5 * 60_000
      ? { dot: 'bg-amber-500', ring: 'ring-amber-200', text: 'text-amber-700' }
      : { dot: 'bg-rose-500', ring: 'ring-rose-200', text: 'text-rose-700' };

  return (
    <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
      {/* ── Status cluster (left) ── */}
      <div className="flex flex-wrap items-center gap-2">

        {/* Sheet status pill */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${hasSheet}-${isPosted}-${sheetDate}`}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.18 }}
            className={[
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide',
              !hasSheet && 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
              hasSheet && !isPosted && 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
              hasSheet && isPosted && 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {!hasSheet && <AlertCircle size={12} />}
            {hasSheet && !isPosted && <Unlock size={12} />}
            {hasSheet && isPosted && <Lock size={12} />}
            <span>{!hasSheet ? 'Awaiting Entry' : isPosted ? 'Closed' : 'Open'}</span>
          </motion.div>
        </AnimatePresence>

        {/* Date label */}
        {(() => {
          // Prefer the per-user `targetDate` (already a YYYY-MM-DD string).
          // Otherwise normalize the sheet's stored date to the local day.
          const iso = targetDate ?? toLocalDateISO(sheetDate);
          if (!iso) return null;
          const today = todayISO();
          const isBackdate = iso !== today;
          return (
            <span className="hidden text-xs text-gray-500 sm:inline">
              <span
                className={
                  isBackdate
                    ? 'mr-1 font-semibold text-amber-700'
                    : 'mr-1 font-semibold text-emerald-700'
                }
              >
                {isBackdate ? 'Backdate ·' : 'Today ·'}
              </span>
              {fmtDate(iso)}
            </span>
          );
        })()}

        {/* Closing balance preview when a sheet exists.
            The running closing balance is the single most important glance value
            on a finance screen, so it stays visible on every breakpoint; only
            the cash/online split collapses on narrow screens. */}
        {hasSheet && (
          <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600 ring-1 ring-gray-200">
            <span className="uppercase tracking-wide text-gray-500">Closing</span>
            <span className="font-semibold text-gray-800">{closingBalance.toLocaleString()}</span>
            <span className="hidden items-center gap-1 lg:inline-flex">
              <span className="text-gray-400">·</span>
              <span className="text-gray-500">Cash</span>
              <span className="font-semibold text-gray-800">{cashClosingBalance.toLocaleString()}</span>
              <span className="text-gray-400">/</span>
              <span className="text-gray-500">Online</span>
              <span className="font-semibold text-gray-800">{onlineClosingBalance.toLocaleString()}</span>
            </span>
          </span>
        )}
      </div>

      {/* ── Action cluster (right) ── */}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {/* Last synced indicator (driven by the polling queue's onSync hook) */}
        <span
          title={
            lastSyncedAt
              ? `Last synced at ${lastSyncedAt.toLocaleTimeString('en-PK', { hour12: true })}`
              : 'Awaiting first sync'
          }
          className={`inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] ring-1 ${syncTone.ring} ${syncTone.text}`}
        >
          <span className="relative flex h-2 w-2">
            <AnimatePresence>
              {sinceMs < 10_000 && lastSyncedAt && (
                <motion.span
                  key="sync-pulse"
                  className={`absolute inline-flex h-full w-full rounded-full ${syncTone.dot} opacity-75`}
                  animate={{ scale: [1, 2.2], opacity: [0.7, 0] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
                />
              )}
            </AnimatePresence>
            <span className={`relative inline-flex h-2 w-2 rounded-full ${syncTone.dot}`} />
          </span>
          <span className="hidden sm:inline">Synced</span>
          <span className="font-medium">{formatRelative(lastSyncedAt, tick)}</span>
        </span>

        {/* Manual refresh */}
        <button
          type="button"
          onClick={handleRefresh}
          disabled={busy !== null || loading}
          title="Refresh all data"
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          <RefreshCw
            size={14}
            className={busy === 'refresh' || loading ? 'animate-spin' : ''}
          />
          <span className="hidden sm:inline">Refresh</span>
        </button>

        {/* Close Daily Sheet (with two-step confirm). Open is auto-triggered
            on first slip/expense — no explicit Open button anymore. */}
        {hasSheet && !isPosted && !inBackdate && !confirmClose && (
          <button
            type="button"
            onClick={() => setConfirmClose(true)}
            disabled={busy !== null || loading}
            className="inline-flex items-center gap-1.5 rounded-md border border-rose-600 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50 disabled:opacity-60"
          >
            <Lock size={14} />
            Close Sheet
          </button>
        )}

        {hasSheet && !isPosted && !inBackdate && confirmClose && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setConfirmClose(false)}
              disabled={busy !== null}
              className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClose}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-600 bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-rose-700 disabled:opacity-60"
            >
              {busy === 'close' ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
              Confirm Close
            </button>
          </div>
        )}

        {/* Subtle divider */}
        <span className="hidden h-5 w-px bg-gray-200 sm:inline-block" aria-hidden />

        {/* Monthly stream controls (Open Month / Close Month + streaming pulse) */}
        <DailySheetMonthOpenClose />

      </div>

      {/* Error toast — spans the full row so it never collides with the actions */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="basis-full rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs text-rose-700"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
