// pos_modules/orders/order-editor/PaymentDrawer.tsx
// Slide-up payment panel: what has been paid, what is left, and how to take it.
//
// Phase 16 §2.2/§2.3. The data model always supported split payments —
// `order.transactions` is an array and `add_payment` pushes onto it, each entry
// carrying its own method, label, amount and reference. What was missing was
// the interface: this drawer treated payment as one method for one amount, so
// "£20 cash, rest on card" had nowhere to go and nobody could see what had
// already been taken without leaving the screen.

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  X,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Users,
  Wallet,
} from 'lucide-react';
import { Order, PAYMENT_METHOD_LABELS } from '@/types/order.types';
import type { IPaymentMethodConfig } from '@/types/settings.types';
import { formatPrice } from '@/types/menu.types';
import { usePOSStore } from '@/stores/posStore';

interface PaymentDrawerProps {
  activeOrder: Order;
  show: boolean;
  onClose: () => void;

  /** Tenant-configured, enabled payment methods (ordered). */
  paymentMethods: IPaymentMethodConfig[];
  /** Selected method id. */
  paymentMethod: string;
  setPaymentMethod: (id: string) => void;
  paymentAmount: string;
  setPaymentAmount: (a: string) => void;
  paymentRef: string;
  setPaymentRef: (r: string) => void;

  isSubmitting: boolean;
  error: string | null;
  success: boolean;

  onSubmit: () => Promise<void>;
  /** Undo a payment already recorded on this order. */
  onRemovePayment?: (paymentId: string) => void | Promise<void>;
}

/** Round to cents. Splitting by N produces thirds; a bill must not. */
const toMoney = (n: number) => Math.round(n * 100) / 100;

