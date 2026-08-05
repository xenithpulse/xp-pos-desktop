// pos_modules/context-bar/GlobalContextBar.tsx
// Smart top bar: tab navigation, rich order context, live stats, global actions
// Responsive: tabs move to bottom bar on mobile; error & network indicators

'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutGrid,
  ClipboardList,
  UtensilsCrossed,
  RefreshCw,
  Plus,
  Bell,
  User,
  ChevronDown,
  PenSquare,
  History,
  Printer,
  FileText,
  ShoppingBag,
  Hash,
  Users,
  AlertCircle,
  Archive,
  CreditCard,
  CircleDot,
  Zap,
  Wifi,
  WifiOff,
  Radio,
  Activity,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  Signal,
  SignalLow,
  SignalMedium,
  SignalHigh,
  SignalZero,
  Maximize,
  Minimize,
  Settings,
  Truck,
} from 'lucide-react';
import { usePOSStore, type NetworkQuality } from '@/stores/posStore';
import { formatPrice } from '@/types/menu.types';
import type { TabConfig, GlobalContextBarProps, SyncStatus } from './types';
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
} from '@/types/order.types';
import { ThermalPrinterStatus, PrinterSettingsPanel } from '../orders/printing-facility';

// ─────────────────────────────────────────────────────────────────────────────
// Tab Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The tabs of the dine-in workspace.
 *
 * Takeaway and Delivery are NOT here. They are their own pages (/takeaway,
 * /delivery) and were removed from this strip in Phase 16 §3 — carrying them
 * in both places meant two routes to the same screen and a tab strip that
 * contradicted the sidebar. The capability is untouched: those routes render
 * the same component pinned to a workspace, which still drives the
 * `takeawaySlot` / `deliverySlot` context-bar content below.
 */
