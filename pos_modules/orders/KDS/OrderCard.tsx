'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Order Card - Visual card for grid layout
//
// Phase 16 §1.1/§1.2:
//  - the status ladder lives in ../statusLadder, not here, so the card, the
//    list view and the details panel cannot drift apart again;
//  - on the kitchen surface the card body is NOT a button. Tapping a ticket
//    used to advance it (or open a panel over the board); now only the labelled
//    action button changes anything, and the ticket shows every line instead of
//    hiding the tail behind "+n more".
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  User,
  MapPin,
  Phone,
  Flame,
  CheckCircle2,
  Timer,
  CreditCard,
  MessageSquare,
  UtensilsCrossed,
  Package,
  Truck,
  Car,
  FileText,
} from 'lucide-react';
import {
  Order,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  ORDER_MODE_LABELS,
  ORDER_MODE_COLORS,
} from '@/types/order.types';
import { getNextStatusAction, type OrderSurface, type StatusActionColor } from '../statusLadder';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: Order;
  onStatusChange: (orderId: string, action: string) => void;
  /** Omit to render no Details control at all — better than a button that
   *  does nothing (the kitchen screen used to pass a no-op). */
  onViewDetails?: (order: Order) => void;
  /** 'kds' = kitchen board: inert card body, ladder stops at Served / Out. */
  surface?: OrderSurface;
}

