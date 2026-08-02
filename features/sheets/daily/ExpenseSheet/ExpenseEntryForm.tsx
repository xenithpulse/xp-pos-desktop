'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CASH_WITHDRAWL_CATEGORY, CASH_WITHDRAWL_DESCRIPTION } from './utils';

const PAYMENT_METHODS = ['cash', 'online'] as const;
type PaymentMethod = (typeof PAYMENT_METHODS)[number];

interface ExpenseEntryFormProps {
  formData: {
    category: string;
    description: string;
    amount: string;
    paymentMethod: PaymentMethod;
  };
  setFormData: React.Dispatch<
    React.SetStateAction<{
      category: string;
      description: string;
      amount: string;
      paymentMethod: PaymentMethod;
    }>
  >;
  expenseCategories: string[];
  loadingExpense: boolean;
  expenseError: string | null;
  expenseSuccess: string | null;
  handleSubmit: (e: React.FormEvent) => void;
  /** Optional inline create. When provided, the dropdown shows a
   *  `+ Add category "{query}"` row whenever the typed query has no
   *  case-insensitive match. Parent should POST to
   *  /api/tenant-config/expense-categories and refresh the tenant config. */
  onCreateCategory?: (name: string) => Promise<string | undefined>;
}

/* ── Amount to readable words ── */
function amountToWords(val: string): { formatted: string; words: string } | null {
  const n = Number(val);
  if (!val || !Number.isFinite(n) || n <= 0) return null;

  const formatted = n.toLocaleString('en-US');

  const parts: string[] = [];
  const units: [number, string][] = [
    [1_000_000_000, 'Billion'],
    [1_000_000, 'Million'],
    [1_000, 'Thousand'],
    [100, 'Hundred'],
  ];

  let rem = Math.floor(n);
  for (const [div, label] of units) {
    const q = Math.floor(rem / div);
    if (q > 0) {
      parts.push(`${q} ${label}`);
      rem -= q * div;
    }
  }
  if (rem > 0) parts.push(String(rem));

  // Decimal part
  const dec = n % 1;
  if (dec > 0) {
    const cents = Math.round(dec * 100);
    if (cents > 0) parts.push(`${cents}/100`);
  }

  const words = parts.join(', ');
  return { formatted, words };
}

/* ── Checkmark SVG path for the success tick ── */
const CheckPath = () => (
  <motion.path
    d="M5 13l4 4L19 7"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    initial={{ pathLength: 0 }}
    animate={{ pathLength: 1 }}
    transition={{ duration: 0.3, ease: 'easeOut' }}
  />
);

/* ── Spinner ring ── */
const Spinner = () => (
  <motion.svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    initial={{ rotate: 0 }}
    animate={{ rotate: 360 }}
    transition={{ repeat: Infinity, duration: 0.6, ease: 'linear' }}
  >
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" opacity={0.25} />
    <motion.circle
      cx="12" cy="12" r="10"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round"
      strokeDasharray="62.83"
      strokeDashoffset="48"
    />
  </motion.svg>
);

