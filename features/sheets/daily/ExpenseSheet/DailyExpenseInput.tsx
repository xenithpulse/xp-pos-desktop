'use client';

import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import * as U from './utils';
import { CASH_WITHDRAWL_CATEGORY, CASH_WITHDRAWL_DESCRIPTION } from './utils';
import SlipEntriesSection from './SlipEntriesSection';
import ExpenseEntryForm from './ExpenseEntryForm';
import { useSession } from 'next-auth/react';
import { UnusedSlipsSection } from './UnUsedClipSection';
import BackdateSelector from '../BackdateSelector';
import { Loader } from 'lucide-react';
import { motion, animate, useReducedMotion, AnimatePresence, Variants } from 'framer-motion';
import { useDailySheet } from '../DailySheetContext';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import OpenDayGate from './OpenDayGate';

type AnimatedNumberProps = { value: number; duration?: number; className?: string; format?: (v: number) => string };

function AnimatedNumber({ value, duration = 0.8, format = (v) => v.toLocaleString() }: AnimatedNumberProps) {
  const prefersReduced = useReducedMotion();
  const [display, setDisplay] = useState<number>(prefersReduced ? value : 0);

  useEffect(() => {
    if (prefersReduced) {
      setDisplay(value);
      return;
    }
    const controls = animate(display, value, {
      duration,
      onUpdate(v) {
        setDisplay(Math.round(v));
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, prefersReduced]);

  return <>{format(display)}</>;
}

/**
 * Tailwind tokens grouped per card variant. Inlined as a record so every
 * SummaryCard renders the SAME structure with only color tokens swapped —
 * keeps the four cards visually uniform and trivially extensible.
 */
type SummaryVariant = 'neutral' | 'income' | 'expense' | 'closing';

const SUMMARY_VARIANTS: Record<SummaryVariant, {
  card: string;
  title: string;
  value: string;
  pillRing: string;
  pillValue: string;
}> = {
  neutral: {
    card: 'border-gray-100 bg-gray-50/60',
    title: 'text-gray-500',
    value: 'text-gray-800',
    pillRing: 'ring-gray-200',
    pillValue: 'text-gray-800',
  },
  income: {
    card: 'border-emerald-100 bg-emerald-50/40',
    title: 'text-emerald-700',
    value: 'text-emerald-700',
    pillRing: 'ring-emerald-100',
    pillValue: 'text-emerald-700',
  },
  expense: {
    card: 'border-rose-100 bg-rose-50/40',
    title: 'text-rose-700',
    value: 'text-rose-700',
    pillRing: 'ring-rose-100',
    pillValue: 'text-rose-700',
  },
  closing: {
    card: 'border-blue-100 bg-blue-50/40',
    title: 'text-blue-700',
    value: 'text-blue-700',
    pillRing: 'ring-blue-100',
    pillValue: 'text-blue-700',
  },
};

type SummaryPill = { label: string; value: number };

interface SummaryCardProps {
  variant: SummaryVariant;
  title: string;
  total: number;
  pills: SummaryPill[];      // Cash + Online breakdown (cheque folded into cash)
  caption: string;
}

function SummaryCard({ variant, title, total, pills, caption }: SummaryCardProps) {
  const v = SUMMARY_VARIANTS[variant];
  return (
    <div className={`flex flex-col rounded-lg border p-3 ${v.card}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${v.title}`}>
          {title}
        </span>
        <span className={`text-xl font-bold ${v.value}`}>
          <AnimatedNumber value={total} />
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {pills.map((p) => (
          <div
            key={p.label}
            className={`flex flex-col items-center rounded-md bg-white/80 px-1 py-1 ring-1 ${v.pillRing}`}
          >
            <span className="text-[9px] uppercase text-gray-500">{p.label}</span>
            <span className={`text-xs font-semibold ${v.pillValue}`}>
              <AnimatedNumber value={p.value} />
            </span>
          </div>
        ))}
      </div>
      <span className="mt-auto pt-2 text-[10px] text-gray-400">{caption}</span>
    </div>
  );
}

const fadeSlide: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.44, ease: [0.2, 0.8, 0.2, 1] } },
};

const containerStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};

const expenseCategoriesFallback = [
  'Food', 'Utilities', 'Decorations', 'Staff', 'Entertainment',
  'Maintenance', 'Miscellaneous', 'Vendors Payment', 'Office Expense',
  'Salaries', 'Inventory', 'Cash Withdrawl',
];

