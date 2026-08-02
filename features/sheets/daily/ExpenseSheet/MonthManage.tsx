"use client";

import React, { useEffect, useState, JSX } from "react";
import { createPortal } from "react-dom";
import { getActiveMonthly, openMonthly, closeMonthly, updateMonthlyDates, MonthlySheet } from "../../monthly/monthyAgent";
import { motion, AnimatePresence } from 'framer-motion';

// ── Month-window helpers ────────────────────────────────────────────────────
// The monthly sheet's [startDate, endDate] is the window that decides which
// daily sheets belong to it, so we surface how close the end is and constrain
// any edit to never drop an existing daily sheet.

/** Extract the YYYY-MM-DD day portion from an ISO date string. */
function toDayStr(iso?: string): string {
  return iso ? iso.slice(0, 10) : "";
}

/** Whole calendar days from today until the given end date (negative = past). */
function daysUntil(endIso?: string): number | null {
  const dayStr = toDayStr(endIso);
  if (!dayStr) return null;
  const [ey, em, ed] = dayStr.split("-").map(Number);
  if (!ey || !em || !ed) return null;
  const end = Date.UTC(ey, em - 1, ed);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((end - today) / 86400000);
}

/** Earliest / latest daily-sheet day string recorded on the month, if any. */
function dailyBounds(m: MonthlySheet | null): { earliest?: string; latest?: string } {
  const dates = (m?.dailySummaries ?? [])
    .map((d) => toDayStr(typeof d.date === "string" ? d.date : undefined))
    .filter(Boolean)
    .sort();
  return { earliest: dates[0], latest: dates[dates.length - 1] };
}

/** Threshold (in days) at which we flag the month's end as "near". */
const END_NEAR_DAYS = 3;

interface OpenForm {
  monthLabel: string;
  startDate: string;
  endDate: string;
  cashOpeningBalance: string;
  onlineOpeningBalance: string;
  notes: string;
}

function toNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function getErrMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return String(err);
  } catch {
    return "An unknown error occurred";
  }
}