export default function ExpenseEntryForm({
  formData,
  setFormData,
  expenseCategories,
  loadingExpense,
  expenseError,
  expenseSuccess,
  handleSubmit,
  onCreateCategory,
}: ExpenseEntryFormProps) {
  // Search state
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Amount popover
  const [amountFocused, setAmountFocused] = useState(false);
  const amountInfo = useMemo(() => amountToWords(formData.amount), [formData.amount]);

  // Button visual phase: idle → loading → done → idle
  type BtnPhase = 'idle' | 'loading' | 'done';
  const [btnPhase, setBtnPhase] = useState<BtnPhase>('idle');
  const doneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drive btnPhase from parent loadingExpense + expenseSuccess
  useEffect(() => {
    if (loadingExpense) {
      setBtnPhase('loading');
    } else if (btnPhase === 'loading') {
      // loading just finished → show done checkmark
      setBtnPhase('done');
      doneTimerRef.current = setTimeout(() => setBtnPhase('idle'), 1200);
    }
    return () => { if (doneTimerRef.current) clearTimeout(doneTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingExpense]);

  // Reset to idle on error (skip done phase)
  useEffect(() => {
    if (expenseError) setBtnPhase('idle');
  }, [expenseError]);

  // Debounce search for smoother framer-motion experience
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  // Filtered list (top 42 matches)
  const filtered = useMemo(() => {
    if (!debouncedQuery) return expenseCategories.slice(0, 42);
    const q = debouncedQuery.toLowerCase();
    const starts = expenseCategories.filter((c) => c.toLowerCase().startsWith(q));
    const contains = expenseCategories.filter(
      (c) => !c.toLowerCase().startsWith(q) && c.toLowerCase().includes(q)
    );
    return [...starts, ...contains].slice(0, 42);
  }, [debouncedQuery, expenseCategories]);

  // Decide whether to surface the "+ Add" affordance: parent supplied a
  // creator AND the typed text doesn't exactly match any existing category.
  const trimmedQuery = query.trim();
  const showCreateRow =
    !!onCreateCategory &&
    !!trimmedQuery &&
    !expenseCategories.some(
      (c) => c.trim().toLowerCase() === trimmedQuery.toLowerCase()
    );
  const createRowIdx = showCreateRow ? filtered.length : -1;
  const totalRows = filtered.length + (showCreateRow ? 1 : 0);
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  async function handleCreateCategory() {
    if (!onCreateCategory || !trimmedQuery || creating) return;
    setCreating(true);
    setCreateErr(null);
    try {
      const created = await onCreateCategory(trimmedQuery);
      const name = created || trimmedQuery;
      pickCategory(name);
    } catch (e) {
      setCreateErr(e instanceof Error ? e.message : 'Failed to add');
    } finally {
      setCreating(false);
    }
  }

  // Close on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // keyboard nav
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, Math.max(totalRows - 1, 0)));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightIndex === createRowIdx) {
          void handleCreateCategory();
          return;
        }
        const pick = filtered[highlightIndex];
        if (pick) pickCategory(pick);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered, highlightIndex, totalRows, createRowIdx]);

  function pickCategory(cat: string) {
    setFormData((prev) => {
      // Special-case: "Cash Withdrawl" auto-fills description and forces cash payment.
      // Only overwrite description if the user hasn't typed something custom.
      if (cat === CASH_WITHDRAWL_CATEGORY) {
        const shouldFillDesc = !prev.description.trim() || prev.description === CASH_WITHDRAWL_DESCRIPTION;
        return {
          ...prev,
          category: cat,
          description: shouldFillDesc ? CASH_WITHDRAWL_DESCRIPTION : prev.description,
          paymentMethod: 'cash',
        };
      }
      return { ...prev, category: cat };
    });
    setQuery(cat);
    setOpen(false);
    inputRef.current?.blur();
  }

  // keep highlight index valid when filtered changes
  useEffect(() => setHighlightIndex(0), [filtered]);

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5">
      {/* Row 1: Category search (full width) */}
      <div className="relative" ref={containerRef}>
        <div
          className="flex items-center border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus-within:border-gray-400 transition-colors"
          onClick={() => {
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          <input
            ref={inputRef}
            placeholder="Search or pick category..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="w-full outline-none text-sm"
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls="expense-listbox"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setFormData((p) => ({ ...p, category: '' }));
                setOpen(true);
                inputRef.current?.focus();
              }}
              className="text-gray-400 hover:text-gray-600 text-sm px-1"
              aria-label="Clear"
            >
              ✕
            </button>
          )}
        </div>

        <AnimatePresence>
          {open && (
            <motion.ul
              id="expense-listbox"
              role="listbox"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="absolute z-50 mt-1.5 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
            >
              {filtered.length === 0 && !showCreateRow ? (
                <li className="p-3 text-sm text-gray-400">No results</li>
              ) : (
                <>
                  {filtered.map((c, idx) => {
                    const isHighlighted = idx === highlightIndex;
                    const isSelected = c === formData.category;
                    return (
                      <motion.li
                        key={c}
                        onClick={() => pickCategory(c)}
                        onMouseEnter={() => setHighlightIndex(idx)}
                        initial={false}
                        animate={{ backgroundColor: isHighlighted ? '#f9fafb' : '#ffffff' }}
                        className={`cursor-pointer px-3 py-2 flex justify-between items-center text-sm ${
                          isSelected ? 'font-semibold' : ''
                        }`}
                        role="option"
                        aria-selected={isSelected}
                      >
                        <span>{c}</span>
                        {isSelected && <span className="text-xs">✓</span>}
                      </motion.li>
                    );
                  })}
                  {showCreateRow && (
                    <li
                      onMouseDown={(e) => {
                        e.preventDefault();
                        void handleCreateCategory();
                      }}
                      onMouseEnter={() => setHighlightIndex(createRowIdx)}
                      role="option"
                      aria-selected={false}
                      className={`cursor-pointer px-3 py-2 text-sm flex items-center justify-between gap-2 border-t border-gray-100 ${
                        highlightIndex === createRowIdx
                          ? 'bg-emerald-50 text-emerald-800'
                          : 'text-emerald-700 hover:bg-emerald-50'
                      }`}
                      title={`Add category "${trimmedQuery}"`}
                    >
                      <span className="truncate">
                        <span className="mr-1 font-semibold">＋</span>
                        {creating ? 'Adding…' : `Add category "${trimmedQuery}"`}
                      </span>
                      {createErr && (
                        <span className="text-[10px] text-rose-600 shrink-0 truncate max-w-[55%]">
                          {createErr}
                        </span>
                      )}
                    </li>
                  )}
                </>
              )}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {/* Row 2: Description + Amount */}
      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Description"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400 transition-colors"
            required
          />
        </div>
        <div className="relative w-70">
          <input
            type="number"
            placeholder="Amount"
            value={formData.amount}
            onChange={(e) => setFormData((prev) => ({ ...prev, amount: e.target.value }))}
            onFocus={() => setAmountFocused(true)}
            onBlur={() => setAmountFocused(false)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-gray-400 transition-colors"
            required
          />
          <AnimatePresence>
            {amountFocused && amountInfo && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 right-0 top-full mt-1.5 z-40 rounded-lg bg-gray-900 text-white px-3 py-2 shadow-lg"
              >
                <p className="text-xs font-mono tracking-wide">{amountInfo.formatted}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{amountInfo.words}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Row 3: Payment pills | Submit + error */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <div className="flex gap-1.5" role="radiogroup" aria-label="Payment method">
          {PAYMENT_METHODS.map((m) => {
            const active = formData.paymentMethod === m;
            return (
              <motion.button
                key={m}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setFormData((prev) => ({ ...prev, paymentMethod: m }))}
                whileTap={{ scale: 0.93 }}
                className={`relative px-3.5 py-1 text-xs font-medium capitalize cursor-pointer select-none transition-colors duration-150 ${
                  active
                    ? 'text-white'
                    : 'text-gray-500 bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {/* Animated pill background */}
                {active && (
                  <motion.span
                    layoutId="paymentPill"
                    className="absolute inset-0 rounded-full bg-black"
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  />
                )}
                <span className="relative z-10">{m}</span>
              </motion.button>
            );
          })}
        </div>

        {/* Submit button with loading / checkmark phases */}
        <div className="flex items-center gap-3">
          <motion.button
            type="submit"
            disabled={btnPhase === 'loading'}
            whileTap={btnPhase === 'idle' ? { scale: 0.95 } : {}}
            className={`relative flex items-center justify-center gap-2 h-9 overflow-hidden text-sm font-medium transition-colors duration-200 ${
              btnPhase === 'done'
                ? 'bg-green-600 text-white px-5'
                : btnPhase === 'loading'
                  ? 'bg-gray-800 text-white px-5 cursor-wait'
                  : 'bg-black text-white px-5 hover:bg-gray-800 active:bg-gray-900'
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {btnPhase === 'loading' ? (
                <motion.span key="spin" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.12 }} className="flex items-center gap-1.5">
                  <Spinner />
                  <span>Adding…</span>
                </motion.span>
              ) : btnPhase === 'done' ? (
                <motion.span key="done" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.15 }} className="flex items-center gap-1">
                  <svg className="w-5 h-5" viewBox="0 0 24 24"><CheckPath /></svg>
                  <span>Added</span>
                </motion.span>
              ) : (
                <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.1 }}>
                  Add Expense
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          {/* Error / success text */}
          <AnimatePresence mode="wait">
            {expenseError && (
              <motion.span key="err" initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="text-sm text-red-600">{expenseError}</motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
    </form>
  );
}
