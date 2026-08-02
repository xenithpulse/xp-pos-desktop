'use client';

/**
 * OpenDayGate
 *
 * Shown on the Daily Input tab when no sheet exists for the day yet. Enforces
 * the "count the drawer, then open" flow: the cashier must confirm (or adjust)
 * the opening cash balance before the day's sheet is created — no slips or
 * expenses can be recorded until then.
 *
 * The cash field is prefilled with the amount carried forward from the prior
 * day's closing (fetched into context via /api/daily-sheet/opening-balance).
 * The cashier confirms it or overrides it with the physical drawer count; any
 * difference is surfaced as a variance. Online opening is not counted here — it
 * carries forward automatically.
 */
import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, Unlock, AlertCircle, ArrowRight } from 'lucide-react';
import { useDailySheet } from '../DailySheetContext';

function money(n: number): string {
  return (Number(n) || 0).toLocaleString();
}

export default function OpenDayGate() {
  const {
    cashOpeningBalance,
    onlineOpeningBalance,
    openSheet,
    loading,
  } = useDailySheet();

  const [cash, setCash] = useState<string>('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const carriedCash = Number(cashOpeningBalance) || 0;
  const carriedOnline = Number(onlineOpeningBalance) || 0;

  // Prefill with the carried-forward cash once context has it — unless the
  // cashier has already started typing (don't clobber their input on a refresh).
  useEffect(() => {
    if (!touched) setCash(carriedCash ? String(carriedCash) : '0');
  }, [carriedCash, touched]);

  const enteredCash = cash.trim() === '' ? 0 : Number(cash) || 0;
  const variance = enteredCash - carriedCash;
  const combined = enteredCash + carriedOnline;
  const invalid = cash.trim() === '' || Number.isNaN(Number(cash)) || enteredCash < 0;

  const handleOpen = async () => {
    if (invalid) {
      setError('Enter a valid opening cash amount.');
      return;
    }
    setBusy(true);
    setError(null);
    const res = await openSheet({
      cashOpeningBalance: enteredCash,
      onlineOpeningBalance: carriedOnline,
      openingBalance: combined,
    });
    if (!res.ok) {
      setError(res.error ?? 'Failed to open the day.');
      setBusy(false);
    }
    // On success the sheet loads via refreshSheet and this gate unmounts.
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mx-auto w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200">
          <Unlock size={18} />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Open Today&apos;s Sheet</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            Count the cash drawer and confirm the opening balance to start the day.
            Slips and expenses can be recorded once the day is open.
          </p>
        </div>
      </div>

      {/* Opening cash input */}
      <div className="mt-5">
        <label htmlFor="opening-cash" className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Opening Cash (drawer count)
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-400">₨</span>
          <input
            id="opening-cash"
            type="number"
            inputMode="numeric"
            min={0}
            value={cash}
            onChange={(e) => {
              setTouched(true);
              setCash(e.target.value);
              if (error) setError(null);
            }}
            disabled={busy}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-lg font-semibold tabular-nums text-gray-900 focus:border-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:opacity-60"
            placeholder="0"
          />
        </div>

        {/* Carried-forward reference + variance */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-gray-500">
            Carried forward:{' '}
            <span className="font-semibold text-gray-700 tabular-nums">₨ {money(carriedCash)}</span>
          </span>
          {variance !== 0 && !invalid && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums ${
                variance > 0
                  ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                  : 'bg-rose-50 text-rose-700 ring-1 ring-rose-200'
              }`}
            >
              {variance > 0 ? 'Over' : 'Short'} ₨ {money(Math.abs(variance))}
            </span>
          )}
        </div>
      </div>

      {/* Online (carried, read-only) + combined preview */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-100 bg-gray-50/70 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Online (carried)
          </div>
          <div className="mt-0.5 text-sm font-semibold text-gray-800 tabular-nums">
            ₨ {money(carriedOnline)}
          </div>
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">
            Total Opening
          </div>
          <div className="mt-0.5 text-sm font-bold text-blue-700 tabular-nums">
            ₨ {money(combined)}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* Action */}
      <button
        type="button"
        onClick={handleOpen}
        disabled={busy || loading || invalid}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Opening…
          </>
        ) : (
          <>
            Open Day with ₨ {money(combined)}
            <ArrowRight size={16} />
          </>
        )}
      </button>
    </motion.div>
  );
}
