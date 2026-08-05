// features/pos/ManagementHub.tsx
// ManagementHub - Dedicated Workspace Architecture
// Tabs: Floor Plan | Orders (Grid) | Order Editor | Takeaway | Order List
//
// ── WHY THIS IS A COMPONENT AND NOT A PAGE ANY MORE ──────────────────────────
// It used to be app/hub/page.tsx. It now backs four routes:
//
//   /hub        everything (floor plan, orders, takeaway, delivery, list)
//   /takeaway   pinned to takeaway
//   /delivery   pinned to delivery
//
// Plenty of restaurants put one person on delivery and another on takeaway for
// a whole shift. Those people do not need the floor plan and they do not need
// each other's queue - every screen they have to navigate past on a busy
// service is a mistake waiting to happen. So each order type gets its own URL,
// and `workspace` pins this component to it: the tab strip disappears, the
// header names the queue, and there is nowhere else to accidentally end up.
//
// Pinning rather than extracting is deliberate. The takeaway and delivery tabs
// are one <OrderEditor> each, sitting on ~1500 lines of shared realtime sync,
// order-context and refresh plumbing. Copying that into two more files would
// mean three implementations of the same order flow drifting apart. One
// component, three entry points.

'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { AnimatePresence } from 'framer-motion';
import { LayoutGrid, Users, DollarSign, Clock, Bike, ShoppingBag } from 'lucide-react';
import { hasPermission } from '@/types/admin.types';
import { usePOSStore } from '@/stores/posStore';
import GlobalContextBar, { ContextBarSlot, StatBadge, SearchInput, FilterDropdown } from '@/pos_modules/context-bar';
import { FloorPlanCanvas, TableSessionPanel, ResponsiveCanvasWrapper, MobileTableGrid } from '@/pos_modules/floor-plan';
import { OrderManagerGrid, OrderManagerList, OrderDetailsPanel, OrderEditor, OrderList, flushOrderEditorCache } from '@/pos_modules/orders';
import type { OrderEditorHandle } from '@/pos_modules/orders/order-editor';
import Loader from '@/pos_modules/shared/Loader';
import {
  ITable,
  ITableSection,
  TableStatus,
  BulkUpsertTableItem,
  DEFAULT_RESERVATION_POLICY,
  canSeatTable,
  getEffectiveTableStatus,
  resolvePolicy,
} from '@/types/table.types';
import type { ReservationInputPayload } from '@/pos_modules/floor-plan';
import { Order, OrderStats, PaymentMethod } from '@/types/order.types';
import { useRealtimeSync } from '@/lib/hooks/useRealtimeSync';
import { useDebouncedCallback } from '@/lib/hooks/useDebouncedCallback';
import type { RealtimeEvent } from '@/lib/realtime/types';

const REFRESH_INTERVAL = 30000;

/** Minimum time (ms) the tab must be hidden before a visibility re-sync fires */
const VISIBILITY_THROTTLE_MS = 5_000;

/** Timeout (ms) for any individual data fetch — prevents hanging requests from blocking UI */
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Table actions that rewrite the reservation queue. A status-only patch can't
 * carry the new bookings, so these always trigger a table refetch.
 */
const RESERVATION_ACTIONS = new Set([
  'add_reservation',
  'set_reserved',
  'update_reservation',
  'cancel_reservation',
  'clear_reservation',
  'mark_no_show',
  'mark_arrived',
  'reservation_moved',
  'reservation_reconciled',
]);

/**
 * A single order type this hub can be pinned to.
 *
 * `undefined` means the full hub: every tab the site's settings enable.
 */
export type HubWorkspace = 'takeaway' | 'delivery';

export interface ManagementHubProps {
  /** Pin to one order type and hide the rest. See the note at the top. */
  workspace?: HubWorkspace;
}

