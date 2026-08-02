'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import { Calendar, AlertTriangle, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

interface BackdateInfo {
  lastSheetDate: string | null;
  gapDates: string[];
  todayHasSheet: boolean;
  // Active monthly window (YYYY-MM-DD). Present so that, during onboarding when
  // no daily sheets exist yet, the user can pick a custom start date bounded by
  // the month they opened. Null when no monthly sheet is active.
  monthLabel?: string | null;
  monthStartDate?: string | null;
  monthEndDate?: string | null;
}

interface Props {
  /** Called after a backdated sheet is successfully created — parent should switch context to that date */
  onBackdateCreated: (date: string, sheetId: string) => void;
  /** Called when user clicks "Switch to Today" */
  onSwitchToToday: () => void;
  /** Currently active target date (YYYY-MM-DD); null or today = normal mode */
  activeBackdate: string | null;
}

type Phase = 'idle' | 'loading' | 'creating' | 'confirming' | 'done' | 'error';

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function todayISO(): string {
  // Local (regional) calendar date — matches how the server keys its sheets.
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Yesterday (local) as YYYY-MM-DD — the latest date a backdated sheet may use. */
function yesterdayISO(): string {
  const [y, m, d] = todayISO().split('-').map(Number);
  const dt = new Date(y, m - 1, d - 1); // local, DST-safe
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** Smaller of two YYYY-MM-DD strings (ISO strings sort lexicographically). */
function minDay(a: string, b: string): string {
  return a < b ? a : b;
}

export default function BackdateSelector({ onBackdateCreated, onSwitchToToday, activeBackdate }: Props) {
  const [info, setInfo] = useState<BackdateInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchErr, setSwitchErr] = useState('');

  const handleSwitchToToday = useCallback(async () => {
    if (!activeBackdate || switching) return;
    const ok = window.confirm(
      `Close the backdated sheet for ${fmtDate(activeBackdate)} and switch to today?\n\n` +
        'Only one sheet can be open at a time. The backdated sheet will be marked as posted ' +
        '(read-only) and today\u2019s sheet will be activated.',
    );
    if (!ok) return;
    setSwitching(true);
    setSwitchErr('');
    try {
      const res = await axios.post('/api/daily-sheet/close', { date: activeBackdate });
      // 200 = closed, 409 with "already closed" is also fine
      if (res.status >= 200 && res.status < 300) {
        onSwitchToToday();
      }
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      const serverMsg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      if (status === 409 && /already closed/i.test(serverMsg ?? '')) {
        // Sheet already posted — just switch.
        onSwitchToToday();
      } else if (status === 404) {
        // No matching open sheet anymore — safe to switch.
        onSwitchToToday();
      } else {
        setSwitchErr(serverMsg ?? 'Failed to close backdated sheet.');
      }
    } finally {
      setSwitching(false);
    }
  }, [activeBackdate, onSwitchToToday, switching]);

  const fetchGapInfo = useCallback(async () => {
    setPhase('loading');
    setErrMsg('');
    try {
      const { data } = await axios.get<BackdateInfo>('/api/daily-sheet/backdate');
      setInfo(data);
      setPhase('idle');
    } catch {
      setErrMsg('Failed to load backdate info.');
      setPhase('error');
    }
  }, []);

  // Fetch gap info when component opens
  useEffect(() => {
    if (expanded) void fetchGapInfo();
  }, [expanded, fetchGapInfo]);

  const confirmCreate = () => {
    if (!selectedDate) return;
    setPhase('confirming');
  };

  const executeCreate = async () => {
    if (!selectedDate) return;
    setPhase('creating');
    setErrMsg('');
    try {
      const { data } = await axios.post('/api/daily-sheet/backdate', { date: selectedDate });
      setPhase('done');
      onBackdateCreated(selectedDate, data.sheet?._id ?? data.sheet?.id ?? '');
      // Auto-close after success
      setTimeout(() => {
        setExpanded(false);
        setPhase('idle');
        setSelectedDate(null);
      }, 1500);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Failed to create backdated sheet.';
      setErrMsg(msg);
      setPhase('error');
    }
  };

  const cancel = () => {
    setPhase('idle');
    setSelectedDate(null);
    setErrMsg('');
  };

  const hasGaps = info && info.gapDates.length > 0;
  const isBackdateActive = Boolean(activeBackdate && activeBackdate !== todayISO());

  // Onboarding case: no daily sheet exists yet, so there is no gap to derive
  // dates from. Offer a free-form date picker bounded by the active month.
  const noSheets = Boolean(info && info.lastSheetDate === null);
  const hasActiveMonth = Boolean(info?.monthStartDate && info?.monthEndDate);
  const customMin = info?.monthStartDate ?? undefined;
  // Latest selectable day: the month's end, but never later than yesterday
  // (a backdated sheet must be strictly in the past).
  const customMax =
    info?.monthEndDate ? minDay(info.monthEndDate, yesterdayISO()) : yesterdayISO();
  // If the month starts today/future there is no valid past date to pick.
  const customRangeInvalid = Boolean(customMin && customMin > customMax);

  return (
    <div className="relative">
      {/* Active backdate banner */}
      <AnimatePresence>
        {isBackdateActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-2 flex flex-col gap-1 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-amber-800 text-sm">
                <Calendar size={14} />
                <span>
                  Working on backdated sheet: <strong>{fmtDate(activeBackdate!)}</strong>
                </span>
              </div>
              <button
                onClick={handleSwitchToToday}
                disabled={switching}
                className="flex items-center gap-1 px-3 py-1 text-xs font-medium bg-black text-white rounded-full hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {switching ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Closing…
                  </>
                ) : (
                  <>
                    Close &amp; Switch to Today
                    <ArrowRight size={12} />
                  </>
                )}
              </button>
            </div>
            {switchErr && (
              <p className="text-[11px] text-red-600 pl-6">{switchErr}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      {!isBackdateActive && (
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className="flex border items-center italic gap-1.5 px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
        >
          <Calendar size={13} />
          <span>{expanded ? 'Close' : 'Backdate Daily Sheet'}</span>
        </button>
      )}

      {/* Panel */}
      <AnimatePresence>
        {expanded && !isBackdateActive && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-3 rounded-lg border border-gray-200 bg-white space-y-3">
              {/* Header */}
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-500 leading-relaxed">
                  {noSheets
                    ? 'No daily sheets yet. Pick a start date within the open month to create your first daily sheet. The opening balance is taken from the monthly opening balance.'
                    : "Select a missing date to create a backdated daily sheet. The opening balance will be automatically derived from the previous day's closing balance."}
                </p>
              </div>

              {/* Loading */}
              {phase === 'loading' && (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <Loader2 size={14} className="animate-spin" />
                  Checking for gaps…
                </div>
              )}

              {/* No gaps (only meaningful once at least one sheet exists) */}
              {phase === 'idle' && info && !hasGaps && !noSheets && (
                <p className="text-xs text-green-600 py-1">
                  <CheckCircle2 size={13} className="inline mr-1" />
                  No missing dates found. All days are covered.
                </p>
              )}

              {/* Onboarding: free-form custom start date within the open month */}
              {phase !== 'loading' && noSheets && phase !== 'done' && (
                <>
                  {!hasActiveMonth ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
                      No active monthly sheet. Open a month first, then choose the start date for your
                      first daily sheet.
                    </p>
                  ) : customRangeInvalid ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
                      The open month ({info!.monthLabel}) hasn&apos;t started yet. Use &ldquo;Open
                      Sheet&rdquo; for today instead.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-medium text-gray-600">
                        Start date{info!.monthLabel ? ` (within ${info!.monthLabel})` : ''}
                      </label>
                      <input
                        type="date"
                        min={customMin}
                        max={customMax}
                        value={selectedDate ?? ''}
                        onChange={(e) => {
                          setSelectedDate(e.target.value || null);
                          setPhase('idle');
                          setErrMsg('');
                        }}
                        className="w-full px-3 py-1.5 rounded-md text-xs text-gray-700 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-black/10"
                      />
                      <p className="text-[11px] text-gray-400">
                        Allowed: {fmtDate(customMin!)} → {fmtDate(customMax)}
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Date selection */}
              {phase !== 'loading' && hasGaps && phase !== 'done' && (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {info!.gapDates.map((d) => {
                      const active = selectedDate === d;
                      return (
                        <motion.button
                          key={d}
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setSelectedDate(d);
                            setPhase('idle');
                            setErrMsg('');
                          }}
                          className={`relative px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            active
                              ? 'text-white'
                              : 'text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId="backdatePill"
                              className="absolute inset-0 rounded-md bg-black"
                              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                            />
                          )}
                          <span className="relative z-10">{fmtDate(d)}</span>
                        </motion.button>
                      );
                    })}
                  </div>

                  {/* Last sheet info */}
                  {info!.lastSheetDate && (
                    <p className="text-[11px] text-gray-400">
                      Last sheet: {fmtDate(info!.lastSheetDate)}
                    </p>
                  )}
                </>
              )}

              {/* Confirm step */}
              <AnimatePresence mode="wait">
                {phase === 'confirming' && selectedDate && (
                  <motion.div
                    key="confirm"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="p-2.5 rounded-md bg-amber-50 border border-amber-200 space-y-2"
                  >
                    <p className="text-xs text-amber-800 font-medium">
                      Create a daily sheet backdated to <strong>{fmtDate(selectedDate)}</strong>?
                    </p>
                    <p className="text-[11px] text-amber-700 leading-relaxed">
                      This will set date, createdAt, and updatedAt to the selected date.
                      {noSheets
                        ? ' The opening balance will be taken from the monthly opening balance.'
                        : " The opening balance will be derived from the previous sheet's closing balance."}
                      {' '}This action cannot be undone easily.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={executeCreate}
                        className="px-3 py-1 text-xs font-medium bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
                      >
                        Confirm &amp; Create
                      </button>
                      <button
                        onClick={cancel}
                        className="px-3 py-1 text-xs font-medium text-gray-500 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}

                {phase === 'creating' && (
                  <motion.div
                    key="creating"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 text-xs text-gray-500 py-2"
                  >
                    <Loader2 size={14} className="animate-spin" />
                    Creating backdated sheet…
                  </motion.div>
                )}

                {phase === 'done' && (
                  <motion.div
                    key="done"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-center gap-2 text-xs text-green-600 py-2"
                  >
                    <CheckCircle2 size={14} />
                    Sheet created. Switching to {fmtDate(selectedDate!)}.
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error */}
              {errMsg && (
                <p className="text-xs text-red-600">{errMsg}</p>
              )}

              {/* Create button (when date selected but not yet confirming) */}
              {selectedDate && phase === 'idle' && (
                <button
                  onClick={confirmCreate}
                  className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-md hover:bg-gray-800 transition-colors"
                >
                  Create Sheet for {fmtDate(selectedDate)}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
