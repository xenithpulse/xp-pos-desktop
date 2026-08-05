'use client';

// ─────────────────────────────────────────────────────────────────────────────
// KDS Order Tray — the whole ticket, full screen, on demand.
//
// The kitchen board deliberately keeps its cards inert (Phase 16 §1.2): a panel
// that slides out whenever somebody brushes a ticket covers the rest of the
// board and is never what the person tapping wanted. But a cook does sometimes
// need everything at once — a long order, a wall of modifiers, the note the
// waiter typed — and squinting at a card in a column four wide is not it.
//
// So this opens only from the card's labelled Details control, fills the
// screen rather than sliding over the board, and carries exactly one status
// button: the same next step the card offers, so there is one rule everywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Clock,
  User,
  Phone,
  MapPin,
  Flame,
  MessageSquare,
  UtensilsCrossed,
  Package,
  Truck,
  Car,
} from 'lucide-react';
import {
  Order,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  ORDER_MODE_LABELS,
  ORDER_MODE_COLORS,
} from '@/types/order.types';
import { getNextStatusAction, type StatusActionColor } from '../statusLadder';

interface KdsOrderTrayProps {
  order: Order | null;
  onClose: () => void;
  onStatusChange: (orderId: string, action: string) => void;
}

// Static class map — Tailwind JIT cannot see interpolated class names.
const CTA_STYLES: Record<StatusActionColor, string> = {
  blue: 'bg-blue-500 hover:bg-blue-400',
  amber: 'bg-amber-500 hover:bg-amber-400',
  green: 'bg-green-600 hover:bg-green-500',
  cyan: 'bg-cyan-500 hover:bg-cyan-400',
  purple: 'bg-purple-500 hover:bg-purple-400',
  emerald: 'bg-emerald-600 hover:bg-emerald-500',
};

function modeIcon(mode: string, size = 18) {
  const icons: Record<string, React.ReactNode> = {
    dine_in: <UtensilsCrossed size={size} />,
    takeaway: <Package size={size} />,
    delivery: <Truck size={size} />,
    drive_thru: <Car size={size} />,
    curbside: <MapPin size={size} />,
  };
  return icons[mode] ?? <Clock size={size} />;
}

function elapsedLabel(createdAt: string): string {
  const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

export default function KdsOrderTray({ order, onClose, onStatusChange }: KdsOrderTrayProps) {
  return (
    <AnimatePresence>
      {order && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/80"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-2 sm:inset-6 lg:inset-10 z-50 flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-gray-900 shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            <TrayHeader order={order} onClose={onClose} />
            <TrayBody order={order} />
            <TrayFooter order={order} onClose={onClose} onStatusChange={onStatusChange} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TrayHeader({ order, onClose }: { order: Order; onClose: () => void }) {
  const modeColor = ORDER_MODE_COLORS[order.mode];
  const statusColor = ORDER_STATUS_COLORS[order.status];

  const who = order.table?.tableNumber
    ? `Table ${order.table.tableNumber}`
    : order.customer?.name || `Order #${String(order.orderNumber).split('-').pop()}`;

  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${modeColor.bg} ${modeColor.text}`}>
            {modeIcon(order.mode, 15)}
            {ORDER_MODE_LABELS[order.mode]}
          </span>
          <span className={`inline-flex items-center rounded-md px-2.5 py-1 text-sm font-semibold ${statusColor.bg} ${statusColor.text}`}>
            {ORDER_STATUS_LABELS[order.status]}
          </span>
          {order.isPriority && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-500/20 px-2.5 py-1 text-sm font-bold text-red-400">
              <Flame size={14} />
              Rush
            </span>
          )}
        </div>
        <h2 className="mt-2 truncate text-2xl font-bold text-white sm:text-3xl">{who}</h2>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-400">
          <Clock size={13} />
          Ordered {elapsedLabel(order.createdAt)}
          <span className="text-gray-600">·</span>
          <span className="font-mono">#{String(order.orderNumber).split('-').pop()}</span>
        </p>
      </div>

      {/* Labelled, not a bare X — rule 0.1. */}
      <button
        onClick={onClose}
        className="flex shrink-0 items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10"
      >
        <X size={16} />
        Close
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TrayBody({ order }: { order: Order }) {
  return (
    <div className="flex-1 overflow-y-auto px-5 py-4">
      {/* Delivery address and phone belong on the ticket — the rider reads
          them off the pass, not off the till. */}
      {order.mode === 'delivery' && order.customer && (
        <div className="mb-4 rounded-xl border border-white/10 bg-white/5 p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Deliver To
          </h3>
          <div className="space-y-1 text-sm text-gray-200">
            {order.customer.name && (
              <p className="flex items-center gap-2"><User size={14} className="text-gray-500" />{order.customer.name}</p>
            )}
            {order.customer.phone && (
              <p className="flex items-center gap-2"><Phone size={14} className="text-gray-500" />{order.customer.phone}</p>
            )}
            {order.customer.address && (
              <p className="flex items-start gap-2">
                <MapPin size={14} className="mt-0.5 shrink-0 text-gray-500" />
                <span>
                  {order.customer.address.line1}
                  {order.customer.address.line2 ? `, ${order.customer.address.line2}` : ''}
                  {order.customer.address.city ? `, ${order.customer.address.city}` : ''}
                </span>
              </p>
            )}
          </div>
        </div>
      )}

      {order.kitchenNotes && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-amber-400">
            Kitchen Note
          </h3>
          <p className="text-base text-amber-100">{order.kitchenNotes}</p>
        </div>
      )}

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {order.items.length} {order.items.length === 1 ? 'Item' : 'Items'}
      </h3>

      {/* Deliberately large. This is read at arm's length across a pass. */}
      <ul className="space-y-2">
        {order.items.map((item, idx) => (
          <li
            key={item._id || idx}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-3"
          >
            <div className="flex items-start gap-3">
              <span className="min-w-[2.5rem] rounded-lg bg-white/10 px-2 py-1 text-center text-lg font-bold text-white">
                {item.quantity}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold leading-snug text-white">{item.name}</p>
                {item.modifiers && item.modifiers.length > 0 && (
                  <p className="mt-0.5 text-sm text-gray-400">
                    {item.modifiers.map((m) => m.name).join(', ')}
                  </p>
                )}
                {item.specialInstructions && (
                  <p className="mt-1 flex items-start gap-1.5 text-sm font-medium text-amber-300">
                    <MessageSquare size={14} className="mt-0.5 shrink-0" />
                    {item.specialInstructions}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function TrayFooter({
  order,
  onClose,
  onStatusChange,
}: {
  order: Order;
  onClose: () => void;
  onStatusChange: (orderId: string, action: string) => void;
}) {
  // The same rung the card offers. The kitchen ladder stops at Served / Out,
  // so a handed-over order correctly shows nothing here.
  const next = getNextStatusAction(order.status, order.mode, 'kds');
  const Icon = next?.icon;

  return (
    <div className="border-t border-white/10 bg-black/30 px-5 py-4">
      {next && Icon ? (
        <button
          onClick={() => {
            onStatusChange(order._id, next.action);
            onClose();
          }}
          className={`flex w-full items-center justify-center gap-2.5 rounded-xl px-4 py-4 text-lg font-bold text-white transition-colors ${CTA_STYLES[next.color]}`}
        >
          <Icon size={22} />
          {next.label}
        </button>
      ) : (
        <p className="py-2 text-center text-sm text-gray-500">
          Nothing left for the kitchen on this order — the till closes it and takes payment.
        </p>
      )}
    </div>
  );
}
