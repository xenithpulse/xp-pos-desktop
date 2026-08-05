'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Order Manager Grid - Main layout with columns by status
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import { CheckCircle2, Timer, UtensilsCrossed, Truck, AlertCircle } from 'lucide-react';
import OrderCard from './OrderCard';
import { Order, OrderStatus } from '@/types/order.types';
import type { OrderSurface } from '../statusLadder';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface OrderManagerGridProps {
  orders: Order[];
  onStatusChange: (orderId: string, action: string) => void;
  /** Omit on a kitchen board that has no panel to open — the card then renders
   *  no Details control rather than one wired to nothing. */
  onViewDetails?: (order: Order) => void;
  isLoading: boolean;
  /**
   * Which screen this grid is. Phase 16 §1.2: this is a prop, never a guess
   * from the current route.
   *  - 'kds'  kitchen board. Card body inert, ladder stops at Served / Out.
   *  - 'hub'  management view. Card body opens the details panel.
   */
  surface?: OrderSurface;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status Columns Configuration
// ─────────────────────────────────────────────────────────────────────────────

interface ColumnConfig {
  status: OrderStatus[];
  label: string;
  icon: React.ReactNode;
  color: string;
  showCount: boolean;
}

const columns: ColumnConfig[] = [
  {
    status: ['draft', 'confirmed'],
    label: 'New Orders',
    icon: <AlertCircle size={18} />,
    color: 'blue',
    showCount: true,
  },
  {
    status: ['preparing'],
    label: 'Preparing',
    icon: <Timer size={18} />,
    color: 'amber',
    showCount: true,
  },
  {
    status: ['ready'],
    label: 'Ready',
    icon: <CheckCircle2 size={18} />,
    color: 'green',
    showCount: true,
  },
  {
    status: ['served', 'out_for_delivery'],
    label: 'Served / Out',
    icon: <Truck size={18} />,
    color: 'purple',
    showCount: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OrderManagerGrid({
  orders,
  onStatusChange,
  onViewDetails,
  isLoading,
  surface = 'hub',
}: OrderManagerGridProps) {
  // Group orders by column
  const ordersByColumn = useMemo(() => {
    const grouped: Record<number, Order[]> = {};
    
    columns.forEach((col, idx) => {
      grouped[idx] = orders.filter(order => 
        col.status.includes(order.status)
      ).sort((a, b) => {
        // Priority orders first
        if (a.isPriority !== b.isPriority) return a.isPriority ? -1 : 1;
        // Then by creation time (oldest first for urgency)
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });
    });
    
    return grouped;
  }, [orders]);

  // Phase 16 §1.2: the "Preparing column advances on body tap, every other
  // column opens a panel" special case is gone. One rule for every column — the
  // labelled action button is the only thing that changes an order's status.

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
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <UtensilsCrossed size={44} className="text-gray-600" />
          <span className="text-lg text-gray-300">Nothing cooking right now.</span>
          <span className="text-sm text-gray-500 max-w-sm">
            {surface === 'kds'
              ? 'Tickets appear here the moment the till sends an order to the kitchen. Nothing to do until one does.'
              : 'Start an order from the floor plan, or open Takeaway or Delivery for a counter order.'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden p-4">
      <div className="h-full grid grid-cols-4 gap-4">
        {columns.map((column, colIdx) => {
          const columnOrders = ordersByColumn[colIdx] || [];
          const colorClasses = {
            blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
            amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
            green: 'bg-green-500/20 text-green-400 border-green-500/30',
            purple: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
          };

          return (
            <div
              key={colIdx}
              className="flex flex-col h-full bg-gray-900/30 rounded-xl overflow-hidden"
            >
              {/* Column Header */}
              <div className={`
                flex items-center justify-between px-4 py-3
                border-b border-white/5
              `}>
                <div className="flex items-center gap-2">
                  <span className={`
                    p-1.5 rounded-lg
                    ${colorClasses[column.color as keyof typeof colorClasses]}
                  `}>
                    {column.icon}
                  </span>
                  <span className="font-semibold text-white">
                    {column.label}
                  </span>
                </div>
                {column.showCount && (
                  <span className={`
                    min-w-[28px] h-7 px-2 rounded-full
                    flex items-center justify-center
                    text-sm font-bold
                    ${colorClasses[column.color as keyof typeof colorClasses]}
                  `}>
                    {columnOrders.length}
                  </span>
                )}
              </div>

              {/* Column Content */}
              <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
                <AnimatePresence mode="popLayout">
                  {columnOrders.map((order) => (
                    <OrderCard
                      key={order._id}
                      order={order}
                      onStatusChange={onStatusChange}
                      onViewDetails={onViewDetails}
                      surface={surface}
                    />
                  ))}
                </AnimatePresence>

                {columnOrders.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
                    No orders
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
