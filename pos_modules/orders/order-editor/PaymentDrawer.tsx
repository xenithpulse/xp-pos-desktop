// pos_modules/orders/order-editor/PaymentDrawer.tsx
// Slide-up payment form with method selection, amount, and submit

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { Order } from '@/types/order.types';
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
}

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
}: PaymentDrawerProps) {
  const currencySymbol =
    usePOSStore((s) => s.settings?.currencySymbol) || 'Rs.';
  const selected = paymentMethods.find((m) => m.id === paymentMethod);
  const selectedLabel = selected?.label ?? 'Payment';
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
          <div className="p-4 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <CreditCard size={16} className="text-green-400" />
                Add Payment
              </h3>
              <button
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-white rounded hover:bg-gray-800"
              >
                <X size={16} />
              </button>
            </div>

            {/* Amount Due Badge */}
            <div className="flex items-center justify-between px-3 py-2 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <span className="text-sm text-orange-300">Amount Due</span>
              <span className="text-lg font-bold text-orange-400">
                {formatPrice(activeOrder.amountDue)}
              </span>
            </div>

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
                  title={m.label}
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
                  onClick={() =>
                    setPaymentAmount(String(activeOrder.amountDue))
                  }
                  className="flex-1 py-1.5 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  Full Amount
                </button>
                <button
                  onClick={() =>
                    setPaymentAmount(
                      String(Math.ceil(activeOrder.amountDue / 2)),
                    )
                  }
                  className="flex-1 py-1.5 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  Half
                </button>
                <button
                  onClick={() => setPaymentAmount('')}
                  className="flex-1 py-1.5 text-xs rounded bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  Custom
                </button>
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
                <span>Payment recorded successfully!</span>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={onSubmit}
              disabled={isSubmitting || !paymentAmount}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold transition-all ${
                isSubmitting || !paymentAmount
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
                Record {selectedLabel} Payment — {formatPrice(parseFloat(paymentAmount) || 0)}
              </span>
              <span className="sm:hidden">
                Pay {formatPrice(parseFloat(paymentAmount) || 0)}
              </span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