// Static class map — Tailwind JIT cannot see interpolated class names.
const ACTION_STYLES: Record<StatusActionColor, string> = {
  blue: 'bg-blue-500 hover:bg-blue-400',
  amber: 'bg-amber-500 hover:bg-amber-400',
  green: 'bg-green-600 hover:bg-green-500',
  cyan: 'bg-cyan-500 hover:bg-cyan-400',
  purple: 'bg-purple-500 hover:bg-purple-400',
  emerald: 'bg-emerald-600 hover:bg-emerald-500',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Format time elapsed
// ─────────────────────────────────────────────────────────────────────────────

function formatElapsedTime(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get mode icon
// ─────────────────────────────────────────────────────────────────────────────

function getModeIcon(mode: string, size = 14) {
  const icons: Record<string, React.ReactNode> = {
    dine_in: <UtensilsCrossed size={size} />,
    takeaway: <Package size={size} />,
    delivery: <Truck size={size} />,
    drive_thru: <Car size={size} />,
    curbside: <MapPin size={size} />,
  };
  return icons[mode] || <Clock size={size} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OrderCard({
  order,
  onStatusChange,
  onViewDetails,
  surface = 'hub',
}: OrderCardProps) {
  const isKds = surface === 'kds';

  const statusColor = ORDER_STATUS_COLORS[order.status];
  const paymentColor = PAYMENT_STATUS_COLORS[order.paymentStatus];
  const modeColor = ORDER_MODE_COLORS[order.mode];
  const elapsedTime = formatElapsedTime(order.createdAt);
  const nextAction = getNextStatusAction(order.status, order.mode, surface);
  const ActionIcon = nextAction?.icon;

  // Time urgency indicator
  const elapsedMinutes = useMemo(() => {
    const created = new Date(order.createdAt);
    return Math.floor((Date.now() - created.getTime()) / 60000);
  }, [order.createdAt]);

  const isUrgent = elapsedMinutes > 20 && !['completed', 'cancelled'].includes(order.status);
  const isOverdue = elapsedMinutes > 30 && !['completed', 'cancelled'].includes(order.status);

  // Get display name (table number or customer name)
  const displayName = order.table?.tableNumber
    ? `Table ${order.table.tableNumber}`
    : order.customer?.name || order.orderNumber;

  // On the kitchen board a ticket shows every line — a cook cannot make
  // "+3 more items". In the hub the card stays a summary; the panel has the rest.
  const visibleItems = isKds ? order.items : order.items.slice(0, 3);
  const hiddenItemCount = order.items.length - visibleItems.length;

  // The card body is only a control in the hub, where it opens the details
  // panel. On the kitchen board nothing happens unless a labelled button is
  // pressed (rule 0.4 — a tap must not silently change a customer's order).
  const bodyIsButton = !isKds && !!onViewDetails;
  const hasActionBar = !!nextAction || (isKds && !!onViewDetails);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={`
        relative bg-gray-800/50 backdrop-blur-sm rounded-xl
        border transition-colors duration-200
        ${bodyIsButton ? 'cursor-pointer' : 'cursor-default'}
        ${isOverdue
          ? 'border-red-500/50 shadow-lg shadow-red-500/10'
          : isUrgent
            ? 'border-amber-500/50 shadow-lg shadow-amber-500/10'
            // Hover feedback only where the body actually does something.
            // A card that lifts under the cursor but ignores the tap is a lie.
            : bodyIsButton ? 'border-white/10 hover:border-white/25' : 'border-white/10'
        }
        ${order.isPriority ? 'ring-2 ring-red-500/30' : ''}
      `}
      onClick={bodyIsButton ? () => onViewDetails?.(order) : undefined}
      role={bodyIsButton ? 'button' : undefined}
      tabIndex={bodyIsButton ? 0 : undefined}
    >
      {/* Priority Indicator */}
      {order.isPriority && (
        <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-lg">
          <Flame size={14} className="text-white" />
        </div>
      )}

      {/* Header */}
      <div className="px-4 pt-3 pb-2 border-b border-white/5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {/* Mode Badge */}
              <span className={`
                inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium
                ${modeColor.bg} ${modeColor.text}
              `}>
                {getModeIcon(order.mode)}
                {ORDER_MODE_LABELS[order.mode]}
              </span>

              {/* Order Number */}
              <span className="text-xs text-gray-500 font-mono">
                #{String(order.orderNumber).split('-').pop()}
              </span>
            </div>

            {/* Display Name */}
            <h3 className="mt-1 text-lg font-semibold text-white truncate">
              {displayName}
            </h3>
          </div>

          {/* Time Elapsed */}
          <div className={`
            flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
            ${isOverdue
              ? 'bg-red-500/20 text-red-400'
              : isUrgent
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-white/5 text-gray-400'
            }
          `}>
            <Clock size={12} />
            {elapsedTime}
          </div>
        </div>
      </div>

      {/* Items Summary */}
      <div className="px-4 py-3">
        <div className="space-y-1">
          {visibleItems.map((item, idx) => (
            <div key={item._id || idx}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-300 truncate flex-1">
                  <span className="text-gray-500 mr-1">{item.quantity}x</span>
                  {item.name}
                </span>
                <span className={`
                  w-2 h-2 rounded-full ml-2 shrink-0
                  ${item.status === 'ready' || item.status === 'served'
                    ? 'bg-green-500'
                    : item.status === 'preparing'
                      ? 'bg-amber-500'
                      : 'bg-gray-500'
                  }
                `} />
              </div>

              {/* Modifiers and instructions are the whole point of a kitchen
                  ticket — they never get truncated away there. */}
              {isKds && item.modifiers && item.modifiers.length > 0 && (
                <div className="pl-5 text-xs text-gray-500">
                  {item.modifiers.map((m) => m.name).join(', ')}
                </div>
              )}
              {isKds && item.specialInstructions && (
                <div className="pl-5 flex items-start gap-1 text-xs text-amber-400">
                  <MessageSquare size={11} className="mt-0.5 shrink-0" />
                  {item.specialInstructions}
                </div>
              )}
            </div>
          ))}
          {hiddenItemCount > 0 && (
            <div className="text-xs text-gray-500">
              +{hiddenItemCount} more items
            </div>
          )}
        </div>

        {/* Kitchen notes — order-level, and equally un-truncatable. */}
        {isKds && order.kitchenNotes && (
          <div className="mt-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-400 mb-0.5">
              Kitchen Note
            </div>
            <div className="text-xs text-gray-300">{order.kitchenNotes}</div>
          </div>
        )}

        {/* Customer Info (for delivery) */}
        {order.mode === 'delivery' && order.customer && (
          <div className="mt-3 pt-2 border-t border-white/5 space-y-1">
            {order.customer.name && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <User size={12} />
                {order.customer.name}
              </div>
            )}
            {order.customer.phone && (
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Phone size={12} />
                {order.customer.phone}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={`
        px-4 py-2 bg-black/20 flex items-center justify-between gap-2
        ${hasActionBar ? '' : 'rounded-b-xl'}
      `}>
        {/* Status Badge */}
        <span className={`
          inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium
          ${statusColor.bg} ${statusColor.text}
        `}>
          {order.status === 'preparing' && <Timer size={12} className="animate-pulse" />}
          {order.status === 'ready' && <CheckCircle2 size={12} />}
          {ORDER_STATUS_LABELS[order.status]}
        </span>

        {/* Payment Status */}
        <span className={`
          inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
          ${paymentColor.bg} ${paymentColor.text}
        `}>
          <CreditCard size={12} />
          {PAYMENT_STATUS_LABELS[order.paymentStatus]}
        </span>

        {/* Total */}
        <span className="text-sm font-bold text-white">
          {order.grandTotal.toFixed(2)}
        </span>
      </div>

      {/* Action bar. Sits inside the card rather than floating over the gap
          below it — a half-overlapping pill is a small target and it covered
          the next ticket on a dense board. */}
      {hasActionBar && (
        <div className="flex items-stretch gap-2 px-3 py-2.5 border-t border-white/5 rounded-b-xl">
          {isKds && onViewDetails && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails(order);
              }}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-white/5 text-gray-300 text-sm font-medium hover:bg-white/10 transition-colors"
            >
              <FileText size={15} />
              Details
            </button>
          )}

          {nextAction && ActionIcon && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStatusChange(order._id, nextAction.action);
              }}
              className={`
                flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg
                text-white text-sm font-semibold transition-colors
                ${ACTION_STYLES[nextAction.color]}
              `}
            >
              <ActionIcon size={16} />
              {nextAction.label}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