export default function PaymentDrawer({
  activeOrder,
  show,
  onClose,
  paymentMethods,
  paymentMethod,
  setPaymentMethod,
  paymentAmount,
  setPaymentAmount,
  paymentRef,
  setPaymentRef,
  isSubmitting,
  error,
  success,
  onSubmit,
  onRemovePayment,
}: PaymentDrawerProps) {
  const currencySymbol =
    usePOSStore((s) => s.settings?.currencySymbol) || 'Rs.';

  // How many ways the bill is being split. Purely a calculator for the amount
  // field — each payment is still recorded on its own, with its own method.
  const [splitWays, setSplitWays] = useState(2);

  const selected = paymentMethods.find((m) => m.id === paymentMethod);
  const selectedLabel = selected?.label ?? 'Payment';

  const payments = activeOrder.transactions ?? [];
  const leftToPay = activeOrder.amountDue ?? 0;
  const isSettled = leftToPay <= 0;
  const enteredAmount = parseFloat(paymentAmount) || 0;
  const isClosed = activeOrder.status === 'completed';

  const canSubmit = !isSubmitting && !isSettled && enteredAmount > 0;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="border-t border-gray-800 bg-gray-900 overflow-hidden"
        >
          <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <CreditCard size={16} className="text-green-400" />
                Payment
              </h3>
              <button
                onClick={onClose}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-400 hover:text-white rounded hover:bg-gray-800"
              >
                <X size={14} />
                Close
              </button>
            </div>

            {/* ── Payments already taken ─────────────────────────────────
                Nobody could see this without leaving the screen. Each line
                is a real transaction with its own method, so a bill settled
                across two cards reads as two lines, not one blurred total. */}
            {payments.length > 0 && (
              <div className="rounded-lg border border-gray-800 bg-gray-950/60 overflow-hidden">
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-800">
                  Paid so far
                </div>
                <ul className="divide-y divide-gray-800">
                  {payments.map((tx, idx) => (
                    <li key={tx._id || idx} className="flex items-center gap-2 px-3 py-2">
                      <Wallet size={14} className="text-gray-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-200 truncate">
                          {/* The tenant's own method name, not the coarse
                              category — "JazzCash", not "Other". */}
                          {tx.methodLabel || PAYMENT_METHOD_LABELS[tx.method]}
                        </div>
                        {tx.reference && (
                          <div className="text-[11px] text-gray-500 truncate">
                            Ref {tx.reference}
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-semibold text-gray-100 shrink-0">
                        {formatPrice(tx.amount)}
                      </span>
                      {onRemovePayment && !isClosed && (
                        <button
                          onClick={() => onRemovePayment(tx._id)}
                          disabled={isSubmitting}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium text-red-400 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                          <Trash2 size={12} />
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center justify-between px-3 py-2 border-t border-gray-800 text-sm">
                  <span className="text-gray-400">Total Paid</span>
                  <span className="font-semibold text-gray-100">
                    {formatPrice(activeOrder.amountPaid ?? 0)}
                  </span>
                </div>
              </div>
            )}

            {/* ── Left to Pay ────────────────────────────────────────────
                The running figure. "Amount Due" was product vocabulary. */}
            <div
              className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
                isSettled
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-orange-500/10 border-orange-500/20'
              }`}
            >
              <span className={`text-sm ${isSettled ? 'text-green-300' : 'text-orange-300'}`}>
                Left to Pay
              </span>
              <span className={`text-lg font-bold ${isSettled ? 'text-green-400' : 'text-orange-400'}`}>
                {formatPrice(leftToPay)}
              </span>
            </div>

            {isSettled ? (
              /* Nothing owed. The control is disabled with the reason stated —
                 an accidental extra payment is a drawer discrepancy at close,
                 and by then whoever caused it has gone home. */
              <div className="flex items-start gap-2 px-3 py-3 rounded-lg bg-gray-800/60 border border-gray-700 text-sm text-gray-300">
                <CheckCircle2 size={16} className="text-green-400 mt-0.5 shrink-0" />
                <span>
                  This order is fully paid. To change what was taken, remove a
                  payment above and record it again.
                </span>
              </div>
            ) : (
              <>
                {/* Payment Method Selector — driven by tenant settings */}
                <div className="grid grid-cols-4 gap-2">
                  {paymentMethods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setPaymentMethod(m.id)}
                      className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-xs font-medium transition-all ${
                        paymentMethod === m.id
                          ? 'bg-green-600/20 border-green-500 text-green-400'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <span className="text-base leading-none">{m.icon || '•'}</span>
                      <span className="truncate max-w-full">{m.label}</span>
                    </button>
                  ))}
                </div>

                {/* Amount Input */}
                <div className="space-y-2">
                  <label className="text-xs text-gray-500 uppercase tracking-wider">
                    Amount
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full pl-11 pr-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-lg font-semibold focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                      min={0}
                      step={0.01}
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => setPaymentAmount(String(toMoney(leftToPay)))}
                      className="flex-1 py-1.5 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      All of It
                    </button>
                    <button
                      onClick={() => setPaymentAmount(String(toMoney(leftToPay / 2)))}
                      className="flex-1 py-1.5 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      Half
                    </button>
                    <button
                      onClick={() => setPaymentAmount('')}
                      className="flex-1 py-1.5 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      Type It
                    </button>
                  </div>

                  {/* Split evenly by N — the "table of four, separate cards"
                      case. It only fills the amount box; each share is still
                      taken as its own payment with its own method. */}
                  <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-gray-800/60 border border-gray-700">
                    <Users size={14} className="text-gray-500 shrink-0" />
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      Split evenly by
                    </span>
                    <div className="flex items-center gap-1">
                      {[2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => {
                            setSplitWays(n);
                            setPaymentAmount(String(toMoney(leftToPay / n)));
                          }}
                          className={`w-7 h-7 rounded text-xs font-semibold transition-colors ${
                            splitWays === n
                              ? 'bg-green-600 text-white'
                              : 'bg-gray-900 text-gray-400 hover:bg-gray-700 hover:text-white'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <span className="ml-auto text-xs text-gray-500 truncate">
                      {formatPrice(toMoney(leftToPay / splitWays))} each
                    </span>
                  </div>
                </div>

                {/* Reference — shown when the selected method requires one */}
                {selected?.requiresReference && (
                  <div className="space-y-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider">
                      Reference / Txn ID
                    </label>
                    <input
                      type="text"
                      value={paymentRef}
                      onChange={(e) => setPaymentRef(e.target.value)}
                      placeholder="Transaction reference..."
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500"
                    />
                  </div>
                )}
              </>
            )}

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
                <AlertTriangle size={14} />
                <span>{error}</span>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex items-center gap-2 px-3 py-2 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300 text-sm">
                <CheckCircle2 size={14} />
                <span>Payment recorded.</span>
              </div>
            )}

            {/* Submit */}
            {!isSettled && (
              <button
                onClick={onSubmit}
                disabled={!canSubmit}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-all ${
                  !canSubmit
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-600 to-emerald-600 text-white hover:from-green-500 hover:to-emerald-500 shadow-lg shadow-green-600/25'
                }`}
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 size={18} />
                )}
                <span className="hidden sm:inline">
                  Take {formatPrice(enteredAmount)} by {selectedLabel}
                </span>
                <span className="sm:hidden">
                  Take {formatPrice(enteredAmount)}
                </span>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
