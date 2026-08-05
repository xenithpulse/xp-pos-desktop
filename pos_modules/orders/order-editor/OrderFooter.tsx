// pos_modules/orders/order-editor/OrderFooter.tsx
// Totals, fire-to-kitchen, lifecycle actions, complete button

'use client';

import { useState } from 'react';
import {
  AlertTriangle,
  X,
  Check,
  Send,
  Ban,
  CheckCircle2,
  Printer,
  CreditCard,
  Building2,
  Wallet,
  Receipt,
  RotateCcw,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { ICart, formatPrice } from '@/types/menu.types';
import { Order, PAYMENT_METHOD_LABELS } from '@/types/order.types';
import type { IPaymentMethodConfig } from '@/types/settings.types';
import type { LifecycleAction } from './types';

interface OrderFooterProps {
  activeOrder: Order | null;
  cart: ICart;
  pendingTotal: number;

  // Commit
  handleCommitItems: () => Promise<void>;
  isCommitting: boolean;
  commitError: string | null;
  commitSuccess: boolean;
  setCommitError: (err: string | null) => void;
  setCommitSuccess: (ok: boolean) => void;
  handlePrintKOT: () => void;

  // Lifecycle
  lifecycleActions: LifecycleAction[];
  canCancel: boolean;
  handleLifecycleAction: (action: string) => Promise<void>;
  handleCancelOrder: () => Promise<void>;
  isPerformingAction: boolean;
  actionError: string | null;

  // Complete
  handleCompleteOrder: (methodId?: string, paidAmount?: number) => Promise<void>;
  paymentMethods: IPaymentMethodConfig[];
  isCompletingOrder: boolean;
  completeError: string | null;

  // Payment
  canPay: boolean;
  onOpenPayment: () => void;

  /** Put a closed order back into service. Omit to hide the control. */
  onReopenOrder?: () => Promise<void>;

  // Error management
  clearErrors: () => void;

  // Mobile
  onSwitchToCatalog?: () => void;
}

export default function OrderFooter({
  activeOrder,
  cart,
  pendingTotal,
  handleCommitItems,
  isCommitting,
  commitError,
  commitSuccess,
  setCommitError,
  setCommitSuccess,
  handlePrintKOT,
  lifecycleActions,
  canCancel,
  handleLifecycleAction,
  handleCancelOrder,
  isPerformingAction,
  actionError,
  handleCompleteOrder,
  paymentMethods,
  isCompletingOrder,
  completeError,
  canPay,
  onOpenPayment,
  onReopenOrder,
  clearErrors,
  onSwitchToCatalog,
}: OrderFooterProps) {
  // State for payment method selection on quick complete
  const [showPaymentSelect, setShowPaymentSelect] = useState(false);
  // Optional tendered/paid amount typed at complete-time (record-keeping).
  const [tendered, setTendered] = useState('');
  // Actions start OPEN. Collapsed-by-default hid the only controls on the
  // panel behind a 10px grey word, which on a busy till reads as "there is
  // nothing you can do here".
  const [showLifecycleActions, setShowLifecycleActions] = useState(true);
  const [confirmReopen, setConfirmReopen] = useState(false);

  const due = activeOrder?.amountDue ?? 0;
  const isClosed = activeOrder?.status === 'completed';
  const isFullyPaid = !!activeOrder && due <= 0 && (activeOrder.amountPaid ?? 0) > 0;
  const paymentCount = activeOrder?.transactions?.length ?? 0;
  const tenderedNum = parseFloat(tendered);
  const change = !isNaN(tenderedNum) && tenderedNum > due ? tenderedNum - due : 0;

  const handleQuickComplete = async (methodId: string) => {
    setShowPaymentSelect(false);
    const paid = parseFloat(tendered);
    await handleCompleteOrder(methodId, isNaN(paid) || paid <= 0 ? undefined : paid);
    setTendered('');
  };

  return (
    <div className="border-t border-gray-800 p-2 md:p-2.5 space-y-1 md:space-y-1.5">
      {/* ── Order totals ──────────────────────────────────────────────── */}
      {activeOrder && typeof activeOrder.grandTotal === 'number' && (
        <div className="space-y-1 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>Order Subtotal</span>
            <span>{formatPrice(activeOrder.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Tax</span>
            <span>{formatPrice(activeOrder.taxAmount)}</span>
          </div>
          {activeOrder.discountAmount > 0 && (
            <div className="flex justify-between text-green-400">
              <span>Discount</span>
              <span>-{formatPrice(activeOrder.discountAmount)}</span>
            </div>
          )}
          {/* ── Adjustments breakdown ─────────────────────────────────── */}
          {activeOrder.adjustments && activeOrder.adjustments.length > 0 && (
            <>
              {activeOrder.adjustments.map((adj) => {
                const isDeduction = adj.kind === 'discount';
                return (
                  <div
                    key={adj._id}
                    className={`flex justify-between text-xs ${
                      isDeduction ? 'text-green-400' : 'text-orange-400'
                    }`}
                  >
                    <span className="truncate pr-2">
                      {adj.name}
                      {adj.calcMode === 'percentage' && (
                        <span className="text-gray-500 ml-1">({adj.value}%)</span>
                      )}
                    </span>
                    <span className="flex-shrink-0">
                      {isDeduction ? '-' : '+'}{formatPrice(adj.computedAmount)}
                    </span>
                  </div>
                );
              })}
            </>
          )}
          <div className="flex justify-between text-white font-semibold text-base pt-1 border-t border-gray-800">
            <span>Grand Total</span>
            <span>{formatPrice(activeOrder.grandTotal)}</span>
          </div>
          {/* One line per payment, so a bill settled across two methods reads
              as two entries rather than a single blurred total (§2.2). */}
          {paymentCount > 0 && (
            <>
              {activeOrder.transactions.map((tx, idx) => (
                <div
                  key={tx._id || idx}
                  className="flex justify-between text-gray-400 text-xs"
                >
                  <span className="truncate pr-2">
                    Paid · {tx.methodLabel || PAYMENT_METHOD_LABELS[tx.method]}
                  </span>
                  <span className="flex-shrink-0">{formatPrice(tx.amount)}</span>
                </div>
              ))}
            </>
          )}
          {activeOrder.amountDue > 0 && (
            <div className="flex justify-between text-orange-400 text-sm font-medium">
              <span>Left to Pay</span>
              <span>{formatPrice(activeOrder.amountDue)}</span>
            </div>
          )}
          {isFullyPaid && activeOrder.status !== 'draft' && (
            <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-semibold pt-1">
              <CheckCircle2 size={14} />
              <span>Fully Paid</span>
            </div>
          )}
        </div>
      )}

      {/* ── Cart (new items) totals ───────────────────────────────────── */}
      {cart.items.length > 0 && (
        <div className="space-y-1 text-sm">
          {activeOrder && (
            <h4 className="text-xs font-semibold text-gray-500 uppercase">
              New Items
            </h4>
          )}
          <div className="flex justify-between text-gray-400">
            <span>Subtotal</span>
            <span>{formatPrice(cart.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Tax</span>
            <span>{formatPrice(cart.taxTotal)}</span>
          </div>
          <div className="flex justify-between text-white font-semibold text-lg pt-2 border-t border-gray-800">
            <span>Cart Total</span>
            <span>{formatPrice(cart.grandTotal)}</span>
          </div>
        </div>
      )}

      {cart.items.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-orange-500/20 border border-orange-500/30 rounded-lg text-orange-300 text-sm">
          <AlertTriangle size={14} />
          <span>{cart.items.length} items in cart</span>
          <span className="ml-auto font-medium">
            {formatPrice(pendingTotal)}
          </span>
        </div>
      )}

      {/* ── Errors ────────────────────────────────────────────────────── */}
      {(commitError || actionError || completeError) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-red-300 text-sm">
          <AlertTriangle size={14} />
          <span className="flex-1">
            {commitError || actionError || completeError}
          </span>
          <button onClick={clearErrors} className="text-red-400 hover:text-red-200">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Commit success toast ──────────────────────────────────────── */}
      {commitSuccess && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/20 border border-green-500/30 rounded-lg text-green-300 text-sm">
          <Check size={14} />
          <span className="flex-1">Items sent to kitchen!</span>
          <button
            onClick={handlePrintKOT}
            className="flex items-center gap-1 px-2 py-1 bg-green-500/30 hover:bg-green-500/50 rounded text-green-200 text-xs font-medium transition-colors"
          >
            <Printer size={12} />
            Print Kitchen Ticket
          </button>
        </div>
      )}

      {/* ── Send to Kitchen — only visible when cart has items ─────────── */}
      {cart.items.length > 0 && (
        <button
          onClick={handleCommitItems}
          disabled={isCommitting}
          className="w-full flex items-center justify-center gap-1.5 md:gap-2 py-2 md:py-2.5 rounded-lg font-semibold text-xs md:text-sm transition-all bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-400 hover:to-red-400 shadow-lg shadow-orange-500/25"
        >
          {isCommitting ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={14} className="md:w-4 md:h-4" />
          )}
          <span className="hidden sm:inline">Send to Kitchen</span>
          <span className="sm:hidden">Send</span>
        </button>
      )}

      {/* ── Reopen a closed order ─────────────────────────────────────────
          A closed order used to be the end of the road: no controls, and if it
          still held a table, no way to free it either. Reopening puts it back
          to Served, hands the table back, and returns the stock `complete`
          deducted so closing it again does not deduct twice. */}
      {isClosed && onReopenOrder && (
        <div className="space-y-1.5">
          {confirmReopen ? (
            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-2">
              <p className="text-[11px] text-amber-200 leading-snug">
                Reopen order #{String(activeOrder?.orderNumber ?? '').split('-').pop()}? It goes
                back to Served and can be added to and closed again. Payments already taken stay
                on it.
              </p>
              <div className="flex gap-1.5">
                <button
                  onClick={async () => {
                    setConfirmReopen(false);
                    await onReopenOrder();
                  }}
                  disabled={isPerformingAction}
                  className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  Yes, Reopen
                </button>
                <button
                  onClick={() => setConfirmReopen(false)}
                  className="flex-1 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-xs font-semibold transition-colors"
                >
                  Leave Closed
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmReopen(true)}
              disabled={isPerformingAction}
              className="w-full flex items-center justify-center gap-2 py-2 md:py-2.5 rounded-lg font-semibold text-xs md:text-sm bg-amber-600/20 border border-amber-500/40 text-amber-300 hover:bg-amber-600/30 transition-colors disabled:opacity-50"
            >
              <RotateCcw size={15} />
              Reopen Order
            </button>
          )}
        </div>
      )}

      {/* ── Lifecycle Actions ────────────────────────────────────────── */}
      {(lifecycleActions.length > 0 || canCancel) && (
        <div className="space-y-1">
          <button
            onClick={() => setShowLifecycleActions(!showLifecycleActions)}
            className="w-full flex items-center justify-between px-2 py-1 text-[11px] font-semibold text-gray-400 hover:text-gray-200 transition-colors"
          >
            <span>Actions</span>
            {showLifecycleActions ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showLifecycleActions && (
            <div className="flex gap-1 flex-wrap">
              {lifecycleActions.map((act) => (
                <button
                  key={act.action}
                  onClick={() => handleLifecycleAction(act.action)}
                  disabled={isPerformingAction}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-white transition-all ${act.color} ${
                    isPerformingAction ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {act.icon}
                  <span>{act.label}</span>
                </button>
              ))}
              {canCancel && (
                <button
                  onClick={handleCancelOrder}
                  disabled={isPerformingAction}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all ${
                    isPerformingAction ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  <Ban size={10} />
                  <span>Cancel</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Payment ───────────────────────────────────────────────────────
          Phase 16 §2.3: when nothing is owed the control is disabled with the
          reason stated, not silently removed. Overpayment is not a rounding
          annoyance — it is a real cash-drawer discrepancy at close, and the
          person who caused it has gone home. */}
      {canPay && (
        <div className="space-y-1.5">
          <button
            onClick={onOpenPayment}
            disabled={isCompletingOrder || isPerformingAction || isFullyPaid}
            className={`w-full flex items-center justify-center gap-2 py-2 md:py-2.5 rounded-lg font-semibold text-xs md:text-sm transition-all ${
              isCompletingOrder || isPerformingAction || isFullyPaid
                ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                : 'bg-gray-800 text-green-400 border border-green-500/30 hover:bg-gray-700 hover:border-green-500/50'
            }`}
          >
            <Wallet size={16} />
            <span>Add Payment</span>
            {!isFullyPaid && (
              <span className="ml-auto font-medium">{formatPrice(due)}</span>
            )}
          </button>

          {isFullyPaid && (
            <p className="text-[11px] text-gray-500 text-center">
              This order is fully paid.
            </p>
          )}

          {/* Still reachable when settled — a wrong method or amount has to be
              removable without a trip to the database. */}
          {isFullyPaid && paymentCount > 0 && (
            <button
              onClick={onOpenPayment}
              disabled={isCompletingOrder || isPerformingAction}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-gray-300 bg-gray-800/60 border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <Receipt size={14} />
              Payments Taken ({paymentCount})
            </button>
          )}
        </div>
      )}

      {/* ── Quick Complete Order with Payment Method ──────────────────── */}
      {activeOrder &&
        !['completed', 'cancelled', 'draft'].includes(activeOrder.status) &&
        (activeOrder.items?.length ?? 0) > 0 && (
          <div className="space-y-1.5">
            {!showPaymentSelect ? (
              <button
                onClick={() => setShowPaymentSelect(true)}
                disabled={isCompletingOrder || isPerformingAction}
                className={`w-full flex items-center justify-center gap-2 py-2 md:py-2.5 rounded-lg font-semibold text-xs md:text-sm transition-all ${
                  isCompletingOrder || isPerformingAction
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-emerald-600 to-green-600 text-white hover:from-emerald-500 hover:to-green-500 shadow-lg shadow-emerald-600/25'
                }`}
              >
                {isCompletingOrder ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                <span className="hidden sm:inline">Close Order &amp; Take Payment</span>
                <span className="sm:hidden">Close &amp; Pay</span>
              </button>
            ) : (
              <div className="p-2 rounded-lg bg-gray-800/80 border border-gray-700 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-300">Select Payment Method</span>
                  <button
                    onClick={() => setShowPaymentSelect(false)}
                    className="p-1 text-gray-500 hover:text-gray-300 rounded"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Optional tendered amount — for cash record-keeping. Blank = pay exact due. */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value)}
                      placeholder={`Paid amount (optional) — due ${formatPrice(due)}`}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  {change > 0 && (
                    <span className="text-xs font-semibold text-amber-400 whitespace-nowrap">
                      Change {formatPrice(change)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {paymentMethods.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => handleQuickComplete(m.id)}
                      disabled={isCompletingOrder}
                      className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-lg font-medium text-xs transition-all ${
                        isCompletingOrder
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/40 hover:border-emerald-500/50'
                      }`}
                    >
                      {isCompletingOrder ? (
                        <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                      ) : (
                        <span className="text-base leading-none">{m.icon || '•'}</span>
                      )}
                      <span className="truncate max-w-full">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