export default function DailySheetMonthOpenClose(): JSX.Element {
  const [activeMonthly, setActiveMonthly] = useState<MonthlySheet | null>(null);
  const [isModalOpen, setModalOpen] = useState<boolean>(false);
  const [isCloseModalOpen, setCloseModalOpen] = useState<boolean>(false);
  const [isDatesModalOpen, setDatesModalOpen] = useState<boolean>(false);
  const [confirmValue, setConfirmValue] = useState<string>("");
  const [loadingOpen, setLoadingOpen] = useState<boolean>(false);
  const [loadingClose, setLoadingClose] = useState<boolean>(false);
  const [loadingDates, setLoadingDates] = useState<boolean>(false);
  const [datesForm, setDatesForm] = useState<{ startDate: string; endDate: string }>({
    startDate: "",
    endDate: "",
  });
  const [datesError, setDatesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<OpenForm>({
    monthLabel: "",
    startDate: "",
    endDate: "",
    cashOpeningBalance: "0",
    onlineOpeningBalance: "0",
    notes: "",
  });

  useEffect(() => {
    (async () => {
      try {
        console.info("[DailySheetMonthOpenClose] loading active monthly...");
        const m = await getActiveMonthly();
        if (m) {
          setActiveMonthly(m);
          console.info("[DailySheetMonthOpenClose] active monthly loaded:", m.monthLabel);
        }
      } catch (err: unknown) {
        console.error("[DailySheetMonthOpenClose] failed to load active monthly:", err);
        setError(getErrMessage(err) || "Failed to fetch active monthly");
      }
    })();
  }, []);

  async function handleOpen(e?: React.FormEvent): Promise<void> {
    if (e) e.preventDefault();
    setError(null);
    setLoadingOpen(true);
    try {
      if (!form.monthLabel || !form.startDate || !form.endDate) {
        setError("Please fill monthLabel, startDate and endDate");
        return;
      }

      console.info("[DailySheetMonthOpenClose] opening monthly:", form.monthLabel);
      const cashOpening = toNum(form.cashOpeningBalance);
      const onlineOpening = toNum(form.onlineOpeningBalance);
      const created = await openMonthly({
        monthLabel: form.monthLabel,
        startDate: form.startDate,
        endDate: form.endDate,
        openingBalance: cashOpening + onlineOpening,
        cashOpeningBalance: cashOpening,
        onlineOpeningBalance: onlineOpening,
        notes: form.notes || undefined,
      });

      setActiveMonthly(created);
      setModalOpen(false);
      console.info("[DailySheetMonthOpenClose] opened & streaming to:", created.monthLabel);
    } catch (err: unknown) {
      console.error("[DailySheetMonthOpenClose] open failed:", err);
      setError(getErrMessage(err) || "Failed to open monthly");
    } finally {
      setLoadingOpen(false);
    }
  }

  async function handleConfirmClose(): Promise<void> {
    if (!activeMonthly?._id || activeMonthly?.closingBalance == null) {
      setError("Active monthly sheet not found or closing balance is missing.");
      return;
    }

    const expectedValue = String(Math.round(activeMonthly.closingBalance));
    if (confirmValue.trim() !== expectedValue) {
      setError(`Confirmation failed. Please type the exact closing balance: ${expectedValue}`);
      return;
    }

    setError(null);
    setLoadingClose(true);

    try {
      console.info("[DailySheetMonthOpenClose] closing monthly:", activeMonthly._id);
      await closeMonthly(activeMonthly._id);
      setActiveMonthly(null);
      setCloseModalOpen(false);
      setConfirmValue("");
      console.info("[DailySheetMonthOpenClose] closed monthly successfully");
    } catch (err: unknown) {
      console.error("[DailySheetMonthOpenClose] close failed:", err);
      setError(getErrMessage(err) || "Failed to close monthly");
    } finally {
      setLoadingClose(false);
    }
  }

  function openDatesModal(): void {
    if (!activeMonthly) return;
    setDatesError(null);
    setDatesForm({
      startDate: toDayStr(activeMonthly.startDate),
      endDate: toDayStr(activeMonthly.endDate),
    });
    setDatesModalOpen(true);
  }

  async function handleSaveDates(e?: React.FormEvent): Promise<void> {
    if (e) e.preventDefault();
    if (!activeMonthly?._id) return;
    setDatesError(null);

    if (!datesForm.startDate || !datesForm.endDate) {
      setDatesError("Both start and end date are required.");
      return;
    }
    if (datesForm.startDate > datesForm.endDate) {
      setDatesError("Start date must be on or before end date.");
      return;
    }

    setLoadingDates(true);
    try {
      const updated = await updateMonthlyDates(activeMonthly._id, {
        startDate: datesForm.startDate,
        endDate: datesForm.endDate,
      });
      setActiveMonthly(updated);
      setDatesModalOpen(false);
    } catch (err: unknown) {
      setDatesError(getErrMessage(err) || "Failed to update dates");
    } finally {
      setLoadingDates(false);
    }
  }

  // Days until the active month's end date, and its daily-sheet bounds. These
  // drive the "end date near" mark and constrain the extend/edit inputs so a
  // shrink can never orphan an existing daily sheet.
  const endCountdown = activeMonthly ? daysUntil(activeMonthly.endDate) : null;
  const endIsNear = endCountdown !== null && endCountdown <= END_NEAR_DAYS;
  const endIsPast = endCountdown !== null && endCountdown < 0;
  const bounds = dailyBounds(activeMonthly);

  // Render modals into document.body so they aren't clipped or repositioned
  // by the top bar's stacking / overflow context.
  const portalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <div className="flex text-black/90 items-center gap-3">
      {/* Conditionally render the "Open Month" button */}
      {!activeMonthly && (
        <button
          onClick={() => setModalOpen(true)}
          className="px-3 py-2 rounded-md bg-sky-600 text-white text-sm hover:opacity-90"
        >
          Open Month
        </button>
      )}

      {/* Only show Close Month when there is an active month to close */}
      {activeMonthly && (
        <button
          onClick={() => {
            setCloseModalOpen(true);
            setError(null);
          }}
          disabled={loadingClose}
          className="px-3 py-2 rounded-md text-sm bg-rose-500 text-white hover:opacity-90 disabled:opacity-60"
        >
          {loadingClose ? "Closing..." : "Close Month"}
        </button>
      )}

      <div className="ml-2 text-sm">
        {activeMonthly ? (
          <span className="inline-flex items-center gap-1">
            <div className="flex items-center mr-2">
                <div className='relative flex items-center justify-center'>
                    <AnimatePresence>
                            <motion.span
                                key="polling-pulse-outer"
                                className="absolute w-3 h-3 rounded-full bg-green-400 opacity-75"
                                animate={{ scale: [1, 2.5], opacity: [1, 0] }}
                                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                            />
                    </AnimatePresence>
                    <motion.span
                        className={`w-2 h-2 rounded-full z-10 bg-green-600`}
                        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    />
                </div>
            </div>
              Streaming to <strong>{activeMonthly.monthLabel}</strong>

              {/* End-date-near mark: amber when the end is within a few days,
                  red once the window has already ended. */}
              {endCountdown !== null && (endIsNear || endIsPast) && (
                <span
                  title={`Month window ends ${toDayStr(activeMonthly.endDate)}`}
                  className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${
                    endIsPast
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      endIsPast ? "bg-rose-500" : "bg-amber-500"
                    }`}
                  />
                  {endIsPast
                    ? `Ended ${Math.abs(endCountdown)}d ago`
                    : endCountdown === 0
                      ? "Ends today"
                      : `Ends in ${endCountdown}d`}
                </span>
              )}

              <button
                type="button"
                onClick={openDatesModal}
                className="ml-2 px-2 py-0.5 rounded-md border border-slate-300 text-xs text-slate-700 hover:bg-slate-100"
              >
                Edit dates
              </button>
              </span>
            ) : (
              <span className="text-gray-500">Not streaming</span>
            )}
          </div>

      {/* Open Month Modal (portalled to body) */}
      {isModalOpen && portalTarget && createPortal(
        <div className="fixed text-black inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg bg-white rounded-lg p-6 shadow-lg">
            <h3 className="text-lg font-semibold mb-4">Open Monthly Sheet</h3>
            {error && <div className="text-rose-600 mb-2">{error}</div>}
            <form onSubmit={handleOpen} className="space-y-3">
              <div>
                <label className="block text-sm">Month Label</label>
                <input
                  className="mt-1 w-full p-2 border text-black rounded-md"
                  value={form.monthLabel}
                  onChange={(e) => setForm((s) => ({ ...s, monthLabel: e.target.value }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm">Start Date</label>
                  <input
                    type="date"
                    className="mt-1 w-full text-black p-2 border rounded-md"
                    value={form.startDate}
                    onChange={(e) => setForm((s) => ({ ...s, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm">End Date</label>
                  <input
                    type="date"
                    className="mt-1 w-full text-black p-2 border rounded-md"
                    value={form.endDate}
                    onChange={(e) => setForm((s) => ({ ...s, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Opening Balances</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500">Cash on Hand</label>
                    <input
                      type="number"
                      step="0.01"
                      className="mt-1 w-full text-black p-2 border rounded-md"
                      value={form.cashOpeningBalance}
                      onChange={(e) => setForm((s) => ({ ...s, cashOpeningBalance: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">Online / Bank</label>
                    <input
                      type="number"
                      step="0.01"
                      className="mt-1 w-full text-black p-2 border rounded-md"
                      value={form.onlineOpeningBalance}
                      onChange={(e) => setForm((s) => ({ ...s, onlineOpeningBalance: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-600 text-right">
                  Combined opening:&nbsp;
                  <strong>
                    {(toNum(form.cashOpeningBalance) + toNum(form.onlineOpeningBalance)).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={loadingOpen} className="px-3 py-2 rounded-md bg-sky-600 text-white">
                  {loadingOpen ? "Opening..." : "Open & Stream"}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="px-3 py-2 rounded-md border">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>,
        portalTarget
      )}

      {/* Close Month Confirmation Modal (portalled to body) */}
      {isCloseModalOpen && activeMonthly && portalTarget && createPortal(
        (() => {
          const expected = activeMonthly.closingBalance != null
            ? String(Math.round(activeMonthly.closingBalance))
            : "";
          const expectedFormatted = activeMonthly.closingBalance != null
            ? Math.round(activeMonthly.closingBalance).toLocaleString()
            : "N/A";
          const matches = expected !== "" && confirmValue.trim() === expected;

          return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-rose-50 to-rose-100 px-6 py-5 border-b border-rose-200">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-rose-100 border border-rose-300 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-rose-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-rose-900">Close Monthly Sheet</h3>
                      <p className="text-xs text-rose-700/80 mt-0.5">This will finalize <strong>{activeMonthly.monthLabel}</strong> and cannot be undone.</p>
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                  {/* Closing balance display */}
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Closing Balance</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
                      {expectedFormatted}
                    </div>
                  </div>

                  {/* Confirmation input */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">
                      Type the closing balance to confirm
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoFocus
                      placeholder={expected}
                      className={`w-full px-3 py-2.5 text-black border rounded-lg text-center font-mono text-lg tabular-nums transition-colors outline-none ${
                        confirmValue === ""
                          ? "border-slate-300 focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                          : matches
                            ? "border-emerald-400 bg-emerald-50/50 focus:ring-2 focus:ring-emerald-100"
                            : "border-rose-300 bg-rose-50/50 focus:ring-2 focus:ring-rose-100"
                      }`}
                      value={confirmValue}
                      onChange={(e) => setConfirmValue(e.target.value.replace(/[^\d-]/g, ""))}
                    />
                    {confirmValue !== "" && !matches && (
                      <p className="mt-1.5 text-xs text-rose-600">Value does not match the closing balance.</p>
                    )}
                  </div>

                  {error && (
                    <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-xs">
                      {error}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCloseModalOpen(false);
                      setConfirmValue("");
                      setError(null);
                    }}
                    disabled={loadingClose}
                    className="px-4 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-60 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmClose}
                    disabled={loadingClose || !matches}
                    className={`px-4 py-2 rounded-md text-sm text-white font-medium shadow-sm transition-colors ${
                      matches && !loadingClose
                        ? "bg-rose-600 hover:bg-rose-700"
                        : "bg-slate-300 cursor-not-allowed"
                    }`}
                  >
                    {loadingClose ? "Closing..." : "Close Month"}
                  </button>
                </div>
              </motion.div>
            </div>
          );
        })(),
        portalTarget
      )}

      {/* Edit / Extend Dates Modal (portalled to body) */}
      {isDatesModalOpen && activeMonthly && portalTarget && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 text-black">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="w-full max-w-md bg-white rounded-xl shadow-2xl overflow-hidden border border-slate-200"
          >
            <div className="px-6 py-5 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">Edit month window</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Extend or adjust <strong>{activeMonthly.monthLabel}</strong>. The range must keep
                every daily sheet already inside it and must not overlap another month.
              </p>
            </div>

            <form onSubmit={handleSaveDates} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    // Can't start later than the earliest daily sheet, or it drops out of the month.
                    max={bounds.earliest || undefined}
                    className="w-full p-2 border border-slate-300 rounded-md text-black"
                    value={datesForm.startDate}
                    onChange={(e) => setDatesForm((s) => ({ ...s, startDate: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">End Date</label>
                  <input
                    type="date"
                    // Can't end earlier than the latest daily sheet already recorded.
                    min={bounds.latest || datesForm.startDate || undefined}
                    className="w-full p-2 border border-slate-300 rounded-md text-black"
                    value={datesForm.endDate}
                    onChange={(e) => setDatesForm((s) => ({ ...s, endDate: e.target.value }))}
                  />
                </div>
              </div>

              {(bounds.earliest || bounds.latest) && (
                <p className="text-[11px] text-slate-500">
                  Daily sheets recorded: {bounds.earliest ?? "—"} → {bounds.latest ?? "—"}
                </p>
              )}

              {datesError && (
                <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 text-xs">
                  {datesError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDatesModalOpen(false)}
                  disabled={loadingDates}
                  className="px-4 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loadingDates}
                  className="px-4 py-2 rounded-md text-sm text-white font-medium bg-sky-600 hover:bg-sky-700 disabled:opacity-60"
                >
                  {loadingDates ? "Saving..." : "Save Dates"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>,
        portalTarget
      )}
    </div>
  );
}