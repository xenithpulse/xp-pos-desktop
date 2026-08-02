// components/orders/OrderList.tsx
// High-performance paginated order list with Ongoing / History sub-views
// Clicking an order loads it into the Order Editor tab

'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  History,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Filter,
  ArrowUpDown,
  Eye,
  DollarSign,
  Users,
  User,
  LayoutGrid,
  AlertCircle,
  RotateCcw,
  FileText,
  Printer,
  CheckCircle2,
  ChefHat,
  UtensilsCrossed,
  CreditCard,
  Package,
  Edit,
  MoreHorizontal,
  Trash2,
  X,
  CheckSquare,
  Square,
} from 'lucide-react';
import { usePOSStore } from '@/stores/posStore';
import {
  Order,
  OrderStatus,
  OrdersResponse,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
  ORDER_MODE_LABELS,
  ORDER_MODE_COLORS,
  PaymentStatus,
} from '@/types/order.types';
import { SmartCache } from '@/lib/cache';
import { DaySummaryPanel } from '../printing-facility';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ListSubView = 'ongoing' | 'history';

interface OrderListProps {
  /** Called when user clicks an order to open in the editor */
  onOpenInEditor?: (order: Order) => void;
  /**
   * Monotonic counter the hub bumps on every realtime order event. When it
   * changes, this list invalidates its cache and refetches the current view —
   * keeping it live off the hub's single realtime connection (no extra socket).
   */
  refreshSignal?: number;
}

const PAGE_SIZE = 20;

const orderListCache = new SmartCache<OrdersResponse>({ ttl: 15_000, maxSize: 50 });