const TABS: TabConfig[] = [
  {
    id: 'floor-plan',
    label: 'Floor Plan',
    icon: <LayoutGrid size={18} />,
  },
  {
    id: 'orders',
    label: 'Orders',
    icon: <ClipboardList size={18} />,
  },
  {
    id: 'order-editor',
    label: 'Order Editor',
    icon: <PenSquare size={18} />,
  },
  {
    id: 'order-list',
    label: 'History',
    icon: <History size={18} />,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sync status helpers
// ─────────────────────────────────────────────────────────────────────────────

const SYNC_META: Record<SyncStatus, { icon: typeof Wifi; color: string; label: string; pulse: boolean }> = {
  connected:    { icon: Wifi,    color: 'text-emerald-400', label: 'Live',         pulse: false },
  connecting:   { icon: Radio,   color: 'text-amber-400',   label: 'Connecting…',  pulse: true },
  polling:      { icon: Radio,   color: 'text-yellow-400',  label: 'Polling',      pulse: true },
  disconnected: { icon: WifiOff, color: 'text-red-400',     label: 'Offline',      pulse: false },
};

// ─────────────────────────────────────────────────────────────────────────────
// Network quality helpers
// ─────────────────────────────────────────────────────────────────────────────

const NETWORK_META: Record<NetworkQuality, { icon: typeof Signal; color: string; label: string }> = {
  excellent: { icon: Signal,       color: 'text-emerald-400', label: 'Excellent' },
  good:      { icon: SignalHigh,   color: 'text-green-400',   label: 'Good' },
  fair:      { icon: SignalMedium, color: 'text-amber-400',   label: 'Fair' },
  poor:      { icon: SignalLow,    color: 'text-red-400',     label: 'Poor' },
  offline:   { icon: SignalZero,   color: 'text-red-500',     label: 'Offline' },
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Network Quality Monitor Hook
// ─────────────────────────────────────────────────────────────────────────────

function useNetworkMonitor() {
  const setNetworkQuality = usePOSStore((s) => s.setNetworkQuality);

  useEffect(() => {
    function assess() {
      if (!navigator.onLine) {
        setNetworkQuality('offline');
        return;
      }
      const conn = (navigator as any).connection;
      if (!conn) {
        setNetworkQuality('good');
        return;
      }
      const rtt = conn.rtt ?? 0;       // ms
      const dl = conn.downlink ?? 10;   // Mbps
      if (rtt === 0 && dl === 0) { setNetworkQuality('offline'); return; }
      if (dl >= 5 && rtt < 100) { setNetworkQuality('excellent'); return; }
      if (dl >= 2 && rtt < 200) { setNetworkQuality('good'); return; }
      if (dl >= 0.5 && rtt < 500) { setNetworkQuality('fair'); return; }
      setNetworkQuality('poor');
    }

    assess();

    window.addEventListener('online', assess);
    window.addEventListener('offline', assess);
    const conn = (navigator as any).connection;
    conn?.addEventListener?.('change', assess);

    // Periodic re-assessment every 15 seconds
    const interval = setInterval(assess, 15_000);

    return () => {
      window.removeEventListener('online', assess);
      window.removeEventListener('offline', assess);
      conn?.removeEventListener?.('change', assess);
      clearInterval(interval);
    };
  }, [setNetworkQuality]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function GlobalContextBar({
  floorPlanSlot,
  ordersSlot,
  orderEditorSlot,
  orderListSlot,
  takeawaySlot,
  deliverySlot,
  hiddenTabs = [],
  onNewOrder,
  onRefresh,
  onPrintKOT,
  onPrintInvoice,
  userName = 'Staff',
  userRole = 'Server',
  syncStatus = 'disconnected',
  activityLog = [],
}: GlobalContextBarProps) {
  const activeTab = usePOSStore((state) => state.activeTab);
  const setActiveTab = usePOSStore((state) => state.setActiveTab);
  const isRefreshing = usePOSStore((state) => state.isRefreshing);
  const focusedContext = usePOSStore((state) => state.focusedContext);
  const triggerGlobalRefresh = usePOSStore((state) => state.triggerGlobalRefresh);
  const cart = usePOSStore((state) => state.cart);
  const sidebarVisible = usePOSStore((state) => state.sidebarVisible);
  const toggleSidebar = usePOSStore((state) => state.toggleSidebar);
  const errors = usePOSStore((state) => state.errors);
  const dismissError = usePOSStore((state) => state.dismissError);
  const networkQuality = usePOSStore((state) => state.networkQuality);

  // Monitor network quality
  useNetworkMonitor();

  // Filter out hidden tabs (driven by hub settings)
  const visibleTabs = useMemo(
    () => (hiddenTabs.length ? TABS.filter((t) => !hiddenTabs.includes(t.id)) : TABS),
    [hiddenTabs],
  );

  // Activity panel open state
  const [showActivity, setShowActivity] = useState(false);
  const [showPrinterSettings, setShowPrinterSettings] = useState(false);
  const activityRef = useRef<HTMLDivElement>(null);
  const printerSettingsRef = useRef<HTMLDivElement>(null);

  // Fullscreen toggle
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  // Close activity panel when clicking outside
  useEffect(() => {
    if (!showActivity) return;
    const handler = (e: MouseEvent) => {
      if (activityRef.current && !activityRef.current.contains(e.target as Node)) {
        setShowActivity(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showActivity]);

  // Close printer settings panel when clicking outside
  useEffect(() => {
    if (!showPrinterSettings) return;
    const handler = (e: MouseEvent) => {
      if (printerSettingsRef.current && !printerSettingsRef.current.contains(e.target as Node)) {
        setShowPrinterSettings(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPrinterSettings]);

  // Auto-dismiss errors after 6 seconds
  useEffect(() => {
    if (errors.length === 0) return;
    const timer = setTimeout(() => {
      if (errors.length > 0) dismissError(errors[0].id);
    }, 6000);
    return () => clearTimeout(timer);
  }, [errors, dismissError]);

  // Get the active slot content
  const getActiveSlot = () => {
    switch (activeTab) {
      case 'floor-plan':
        return floorPlanSlot;
      case 'orders':
        return ordersSlot;
      case 'order-editor':
        return orderEditorSlot;
      case 'order-list':
        return orderListSlot;
      case 'takeaway':
        return takeawaySlot;
      case 'delivery':
        return deliverySlot;
      default:
        return null;
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    triggerGlobalRefresh();
    onRefresh?.();
  };

  // Is this an order-editing context?
  const isEditorContext = activeTab === 'order-editor' || activeTab === 'takeaway' || activeTab === 'delivery';
  const order = focusedContext.order;

  // Smart order status info for context bar
  const effectivePaymentStatus =
    order?.status === 'draft' ? 'pending' as const : order?.paymentStatus;

  // Network strength indicator meta
  const netMeta = NETWORK_META[networkQuality];
  const NetIcon = netMeta.icon;

  return (
    <>
      {/* ── Top Bar ────────────────────────────────────────────────────────── */}
      <header className="relative bg-gray-900 border-b border-gray-800 px-3 md:px-4 py-2 z-40">
        <div className="flex items-center justify-between gap-2 md:gap-3">
          {/* Left Section: Tab Switcher — hidden on mobile (moved to bottom) */}
          <div className="hidden md:flex items-center gap-4 flex-shrink-0">
            <nav className="flex items-center gap-0.5 bg-gray-800 rounded-lg p-1">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab.id
                      ? 'text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                  }`}
                >
                  {activeTab === tab.id && (
                    <motion.div
                      layoutId="activeTabDesktop"
                      className="absolute inset-0 bg-gray-700 rounded-lg"
                      transition={{ type: 'spring', duration: 0.25, bounce: 0.15 }}
                    />
                  )}
                  <span className="relative z-10">{tab.icon}</span>
                  <span className="relative z-10 hidden xl:inline">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          {/* Mobile: active tab label + network */}
          <div className="flex md:hidden items-center gap-2 flex-shrink-0">
            <div className={`flex items-center gap-1 ${netMeta.color}`} title={`Network: ${netMeta.label}`}>
              <NetIcon size={14} />
            </div>
          </div>

          {/* Center Section: Dynamic Slot + Smart Order Context */}
          <div className="flex-1 flex items-center justify-center gap-2 min-w-0 overflow-x-auto scrollbar-hide">
            {/* Slot content from parent */}
            {getActiveSlot()}

            {/* Smart Order Context — shown when in editor/takeaway mode with an order */}
            {isEditorContext && order && (
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {/* Table / Quick Order badge */}
                {focusedContext.table ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/15 border border-purple-500/25 rounded-lg" title={`Table ${focusedContext.table.tableNumber}`}>
                    <UtensilsCrossed size={13} className="text-purple-400" />
                    <span className="text-xs font-semibold text-purple-300 hidden md:inline">
                      T-{focusedContext.table.tableNumber}
                    </span>
                  </div>
                ) : activeTab === 'takeaway' ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-orange-500/15 border border-orange-500/25 rounded-lg" title="Takeaway">
                    <ShoppingBag size={13} className="text-orange-400" />
                    <span className="text-xs font-semibold text-orange-300 hidden md:inline">Takeaway</span>
                  </div>
                ) : activeTab === 'delivery' ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-500/15 border border-purple-500/25 rounded-lg" title="Delivery">
                    <Truck size={13} className="text-purple-400" />
                    <span className="text-xs font-semibold text-purple-300 hidden md:inline">Delivery</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-500/15 border border-gray-500/25 rounded-lg" title="Quick Order">
                    <Zap size={13} className="text-gray-400" />
                    <span className="text-xs font-semibold text-gray-300 hidden md:inline">Quick</span>
                  </div>
                )}

                {/* Order number */}
                <div className="flex items-center gap-1 px-2 py-1 bg-gray-800 rounded-lg" title={String(order.orderNumber)}>
                  <Hash size={12} className="text-gray-500" />
                  <span className="text-xs font-mono text-gray-300">
                    {String(order.orderNumber).slice(-4)}
                  </span>
                </div>

                {/* Order status badge */}
                <span
                  className={`px-2 py-1 rounded-lg text-xs font-semibold ${
                    ORDER_STATUS_COLORS[order.status]?.bg || 'bg-gray-500/20'
                  } ${ORDER_STATUS_COLORS[order.status]?.text || 'text-gray-400'}`}
                  title={ORDER_STATUS_LABELS[order.status] || order.status}
                >
                  {ORDER_STATUS_LABELS[order.status] || order.status}
                </span>

                {/* Payment status badge */}
                {effectivePaymentStatus && (
                  <span
                    className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
                      PAYMENT_STATUS_COLORS[effectivePaymentStatus]?.bg || 'bg-gray-500/20'
                    } ${
                      PAYMENT_STATUS_COLORS[effectivePaymentStatus]?.text || 'text-gray-400'
                    }`}
                    title={PAYMENT_STATUS_LABELS[effectivePaymentStatus]}
                  >
                    <CreditCard size={11} />
                    <span className="hidden md:inline">{PAYMENT_STATUS_LABELS[effectivePaymentStatus]}</span>
                  </span>
                )}

                {/* Guest count */}
                {focusedContext.session?.covers ? (
                  <div className="hidden sm:flex items-center gap-1 px-2 py-1 bg-gray-800 rounded-lg" title={`${focusedContext.session.covers} guests`}>
                    <Users size={12} className="text-cyan-400" />
                    <span className="text-xs text-gray-300">
                      {focusedContext.session.covers}
                    </span>
                  </div>
                ) : null}

                {/* Waiter / Created-by badge */}
                {(() => {
                  const session = focusedContext.session;
                  const waiter = session?.waiterId && typeof session.waiterId === 'object'
                    ? (session.waiterId as any).username
                    : null;
                  const creator = order?.createdBy && typeof order.createdBy === 'object'
                    ? (order.createdBy as any).username
                    : null;
                  const staffName = waiter || creator;
                  if (!staffName) return null;
                  return (
                    <div
                      className="hidden sm:flex items-center gap-1 px-2 py-1 bg-blue-500/15 border border-blue-500/25 rounded-lg"
                      title={`Managed by ${staffName}`}
                    >
                      <User size={11} className="text-blue-400" />
                      <span className="text-xs font-medium text-blue-300">{staffName}</span>
                    </div>
                  );
                })()}

                {/* Grand total */}
                {order.grandTotal > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/15 border border-emerald-500/25 rounded-lg">
                    <span className="text-xs font-bold text-emerald-300">
                      {formatPrice(order.grandTotal)}
                    </span>
                  </div>
                )}

                {/* Historical badge */}
                {(order.status === 'completed' || order.status === 'cancelled') && (
                  <span className="hidden lg:flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-600/25 text-gray-400 text-xs font-semibold">
                    <Archive size={11} />
                    Historical
                  </span>
                )}

                {/* Cart pending items count */}
                {cart.items.length > 0 && (
                  <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/15 border border-amber-500/25 rounded-lg" title={`${cart.items.length} items pending`}>
                    <CircleDot size={11} className="text-amber-400" />
                    <span className="text-xs font-semibold text-amber-300">
                      {cart.items.length}<span className="hidden md:inline"> pending</span>
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Section: Global Actions */}
          <div className="flex items-center gap-1.5 md:gap-2">
            {/* Network strength — desktop only (mobile shows in left area) */}
            <div
              className={`hidden md:flex items-center gap-1 px-2 py-2 rounded-lg bg-gray-800 ${netMeta.color}`}
              title={`Network: ${netMeta.label}`}
            >
              <NetIcon size={14} />
              <span className="hidden xl:inline text-xs font-medium">{netMeta.label}</span>
            </div>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className="hidden sm:flex p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>

            {/* Sidebar Toggle */}
            <button
              onClick={toggleSidebar}
              className="hidden md:flex p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              title={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'}
            >
              {sidebarVisible ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>

            {/* New Order button */}
            {(activeTab === 'orders' || activeTab === 'order-list' || activeTab === 'floor-plan') && (
              <button
                onClick={onNewOrder}
                className="flex items-center gap-1.5 px-2 md:px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={15} />
                <span className="hidden lg:inline">New Order</span>
              </button>
            )}

            {/* Print Actions (Order Editor / Takeaway tab with order) */}
            {isEditorContext && focusedContext.orderId && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onPrintKOT}
                  className="flex items-center gap-1.5 px-2 md:px-2.5 py-2 bg-amber-600/20 border border-amber-500/30 text-amber-300 hover:bg-amber-600/30 rounded-lg text-xs font-medium transition-colors"
                  title="Print Kitchen Ticket"
                >
                  <Printer size={14} />
                  <span className="hidden lg:inline">Kitchen Ticket</span>
                </button>
                <button
                  onClick={onPrintInvoice}
                  className="flex items-center gap-1.5 px-2 md:px-2.5 py-2 bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/30 rounded-lg text-xs font-medium transition-colors"
                  title="Print Invoice / Bill"
                >
                  <FileText size={14} />
                  <span className="hidden lg:inline">Receipt</span>
                </button>
              </div>
            )}

            {/* Thermal Printer Status Indicator */}
            <ThermalPrinterStatus showTestButton={true} />

            {/* Printer Settings Button */}
            <button
              onClick={() => setShowPrinterSettings(true)}
              className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              title="Printer Settings"
            >
              <Settings size={16} />
            </button>

            {/* Sync Status Indicator */}
            {(() => {
              const meta = SYNC_META[syncStatus];
              const Icon = meta.icon;
              return (
                <button
                  onClick={() => setShowActivity((v) => !v)}
                  className={`relative flex items-center gap-1.5 px-2 py-2 rounded-lg transition-colors
                    bg-gray-800 hover:bg-gray-700 ${meta.color}`}
                  title={`Sync: ${meta.label}${activityLog.length > 0 ? ` — ${activityLog.length} recent events` : ''}`}
                >
                  <Icon size={16} className={meta.pulse ? 'animate-pulse' : ''} />
                  <span className="hidden lg:inline text-xs font-medium">{meta.label}</span>
                  {activityLog.length > 0 && (
                    <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ${
                      syncStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'
                    }`} />
                  )}
                </button>
              );
            })()}

            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`relative p-2 rounded-lg transition-colors ${
                isRefreshing
                  ? 'bg-purple-600/20 text-purple-400'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
              title="Refresh all data"
            >
              <RefreshCw
                size={16}
                className={isRefreshing ? 'animate-spin' : ''}
              />
              {isRefreshing && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              )}
            </button>

            {/* User Menu */}
            <button className="flex items-center gap-2 px-2 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors">
              <div className="w-7 h-7 bg-gradient-to-br from-emerald-400 to-cyan-500 rounded-full flex items-center justify-center">
                <User size={14} className="text-white" />
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-sm text-white font-medium">{userName}</div>
                <div className="text-xs text-gray-400">{userRole}</div>
              </div>
              <ChevronDown size={14} className="text-gray-400 hidden lg:block" />
            </button>
          </div>
        </div>

        {/* ── Error Toast Bar ─────────────────────────────────────────────── */}
        <AnimatePresence>
          {errors.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="mt-2 space-y-1"
            >
              {errors.map((err) => (
                <div
                  key={err.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 bg-red-500/15 border border-red-500/25 rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                    <span className="text-xs text-red-300 truncate">{err.message}</span>
                    {err.source && (
                      <span className="text-[10px] text-red-500/70 flex-shrink-0">[{err.source}]</span>
                    )}
                  </div>
                  <button
                    onClick={() => dismissError(err.id)}
                    className="text-red-400/60 hover:text-red-300 flex-shrink-0"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Activity Log Dropdown ─────────────────────────────────────────── */}
        <AnimatePresence>
          {showActivity && (
            <motion.div
              ref={activityRef}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute right-4 top-14 z-50 w-80 max-h-72 overflow-y-auto
                bg-gray-900 border border-gray-700 rounded-xl shadow-2xl"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
                <div className="flex items-center gap-2">
                  <Activity size={14} className="text-gray-400" />
                  <span className="text-xs font-semibold text-gray-300">Live Activity</span>
                  {(() => {
                    const meta = SYNC_META[syncStatus];
                    const Icon = meta.icon;
                    return (
                      <span className={`flex items-center gap-1 text-[10px] font-medium ${meta.color}`}>
                        <Icon size={10} />
                        {meta.label}
                      </span>
                    );
                  })()}
                </div>
                <button onClick={() => setShowActivity(false)} className="text-gray-500 hover:text-gray-300">
                  <X size={14} />
                </button>
              </div>

              {activityLog.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-gray-500">
                  No recent activity
                </div>
              ) : (
                <ul className="divide-y divide-gray-800/50">
                  {activityLog.map((entry, i) => {
                    const isTable = entry.type.startsWith('table:');
                    const isOrder = entry.type.startsWith('order:');
                    const isMenu = entry.type.startsWith('menu:');
                    const isSession = entry.type.startsWith('session:');
                    const dotColor = isOrder
                      ? 'bg-blue-400'
                      : isTable
                        ? 'bg-purple-400'
                        : isMenu
                          ? 'bg-amber-400'
                          : isSession
                            ? 'bg-cyan-400'
                            : 'bg-gray-400';
                    return (
                      <li key={`${entry.ts}-${i}`} className="flex items-start gap-2 px-3 py-2">
                        <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-300 truncate">{entry.summary}</p>
                          <p className="text-[10px] text-gray-500">{timeAgo(entry.ts)}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ── Mobile Bottom Tab Bar ──────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 px-2 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around">
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col items-center gap-0.5 py-2 px-1 flex-1 transition-colors ${
                  isActive
                    ? 'text-purple-400'
                    : 'text-gray-500 active:text-gray-300'
                }`}
              >
                <span className="relative">
                  {tab.icon}
                  {/* Active indicator dot */}
                  {isActive && (
                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-purple-400" />
                  )}
                  {/* Cart count badge on order-editor tab */}
                  {tab.id === 'order-editor' && cart.items.length > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 px-1 py-0 bg-amber-500 text-white text-[9px] font-bold rounded-full leading-tight">
                      {cart.items.length}
                    </span>
                  )}
                </span>
                <span className="text-[10px] font-medium leading-none">{tab.label.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Printer Settings Slide-in Panel ─────────────────────────────────── */}
      <AnimatePresence>
        {showPrinterSettings && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-black/50"
              onClick={() => setShowPrinterSettings(false)}
            />
            {/* Slide-in Panel */}
            <motion.div
              ref={printerSettingsRef}
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-lg bg-gray-900 border-l border-gray-700 shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-3">
                  <Printer className="text-purple-400" size={20} />
                  <div>
                    <h2 className="text-base font-semibold text-white">Printer Settings</h2>
                    <p className="text-xs text-gray-400">Configure thermal printers</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowPrinterSettings(false)}
                  className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              {/* Panel Content */}
              <div className="flex-1 overflow-y-auto">
                <PrinterSettingsPanel onClose={() => setShowPrinterSettings(false)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
