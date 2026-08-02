'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Order Manager List - Table/list view for orders
// ─────────────────────────────────────────────────────────────────────────────

import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  User,
  MapPin,
  ChevronRight,
  Flame,
  CheckCircle2,
  Timer,
  CreditCard,
  MoreHorizontal,
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

interface OrderManagerListProps {
  orders: Order[];
  onStatusChange: (orderId: string, action: string) => void;
  onViewDetails: (order: Order) => void;
  isLoading: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function formatElapsedTime(createdAt: string): string {
  const now = new Date();
  const created = new Date(createdAt);
  const diffMs = now.getTime() - created.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h ${mins}m ago`;
}

function formatTime(dateString: string): string {
  return new Date(dateString).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

function getModeIcon(mode: string, size = 16) {
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

export default function OrderManagerList({
  orders,
  onStatusChange,
  onViewDetails,
  isLoading,
}: OrderManagerListProps) {
  if (isLoading && orders.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading orders...</span>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <UtensilsCrossed size={48} className="text-gray-600" />
          <span className="text-lg">No active orders</span>
          <span className="text-sm text-gray-500">New orders will appear here</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <div className="h-full overflow-y-auto">
        {/* Table Header */}
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-white/10 z-10">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="col-span-1">Order</div>
            <div className="col-span-2">Customer / Table</div>
            <div className="col-span-1">Mode</div>
            <div className="col-span-2">Items</div>
            <div className="col-span-1">Status</div>
            <div className="col-span-1">Payment</div>
            <div className="col-span-1">Total</div>
            <div className="col-span-1">Time</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>
        </div>

        {/* Table Body */}
        <div className="divide-y divide-white/5">
          <AnimatePresence>
            {orders.map((order) => {
              const statusColor = ORDER_STATUS_COLORS[order.status];
              const paymentColor = PAYMENT_STATUS_COLORS[order.paymentStatus];
              const modeColor = ORDER_MODE_COLORS[order.mode];
              
              const elapsedMinutes = Math.floor(
                (Date.now() - new Date(order.createdAt).getTime()) / 60000
              );
              const isUrgent = elapsedMinutes > 20 && !['completed', 'cancelled'].includes(order.status);
              const isOverdue = elapsedMinutes > 30 && !['completed', 'cancelled'].includes(order.status);

              const displayName = order.table?.tableNumber 
                ? `Table ${order.table.tableNumber}`
                : order.customer?.name || '—';

              return (
                <motion.div
                  key={order._id}
                  layout
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  onClick={() => onViewDetails(order)}
                  className={`
                    grid grid-cols-12 gap-4 px-4 py-3 items-center
                    cursor-pointer hover:bg-white/5 transition-colors
                    ${order.isPriority ? 'bg-red-500/5' : ''}
                    ${isOverdue ? 'bg-red-500/10' : isUrgent ? 'bg-amber-500/5' : ''}
                  `}
                >
                  {/* Order Number */}
                  <div className="col-span-1 flex items-center gap-2">
                    {order.isPriority && (
                      <Flame size={14} className="text-red-400" />
                    )}
                    <span className="font-mono text-sm text-gray-300">
                      #{String(order.orderNumber).split('-').pop()}
                    </span>
                  </div>

                  {/* Customer / Table */}
                  <div className="col-span-2">
                    <div className="font-medium text-white truncate">
                      {displayName}
                    </div>
                    {order.customer?.phone && (
                      <div className="text-xs text-gray-500 truncate">
                        {order.customer.phone}
                      </div>
                    )}
                  </div>

                  {/* Mode */}
                  <div className="col-span-1">
                    <span className={`
                      inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium
                      ${modeColor.bg} ${modeColor.text}
                    `}>
                      {getModeIcon(order.mode, 12)}
                      {ORDER_MODE_LABELS[order.mode]}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="col-span-2">
                    <div className="text-sm text-gray-300 truncate">
                      {order.items.slice(0, 2).map(i => `${i.quantity}x ${i.name}`).join(', ')}
                    </div>
                    {order.items.length > 2 && (
                      <div className="text-xs text-gray-500">
                        +{order.items.length - 2} more
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  <div className="col-span-1">
                    <span className={`
                      inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                      ${statusColor.bg} ${statusColor.text}
                    `}>
                      {order.status === 'preparing' && <Timer size={12} className="animate-pulse" />}
                      {order.status === 'ready' && <CheckCircle2 size={12} />}
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </div>

                  {/* Payment */}
                  <div className="col-span-1">
                    <span className={`
                      inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium
                      ${paymentColor.bg} ${paymentColor.text}
                    `}>
                      {PAYMENT_STATUS_LABELS[order.paymentStatus]}
                    </span>
                  </div>

                  {/* Total */}
                  <div className="col-span-1">
                    <span className="font-bold text-white">
                      {order.grandTotal.toFixed(0)}
                    </span>
                  </div>

                  {/* Time */}
                  <div className="col-span-1">
                    <div className={`
                      text-sm font-medium
                      ${isOverdue ? 'text-red-400' : isUrgent ? 'text-amber-400' : 'text-gray-400'}
                    `}>
                      {formatElapsedTime(order.createdAt)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatTime(order.createdAt)}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="col-span-2 flex items-center justify-end gap-2">
                    {order.status === 'draft' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStatusChange(order._id, 'confirm');
                        }}
                        className="px-3 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-xs font-medium hover:bg-blue-500/30 transition-colors"
                      >
                        Confirm
                      </button>
                    )}
                    {order.status === 'confirmed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStatusChange(order._id, 'start_preparing');
                        }}
                        className="px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/30 transition-colors"
                      >
                        Start Prep
                      </button>
                    )}
                    {order.status === 'preparing' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStatusChange(order._id, 'mark_ready');
                        }}
                        className="px-3 py-1 rounded-lg bg-green-500/20 text-green-400 text-xs font-medium hover:bg-green-500/30 transition-colors"
                      >
                        Ready
                      </button>
                    )}
                    {order.status === 'ready' && order.mode === 'dine_in' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStatusChange(order._id, 'mark_served');
                        }}
                        className="px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/30 transition-colors"
                      >
                        Served
                      </button>
                    )}
                    {(order.status === 'ready' && order.mode !== 'dine_in') || order.status === 'served' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onStatusChange(order._id, 'complete');
                        }}
                        className="px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/30 transition-colors"
                      >
                        Complete
                      </button>
                    ) : null}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onViewDetails(order);
                      }}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
