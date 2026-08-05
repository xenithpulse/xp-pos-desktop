// pos_modules/orders/order-editor/TakeawayOrderSwitcher.tsx
// Horizontal scrollable pill-list of active takeaway orders.
// Shows client name, order status badge, and total.
// Handles 50+ orders with virtualized-like pagination + search.

'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ArrowRightLeft, ChevronDown, ChevronUp, Plus, Search,
  ChevronLeft, ChevronRight, Package,
} from 'lucide-react';
import type { Order } from '@/types/order.types';
import { ORDER_STATUS_COLORS, ORDER_STATUS_LABELS } from '@/types/order.types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface TakeawayOrderSwitcherProps {
  /** All active takeaway orders */
  orders: Order[];
  /** Currently focused order ID */
  activeOrderId?: string;
  /** Called when switching to a different takeaway order */
  onSwitchOrder: (order: Order) => void;
  /** Called when starting a fresh new takeaway order */
  onNewOrder: () => void;
  /** Whether data is still loading */
  isLoading?: boolean;
  /** Header label + empty-state copy — defaults to "Takeaway Orders" */
  label?: string;
}

const CHIPS_PER_PAGE = 12;

export default function TakeawayOrderSwitcher({
  orders,
  activeOrderId,
  onSwitchOrder,
  onNewOrder,
  isLoading,
  label = 'Takeaway Orders',
}: TakeawayOrderSwitcherProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [chipPage, setChipPage] = useState(0);
  const [filterQuery, setFilterQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Filter orders by search ───────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    if (!filterQuery.trim()) return orders;
    const q = filterQuery.toLowerCase().trim();
    return orders.filter((o) => {
      if (o.customer?.name?.toLowerCase().includes(q)) return true;
      if (o.customer?.phone?.includes(q)) return true;
      if (String(o.orderNumber).toLowerCase().includes(q)) return true;
      return false;
    });
  }, [orders, filterQuery]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / CHIPS_PER_PAGE));
  const visibleOrders = filteredOrders.slice(
    chipPage * CHIPS_PER_PAGE,
    (chipPage + 1) * CHIPS_PER_PAGE,
  );

  // Clamp page
  useEffect(() => {
    if (chipPage >= totalPages) setChipPage(Math.max(0, totalPages - 1));
  }, [chipPage, totalPages]);

  // Reset page on search
  useEffect(() => { setChipPage(0); }, [filterQuery]);

  // Auto-focus search
  useEffect(() => {
    if (showSearch) searchRef.current?.focus();
  }, [showSearch]);

  const handleSwitchToOrder = useCallback(
    (order: Order) => {
      onSwitchOrder(order);
    },
    [onSwitchOrder],
  );

  return (
    <div className="border-b border-gray-800">
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="px-3 py-2 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded((p) => !p)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white transition-colors"
        >
          <ArrowRightLeft size={14} className="text-orange-400" />
          <span>{label}</span>
          <span className="text-xs text-gray-500 font-normal">
            {orders.length} active
          </span>
          {isExpanded ? (
            <ChevronUp size={14} className="text-gray-500" />
          ) : (
            <ChevronDown size={14} className="text-gray-500" />
          )}
        </button>

        <div className="flex items-center gap-1">
          {/* Search toggle (only when 5+ orders) */}
          {orders.length >= 5 && (
            <button
              onClick={() => setShowSearch((p) => !p)}
              className={`p-1 rounded transition-colors ${showSearch ? 'text-orange-400 bg-orange-500/10' : 'text-gray-500 hover:text-white hover:bg-gray-800'}`}
            >
              <Search size={12} />
            </button>
          )}
          {/* New Order Button */}
          <button
            onClick={onNewOrder}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-orange-300 hover:text-white bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 rounded-md transition-colors"
          >
            <Plus size={12} />
            <span className="hidden sm:inline">New</span>
          </button>
        </div>
      </div>

      {/* ── Search bar ─────────────────────────────────────────────────── */}
      {showSearch && isExpanded && (
        <div className="px-3 pb-2">
          <input
            ref={searchRef}
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="Filter by name, phone, order #..."
            className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
          />
        </div>
      )}

      {/* ── Order chips ────────────────────────────────────────────────── */}
      {isExpanded && (
        <div className="px-3 pb-2">
          {isLoading ? (
            <div className="text-center py-3 text-xs text-gray-500">Loading orders...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-3">
              <Package size={16} className="mx-auto mb-1 text-gray-600" />
              <p className="text-xs text-gray-500">
                {filterQuery ? 'No matching orders' : `No active ${label.toLowerCase()}`}
              </p>
              <button
                onClick={onNewOrder}
                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                <Plus size={12} />
                Start New Order
              </button>
            </div>
          ) : (
            <>
              {/* Phase 17 §3.3: two up below `sm` — these tiles carry a
                  customer name, and three across on a phone truncated it to
                  the point of being unusable for telling orders apart. */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {visibleOrders.map((order) => {
                  const isActive = order._id === activeOrderId;
                  const statusColor = ORDER_STATUS_COLORS[order.status] || { bg: 'bg-gray-500/20', text: 'text-gray-400' };
                  const clientName = order.customer?.name || 'Walk-in';
                  const displayName = clientName.length > 12 ? clientName.slice(0, 12) + '…' : clientName;

                  return (
                    <button
                      key={order._id}
                      onClick={() => handleSwitchToOrder(order)}
                      className={`relative flex flex-col items-center text-center px-1.5 py-2 rounded-lg border transition-all duration-150 ${
                        isActive
                          ? 'bg-orange-500/15 border-orange-500/50 ring-1 ring-orange-500/30 shadow-md shadow-orange-500/10'
                          : 'bg-gray-900/60 border-gray-800 hover:border-gray-700 hover:bg-gray-900'
                      }`}
                    >
                      {/* Client name */}
                      <span className={`text-[11px] font-medium leading-tight truncate w-full ${isActive ? 'text-white' : 'text-gray-300'}`}>
                        {displayName}
                      </span>
                      {/* Order number + status badge */}
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[9px] text-gray-500">{String(order.orderNumber).split('-').pop()}</span>
                        <span className={`text-[8px] px-1 py-0 rounded ${statusColor.bg} ${statusColor.text}`}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                      </div>
                      {/* Total */}
                      {order.grandTotal > 0 && (
                        <span className={`text-[10px] mt-0.5 ${isActive ? 'text-orange-300' : 'text-gray-500'}`}>
                          {order.grandTotal}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-2">
                  <button
                    onClick={() => setChipPage((p) => Math.max(0, p - 1))}
                    disabled={chipPage === 0}
                    className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 text-gray-400 transition-colors"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <span className="text-[10px] text-gray-500">
                    {chipPage + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setChipPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={chipPage >= totalPages - 1}
                    className="p-1 rounded hover:bg-gray-800 disabled:opacity-30 text-gray-400 transition-colors"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