export default function ManagementHubPage({ workspace }: ManagementHubProps = {}) {
  const { data: session } = useSession();

  // Global store state
  const activeTab = usePOSStore((state) => state.activeTab);
  const storeSetActiveTab = usePOSStore((state) => state.setActiveTab);

  // In a pinned workspace, every tab except the pinned one is unreachable by
  // design - so leaving it is swallowed here rather than audited at each of the
  // call sites that navigate. Those are all dine-in floor-plan flows today and
  // none of them render on /takeaway or /delivery, but "today" is doing a lot
  // of work in that sentence: one new call site is all it would take to strand
  // a delivery rider on a screen with no way back.
  const setActiveTab = useCallback(
    (tab: import('@/stores/posStore').ActiveTab) => {
      if (workspace && tab !== workspace) return;
      storeSetActiveTab(tab);
    },
    [workspace, storeSetActiveTab],
  );
  const focusedContext = usePOSStore((state) => state.focusedContext);
  const setFocusedContext = usePOSStore((state) => state.setFocusedContext);
  const switchOrderContext = usePOSStore((state) => state.switchOrderContext);
  const clearFocusedContext = usePOSStore((state) => state.clearFocusedContext);
  const registerRefreshCallback = usePOSStore((state) => state.registerRefreshCallback);
  const unregisterRefreshCallback = usePOSStore((state) => state.unregisterRefreshCallback);
  const pushError = usePOSStore((state) => state.pushError);
  const settings = usePOSStore((state) => state.settings);

  // Derived hub config — falls back to sensible defaults when settings haven't loaded yet
  const hub = settings?.hub ?? {
    requireCoversOnSeat: true,
    defaultCovers: 2,
    showTableSessionPanel: true,
    allowReservations: true,
    reservationHoldMinutes: DEFAULT_RESERVATION_POLICY.holdMinutes,
    reservationDurationMinutes: DEFAULT_RESERVATION_POLICY.durationMinutes,
    reservationGraceMinutes: DEFAULT_RESERVATION_POLICY.graceMinutes,
    reservationAutoReleaseMinutes: DEFAULT_RESERVATION_POLICY.autoReleaseMinutes,
    allowWalkInDuringHold: DEFAULT_RESERVATION_POLICY.allowWalkInDuringHold,
    defaultTab: 'floor-plan' as const,
    showFloorPlan: true,
    showOrders: true,
    showTakeaway: true,
    showDelivery: true,
    showOrderList: true,
    autoCloseOnPayment: false,
    autoPrintKOT: false,
  };

  // Timing policy every reservation-aware component reads. Resolved once here
  // so the floor plan, the panel and the mobile grid can never disagree.
  const reservationPolicy = useMemo(
    () =>
      resolvePolicy({
        holdMinutes: hub.reservationHoldMinutes,
        durationMinutes: hub.reservationDurationMinutes,
        graceMinutes: hub.reservationGraceMinutes,
        autoReleaseMinutes: hub.reservationAutoReleaseMinutes,
        allowWalkInDuringHold: hub.allowWalkInDuringHold,
      }),
    [
      hub.reservationHoldMinutes,
      hub.reservationDurationMinutes,
      hub.reservationGraceMinutes,
      hub.reservationAutoReleaseMinutes,
      hub.allowWalkInDuringHold,
    ],
  );

  // Build the list of tab IDs that should be hidden in the context bar.
  //
  // A pinned workspace hides EVERY other tab, whatever the site's hub settings
  // say. That is not the same as "settings turned the others off" - it is a
  // property of the route, and a delivery rider must not be able to reach the
  // floor plan just because the restaurant has it enabled for everyone else.
  const hiddenTabs = useMemo(() => {
    const ALL: import('@/stores/posStore').ActiveTab[] =
      ['floor-plan', 'orders', 'order-editor', 'order-list', 'takeaway', 'delivery'];
    if (workspace) return ALL.filter((t) => t !== workspace);

    const hidden: import('@/stores/posStore').ActiveTab[] = [];
    if (!hub.showFloorPlan)  hidden.push('floor-plan');
    if (!hub.showOrders)     hidden.push('orders');
    if (!hub.showTakeaway)   hidden.push('takeaway');
    if (!hub.showDelivery)   hidden.push('delivery');
    if (!hub.showOrderList)  hidden.push('order-list');
    return hidden;
  }, [workspace, hub.showFloorPlan, hub.showOrders, hub.showTakeaway, hub.showDelivery, hub.showOrderList]);

  // Set the opening tab.
  //
  // A pinned workspace wins over the site's configured default and applies
  // immediately, without waiting for settings to arrive - otherwise /delivery
  // would show the floor plan for as long as the settings fetch takes, which is
  // exactly the wrong first frame on the one screen this user ever opens.
  //
  // The store is global and shared with /hub, so this ALSO has to run when the
  // pinned route is entered from the hub with some other tab already active.
  const defaultTabApplied = useRef(false);
  useEffect(() => {
    if (workspace) {
      setActiveTab(workspace);
      return;
    }
    if (defaultTabApplied.current) return;
    if (!settings?.hub) return; // wait until settings have loaded
    defaultTabApplied.current = true;
    setActiveTab(settings.hub.defaultTab);
  }, [workspace, settings?.hub, setActiveTab]);

  // AbortControllers for fetch dedup — concurrent calls cancel the previous in-flight request
  const abortRefs = useRef({
    tables: null as AbortController | null,
    sections: null as AbortController | null,
    orders: null as AbortController | null,
    stats: null as AbortController | null,
  });

  // Track when the tab was hidden for throttled visibility refresh
  const hiddenAtRef = useRef<number>(0);

  // Floor Plan State
  const [tables, setTables] = useState<ITable[]>([]);

  // OrderEditor ref for imperative print calls
  const orderEditorRef = useRef<OrderEditorHandle>(null);
  const [sections, setSections] = useState<ITableSection[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>();
  const [tableStatusFilter, setTableStatusFilter] = useState<TableStatus | 'all'>('all');
  const [isLoadingTables, setIsLoadingTables] = useState(true);
  const [selectedTable, setSelectedTable] = useState<ITable | null>(null);

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [isLoadingOrders, setIsLoadingOrders] = useState(true);

  // Monotonic tick bumped on every incoming order event. Passed to the Order
  // List tab so it can invalidate its own cache and refetch live off the hub's
  // single realtime connection — no second websocket per browser.
  const [orderEventTick, setOrderEventTick] = useState(0);

  // Takeaway State
  const [takeawayOrders, setTakeawayOrders] = useState<Order[]>([]);
  const [isTakeawayLoading, setIsTakeawayLoading] = useState(true);

  // Delivery State
  const [deliveryOrders, setDeliveryOrders] = useState<Order[]>([]);
  const [isDeliveryLoading, setIsDeliveryLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderViewMode, setOrderViewMode] = useState<'grid' | 'list'>('grid');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderPaymentFilter, setOrderPaymentFilter] = useState('all');

  // Activity log for realtime events (ring buffer, newest first)
  const MAX_ACTIVITY = 20;
  const [activityLog, setActivityLog] = useState<{ type: string; summary: string; ts: number }[]>([]);
  const pushActivity = useCallback((type: string, summary: string) => {
    setActivityLog((prev) => [{ type, summary, ts: Date.now() }, ...prev].slice(0, MAX_ACTIVITY));
  }, []);

  // ── Debounced batch refresh ──────────────────────────────────────────────
  // When Pusher delivers a burst of events (e.g. complete_and_pay triggers
  // both order:completed + table:updated), we batch the refreshes so only
  // one fetch per resource fires within a 300ms window.
  // Uses refs so it never depends on fetch callbacks changing.
  const pendingRefresh = useRef<{ tables: boolean; orders: boolean; stats: boolean; sections: boolean; takeaway: boolean; delivery: boolean }>({
    tables: false, orders: false, stats: false, sections: false, takeaway: false, delivery: false,
  });
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchRef = useRef({ fetchTables: async () => {}, fetchSections: async () => {}, fetchOrders: async () => {}, fetchOrderStats: async () => {}, fetchTakeawayOrders: async () => {}, fetchDeliveryOrders: async () => {} });

  // Stable ref for handleInitiateSession — allows handleTableClick to call it
  // without adding a dependency that would cause realtime re-subscriptions.
  const initiateRef = useRef<
    (
      tableId: string,
      covers: number,
      opts?: { reservationId?: string; overrideReservationHold?: boolean },
    ) => Promise<void>
  >(async () => {});

  const scheduleRefresh = useCallback(
    (targets: { tables?: boolean; orders?: boolean; stats?: boolean; sections?: boolean; takeaway?: boolean; delivery?: boolean }) => {
      if (targets.tables) pendingRefresh.current.tables = true;
      if (targets.orders) pendingRefresh.current.orders = true;
      if (targets.stats) pendingRefresh.current.stats = true;
      if (targets.sections) pendingRefresh.current.sections = true;
      if (targets.takeaway) pendingRefresh.current.takeaway = true;
      if (targets.delivery) pendingRefresh.current.delivery = true;

      if (batchTimerRef.current) return; // already scheduled
      batchTimerRef.current = setTimeout(() => {
        const p = pendingRefresh.current;
        const f = fetchRef.current;
        if (p.tables) f.fetchTables().catch(() => {});
        if (p.sections) f.fetchSections().catch(() => {});
        if (p.orders) f.fetchOrders().catch(() => {});
        if (p.stats) f.fetchOrderStats().catch(() => {});
        if (p.takeaway) f.fetchTakeawayOrders().catch(() => {});
        if (p.delivery) f.fetchDeliveryOrders().catch(() => {});
        pendingRefresh.current = { tables: false, orders: false, stats: false, sections: false, takeaway: false, delivery: false };
        batchTimerRef.current = null;
      }, 300);
    },
    [],
  );

  // ── Data Fetching Helpers ─────────────────────────────────────────────────
  // Each fetcher aborts the previous in-flight request for the same resource
  // so we never overwrite fresh data with a stale response.  Errors are
  // surfaced to the toast queue so every user in the restaurant knows.

  const fetchTables = useCallback(async () => {
    abortRefs.current.tables?.abort();
    const ctrl = new AbortController();
    abortRefs.current.tables = ctrl;
    try {
      // Always fetch ALL tables: the canvas filters by section client-side and
      // the stats badges need the full set. (The withSessions API branch
      // ignores sectionId anyway — sending it only churned this callback.)
      const res = await fetch('/api/tables?withSessions=true', {
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      });
      if (!res.ok) throw new Error(`Tables fetch failed (${res.status})`);
      const data = await res.json();
      setTables(data.tables || data);
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') return; // superseded — ignore
      console.error('Failed to fetch tables:', error);
      pushError('Failed to load tables — retrying…', 'fetchTables');
    } finally {
      setIsLoadingTables(false);
    }
  }, [pushError]);

  const fetchSections = useCallback(async () => {
    abortRefs.current.sections?.abort();
    const ctrl = new AbortController();
    abortRefs.current.sections = ctrl;
    try {
      const res = await fetch('/api/tables/sections', {
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      });
      if (!res.ok) throw new Error(`Sections fetch failed (${res.status})`);
      const data = await res.json();
      setSections(data.sections || []);
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Failed to fetch sections:', error);
    }
  }, []);

  // Data Fetching - Orders

  const fetchOrders = useCallback(async () => {
    abortRefs.current.orders?.abort();
    const ctrl = new AbortController();
    abortRefs.current.orders = ctrl;
    try {
      const params = new URLSearchParams({ activeOnly: 'true' });
      if (orderPaymentFilter !== 'all') params.set('paymentStatus', orderPaymentFilter);

      const res = await fetch(`/api/orders?${params.toString()}`, {
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      });
      if (!res.ok) throw new Error(`Orders fetch failed (${res.status})`);
      const data = await res.json();
      setOrders(data.orders);
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Failed to fetch orders:', error);
      pushError('Failed to load orders — retrying…', 'fetchOrders');
    } finally {
      setIsLoadingOrders(false);
    }
  }, [orderPaymentFilter, pushError]);

  const fetchOrderStats = useCallback(async () => {
    abortRefs.current.stats?.abort();
    const ctrl = new AbortController();
    abortRefs.current.stats = ctrl;
    try {
      const res = await fetch('/api/orders/stats', {
        signal: AbortSignal.any([ctrl.signal, AbortSignal.timeout(FETCH_TIMEOUT_MS)]),
      });
      if (!res.ok) throw new Error(`Stats fetch failed (${res.status})`);
      const data = await res.json();
      setOrderStats(data);
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Failed to fetch order stats:', error);
    }
  }, []);

  // Data Fetching - Takeaway Orders
  const fetchTakeawayOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/pos/takeaway', {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Takeaway fetch failed (${res.status})`);
      const data = await res.json();
      setTakeawayOrders(data.orders || []);
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Failed to fetch takeaway orders:', error);
    } finally {
      setIsTakeawayLoading(false);
    }
  }, []);

  // Data Fetching - Delivery Orders
  const fetchDeliveryOrders = useCallback(async () => {
    try {
      const res = await fetch('/api/pos/delivery', {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`Delivery fetch failed (${res.status})`);
      const data = await res.json();
      setDeliveryOrders(data.orders || []);
    } catch (error: unknown) {
      if ((error as Error).name === 'AbortError') return;
      console.error('Failed to fetch delivery orders:', error);
    } finally {
      setIsDeliveryLoading(false);
    }
  }, []);

  // Keep batch-refresh refs in sync with latest fetch callbacks
  useEffect(() => {
    fetchRef.current = { fetchTables, fetchSections, fetchOrders, fetchOrderStats, fetchTakeawayOrders, fetchDeliveryOrders };
  }, [fetchTables, fetchSections, fetchOrders, fetchOrderStats, fetchTakeawayOrders, fetchDeliveryOrders]);

  // Refresh All

  // Same scoping as the initial load below, and for the same reason: this is
  // the manual refresh button, so on a pinned workspace it would otherwise fire
  // a 403 at /api/tables every time somebody pressed it.
  const refreshAll = useCallback(() => {
    if (!workspace) {
      fetchTables();
      fetchOrders();
    }
    fetchOrderStats();
    if (!workspace || workspace === 'takeaway') fetchTakeawayOrders();
    if (!workspace || workspace === 'delivery') fetchDeliveryOrders();
  }, [workspace, fetchTables, fetchOrders, fetchOrderStats, fetchTakeawayOrders, fetchDeliveryOrders]);

  // Initial load — runs once on mount (empty deps for fetchers that are stable)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A pinned workspace fetches only what it renders.
    //
    // Not just a saving. /api/tables requires manage_orders, and a
    // takeaway-only or delivery-only account does not hold it - so fetching the
    // floor plan here would fire two guaranteed 403s on every load of the one
    // screen that user ever opens. The errors are caught and invisible, which
    // makes them worse: a console full of forbidden requests is exactly the
    // noise that hides the real failure later.
    if (!workspace) {
      fetchTables();
      fetchSections();
      fetchOrders();
    }
    fetchOrderStats();
    if (!workspace || workspace === 'takeaway') fetchTakeawayOrders();
    if (!workspace || workspace === 'delivery') fetchDeliveryOrders();

    // Fetch restaurant settings into global store
    fetch('/api/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) usePOSStore.getState().setSettings(data);
      })
      .catch(() => {});
  }, []); // intentionally empty — initial load only

  // Re-fetch orders when the payment filter changes (not on initial mount)
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    fetchOrders();
  }, [fetchOrders]);

  // Register refresh callback
  useEffect(() => {
    registerRefreshCallback(refreshAll);
    return () => unregisterRefreshCallback(refreshAll);
  }, [refreshAll, registerRefreshCallback, unregisterRefreshCallback]);

  // ── Visibility-based re-sync ──────────────────────────────────────────────
  // When the user switches back to this browser tab, refresh everything so
  // stale data from other users is picked up immediately.
  // Throttled: only fires if the tab was hidden for at least VISIBILITY_THROTTLE_MS
  // to avoid redundant refreshes when quickly alt-tabbing.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (hiddenAtRef.current && Date.now() - hiddenAtRef.current >= VISIBILITY_THROTTLE_MS) {
          refreshAll();
        }
        hiddenAtRef.current = 0;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [refreshAll]);

  // Stable ref for focusedContext.orderId — avoids re-creating useCallback
  // every time the focused order changes, which would cause useRealtimeSync
  // to re-subscribe.
  const focusedOrderIdRef = useRef(focusedContext.orderId);
  useEffect(() => { focusedOrderIdRef.current = focusedContext.orderId; }, [focusedContext.orderId]);

  // Auto-refresh — uses Pusher as primary channel with polling fallback
  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      // Polling fallback sends a synthetic event
      if (event.entityId === '__poll__') {
        refreshAll();
        return;
      }

      // Build a human-readable summary for the activity log
      const action = (event.payload?.action as string) || event.type.split(':')[1] || 'change';
      const entity = event.type.split(':')[0];
      const label =
        entity === 'order'
          ? `Order ${(event.payload?.orderNumber as string) || event.entityId.slice(-6)}`
          : entity === 'table'
            ? `Table ${(event.payload?.tableNumber as string) || event.entityId.slice(-6)}`
            : entity === 'menu'
              ? `Menu ${(event.payload?.name as string) || action}`
              : `${entity} ${action}`;
      pushActivity(event.type, `${label} — ${action}`);

      // If payload was trimmed (too large for Pusher), fall back to full fetch
      const isTrimmed = event.payload?.trimmed === true;
      const type = event.type;

      // ── Order events: in-place patch when payload is rich ───────────
      if (
        type === 'order:updated' ||
        type === 'order:items_fired' ||
        type === 'order:items_updated' ||
        type === 'order:completed' ||
        type === 'order:cancelled'
      ) {
        // Nudge the Order List tab (ongoing + history) to invalidate & refetch.
        setOrderEventTick((t) => t + 1);

        const p = event.payload as Record<string, unknown> | undefined;
        const hasRichPayload = !isTrimmed && p?.status;

        if (hasRichPayload) {
          // Patch in-place without API call
          setOrders((prev) => {
            const idx = prev.findIndex((o) => o._id === event.entityId);
            if (idx === -1) {
              // New order we don't have locally — need to fetch
              scheduleRefresh({ orders: true });
              return prev;
            }
            const existing = prev[idx];
            // Version guard: only apply if event is newer
            if (event.__v !== undefined && existing.__v !== undefined && event.__v < existing.__v) {
              return prev; // stale event, skip
            }
            const patched = {
              ...existing,
              ...(p.status ? { status: p.status as string } : {}),
              ...(p.paymentStatus ? { paymentStatus: p.paymentStatus as string } : {}),
              ...(p.grandTotal !== undefined ? { grandTotal: p.grandTotal as number } : {}),
              ...(p.subtotal !== undefined ? { subtotal: p.subtotal as number } : {}),
              ...(p.amountPaid !== undefined ? { amountPaid: p.amountPaid as number } : {}),
              ...(p.amountDue !== undefined ? { amountDue: p.amountDue as number } : {}),
              ...(event.__v !== undefined ? { __v: event.__v } : {}),
            } as Order;
            const next = [...prev];
            // Remove completed/cancelled orders from the active list
            if (['completed', 'cancelled'].includes(patched.status)) {
              next.splice(idx, 1);
            } else {
              next[idx] = patched;
            }
            return next;
          });
          // Stats (counts/revenue) may have changed — lightweight fetch.
          // For DINE-IN orders (has tableId) also refresh tables: the floor's
          // per-table order total, the Revenue/Guests stat badges and any open
          // TableSessionPanel all read the order embedded in the table's
          // session, so a fire/pay from another terminal must re-embed it.
          // Takeaway/delivery orders don't touch the floor, so refresh those
          // lists instead. Both are cheap no-op fetches when their tab isn't
          // mounted, so it's simpler to refresh both than to thread the
          // order's mode through the (deliberately trimmed) event payload.
          const isDineIn = !!p?.tableId;
          scheduleRefresh({ stats: true, tables: isDineIn, takeaway: !isDineIn, delivery: !isDineIn });
        } else {
          // Trimmed or payload missing key fields — fall back to a full fetch
          // of everything, tables included, so nothing is left stale.
          scheduleRefresh({ orders: true, stats: true, tables: true, takeaway: true, delivery: true });
        }

        // If this order is currently focused in the editor, refresh it live
        if (focusedOrderIdRef.current && event.entityId === focusedOrderIdRef.current) {
          orderEditorRef.current?.refreshOrder();
        }
      }

      // ── Table events: in-place patch for status changes ─────────────
      else if (
        type === 'table:updated' ||
        type === 'table:session_started' ||
        type === 'table:session_closed'
      ) {
        const p = event.payload as Record<string, unknown> | undefined;

        // Session start/close carry embedded session+order data that can't be
        // patched from the event alone — always full-fetch.
        if (
          type === 'table:session_started' ||
          type === 'table:session_closed'
        ) {
          scheduleRefresh({ tables: true });
        }
        // Bulk operations (position updates, upserts) need a full fetch
        else if (event.entityId.startsWith('__bulk') || isTrimmed) {
          scheduleRefresh({ tables: true, sections: true });
        }
        // Section create/delete arrives as table:updated with a section_* action —
        // other clients must refresh their sections list too, not just tables.
        else if (typeof p?.action === 'string' && (p.action as string).startsWith('section_')) {
          scheduleRefresh({ tables: true, sections: true });
        }
        // Detail edits change more than status (number, seats, position) — a
        // status-only patch would leave those fields stale on other terminals.
        else if (p?.action === 'details_updated') {
          scheduleRefresh({ tables: true });
        }
        // Reservation changes rewrite the table's booking queue, which the
        // status field alone can't convey — every floor screen needs the list.
        else if (typeof p?.action === 'string' && RESERVATION_ACTIONS.has(p.action as string)) {
          scheduleRefresh({ tables: true });
        } else if (p?.status) {
          // Simple status change — patch in-place
          setTables((prev) => {
            const idx = prev.findIndex((t) => t._id === event.entityId);
            if (idx === -1) {
              // New table or deleted — fetch to reconcile
              scheduleRefresh({ tables: true });
              return prev;
            }
            const newStatus = p.status as TableStatus;
            const next = [...prev];
            next[idx] = {
              ...next[idx],
              status: newStatus,
              // A table only holds an active session while occupied. Clearing it
              // on any other status stops the floor tile and an open
              // TableSessionPanel from rendering a phantom session between this
              // patch and the reconciling refetch (e.g. when another terminal
              // releases or pays out the table).
              ...(newStatus !== 'occupied' ? { activeSessionId: undefined } : {}),
            };
            return next;
          });
        } else {
          scheduleRefresh({ tables: true });
        }
      }

      // ── Session events ──────────────────────────────────────────────
      else if (type === 'session:updated' || type === 'session:closed') {
        scheduleRefresh({ tables: true }); // sessions are embedded in table responses
      }

      // ── Menu events ─────────────────────────────────────────────────
      else if (
        type === 'menu:item_created' ||
        type === 'menu:item_updated' ||
        type === 'menu:category_created' ||
        type === 'menu:category_updated'
      ) {
        // Refresh the OrderEditor's catalog so menu changes appear instantly
        orderEditorRef.current?.refreshMenu();
      }

      // ── Settings events ─────────────────────────────────────────────
      // Another terminal saved tenant settings — refetch into the store so
      // currency, receipt config, payment methods, hub options, etc. update live.
      else if (type === 'settings:updated') {
        fetch('/api/settings')
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => { if (data) usePOSStore.getState().setSettings(data); })
          .catch(() => {});
      }
    },
    [refreshAll, scheduleRefresh, pushActivity]
  );

  const { status: realtimeStatus } = useRealtimeSync({
    pollingInterval: REFRESH_INTERVAL,
    onEvent: handleRealtimeEvent,
  });

  // Keep store network quality in sync with realtime connection status
  const setNetworkQuality = usePOSStore((state) => state.setNetworkQuality);
  useEffect(() => {
    setNetworkQuality(
      realtimeStatus === 'connected' ? 'excellent'
        : realtimeStatus === 'polling' ? 'fair'
        : realtimeStatus === 'connecting' ? 'good'
        : 'poor'
    );
  }, [realtimeStatus, setNetworkQuality]);

  // Sync focused order when switching tabs
  useEffect(() => {
    if (activeTab === 'orders' && focusedContext.orderId) {
      const order = orders.find((o) => o._id === focusedContext.orderId);
      if (order) {
        setSelectedOrder(order);
      }
    }
  }, [activeTab, focusedContext.orderId, orders]);

  // ── Keep the open TableSessionPanel in lock-step with live table data ──────
  // `selectedTable` is a snapshot captured when the table was clicked. Whenever
  // the tables array is patched — a realtime status change, or a full refetch
  // that re-embeds the session + order — adopt the fresh row so the panel's
  // status badge, session stats, order total and timeline update live without
  // the user having to reopen it. When the table is patched by reference-equal
  // data this is a no-op; a real change swaps in the new object and re-renders.
  useEffect(() => {
    setSelectedTable((prev) => {
      if (!prev) return prev;
      const fresh = tables.find((t) => t._id === prev._id);
      return fresh ?? prev; // keep prev if the table momentarily vanished
    });
  }, [tables]);


  const tableStats = useMemo(() => {
    let totalRevenue = 0;
    let currentGuests = 0;

    tables.forEach((table) => {
      if (table.status === 'occupied' && table.activeSessionId) {
        const session =
          typeof table.activeSessionId === 'object' ? table.activeSessionId : null;
        if (session) {
          currentGuests += session.covers || 0;
          const order =
            session.orderId && typeof session.orderId === 'object'
              ? session.orderId
              : null;
          if (order?.grandTotal) {
            totalRevenue += order.grandTotal;
          }
        }
      }
    });

    // "Available" counts what staff can actually sell right now — a table
    // booked for later is still available until its hold window opens.
    const now = new Date();
    return {
      totalTables: tables.length,
      availableTables: tables.filter(
        (t) => getEffectiveTableStatus(t, now, reservationPolicy) === 'available',
      ).length,
      occupiedTables: tables.filter((t) => t.status === 'occupied').length,
      currentGuests,
      totalRevenue,
    };
  }, [tables, reservationPolicy]);


  const filteredTables = useMemo(() => {
    if (tableStatusFilter === 'all') return tables;
    const now = new Date();
    return tables.filter(
      (t) => getEffectiveTableStatus(t, now, reservationPolicy) === tableStatusFilter,
    );
  }, [tables, tableStatusFilter, reservationPolicy]);

  // Client-side search filtering for orders (no API call needed)
  const filteredOrders = useMemo(() => {
    if (!orderSearchQuery) return orders;
    const query = orderSearchQuery.toLowerCase();
    return orders.filter(
      (order: Order) =>
        String(order.orderNumber).toLowerCase().includes(query) ||
        order.table?.tableNumber?.toLowerCase().includes(query) ||
        order.customer?.name?.toLowerCase().includes(query)
    );
  }, [orders, orderSearchQuery]);

  const handleTableClick = useCallback(
    (table: ITable) => {
      if (table.status === 'cleaning') {
        // Optimistic update — instantly reflect the change
        setTables((prev) =>
          prev.map((t) =>
            t._id === table._id ? { ...t, status: 'available' as TableStatus } : t
          )
        );

        fetch(`/api/tables/${table._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'set_available' }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        })
          .then((res) => {
            if (!res.ok) {
              // Rollback on failure
              setTables((prev) =>
                prev.map((t) =>
                  t._id === table._id ? { ...t, status: 'cleaning' as TableStatus } : t
                )
              );
              throw new Error('Failed to set available');
            }
            // Optimistic update already applied — Pusher confirms to all clients
          })
          .catch((err) => {
            console.error('Failed to transition cleaning → available:', err);
            pushError('Failed to update table status', 'table-status');
          });
        return;
      }

      // Set focus context
      const session =
        typeof table.activeSessionId === 'object' ? table.activeSessionId : null;
      const order = session?.orderId;

      const newContext = {
        tableId: table._id,
        table,
        sessionId: session?._id,
        session: session || undefined,
        orderId: typeof order === 'object' ? order._id : order,
        order: typeof order === 'object' ? order : undefined,
      };

      // Navigation flow:
      //   Occupied table with active session → Order Editor (body click)
      //   Available / Reserved table:
      //     - showTableSessionPanel=true  → Open TableSessionPanel to seat guests
      //     - showTableSessionPanel=false → Auto-initiate session with default covers
      if (session?.orderId) {
        // Atomic switch clears stale cart & replaces context
        switchOrderContext(newContext);
        setActiveTab('order-editor');
      } else if (!hub.showTableSessionPanel && canSeatTable(table, new Date(), reservationPolicy)) {
        // Skip the panel entirely — start session with default covers.
        // canSeatTable() is false inside a reservation hold, so a booked table
        // still opens the panel where the arrival CTA and override live.
        initiateRef.current(table._id, hub.defaultCovers);
      } else {
        setFocusedContext(newContext);
        setSelectedTable(table);
      }
    },
    [
      switchOrderContext,
      setFocusedContext,
      setActiveTab,
      pushError,
      hub.showTableSessionPanel,
      hub.defaultCovers,
      reservationPolicy,
    ]
  );

  /**
   * Info-icon click on an occupied table’s HUD badge:
   * Opens the TableSessionPanel (slide-over details) WITHOUT navigating away.
   * Uses e.stopPropagation() inside TableVisual to prevent the body click.
   */
  const handleTableIconClick = useCallback(
    (table: ITable) => {
      const session =
        typeof table.activeSessionId === 'object' ? table.activeSessionId : null;
      const order = session?.orderId;

      setFocusedContext({
        tableId: table._id,
        table,
        sessionId: session?._id,
        session: session || undefined,
        orderId: typeof order === 'object' ? order._id : order,
        order: typeof order === 'object' ? order : undefined,
      });

      // Open the side panel without navigating to Order Editor
      setSelectedTable(table);
    },
    [setFocusedContext]
  );

  const handleInitiateSession = useCallback(
    async (
      tableId: string,
      covers: number,
      opts?: { reservationId?: string; overrideReservationHold?: boolean },
    ) => {
      try {
        const res = await fetch('/api/tables/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tableId,
            covers,
            reservationId: opts?.reservationId,
            overrideReservationHold: opts?.overrideReservationHold,
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        // 423 = a reservation hold owns this table. Recoverable: staff can
        // re-send with the override, or use the booking's own arrival CTA.
        if (res.status === 423) {
          const body = await res.json().catch(() => ({}));
          pushError(
            `${body.error || 'Table is reserved'} — use “Guest Arrived” or seat the walk-in anyway.`,
            'reservation-hold',
          );
          await fetchTables();
          return;
        }
        if (res.status === 409) {
          pushError('This table was just seated by another user — refreshing…', 'initiate-conflict');
          await fetchTables();
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to initiate session');
        }

        const data = await res.json();

        flushOrderEditorCache();
        switchOrderContext({
          tableId,
          table: data.table,
          sessionId: data.session._id,
          session: data.session,
          orderId: data.order._id,
          order: data.order,
        });

        setActiveTab('order-editor');
        // Optimistic local patch — Pusher broadcasts table:session_started for other clients
        setTables((prev) => prev.map((t) => (t._id === tableId ? data.table : t)));
      } catch (error) {
        console.error('Failed to initiate session:', error);
        pushError(`Failed to start session: ${(error as Error).message}`, 'initiate-session');
      }
    },
    [switchOrderContext, setActiveTab, fetchTables, pushError]
  );

  // Keep initiateRef in sync with latest callback
  useEffect(() => { initiateRef.current = handleInitiateSession; }, [handleInitiateSession]);

  const handleRequestBill = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_bill' }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.warn('Request bill failed:', body.error || res.statusText);
      }
      // Pusher broadcasts session:updated — schedule batched refresh as safety net
      scheduleRefresh({ tables: true });
    } catch (error) {
      console.error('Failed to request bill:', error);
      pushError('Failed to request bill', 'request-bill');
    }
  }, [scheduleRefresh, pushError]);

  const handleCloseSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'close' }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to close session');
        }
        setSelectedTable(null);
        clearFocusedContext();
        // Pusher broadcasts session:closed + order:completed — batched refresh as safety net
        scheduleRefresh({ tables: true, orders: true, stats: true });
      } catch (error) {
        console.error('Failed to close session:', error);
        pushError(`Failed to close session: ${(error as Error).message}`, 'close-session');
        // Refresh anyway — another user may have closed it
        scheduleRefresh({ tables: true });
      }
    },
    [clearFocusedContext, scheduleRefresh, pushError]
  );

  // ── Reservation actions ────────────────────────────────────────────────────
  // Every mutation posts to the table's PATCH endpoint and patches the local
  // table from the decoded response, so the panel reflects the new queue
  // immediately; the broadcast then reconciles the other floor screens.
  const reservationAction = useCallback(
    async (tableId: string, body: Record<string, unknown>, errorLabel: string) => {
      const res = await fetch(`/api/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        const message = payload.error || `Failed to ${errorLabel}`;
        // Bubble validation problems up so the form can offer "book anyway"
        // instead of silently swallowing them into a toast.
        const err = Object.assign(new Error(message), {
          code: payload.code,
          problems: payload.problems,
          overridable: payload.overridable,
        });
        throw err;
      }

      const updated = await res.json();
      if (updated?._id) {
        setTables((prev) => prev.map((t) => (t._id === tableId ? { ...t, ...updated } : t)));
      } else {
        scheduleRefresh({ tables: true });
      }
    },
    [scheduleRefresh],
  );

  const handleAddReservation = useCallback(
    async (tableId: string, reservation: ReservationInputPayload, opts?: { force?: boolean }) => {
      try {
        await reservationAction(
          tableId,
          { action: 'add_reservation', reservation, force: !!opts?.force },
          'add reservation',
        );
      } catch (error) {
        // The form renders this inline — no toast, or staff see it twice.
        throw error;
      }
    },
    [reservationAction],
  );

  const handleUpdateReservation = useCallback(
    async (
      tableId: string,
      reservationId: string,
      reservation: Partial<ReservationInputPayload>,
      opts?: { force?: boolean },
    ) => {
      await reservationAction(
        tableId,
        { action: 'update_reservation', reservationId, reservation, force: !!opts?.force },
        'update reservation',
      );
    },
    [reservationAction],
  );

  const handleCancelReservation = useCallback(
    async (tableId: string, reservationId: string, reason?: string) => {
      try {
        await reservationAction(
          tableId,
          { action: 'cancel_reservation', reservationId, reason },
          'cancel reservation',
        );
      } catch (error) {
        pushError((error as Error).message, 'cancel-reservation');
      }
    },
    [reservationAction, pushError],
  );

  const handleMarkNoShow = useCallback(
    async (tableId: string, reservationId: string, reason?: string) => {
      try {
        await reservationAction(
          tableId,
          { action: 'mark_no_show', reservationId, reason },
          'mark no-show',
        );
      } catch (error) {
        pushError((error as Error).message, 'no-show-reservation');
      }
    },
    [reservationAction, pushError],
  );

  const handleMarkArrived = useCallback(
    async (tableId: string, reservationId: string) => {
      try {
        await reservationAction(
          tableId,
          { action: 'mark_arrived', reservationId },
          'check the guest in',
        );
      } catch (error) {
        pushError((error as Error).message, 'arrive-reservation');
      }
    },
    [reservationAction, pushError],
  );

  const handleMoveReservation = useCallback(
    async (
      tableId: string,
      reservationId: string,
      targetTableId: string,
      opts?: { force?: boolean },
    ) => {
      try {
        const res = await fetch(`/api/tables/${tableId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'move_reservation',
            reservationId,
            targetTableId,
            force: !!opts?.force,
          }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload.error || 'Failed to move reservation');
        }
        const { table: from, targetTable: to } = await res.json();
        // Two tables changed — patch both rather than refetching the floor.
        setTables((prev) =>
          prev.map((t) =>
            t._id === from?._id ? { ...t, ...from } : t._id === to?._id ? { ...t, ...to } : t,
          ),
        );
      } catch (error) {
        console.error('Failed to move reservation:', error);
        pushError((error as Error).message, 'move-reservation');
        scheduleRefresh({ tables: true });
      }
    },
    [pushError, scheduleRefresh],
  );

  /** Seat a booked party — the "Guest Arrived" CTA. */
  const handleSeatReservation = useCallback(
    async (tableId: string, reservationId: string, covers: number) => {
      await initiateRef.current(tableId, covers, { reservationId });
    },
    [],
  );

  // Handler for updating table positions (drag-and-drop in edit mode)
  // Debounced to 500ms so rapid drag events batch into a single API call
  const { debouncedFn: handleTablesUpdate } = useDebouncedCallback(
    async (updates: import('@/types/table.types').TablePositionUpdate[]) => {
      try {
        const res = await fetch('/api/tables', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            updates: updates.map((u) => ({
              id: u.tableId,
              x_position: u.x_position,
              y_position: u.y_position,
              orientation: u.orientation,
              width: u.width,
              height: u.height,
            })),
          }),
        });

        if (!res.ok) throw new Error('Failed to update table positions');

        // Positions already applied locally by canvas — Pusher broadcasts for other clients
        scheduleRefresh({ tables: true });
      } catch (error) {
        console.error('Failed to update table positions:', error);
        throw error; // Re-throw so FloorPlanCanvas can handle it
      }
    },
    500,
  );

  // Handler for bulk-upserting new tables from the Playground
  const handleBulkUpsert = useCallback(
    async (items: BulkUpsertTableItem[]) => {
      try {
        const res = await fetch('/api/tables', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tables: items }),
        });
        if (!res.ok) throw new Error('Bulk upsert failed');
        // Pusher broadcasts bulk table:updated — schedule refresh for reconciliation
        scheduleRefresh({ tables: true, sections: true });
      } catch (error) {
        console.error('Failed to bulk upsert tables:', error);
        throw error;
      }
    },
    [scheduleRefresh],
  );

  // Handler for creating a new zone/section from the Playground sidebar
  const handleCreateZone = useCallback(
    async (name: string, color: string, floor: number) => {
      try {
        const res = await fetch('/api/tables/sections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color, floorNumber: floor }),
        });
        if (!res.ok) throw new Error('Failed to create zone');
        await fetchSections();
      } catch (error) {
        console.error('Failed to create zone:', error);
        throw error;
      }
    },
    [fetchSections],
  );


  const handleTableDelete = useCallback(
    async (tableId: string) => {
      try {
        const res = await fetch(`/api/tables/${tableId}`, {
          method: 'DELETE',
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to delete table');
        }
      } catch (error) {
        console.error('Failed to delete table:', error);
        throw error;
      }
    },
    [],
  );

  const handleOrderStatusChange = useCallback(
    async (orderId: string, action: string, data?: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...data }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (res.status === 409) {
          // Version conflict — another user changed this order
          console.warn('[Hub] Version conflict on order update, refreshing…');
          pushError('Order was modified by another user — refreshing…', 'order-conflict');
          await fetchOrders();
          return;
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Order update failed (${res.status})`);
        }

        const updatedOrder: Order = await res.json();

        // Optimistic in-place update before Pusher event arrives
        setOrders((prev) =>
          prev
            .map((o) => (o._id === orderId ? updatedOrder : o))
            .filter((o) => !['completed', 'cancelled'].includes(o.status))
        );

        if (selectedOrder?._id === orderId) {
          setSelectedOrder(updatedOrder);
        }

        // Pusher broadcasts order event — batch stats refresh with incoming events
        scheduleRefresh({ stats: true });
      } catch (error) {
        console.error('Failed to update order:', error);
        pushError(`Order update failed: ${(error as Error).message}`, 'order-update');
      }
    },
    [selectedOrder, scheduleRefresh, fetchOrders, pushError]
  );

  const handleAddPayment = useCallback(
    async (orderId: string, payment: { method: PaymentMethod; amount: number }) => {
      await handleOrderStatusChange(orderId, 'add_payment', { payment });
    },
    [handleOrderStatusChange]
  );

  const handleViewOrderDetails = useCallback((order: Order) => {
    setSelectedOrder(order);
    switchOrderContext({
      orderId: order._id,
      order,
      tableId: order.table?.tableId,
    });
  }, [switchOrderContext]);

  const handleNewOrder = useCallback(() => {
    flushOrderEditorCache();
    clearFocusedContext();
    setActiveTab('order-editor');
  }, [clearFocusedContext, setActiveTab]);

  // ── Takeaway Handlers ────────────────────────────────────────────────────

  /** Initiate a new takeaway order for a given customer */
  const handleTakeawayInitiate = useCallback(
    async (customerId: string) => {
      try {
        const res = await fetch('/api/pos/takeaway', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to create takeaway order');
        }
        const data = await res.json();
        const order = data.order;

        flushOrderEditorCache();
        switchOrderContext({
          orderId: order._id,
          order,
        });
        // Add to local takeaway orders list
        setTakeawayOrders((prev) => [order, ...prev]);
        scheduleRefresh({ stats: true });
      } catch (error) {
        console.error('Failed to initiate takeaway order:', error);
        pushError(`Failed to create takeaway order: ${(error as Error).message}`, 'takeaway-initiate');
      }
    },
    [switchOrderContext, scheduleRefresh, pushError],
  );

  /** Switch to a different active takeaway order */
  const handleTakeawaySwitch = useCallback(
    (order: Order) => {
      flushOrderEditorCache();
      switchOrderContext({
        orderId: order._id,
        order,
      });
    },
    [switchOrderContext],
  );

  /** Start a fresh new takeaway order (clear context, customer panel shows search) */
  const handleTakeawayNew = useCallback(() => {
    flushOrderEditorCache();
    clearFocusedContext();
    // Stay on takeaway tab — customer panel will show search
  }, [clearFocusedContext]);

  // ── Delivery Handlers ────────────────────────────────────────────────────
  // Mirrors the takeaway handlers above — same creation/switch/new-order flow,
  // just against /api/pos/delivery and the delivery-specific order list.

  /** Initiate a new delivery order for a given customer */
  const handleDeliveryInitiate = useCallback(
    async (customerId: string) => {
      try {
        const res = await fetch('/api/pos/delivery', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ customerId }),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to create delivery order');
        }
        const data = await res.json();
        const order = data.order;

        flushOrderEditorCache();
        switchOrderContext({
          orderId: order._id,
          order,
        });
        // Add to local delivery orders list
        setDeliveryOrders((prev) => [order, ...prev]);
        scheduleRefresh({ stats: true });
      } catch (error) {
        console.error('Failed to initiate delivery order:', error);
        pushError(`Failed to create delivery order: ${(error as Error).message}`, 'delivery-initiate');
      }
    },
    [switchOrderContext, scheduleRefresh, pushError],
  );

  /** Switch to a different active delivery order */
  const handleDeliverySwitch = useCallback(
    (order: Order) => {
      flushOrderEditorCache();
      switchOrderContext({
        orderId: order._id,
        order,
      });
    },
    [switchOrderContext],
  );

  /** Start a fresh new delivery order (clear context, customer panel shows search) */
  const handleDeliveryNew = useCallback(() => {
    flushOrderEditorCache();
    clearFocusedContext();
    // Stay on delivery tab — customer panel will show search
  }, [clearFocusedContext]);

  const renderFloorPlanSlot = () => (
    <ContextBarSlot>
      <StatBadge
        icon={<LayoutGrid size={14} />}
        value={`${tableStats.availableTables}/${tableStats.totalTables}`}
        label="Tables"
        color="purple"
      />
      <StatBadge
        icon={<Users size={14} />}
        value={tableStats.currentGuests}
        label="Guests"
        color="orange"
      />
      <StatBadge
        icon={<DollarSign size={14} />}
        value={`${tableStats.totalRevenue.toLocaleString()}`}
        label="Revenue"
        color="green"
      />
      <FilterDropdown
        value={tableStatusFilter}
        onChange={(v) => setTableStatusFilter(v as TableStatus | 'all')}
        options={[
          { value: 'all', label: 'All Status' },
          { value: 'available', label: 'Available' },
          { value: 'occupied', label: 'Occupied' },
          { value: 'reserved', label: 'Reserved' },
          { value: 'cleaning', label: 'Cleaning' },
        ]}
      />
    </ContextBarSlot>
  );

  const renderOrdersSlot = () => (
    <ContextBarSlot>
      {orderStats && (
        <>
          <StatBadge
            icon={<Clock size={14} />}
            value={orderStats.activeOrders}
            label="Active"
            color="orange"
          />
          <StatBadge
            icon={<DollarSign size={14} />}
            value={`${orderStats.todayRevenue?.toLocaleString() || 0}`}
            label="Today"
            color="green"
          />
        </>
      )}
      <SearchInput
        value={orderSearchQuery}
        onChange={setOrderSearchQuery}
        placeholder="Search orders..."
      />
      <FilterDropdown
        value={orderPaymentFilter}
        onChange={setOrderPaymentFilter}
        options={[
          { value: 'all', label: 'All Payments' },
          { value: 'pending', label: 'Pending' },
          { value: 'paid', label: 'Paid' },
          { value: 'partial', label: 'Partial' },
        ]}
      />
    </ContextBarSlot>
  );


  const renderOrderEditorSlot = () => null;

  const renderTakeawaySlot = () => null;

  const renderDeliverySlot = () => null;

  const renderOrderListSlot = () => (
    <ContextBarSlot>
      {orderStats && (
        <>
          <StatBadge
            icon={<Clock size={14} />}
            value={orderStats.todayOrders}
            label="Today"
            color="blue"
          />
          <StatBadge
            icon={<DollarSign size={14} />}
            value={`${orderStats.todayRevenue?.toLocaleString() || 0}`}
            label="Revenue"
            color="green"
          />
        </>
      )}
    </ContextBarSlot>
  );


  const isLoading =
    (activeTab === 'floor-plan' && isLoadingTables) ||
    (activeTab === 'orders' && isLoadingOrders);


  return (
    <div className="h-screen flex flex-col bg-gray-950">
      {/* Workspace header, pinned routes only.
          Two jobs: say plainly which queue this is, so somebody who has just
          been handed a tablet knows what they are looking at; and give the way
          back to anyone who has one. A delivery-only account has no floor to
          return to, so the link is not shown to them rather than shown and
          bouncing them off the guard. */}
      {workspace && (
        <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black px-4 py-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            {workspace === 'delivery'
              ? <Bike size={17} className="shrink-0 text-emerald-400" />
              : <ShoppingBag size={17} className="shrink-0 text-emerald-400" />}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white leading-tight">
                {workspace === 'delivery' ? 'Delivery' : 'Takeaway'}
              </p>
              <p className="truncate text-[11px] text-white/40 leading-tight">
                {workspace === 'delivery'
                  ? 'Orders going out for delivery'
                  : 'Orders being collected at the counter'}
              </p>
            </div>
          </div>

          {hasPermission(session?.user?.role, session?.user?.permissions, 'manage_orders') && (
            <Link
              href="/hub"
              className="shrink-0 rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium
                         text-white/60 transition-colors hover:border-white/35 hover:text-white"
            >
              Full POS
            </Link>
          )}
        </div>
      )}

      <GlobalContextBar
        floorPlanSlot={renderFloorPlanSlot()}
        ordersSlot={renderOrdersSlot()}
        orderEditorSlot={renderOrderEditorSlot()}
        orderListSlot={renderOrderListSlot()}
        takeawaySlot={renderTakeawaySlot()}
        deliverySlot={renderDeliverySlot()}
        hiddenTabs={hiddenTabs}
        onNewOrder={handleNewOrder}
        onRefresh={refreshAll}
        onPrintKOT={() => orderEditorRef.current?.printKOT()}
        onPrintInvoice={() => orderEditorRef.current?.printInvoice()}
        userName={session?.user?.name || 'Staff'}
        userRole={session?.user?.role || 'Server'}
        syncStatus={realtimeStatus}
        activityLog={activityLog}
      />

      <main className="flex-1 overflow-hidden pb-14 md:pb-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader />
          </div>
        ) : (
          <>
            {/* Floor Plan Tab */}
            {activeTab === 'floor-plan' && (
              <div className="h-full p-4">
                <ResponsiveCanvasWrapper
                  canvasContent={
                    <FloorPlanCanvas
                      tables={filteredTables}
                      sections={sections}
                      onTableClick={handleTableClick}
                      onTableIconClick={handleTableIconClick}
                      onTablesUpdate={async (updates) => { handleTablesUpdate(updates); }}
                      onBulkUpsert={handleBulkUpsert}
                      onTableDelete={handleTableDelete}
                      onCreateZone={handleCreateZone}
                      selectedTableId={selectedTable?._id}
                      selectedSectionId={selectedSectionId}
                      onSectionChange={setSelectedSectionId}
                      statusFilter={tableStatusFilter}
                      onSectionsRefresh={fetchSections}
                      reservationPolicy={reservationPolicy}
                    />
                  }
                  mobileContent={
                    <MobileTableGrid
                      tables={filteredTables}
                      onTableClick={handleTableClick}
                      statusFilter={tableStatusFilter}
                      onStatusFilterChange={setTableStatusFilter}
                      reservationPolicy={reservationPolicy}
                    />
                  }
                />
              </div>
            )}

            {/* Orders Grid Tab */}
            {activeTab === 'orders' && (
              <>
                {orderViewMode === 'grid' ? (
                  <OrderManagerGrid
                    orders={filteredOrders}
                    onStatusChange={handleOrderStatusChange}
                    onViewDetails={handleViewOrderDetails}
                    isLoading={isLoadingOrders}
                  />
                ) : (
                  <OrderManagerList
                    orders={filteredOrders}
                    onStatusChange={handleOrderStatusChange}
                    onViewDetails={handleViewOrderDetails}
                    isLoading={isLoadingOrders}
                  />
                )}
              </>
            )}

            {/* Order Editor Tab */}
            {activeTab === 'order-editor' && (
              <OrderEditor
                ref={orderEditorRef}
                order={focusedContext.order}
                mode="dine-in"
                tables={tables}
                sections={sections}
                onOrderFired={() => {
                  // After firing items, stats change but the order was already
                  // broadcast via Pusher — batch stats refresh with incoming events.
                  scheduleRefresh({ stats: true });
                }}
                onOrderUpdated={(updatedOrder: Order) => {
                  setFocusedContext({ order: updatedOrder });
                  // Patch the orders list in-place instead of refreshAll()
                  setOrders((prev) =>
                    prev.map((o) => (o._id === updatedOrder._id ? updatedOrder : o))
                  );
                  scheduleRefresh({ stats: true });
                }}
              />
            )}

            {/* Takeaway Tab */}
            {activeTab === 'takeaway' && (
              <OrderEditor
                ref={orderEditorRef}
                order={focusedContext.order}
                mode="takeaway"
                takeawayOrders={takeawayOrders}
                isTakeawayLoading={isTakeawayLoading}
                onTakeawaySwitch={handleTakeawaySwitch}
                onTakeawayNew={handleTakeawayNew}
                onTakeawayInitiate={handleTakeawayInitiate}
                onOrderFired={() => {
                  scheduleRefresh({ stats: true, takeaway: true });
                }}
                onOrderUpdated={(updatedOrder: Order) => {
                  setFocusedContext({ order: updatedOrder });
                  // Patch both the generic orders list and takeaway-specific list
                  setOrders((prev) =>
                    prev.map((o) => (o._id === updatedOrder._id ? updatedOrder : o))
                  );
                  setTakeawayOrders((prev) =>
                    prev.map((o) => (o._id === updatedOrder._id ? updatedOrder : o))
                  );
                  scheduleRefresh({ stats: true });
                }}
              />
            )}

            {/* Delivery Tab */}
            {activeTab === 'delivery' && (
              <OrderEditor
                ref={orderEditorRef}
                order={focusedContext.order}
                mode="delivery"
                takeawayOrders={deliveryOrders}
                isTakeawayLoading={isDeliveryLoading}
                onTakeawaySwitch={handleDeliverySwitch}
                onTakeawayNew={handleDeliveryNew}
                onTakeawayInitiate={handleDeliveryInitiate}
                onOrderFired={() => {
                  scheduleRefresh({ stats: true, delivery: true });
                }}
                onOrderUpdated={(updatedOrder: Order) => {
                  setFocusedContext({ order: updatedOrder });
                  // Patch both the generic orders list and delivery-specific list
                  setOrders((prev) =>
                    prev.map((o) => (o._id === updatedOrder._id ? updatedOrder : o))
                  );
                  setDeliveryOrders((prev) =>
                    prev.map((o) => (o._id === updatedOrder._id ? updatedOrder : o))
                  );
                  scheduleRefresh({ stats: true });
                }}
              />
            )}

            {/* Order List Tab */}
            {activeTab === 'order-list' && (
              <OrderList
                refreshSignal={orderEventTick}
                onOpenInEditor={(order) => {
                  switchOrderContext({
                    orderId: order._id,
                    order,
                    tableId: order.table?.tableId,
                  });
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Table Session Panel (Floor Plan) */}
      <AnimatePresence>
        {activeTab === 'floor-plan' && selectedTable && (
          <TableSessionPanel
            table={selectedTable}
            onClose={() => setSelectedTable(null)}
            onInitiateSession={handleInitiateSession}
            onRequestBill={handleRequestBill}
            onCloseSession={handleCloseSession}
            allTables={tables}
            reservationPolicy={reservationPolicy}
            onAddReservation={handleAddReservation}
            onUpdateReservation={handleUpdateReservation}
            onCancelReservation={handleCancelReservation}
            onMarkNoShow={handleMarkNoShow}
            onMarkArrived={handleMarkArrived}
            onMoveReservation={handleMoveReservation}
            onSeatReservation={handleSeatReservation}
            requireCovers={hub.requireCoversOnSeat}
            defaultCovers={hub.defaultCovers}
            allowReservations={hub.allowReservations}
            onViewOrder={(orderId) => {
              // Navigate to Order Editor with this order focused
              const order = orders.find((o) => o._id === orderId);
              if (order) {
                switchOrderContext({
                  orderId: order._id,
                  order,
                  tableId: order.table?.tableId,
                });
                usePOSStore.getState().setActiveTab('order-editor');
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Order Details Panel (Orders Grid side-panel) */}
      <OrderDetailsPanel
        order={selectedOrder}
        isOpen={activeTab === 'orders' && !!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onStatusChange={handleOrderStatusChange}
        onAddPayment={handleAddPayment}
      />
    </div>
  );
}