export default function DailySheetInput() {
  const { data: session } = useSession();
  const user = session?.user.name || '';
  const expenseCategories = expenseCategoriesFallback;

  // ── Shared context — single source of truth ──
  const {
    sheetId,
    slipEntries,
    expenses: expensesList,
    openingBalance,
    cashOpeningBalance,
    onlineOpeningBalance,
    totalIncome,
    totalExpense,
    closingBalance,
    loading: contextLoading,
    availableSlips,
    loadingSlips,
    targetDate,
    refreshSheet,
    setExpensesFromServer,
    reloadAvailableSlips,
    setAvailableSlips,
    notifySlipMutation,
    setSlipEntries,
    setTargetDate,
  } = useDailySheet();

  // ── Form-only local state ──
  const [formData, setFormData] = useState({ category: '', description: '', amount: '', paymentMethod: 'cash' as 'cash' | 'online' });
  const [selectedCopy, setSelectedCopy] = useState('');
  const [selectedUnique, setSelectedUnique] = useState('');
  const [slipError, setSlipError] = useState<string | null>(null);
  const [loadingExpense, setLoadingExpense] = useState(false);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [expenseSuccess, setExpenseSuccess] = useState<string | null>(null);
  const [addingSlip, setAddingSlip] = useState(false);

  // ── Derived from context's availableSlips — no separate state needed ──
  const copyNumbers = useMemo(
    () => [...new Set(availableSlips.map((s) => s.copyNumber))],
    [availableSlips],
  );

  const uniqueNumbers = useMemo(
    () =>
      selectedCopy
        ? availableSlips.filter((s) => s.copyNumber === selectedCopy).map((s) => s.uniqueNumber)
        : [],
    [selectedCopy, availableSlips],
  );

  // Reset unique selection when copy changes or slips reload
  useEffect(() => {
    setSelectedUnique('');
  }, [selectedCopy, availableSlips]);

  // ── Per-payment-method breakdowns derived from authoritative data ──
  // Cheque is intentionally folded into the cash bucket: this business treats
  // a deposited cheque the same as cash on hand for daily-sheet reconciliation,
  // so the UI exposes only cash + online totals.
  const incomeByMethod = useMemo(() => {
    const acc = { cash: 0, online: 0 };
    for (const s of slipEntries) {
      const pm = (s.paymentMethod ?? 'cash').toString().toLowerCase();
      const bucket: 'cash' | 'online' = pm === 'online' ? 'online' : 'cash';
      acc[bucket] += Number(s.amount) || 0;
    }
    return acc;
  }, [slipEntries]);

  const paymentByMethod = useMemo(() => {
    const acc = { cash: 0, online: 0 };
    for (const e of expensesList) {
      const pm = (e.paymentMethod ?? 'cash').toString().toLowerCase();
      const bucket: 'cash' | 'online' = pm === 'online' ? 'online' : 'cash';
      acc[bucket] += Number(e.amount) || 0;
    }
    return acc;
  }, [expensesList]);

  // Per-method closing balances mirror the totals card formula
  // (open + income − expense) but split by payment method.
  const closingByMethod = useMemo(() => ({  
    cash: cashOpeningBalance + incomeByMethod.cash - paymentByMethod.cash,
    online: onlineOpeningBalance + incomeByMethod.online - paymentByMethod.online,
  }), [cashOpeningBalance, onlineOpeningBalance, incomeByMethod, paymentByMethod]);

  // ── Handlers ──

  const handleAddSlip = async () => {
    if (addingSlip || contextLoading) return;
    setSlipError(null);
    setAddingSlip(true);

    const slip = availableSlips.find(
      (s) => s.copyNumber === selectedCopy && s.uniqueNumber === selectedUnique,
    );
    if (!slip) {
      setSlipError('Slip not found.');
      setAddingSlip(false);
      return;
    }

    // Snapshot for rollback
    const prevSlipEntries = [...slipEntries];
    const prevAvailable = [...availableSlips];

    // Optimistic: add to slip entries + remove from available immediately
    const slipPaymentMethod = ((): 'cash' | 'cheque' | 'online' => {
      const pm = (slip.paymentMethod ?? 'cash').toString().toLowerCase();
      return (['cash', 'online'] as const).includes(pm as 'cash' | 'online')
        ? (pm as 'cash' | 'online')
        : 'cash';
    })();
    const newEntry = {
      _id: slip._id,
      copyNumber: slip.copyNumber,
      uniqueNumber: slip.uniqueNumber,
      amount: slip.amount,
      description: slip.description,
      paymentMethod: slipPaymentMethod,
      bookings: Array.isArray(slip.addedToContract)
        ? slip.addedToContract.map((b) => ({
            bookingId: b?.bookingId ? String(b.bookingId) : undefined,
            clientName: b?.clientName ?? '',
            bookingUniqueId: b?.bookingUniqueId ?? '',
            eventTimeAndDate: b?.eventTimeAndDate ?? '',
            hallArea: b?.hallArea ?? '',
            guest: Number(b?.guest ?? 0),
          }))
        : [],
    };
    setSlipEntries([...slipEntries, newEntry]);
    setAvailableSlips((prev) => prev.filter((s) => s._id !== slip._id));
    setSelectedCopy('');
    setSelectedUnique('');

    // Track which step we're in so we can write a meaningful error message
    // — a 409 from step 1 means the slip was claimed by another tab/user, but
    // a 409 from step 2 (atomic-push) means the SHEET itself rejected the
    // write (closed, missing-for-backdate, or another open sheet exists).
    let stage: 'mark-used' | 'sync-sheet' = 'mark-used';
    let slipMarkedUsed = false;

    try {
      // 1. Atomically mark slip used — server rejects with 409 if already claimed
      const usedAtDate = targetDate
        ? new Date(targetDate + 'T12:00:00').toISOString()   // local noon of the backdated day
        : new Date().toISOString();
      await axios.put(`/api/cash-slips/${slip._id}`, {
        used: true,
        usedBy: user,
        usedAt: usedAtDate,
        ...(targetDate && { isBackdated: true }),
      });
      slipMarkedUsed = true;

      // 2. Sync to daily sheet — pass openingBalance from context to avoid redundant API call
      stage = 'sync-sheet';
      await U.syncSlipEntry(newEntry, openingBalance, targetDate ?? undefined);

      // 3. Refresh for authoritative state (silent background)
      await refreshSheet();
      notifySlipMutation();
    } catch (err) {
      console.error('handleAddSlip failed:', err);
      // Rollback optimistic changes
      setSlipEntries(prevSlipEntries);
      setAvailableSlips(prevAvailable);

      const axErr = err as {
        response?: { status?: number; data?: { error?: string; message?: string } };
      };
      const status = axErr?.response?.status;
      const code = axErr?.response?.data?.error;
      const serverMsg = axErr?.response?.data?.message;

      // Decide message based on which step failed.
      if (stage === 'mark-used' && status === 409) {
        // True race: a different writer claimed the slip between fetch and PUT.
        setSlipError('Slip was already claimed by another user. Refreshing...');
        await refreshSheet();
      } else if (stage === 'sync-sheet' && status === 409) {
        // The atomic-push rejected for a sheet-level reason. Surface the
        // actual cause so the user knows what to do (open a backdate, etc.)
        // and undo the slip's used flag so it can be reused.
        if (code === 'OPEN_SHEET_EXISTS') {
          // Auto-recover: the server told us which date the open sheet is on.
          // Pin the context to that date so the next attempt routes correctly,
          // and surface a clear "we switched you over" message instead of the
          // misleading "close it first" instruction (the user IS the only user).
          const openSheetDate = axErr?.response?.data as
            | { openSheetDate?: string }
            | undefined;
          const isoStr =
            typeof openSheetDate?.openSheetDate === 'string'
              ? openSheetDate.openSheetDate.slice(0, 10)
              : null;
          if (isoStr) {
            setSlipError(`Switched to the open sheet (${isoStr}). Please add the slip again.`);
            setTargetDate(isoStr);
          } else {
            setSlipError(serverMsg || 'An older sheet is still open. Close it before starting today.');
          }
          if (slipMarkedUsed) {
            try {
              await axios.put(`/api/cash-slips/${slip._id}`, { used: false, usedBy: '', usedAt: '' });
            } catch (rollbackErr) {
              console.error('Slip rollback failed:', rollbackErr);
            }
          }
          await refreshSheet();
          return;
        }
        const msg = code === 'SHEET_CLOSED'
          ? (serverMsg || 'This daily sheet is closed. Reopen the sheet or use the backdate flow.')
          : code === 'NO_SHEET_FOR_DATE'
            ? (serverMsg || 'No daily sheet exists for this date. Use the backdate flow to create one.')
            : code === 'NO_ACTIVE_MONTHLY'
              ? (serverMsg || 'No active monthly sheet. Open the active month first.')
              : (serverMsg || 'Could not add slip to sheet.');
        setSlipError(msg);
        if (slipMarkedUsed) {
          try {
            await axios.put(`/api/cash-slips/${slip._id}`, { used: false, usedBy: '', usedAt: '' });
          } catch (rollbackErr) {
            console.error('Slip rollback failed:', rollbackErr);
          }
        }
        await refreshSheet();
      } else {
        setSlipError(serverMsg || 'Could not add slip.');
        if (slipMarkedUsed) {
          try {
            await axios.put(`/api/cash-slips/${slip._id}`, { used: false, usedBy: '', usedAt: '' });
          } catch (rollbackErr) {
            console.error('Slip rollback failed:', rollbackErr);
          }
        }
      }
    } finally {
      setAddingSlip(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setExpenseError(null);
    setExpenseSuccess(null);

    if (!formData.category) {
      setExpenseError('Select a category.');
      return;
    }

    const amt = Number(formData.amount);
    if (!amt || amt <= 0) {
      setExpenseError('Enter a valid amount.');
      return;
    }

    // Cash Withdrawl mirrors itself onto slipEntries when the voucher is later
    // posted (handled in DailyExpenseList → useVoucherQueue). Force the canonical
    // description and cash payment here so the eventual mirror stays consistent.
    const isCashWithdrawl = formData.category === CASH_WITHDRAWL_CATEGORY;
    const submittedDescription = isCashWithdrawl
      ? (formData.description?.trim() || CASH_WITHDRAWL_DESCRIPTION)
      : formData.description;
    const submittedPaymentMethod: 'cash' | 'online' = isCashWithdrawl ? 'cash' : formData.paymentMethod;

    // Snapshot for rollback
    const prevExpenses = [...expensesList];
    const newEntry = { category: formData.category, description: submittedDescription, amount: amt, paymentMethod: submittedPaymentMethod };
    const localUpdated = [...expensesList, newEntry];

    // Optimistic: add to expenses + clear form immediately
    setExpensesFromServer(localUpdated as typeof expensesList);
    setFormData({ category: '', description: '', amount: '', paymentMethod: 'cash' });
    setExpenseSuccess('Recorded.');
    setLoadingExpense(true);

    try {
      const syncRes = await U.syncExpenses(localUpdated, openingBalance, targetDate ?? undefined);

      if (syncRes && Array.isArray(syncRes.entries)) {
        setExpensesFromServer(syncRes.entries);
      } else {
        await refreshSheet();
      }
    } catch (err) {
      console.error('handleSubmit failed:', err);
      // Rollback optimistic addition
      setExpensesFromServer(prevExpenses);
      setExpenseError('Failed to add expense — reverted.');
      setExpenseSuccess(null);
    } finally {
      setLoadingExpense(false);
    }
  };

  const controlsDisabled = loadingSlips || loadingExpense || contextLoading || addingSlip;
  // When no sheet exists for today (and we're not in backdate mode), the day
  // must be explicitly opened with an opening balance before any entry UI shows.
  const noSheet = !contextLoading && !sheetId && !targetDate;
  const slipEntriesCount = slipEntries.length;
  const slipEntriesTotal = slipEntries.reduce((s, e) => s + (e.amount || 0), 0);

  return (
    <div className="flex lg:flex-row lg:space-x-2">
      <motion.div
        className="w-full lg:w-2/3 p-2 border border-gray-200 rounded-2xl space-y-3 transition-all duration-300 relative"
        initial="hidden"
        animate="show"
        variants={containerStagger}
      >
        {/* Backdate selector */}
        <motion.div variants={fadeSlide}>
          <BackdateSelector
            activeBackdate={targetDate}
            onBackdateCreated={(date, _sheetId) => {
              setTargetDate(date);
            }}
            onSwitchToToday={() => {
              setTargetDate(null);
            }}
          />
        </motion.div>

        {/* Loading overlay */}
        <AnimatePresence>
          {(contextLoading && loadingSlips) && (
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 rounded-2xl"
            >
              <div className="flex items-center gap-3">
                <Loader className="animate-spin" />
                <span className="text-sm font-medium">Loading data…</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {noSheet ? (
          <motion.div variants={fadeSlide}>
            <OpenDayGate />
          </motion.div>
        ) : (
        <>
        {/* Slip picker — restored to original layout (always visible, no toggle) */}
        <motion.div variants={fadeSlide} className="space-y-6 opacity-80">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-1">
            <div className="flex flex-col">
              <select
                value={selectedCopy}
                onChange={(e) => setSelectedCopy(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                disabled={controlsDisabled}
              >
                <option value="">Select Copy</option>
                {copyNumbers.map((copy) => (
                  <option key={copy} value={copy}>{copy}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <select
                value={selectedUnique}
                onChange={(e) => setSelectedUnique(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all duration-200"
                disabled={!selectedCopy || controlsDisabled}
              >
                <option value="">Select Unique</option>
                {uniqueNumbers.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={handleAddSlip}
                className="w-full px-4 py-2 bg-black text-white font-semibold rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all duration-200"
                disabled={!selectedCopy || !selectedUnique || controlsDisabled}
              >
                {addingSlip ? 'Adding…' : loadingSlips ? 'Loading slips…' : 'Add Slip'}
              </button>
            </div>
          </div>
          {slipError && <div className="text-red-600 text-sm p-2 rounded-md bg-red-50">{slipError}</div>}
        </motion.div>

        {/* Today's Slip Entries — minimised by default. Header preview shows
            count + total + a tiny strip of the most recent slip numbers so the
            user can verify activity without expanding. */}
        <motion.div variants={fadeSlide}>
          <CollapsibleSection
            title="Today&apos;s Cash Slip Entries"
            accent="emerald"
            storageKey="ds.slipEntries"
            defaultOpen={false}
            badge={slipEntriesCount ? String(slipEntriesCount) : 'empty'}
            summary={
              slipEntriesCount ? (
                <span className="flex italic font-bold items-center gap-2">
                  <span className="font-medium text-slate-700 tabular-nums">
                    ₨ {slipEntriesTotal.toLocaleString()}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="truncate">
                    {slipEntries
                      .slice(-6)
                      .map((s) => `${s.uniqueNumber}`)
                      .join(', ')}
                    {slipEntriesCount > 6 ? ` +${slipEntriesCount - 6} more` : ''}
                  </span>
                </span>
              ) : (
                'No slips added yet today.'
              )
            }
          >
            <SlipEntriesSection />
          </CollapsibleSection>
        </motion.div>

        {/* Financial Summary — collapsible. Header preview always shows the
            four key totals so the user can scan without expanding; the full
            per-payment-method breakdown lives inside. Defaults open. */}
        <motion.div variants={fadeSlide}>
          <CollapsibleSection
            title="Financial Summary"
            accent="indigo"
            storageKey="ds.summary"
            defaultOpen
            summary={
              <span className="flex italic font-bold flex-wrap items-center gap-x-3 gap-y-0.5 tabular-nums">
                <span>
                  <span className="text-slate-400">Open</span>{' '}
                  <span className="font-medium text-slate-700">
                    ₨ {openingBalance.toLocaleString()}
                  </span>
                </span>
                <span>
                  <span className="text-emerald-500">In</span>{' '}
                  <span className="font-medium text-emerald-700">
                    ₨ {totalIncome.toLocaleString()}
                  </span>
                </span>
                <span>
                  <span className="text-rose-500">Out</span>{' '}
                  <span className="font-medium text-rose-700">
                    ₨ {totalExpense.toLocaleString()}
                  </span>
                </span>
                <span>
                  <span className="text-slate-400">Close</span>{' '}
                  <span className="font-semibold text-slate-900">
                    ₨ {closingBalance.toLocaleString()}
                  </span>
                </span>
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard
                variant="neutral"
                title="Opening Balance"
                total={openingBalance}
                pills={[
                  { label: 'Cash', value: cashOpeningBalance },
                  { label: 'Online', value: onlineOpeningBalance },
                ]}
                caption="Carried forward"
              />

              <SummaryCard
                variant="income"
                title="Total Income"
                total={totalIncome}
                pills={[
                  { label: 'Cash', value: incomeByMethod.cash },
                  { label: 'Online', value: incomeByMethod.online },
                ]}
                caption="Slips received today"
              />

              <SummaryCard
                variant="expense"
                title="Total Expense"
                total={totalExpense}
                pills={[
                  { label: 'Cash', value: paymentByMethod.cash },
                  { label: 'Online', value: paymentByMethod.online },
                ]}
                caption="Vouchers + entries"
              />

              <SummaryCard
                variant="closing"
                title="Closing Balance"
                total={closingBalance}
                pills={[
                  { label: 'Cash', value: closingByMethod.cash },
                  { label: 'Online', value: closingByMethod.online },
                ]}
                caption="Open + Income − Expense"
              />
            </div>
          </CollapsibleSection>
        </motion.div>

        {/* Expense Form — single-line entry (always visible, no toggle). */}
        <motion.div variants={fadeSlide}>
          <ExpenseEntryForm
            formData={formData}
            setFormData={setFormData}
            expenseCategories={expenseCategories}
            loadingExpense={loadingExpense}
            expenseError={expenseError}
            expenseSuccess={expenseSuccess}
            handleSubmit={handleSubmit}
          />
        </motion.div>
        </>
        )}
      </motion.div>
      <UnusedSlipsSection />
    </div>
  );
}