function getCacheKey(subView: ListSubView, page: number, search: string, paymentFilter: string): string {
  return `${subView}:${page}:${search}:${paymentFilter}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function OrderList({ onOpenInEditor, refreshSignal = 0 }: OrderListProps) {
  const setActiveTab = usePOSStore((s) => s.setActiveTab);
  const setFocusedContext = usePOSStore((s) => s.setFocusedContext);

  const [subView, setSubView] = useState<ListSubView>('ongoing');
  const [page, setPage] = useState(1);
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [showDaySummary, setShowDaySummary] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const realtimeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1); // Reset to first page on search
    }, 400);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // Reset page on sub-view change
  useEffect(() => {
    setPage(1);
  }, [subView]);

  // Fetch orders with cache
  const fetchOrders = useCallback(async () => {
    const cacheKey = getCacheKey(subView, page, debouncedSearch, paymentFilter);
    const cached = orderListCache.get(cacheKey);
    if (cached) {
      setOrders(cached.orders);
      setTotalPages(cached.pagination.totalPages);
      setTotal(cached.pagination.total);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });

      if (subView === 'ongoing') {
        params.set('activeOnly', 'true');
      } else {
        // History: completed & cancelled
        params.set('status', 'completed');
        // We also want cancelled — use a comma-joined approach or fetch both
        // The API only accepts a single status, so we fetch completed and handle on client
        // Actually, let's pass filter differently
      }

      if (paymentFilter !== 'all') {
        params.set('paymentStatus', paymentFilter);
      }

      const res = await fetch(`/api/orders?${params.toString()}`);
      if (res.ok) {
        const data: OrdersResponse = await res.json();
        let filteredOrders = data.orders;

        // Client-side search filter
        if (debouncedSearch) {
          const q = debouncedSearch.toLowerCase();
          filteredOrders = filteredOrders.filter(
            (o) =>
              String(o.orderNumber).toLowerCase().includes(q) ||
              o.table?.tableNumber?.toLowerCase().includes(q) ||
              o.customer?.name?.toLowerCase().includes(q),
          );
        }

        setOrders(filteredOrders);
        setTotalPages(data.pagination.totalPages);
        setTotal(data.pagination.total);

        // Cache
        orderListCache.set(cacheKey, data);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [subView, page, debouncedSearch, paymentFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // ── Realtime refresh ───────────────────────────────────────────────────────
  // The hub bumps `refreshSignal` on every order event. Invalidate the whole
  // cache (counts/pagination shift across pages when orders move between the
  // ongoing/history views) and refetch the current view. Debounced so a burst
  // of events during a busy service collapses into a single fetch. Uses a ref
  // for fetchOrders so this only fires on the signal — not on every filter edit.
  const fetchOrdersRef = useRef(fetchOrders);
  useEffect(() => { fetchOrdersRef.current = fetchOrders; }, [fetchOrders]);

  const didMountSignalRef = useRef(false);
  useEffect(() => {
    // Skip the mount run — the effect above already fetches on mount.
    if (!didMountSignalRef.current) { didMountSignalRef.current = true; return; }

    if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = setTimeout(() => {
      orderListCache.clear();
      fetchOrdersRef.current();
    }, 400);

    return () => {
      if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    };
  }, [refreshSignal]);

  // Handle opening an order in the editor
  const handleOpenOrder = useCallback(
    (order: Order) => {
      setFocusedContext({
        orderId: order._id,
        order,
        tableId: order.table?.tableId,
      });
      setActiveTab('order-editor');
      onOpenInEditor?.(order);
    },
    [setFocusedContext, setActiveTab, onOpenInEditor],
  );

  /**
   * Restart a cancelled order — creates a new session at the original table
   * only if that table is currently Available.
   */
  const handleRestartOrder = useCallback(
    async (order: Order) => {
      if (!order.table?.tableId) {
        alert('This order has no linked table. Cannot restart.');
        return;
      }

      try {
        // Check table availability first
        const tableRes = await fetch(`/api/tables/${order.table.tableId}`);
        if (!tableRes.ok) {
          alert('Could not fetch table status.');
          return;
        }
        const tableData = await tableRes.json();
        if (tableData.status !== 'available') {
          alert(
            `Table ${order.table.tableNumber || tableData.tableNumber} is currently ${tableData.status}. It must be available to restart.`,
          );
          return;
        }

        // Initiate a new session at the table
        const res = await fetch('/api/tables/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableId: order.table.tableId,
            covers: order.table.guestCount || 1,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          alert(errData.error || 'Failed to restart order');
          return;
        }

        const data = await res.json();

        // Navigate to the new order in the editor
        setFocusedContext({
          tableId: order.table.tableId,
          table: data.table,
          sessionId: data.session._id,
          session: data.session,
          orderId: data.order._id,
          order: data.order,
        });
        setActiveTab('order-editor');
      } catch (err) {
        console.error('Failed to restart order:', err);
        alert('Failed to restart order. Please try again.');
      }
    },
    [setFocusedContext, setActiveTab],
  );

  /**
   * Quick action handler — performs status updates directly from the order list
   */
  const handleQuickAction = useCallback(
    async (orderId: string, action: string): Promise<void> => {
      const actionMap: Record<string, { action: string; body?: Record<string, unknown> }> = {
        'start_preparing': { action: 'start_preparing' },
        'mark_ready': { action: 'mark_ready' },
        'serve': { action: 'serve' },
        'pay': { action: 'pay', body: { paymentMethod: 'cash', amount: 0 } },
        'complete': { action: 'complete' },
        'complete_and_pay': { action: 'complete_and_pay', body: { paymentMethod: 'cash' } },
      };

      const config = actionMap[action];
      if (!config) {
        console.warn('Unknown quick action:', action);
        return;
      }

      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: config.action, ...config.body }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          alert(errData.error || `Failed to ${action.replace('_', ' ')}`);
          return;
        }

        // Refresh the order list
        orderListCache.invalidateWhere((key) => key.startsWith(subView));
        fetchOrders();
      } catch (err) {
        console.error(`Quick action ${action} failed:`, err);
        alert(`Failed to ${action.replace('_', ' ')}. Please try again.`);
      }
    },
    [subView, fetchOrders],
  );

  // ─── Selection helpers ──────────────────────────────────────────────────
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === orders.length ? new Set() : new Set(orders.map((o) => o._id)),
    );
  }, [orders]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Clear selection when page / filters change
  useEffect(() => { clearSelection(); }, [page, subView, debouncedSearch, paymentFilter, clearSelection]);

  // ─── Delete helpers ─────────────────────────────────────────────────────
  const handleDeleteOrder = useCallback(
    async (orderId: string, hard = false) => {
      const label = hard ? 'permanently delete' : 'void';
      if (!confirm(`Are you sure you want to ${label} this order?`)) return;
      try {
        const url = hard ? `/api/orders/${orderId}?hardDelete=true` : `/api/orders/${orderId}`;
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || `Failed to ${label} order`);
          return;
        }
        orderListCache.invalidateWhere(() => true);
        fetchOrders();
      } catch {
        alert(`Failed to ${label} order. Please try again.`);
      }
    },
    [fetchOrders],
  );

  const handleBulkDelete = useCallback(
    async (hard = false) => {
      const count = selectedIds.size;
      if (count === 0) return;
      const label = hard ? 'permanently delete' : 'void';
      if (!confirm(`Are you sure you want to ${label} ${count} order${count > 1 ? 's' : ''}?`)) return;
      setIsDeleting(true);
      try {
        const results = await Promise.allSettled(
          Array.from(selectedIds).map((id) => {
            const url = hard ? `/api/orders/${id}?hardDelete=true` : `/api/orders/${id}`;
            return fetch(url, { method: 'DELETE' });
          }),
        );
        const failed = results.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length;
        if (failed > 0) alert(`${failed} of ${count} orders failed to ${label}.`);
        clearSelection();
        orderListCache.invalidateWhere(() => true);
        fetchOrders();
      } catch {
        alert('Bulk delete failed. Please try again.');
      } finally {
        setIsDeleting(false);
      }
    },
    [selectedIds, clearSelection, fetchOrders],
  );

  const handleRefresh = () => {
    // Invalidate cache for current view
    orderListCache.invalidateWhere((key) => key.startsWith(subView));
    fetchOrders();
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="px-3 sm:px-4 py-3 border-b border-gray-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left: toggle + count */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="flex bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => setSubView('ongoing')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                subView === 'ongoing'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <Clock size={14} />
              <span className="hidden xs:inline">Ongoing</span>
            </button>
            <button
              onClick={() => setSubView('history')}
              className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                subView === 'history'
                  ? 'bg-purple-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              <History size={14} />
              <span className="hidden xs:inline">History</span>
            </button>
          </div>
          <span className="text-xs sm:text-sm text-gray-500 whitespace-nowrap">
            {total} order{total !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Right: search + filters + actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[140px] sm:min-w-0 sm:flex-none">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full sm:w-52 lg:w-64 pl-8 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs sm:text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
            />
          </div>

          <select
            value={paymentFilter}
            onChange={(e) => { setPaymentFilter(e.target.value); setPage(1); }}
            className="px-2 sm:px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-xs sm:text-sm focus:outline-none focus:border-purple-500"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="partial">Partial</option>
          </select>

          <button
            onClick={() => setShowDaySummary(true)}
            className="flex items-center gap-1.5 px-2 sm:px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors text-xs sm:text-sm font-medium"
            title="Day Summary Report"
          >
            <FileText size={14} />
            <span className="hidden sm:inline">Reports</span>
          </button>

          <button
            onClick={handleRefresh}
            className="p-2 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ── Bulk-selection bar ───────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-gray-800"
          >
            <div className="px-3 sm:px-4 py-2 flex items-center justify-between bg-purple-600/10">
              <span className="text-xs sm:text-sm text-purple-300 font-medium">
                {selectedIds.size} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleBulkDelete(false)}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  Void Selected
                </button>
                <button
                  onClick={() => handleBulkDelete(true)}
                  disabled={isDeleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  <Trash2 size={13} />
                  Delete Selected
                </button>
                <button
                  onClick={clearSelection}
                  className="p-1.5 text-gray-400 hover:text-white transition-colors"
                  title="Clear selection"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Order list body ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && orders.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <AlertCircle size={48} className="mb-4 opacity-50" />
            <p className="text-lg">No orders found</p>
            <p className="text-sm text-gray-600 mt-1">
              {subView === 'ongoing'
                ? 'No active orders at the moment.'
                : 'No past orders match your filters.'}
            </p>
          </div>
        ) : (
          <>
            {/* ── Desktop table (hidden on mobile) ─────────────────────── */}
            <table className="w-full hidden md:table">
              <thead className="bg-gray-900/50 sticky top-0">
                <tr className="text-[10px] text-gray-500 uppercase tracking-wider">
                  <th className="w-8 px-2 py-2">
                    <button onClick={toggleSelectAll} className="text-gray-500 hover:text-white">
                      {selectedIds.size === orders.length && orders.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
                    </button>
                  </th>
                  <th className="text-left px-3 py-2 font-medium">Order</th>
                  <th className="text-left px-3 py-2 font-medium">Table/Customer</th>
                  <th className="text-left px-3 py-2 font-medium">Mode/Status</th>
                  <th className="text-left px-3 py-2 font-medium">Payment</th>
                  <th className="text-center px-3 py-2 font-medium">Items</th>
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                  <th className="text-left px-3 py-2 font-medium">Time</th>
                  <th className="text-right px-2 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {orders.map((order) => (
                  <OrderRow
                    key={order._id}
                    order={order}
                    onOpen={() => handleOpenOrder(order)}
                    onRestart={
                      order.status === 'cancelled' && order.table?.tableId
                        ? () => handleRestartOrder(order)
                        : undefined
                    }
                    onQuickAction={handleQuickAction}
                    isSelected={selectedIds.has(order._id)}
                    onToggleSelect={() => toggleSelect(order._id)}
                    onDelete={handleDeleteOrder}
                  />
                ))}
              </tbody>
            </table>

            {/* ── Mobile cards (visible only on mobile) ──────────────── */}
            <div className="md:hidden flex flex-col gap-2 p-3">
              {/* Mobile select-all */}
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-white mb-1 self-start"
              >
                {selectedIds.size === orders.length && orders.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
                {selectedIds.size === orders.length && orders.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
              {orders.map((order) => (
                <MobileOrderCard
                  key={order._id}
                  order={order}
                  onOpen={() => handleOpenOrder(order)}
                  onRestart={
                    order.status === 'cancelled' && order.table?.tableId
                      ? () => handleRestartOrder(order)
                      : undefined
                  }
                  onQuickAction={handleQuickAction}
                  isSelected={selectedIds.has(order._id)}
                  onToggleSelect={() => toggleSelect(order._id)}
                  onDelete={handleDeleteOrder}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      {totalPages > 1 && (
        <div className="px-3 sm:px-4 py-3 border-t border-gray-800 flex items-center justify-between">
          <span className="text-xs sm:text-sm text-gray-500">
            <span className="hidden sm:inline">Page </span>{page}/{totalPages}
            <span className="hidden sm:inline"> ({total} orders)</span>
          </span>
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 sm:p-2 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={16} />
            </button>

            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) pageNum = i + 1;
              else if (page <= 3) pageNum = i + 1;
              else if (page >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = page - 2 + i;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPage(pageNum)}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                    page === pageNum
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 sm:p-2 bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Day Summary Report Panel */}
      <DaySummaryPanel
        isOpen={showDaySummary}
        onClose={() => setShowDaySummary(false)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Row — Enhanced with more info and CLA buttons
// ─────────────────────────────────────────────────────────────────────────────

interface OrderRowProps {
  order: Order;
  onOpen: () => void;
  onRestart?: () => void;
  onQuickAction?: (orderId: string, action: string) => Promise<void>;
  isHistorical?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onDelete?: (orderId: string, hard?: boolean) => Promise<void>;
}

function OrderRow({ order, onOpen, onRestart, onQuickAction, isHistorical, isSelected, onToggleSelect, onDelete }: OrderRowProps) {
  const [showActions, setShowActions] = useState(false);
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  
  const statusColor = ORDER_STATUS_COLORS[order.status];
  const paymentColor = PAYMENT_STATUS_COLORS[order.paymentStatus];
  const modeColor = ORDER_MODE_COLORS[order.mode];

  const timeAgo = useMemo(() => {
    const diff = Date.now() - new Date(order.createdAt).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(order.createdAt).toLocaleDateString();
  }, [order.createdAt]);

  // Calculate total item quantity
  const totalQty = useMemo(() => {
    return order.items.reduce((sum, item) => sum + item.quantity, 0);
  }, [order.items]);

  // Get elapsed time since order creation in a more detailed format
  const elapsedTime = useMemo(() => {
    const diff = Date.now() - new Date(order.createdAt).getTime();
    const mins = Math.floor(diff / 60_000);
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hrs > 0) return `${hrs}h ${remainingMins}m`;
    return `${mins}m`;
  }, [order.createdAt]);

  // Status-specific time (when it moved to current status)
  const statusTime = useMemo(() => {
    const statusMap: Record<string, string | undefined> = {
      confirmed: order.confirmedAt,
      preparing: order.prepStartedAt,
      ready: order.readyAt,
      completed: order.completedAt,
    };
    const timestamp = statusMap[order.status];
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }, [order]);

  // Determine next available actions based on status
  const availableActions = useMemo(() => {
    const actions: { label: string; action: string; icon: React.ReactNode; color: string }[] = [];
    
    switch (order.status) {
      case 'confirmed':
        actions.push({ label: 'Start Prep', action: 'start_preparing', icon: <ChefHat size={12} />, color: 'bg-yellow-600 hover:bg-yellow-500' });
        break;
      case 'preparing':
        actions.push({ label: 'Mark Ready', action: 'mark_ready', icon: <CheckCircle2 size={12} />, color: 'bg-orange-600 hover:bg-orange-500' });
        break;
      case 'ready':
        actions.push({ label: 'Serve', action: 'serve', icon: <UtensilsCrossed size={12} />, color: 'bg-blue-600 hover:bg-blue-500' });
        break;
      case 'served':
        if (order.paymentStatus !== 'paid') {
          actions.push({ label: 'Pay', action: 'pay', icon: <CreditCard size={12} />, color: 'bg-green-600 hover:bg-green-500' });
        }
        actions.push({ label: 'Complete', action: 'complete', icon: <CheckCircle2 size={12} />, color: 'bg-emerald-600 hover:bg-emerald-500' });
        break;
    }
    
    return actions;
  }, [order.status, order.paymentStatus]);

  const handleQuickAction = async (action: string) => {
    if (!onQuickAction || isPerformingAction) return;
    setIsPerformingAction(true);
    try {
      await onQuickAction(order._id, action);
    } finally {
      setIsPerformingAction(false);
      setShowActions(false);
    }
  };

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`hover:bg-gray-800/50 transition-colors cursor-pointer group ${isHistorical ? 'bg-amber-900/5' : ''} ${isSelected ? 'bg-purple-900/20' : ''}`}
      onClick={onOpen}
    >
      {/* Checkbox */}
      <td className="w-8 px-2 py-2.5">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.(); }}
          className="text-gray-500 hover:text-white"
        >
          {isSelected ? <CheckSquare size={14} className="text-purple-400" /> : <Square size={14} />}
        </button>
      </td>

      {/* Order Number + Priority + Historical indicator */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white text-sm">#{order.orderNumber}</span>
            {order.isPriority && (
              <span className="px-1 py-0.5 bg-red-500/20 text-red-400 text-[9px] font-bold rounded">
                VIP
              </span>
            )}
            {isHistorical && (
              <span className="px-1 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] font-bold rounded">
                HIST
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-500">{elapsedTime} elapsed</span>
        </div>
      </td>

      {/* Table + Covers */}
      <td className="px-3 py-2.5">
        {order.table?.tableNumber ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1 text-sm text-gray-200 font-medium">
              <LayoutGrid size={12} className="text-purple-400" />
              {order.table.tableNumber}
            </div>
            {order.table.guestCount && (
              <div className="flex items-center gap-1 text-[10px] text-gray-500">
                <Users size={10} />
                {order.table.guestCount} covers
              </div>
            )}
          </div>
        ) : order.customer?.name ? (
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-gray-200 truncate max-w-[100px]">{order.customer.name}</span>
            {order.customer.phone && (
              <span className="text-[10px] text-gray-500">{order.customer.phone}</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-600">—</span>
        )}
      </td>

      {/* Mode + Status combined */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-1">
          <span className={`inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${modeColor.bg} ${modeColor.text}`}>
            {ORDER_MODE_LABELS[order.mode]}
          </span>
          <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${statusColor.bg} ${statusColor.text}`}>
            {ORDER_STATUS_LABELS[order.status]}
          </span>
        </div>
      </td>

      {/* Payment Status + Amount Due indicator */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium ${paymentColor.bg} ${paymentColor.text}`}>
            {PAYMENT_STATUS_LABELS[order.paymentStatus]}
          </span>
          <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-medium ${paymentColor.bg} ${paymentColor.text}`}>
            {order.transactions.length > 0 ? order.transactions[0].method.toString() : "—"}
          </span>
          {order.amountDue > 0 && (
            <span className="text-[10px] text-orange-400 font-medium">
              Due: {order.amountDue}
            </span>
          )}
        </div>
      </td>

      {/* Items count + Qty */}
      <td className="px-3 py-2.5 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-sm font-medium text-gray-200">{order.items.length}</span>
          <span className="text-[10px] text-gray-500">({totalQty} qty)</span>
        </div>
      </td>

      {/* Total + Subtotal */}
      <td className="px-3 py-2.5 text-right">
        <div className="flex flex-col items-end gap-0.5">
          <span className="text-sm font-semibold text-white">{order.grandTotal}</span>
          {order.subtotal !== order.grandTotal && (
            <span className="text-[10px] text-gray-500">Sub: {order.subtotal}</span>
          )}
        </div>
      </td>

      {/* Time + Status timestamp */}
      <td className="px-3 py-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-gray-400">{timeAgo}</span>
          {statusTime && (
            <span className="text-[10px] text-gray-500">@{statusTime}</span>
          )}
        </div>
      </td>

      {/* Actions — expanded with more CLA buttons */}
      <td className="px-2 py-2.5">
        <div className="flex items-center justify-end gap-1 relative">
          {/* Quick action buttons (visible on hover) */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {availableActions.slice(0, 2).map((act) => (
              <button
                key={act.action}
                onClick={(e) => {
                  e.stopPropagation();
                  handleQuickAction(act.action);
                }}
                disabled={isPerformingAction}
                className={`p-1 text-white rounded text-[10px] font-medium flex items-center gap-0.5 transition-all ${act.color} ${isPerformingAction ? 'opacity-50' : ''}`}
                title={act.label}
              >
                {act.icon}
              </button>
            ))}
            
            {/* Edit button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onOpen();
              }}
              className="p-1 bg-purple-600 hover:bg-purple-500 text-white rounded transition-colors"
              title="Edit order"
            >
              <Edit size={12} />
            </button>
            
            {/* Print */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                window.print();
              }}
              className="p-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors"
              title="Print"
            >
              <Printer size={12} />
            </button>

            {/* Delete */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete?.(order._id, false);
              }}
              className="p-1 bg-red-600/80 hover:bg-red-500 text-white rounded transition-colors"
              title="Delete order"
            >
              <Trash2 size={12} />
            </button>
          </div>

          {/* Restart button for cancelled orders */}
          {onRestart && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRestart();
              }}
              className="p-1 bg-green-600 hover:bg-green-500 text-white rounded transition-colors"
              title="Restart order"
            >
              <RotateCcw size={12} />
            </button>
          )}
          
          {/* More actions menu */}
          {availableActions.length > 2 && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowActions(!showActions);
                }}
                className="p-1 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors opacity-0 group-hover:opacity-100"
              >
                <MoreHorizontal size={12} />
              </button>
              {showActions && (
                <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-10 min-w-[120px] py-1">
                  {availableActions.slice(2).map((act) => (
                    <button
                      key={act.action}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickAction(act.action);
                      }}
                      disabled={isPerformingAction}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                    >
                      {act.icon}
                      {act.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </td>
    </motion.tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile Order Card — responsive card layout for small screens
// ─────────────────────────────────────────────────────────────────────────────

function MobileOrderCard({ order, onOpen, onRestart, onQuickAction, isSelected, onToggleSelect, onDelete }: OrderRowProps) {
  const [isPerformingAction, setIsPerformingAction] = useState(false);

  const statusColor = ORDER_STATUS_COLORS[order.status];
  const paymentColor = PAYMENT_STATUS_COLORS[order.paymentStatus];
  const modeColor = ORDER_MODE_COLORS[order.mode];

  const timeAgo = useMemo(() => {
    const diff = Date.now() - new Date(order.createdAt).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return new Date(order.createdAt).toLocaleDateString();
  }, [order.createdAt]);

  const totalQty = useMemo(() => order.items.reduce((sum, item) => sum + item.quantity, 0), [order.items]);

  const availableActions = useMemo(() => {
    const actions: { label: string; action: string; icon: React.ReactNode; color: string }[] = [];
    switch (order.status) {
      case 'confirmed':
        actions.push({ label: 'Start Prep', action: 'start_preparing', icon: <ChefHat size={12} />, color: 'bg-yellow-600 hover:bg-yellow-500' });
        break;
      case 'preparing':
        actions.push({ label: 'Mark Ready', action: 'mark_ready', icon: <CheckCircle2 size={12} />, color: 'bg-orange-600 hover:bg-orange-500' });
        break;
      case 'ready':
        actions.push({ label: 'Serve', action: 'serve', icon: <UtensilsCrossed size={12} />, color: 'bg-blue-600 hover:bg-blue-500' });
        break;
      case 'served':
        if (order.paymentStatus !== 'paid')
          actions.push({ label: 'Pay', action: 'pay', icon: <CreditCard size={12} />, color: 'bg-green-600 hover:bg-green-500' });
        actions.push({ label: 'Complete', action: 'complete', icon: <CheckCircle2 size={12} />, color: 'bg-emerald-600 hover:bg-emerald-500' });
        break;
    }
    return actions;
  }, [order.status, order.paymentStatus]);

  const handleQuickAction = async (action: string) => {
    if (!onQuickAction || isPerformingAction) return;
    setIsPerformingAction(true);
    try { await onQuickAction(order._id, action); }
    finally { setIsPerformingAction(false); }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-gray-900 border rounded-xl p-3 active:bg-gray-800/70 transition-colors ${
        isSelected ? 'border-purple-500 bg-purple-900/15' : 'border-gray-800'
      }`}
    >
      {/* Top row: checkbox, order#, badges, total */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => onToggleSelect?.()} className="text-gray-500 hover:text-white shrink-0">
            {isSelected ? <CheckSquare size={16} className="text-purple-400" /> : <Square size={16} />}
          </button>
          <div onClick={onOpen}>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-white text-sm">#{order.orderNumber}</span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${modeColor.bg} ${modeColor.text}`}>
                {ORDER_MODE_LABELS[order.mode]}
              </span>
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${statusColor.bg} ${statusColor.text}`}>
                {ORDER_STATUS_LABELS[order.status]}
              </span>
              {order.isPriority && (
                <span className="px-1 py-0.5 bg-red-500/20 text-red-400 text-[9px] font-bold rounded">VIP</span>
              )}
            </div>
          </div>
        </div>
        <span className="text-sm font-semibold text-white whitespace-nowrap">{order.grandTotal}</span>
      </div>

      {/* Middle row: table/customer, items, payment, time */}
      <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400 flex-wrap" onClick={onOpen}>
        {order.table?.tableNumber ? (
          <span className="flex items-center gap-1">
            <LayoutGrid size={11} className="text-purple-400" />
            {order.table.tableNumber}
            {order.table.guestCount ? ` · ${order.table.guestCount}p` : ''}
          </span>
        ) : order.customer?.name ? (
          <span className="flex items-center gap-1 truncate max-w-[90px]">
            <User size={11} />
            {order.customer.name}
          </span>
        ) : null}
        <span>{order.items.length} items ({totalQty} qty)</span>
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${paymentColor.bg} ${paymentColor.text}`}>
          {PAYMENT_STATUS_LABELS[order.paymentStatus]}
        </span>
        {order.amountDue > 0 && (
          <span className="text-[10px] text-orange-400 font-medium">Due: {order.amountDue}</span>
        )}
        <span className="ml-auto text-[10px] text-gray-500">{timeAgo}</span>
      </div>

      {/* Actions row */}
      <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
        {availableActions.map((act) => (
          <button
            key={act.action}
            onClick={() => handleQuickAction(act.action)}
            disabled={isPerformingAction}
            className={`flex items-center gap-1 px-2 py-1 text-white rounded text-[10px] font-medium transition-all ${act.color} ${isPerformingAction ? 'opacity-50' : ''}`}
          >
            {act.icon}
            {act.label}
          </button>
        ))}

        <button
          onClick={onOpen}
          className="flex items-center gap-1 px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[10px] font-medium"
        >
          <Edit size={11} /> Edit
        </button>

        {onRestart && (
          <button
            onClick={onRestart}
            className="flex items-center gap-1 px-2 py-1 bg-green-600 hover:bg-green-500 text-white rounded text-[10px] font-medium"
          >
            <RotateCcw size={11} /> Restart
          </button>
        )}

        <button
          onClick={() => onDelete?.(order._id, false)}
          className="flex items-center gap-1 px-2 py-1 bg-red-600/80 hover:bg-red-500 text-white rounded text-[10px] font-medium ml-auto"
        >
          <Trash2 size={11} /> Delete
        </button>
      </div>
    </motion.div>
  );
}
