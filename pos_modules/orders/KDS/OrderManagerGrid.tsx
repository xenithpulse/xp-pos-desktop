'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Order Manager Grid - Main layout with columns by status
// ─────────────────────────────────────────────────────────────────────────────

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, CheckCircle2, Timer, UtensilsCrossed, Truck, AlertCircle } from 'lucide-react';
import OrderCard from './OrderCard';
import {
  Order,
  OrderStatus,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
} from '@/types/order.types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface OrderManagerGridProps {
  orders: Order[];
  onStatusChange: (orderId: string, action: string) => void;
  onViewDetails: (order: Order) => void;
  isLoading: boolean;
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

  // Quick-action click handler:
  // Preparing → mark_ready on click (kanban quick-advance)
  // Other statuses → open details panel
  const handleCardClick = (order: Order) => {
    if (order.status === 'preparing') {
      onStatusChange(order._id, 'mark_ready');
    } else {
      onViewDetails(order);
    }
  };

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
                      onViewDetails={handleCardClick}
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
