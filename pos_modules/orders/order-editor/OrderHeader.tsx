// pos_modules/orders/order-editor/OrderHeader.tsx
// Order header bar: table info, order number, status badges, conflict warning

'use client';

import { Archive, AlertCircle, Users } from 'lucide-react';
import {
  PAYMENT_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  Order,
} from '@/types/order.types';
import type { FocusedContext } from '@/stores/posStore';

interface OrderHeaderProps {
  activeOrder: Order | null;
  isHistorical: boolean;
  focusedContext: FocusedContext;
  statusLabel: string;
  statusColor: { bg: string; text: string; border: string };
  tableConflictWarning: string | null;
}

export default function OrderHeader({
  activeOrder,
  isHistorical,
  focusedContext,
  statusLabel,
  statusColor,
  tableConflictWarning,
}: OrderHeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-gray-800">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {focusedContext.table
              ? `Table ${focusedContext.table.tableNumber}`
              : 'Quick Order'}
          </h2>
          {activeOrder && (
            <span className="text-sm text-gray-400">
              #{activeOrder.orderNumber}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isHistorical && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-600/30 text-gray-300 flex items-center gap-1">
              <Archive size={12} />
              Historical Record
            </span>
          )}
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor.bg} ${statusColor.text}`}
          >
            {statusLabel}
          </span>
          {activeOrder && (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                (() => {
                  // Until items are fired (status=draft), always show Pending
                  const effectivePaymentStatus =
                    activeOrder.status === 'draft' ? 'pending' : activeOrder.paymentStatus;
                  return `${
                    PAYMENT_STATUS_COLORS[effectivePaymentStatus]?.bg || 'bg-gray-500/20'
                  } ${
                    PAYMENT_STATUS_COLORS[effectivePaymentStatus]?.text || 'text-gray-400'
                  }`;
                })()
              }`}
            >
              {activeOrder.status === 'draft'
                ? PAYMENT_STATUS_LABELS['pending']
                : PAYMENT_STATUS_LABELS[activeOrder.paymentStatus]}
            </span>
          )}
        </div>
      </div>

      {tableConflictWarning && (
        <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-amber-500/15 border border-amber-500/30 rounded-lg text-amber-300 text-xs">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>{tableConflictWarning}</span>
        </div>
      )}

      {focusedContext.session && (
        <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
          <Users size={14} className="text-purple-400" />
          <span>{focusedContext.session.covers || 0} guests</span>
        </div>
      )}
    </div>
  );
}
