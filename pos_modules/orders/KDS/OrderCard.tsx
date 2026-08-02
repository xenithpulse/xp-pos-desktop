'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Order Card - Visual card for grid layout
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Clock,
  User,
  MapPin,
  Phone,
  ChevronRight,
  Flame,
  AlertCircle,
  CheckCircle2,
  Timer,
  CreditCard,
  MoreVertical,
  Play,
  Check,
  XCircle,
  UtensilsCrossed,
  Package,
  Truck,
  Car,
} from 'lucide-react';
import {
  Order,
  OrderStatus,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  ORDER_MODE_LABELS,
  ORDER_MODE_COLORS,
} from '@/types/order.types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: Order;
  onStatusChange: (orderId: string, action: string) => void;
  onViewDetails: (order: Order) => void;
  onQuickAction?: (orderId: string, action: string) => void;
}

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
// Helper: Get next action for status
// ─────────────────────────────────────────────────────────────────────────────

function getNextAction(status: OrderStatus, mode: string): { action: string; label: string; icon: React.ReactNode } | null {
  const actions: Record<OrderStatus, { action: string; label: string; icon: React.ReactNode } | null> = {
    draft: { action: 'confirm', label: 'Confirm', icon: <Check size={14} /> },
    confirmed: { action: 'start_preparing', label: 'Start Prep', icon: <Play size={14} /> },
    preparing: { action: 'mark_ready', label: 'Ready', icon: <CheckCircle2 size={14} /> },
    ready: mode === 'delivery' 
      ? { action: 'out_for_delivery', label: 'Out for Delivery', icon: <Truck size={14} /> }
      : { action: 'complete', label: 'Complete', icon: <CheckCircle2 size={14} /> },
    served: { action: 'complete', label: 'Complete', icon: <CheckCircle2 size={14} /> },
    out_for_delivery: { action: 'complete', label: 'Delivered', icon: <CheckCircle2 size={14} /> },
    completed: null,
    cancelled: null,
  };
  return actions[status];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OrderCard({
  order,
  onStatusChange,
  onViewDetails,
  onQuickAction,
}: OrderCardProps) {
  const [showActions, setShowActions] = useState(false);

  const statusColor = ORDER_STATUS_COLORS[order.status];
  const paymentColor = PAYMENT_STATUS_COLORS[order.paymentStatus];
  const modeColor = ORDER_MODE_COLORS[order.mode];
  const elapsedTime = formatElapsedTime(order.createdAt);
  const nextAction = getNextAction(order.status, order.mode);

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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      className={`
        relative bg-gray-800/50 backdrop-blur-sm rounded-xl
        border transition-all duration-200 cursor-pointer
        ${isOverdue 
          ? 'border-red-500/50 shadow-lg shadow-red-500/10' 
          : isUrgent 
            ? 'border-amber-500/50 shadow-lg shadow-amber-500/10'
            : 'border-white/10 hover:border-white/20'
        }
        ${order.isPriority ? 'ring-2 ring-red-500/30' : ''}
      `}
      onClick={() => onViewDetails(order)}
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
          {order.items.slice(0, 3).map((item, idx) => (
            <div key={item._id || idx} className="flex items-center justify-between text-sm">
              <span className="text-gray-300 truncate flex-1">
                <span className="text-gray-500 mr-1">{item.quantity}x</span>
                {item.name}
              </span>
              <span className={`
                w-2 h-2 rounded-full ml-2
                ${item.status === 'ready' || item.status === 'served' 
                  ? 'bg-green-500' 
                  : item.status === 'preparing' 
                    ? 'bg-amber-500' 
                    : 'bg-gray-500'
                }
              `} />
            </div>
          ))}
          {order.items.length > 3 && (
            <div className="text-xs text-gray-500">
              +{order.items.length - 3} more items
            </div>
          )}
        </div>

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
      <div className="px-4 py-2 bg-black/20 rounded-b-xl flex items-center justify-between">
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

      {/* Quick Action Button */}
      {nextAction && (
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            e.stopPropagation();
            onStatusChange(order._id, nextAction.action);
          }}
          className={`
            absolute -bottom-3 left-1/2 -translate-x-1/2
            flex items-center gap-1.5 px-3 py-1.5 rounded-full
            bg-gradient-to-r from-cyan-500 to-blue-500
            text-white text-xs font-medium
            shadow-lg shadow-cyan-500/30
            hover:from-cyan-400 hover:to-blue-400
            transition-all duration-200
          `}
        >
          {nextAction.icon}
          {nextAction.label}
        </motion.button>
      )}
    </motion.div>
  );
}
