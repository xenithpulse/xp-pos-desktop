// pos_modules/orders/order-editor/useOrderEditorState.ts
// Central hook: all state, handlers, and derived values for the Order Editor.
// Sub-components consume slices of this return value via props.

'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import { usePOSStore } from '@/stores/posStore';
import {
  ICategory,
  IMenuItem,
  formatPrice,
} from '@/types/menu.types';
import {
  Order,
  PaymentMethod,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_COLORS,
  PAYMENT_METHOD_LABELS,
} from '@/types/order.types';
import { SmartCache } from '@/lib/cache';
import { LIFECYCLE_ACTIONS } from '../OrderEditorConstants';
import { openPrintWindow } from '../helpers';
import {
  usePrintService,
  createKOTData,
  createBillData,
  generateKOTNumber,
} from '../printing-facility';
import type { OrderEditorProps, UseOrderEditorReturn } from './types';

import type { AdjustmentKind, AdjustmentCalcMode } from '@/types/order.types';
import type { IPaymentMethodConfig, PaymentCategory } from '@/types/settings.types';

// Fallback methods when tenant settings haven't loaded yet.
const FALLBACK_PAYMENT_METHODS: IPaymentMethodConfig[] = [
  { id: 'cash', label: 'Cash', icon: '💵', category: 'cash', enabled: true, requiresReference: false, sortOrder: 0, isBuiltIn: true },
  { id: 'card', label: 'Card', icon: '💳', category: 'card', enabled: true, requiresReference: true, sortOrder: 1, isBuiltIn: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// LocalStorage keys for catalog persistence
// ─────────────────────────────────────────────────────────────────────────────

const LS_MENU_ITEMS_KEY = 'xp_pos:catalog:menuItems';
const LS_CATEGORIES_KEY = 'xp_pos:catalog:categories';
const LS_CATALOG_TS_KEY = 'xp_pos:catalog:timestamp';
/** Max age of localStorage catalog cache: 10 minutes */
const CATALOG_CACHE_TTL = 10 * 60 * 1000;

function getCachedCatalog(): { items: IMenuItem[]; categories: ICategory[] } | null {
  try {
    const ts = localStorage.getItem(LS_CATALOG_TS_KEY);
    if (!ts || Date.now() - Number(ts) > CATALOG_CACHE_TTL) return null;
    const rawItems = localStorage.getItem(LS_MENU_ITEMS_KEY);
    const rawCats = localStorage.getItem(LS_CATEGORIES_KEY);
    if (!rawItems || !rawCats) return null;
    return { items: JSON.parse(rawItems), categories: JSON.parse(rawCats) };
  } catch {
    return null;
  }
}

function setCachedCatalog(items: IMenuItem[], categories: ICategory[]) {
  try {
    localStorage.setItem(LS_MENU_ITEMS_KEY, JSON.stringify(items));
    localStorage.setItem(LS_CATEGORIES_KEY, JSON.stringify(categories));
    localStorage.setItem(LS_CATALOG_TS_KEY, String(Date.now()));
  } catch {
    // localStorage full — silently fail
  }
}

function flushCatalogCache() {
  try {
    localStorage.removeItem(LS_MENU_ITEMS_KEY);
    localStorage.removeItem(LS_CATEGORIES_KEY);
    localStorage.removeItem(LS_CATALOG_TS_KEY);
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Cache — keyed by orderId, TTL + max-size + version
// ─────────────────────────────────────────────────────────────────────────────

const orderEditorCache = new SmartCache<Order>({ ttl: 30_000, maxSize: 100 });

function getCachedOrder(orderId: string): Order | null {
  return orderEditorCache.get(orderId);
}

function setCachedOrder(order: Order) {
  orderEditorCache.set(order._id, order, order.updatedAt ?? undefined);
}

function invalidateCachedOrder(orderId: string) {
  orderEditorCache.delete(orderId);
}

/** Flush the entire cache — call on hard context switches */
export function flushOrderEditorCache() {
  orderEditorCache.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useOrderEditorState(
  props: OrderEditorProps,
): UseOrderEditorReturn {
  const { order, onOrderFired, onOrderUpdated } = props;

  // ── Store slices ────────────────────────────────────────────────────────
  const focusedContext = usePOSStore((s) => s.focusedContext);
  const cart = usePOSStore((s) => s.cart);
  const addToCart = usePOSStore((s) => s.addToCart);
  const updateCartQty = usePOSStore((s) => s.updateCartItemQuantity);
  const removeCart = usePOSStore((s) => s.removeFromCart);
  const clearCart = usePOSStore((s) => s.clearCart);
  const updateCartInstr = usePOSStore((s) => s.updateCartItemInstructions);
  const cartOrderId = usePOSStore((s) => s.cartOrderId);
  const setCartOrderId = usePOSStore((s) => s.setCartOrderId);

  // ── Catalog state ───────────────────────────────────────────────────────
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [allMenuItemsDraft, setAllMenuItemsDraft] = useState<IMenuItem[]>([]);
  const [menuItems, setMenuItems] = useState<IMenuItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const allItemsLoadedRef = useRef(false);

  // ── Commit state ────────────────────────────────────────────────────────
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [commitSuccess, setCommitSuccess] = useState(false);

  // ── Instructions editing ────────────────────────────────────────────────
  const [editingInstructionsId, setEditingInstructionsId] = useState<string | null>(null);

  // ── Server item editing ─────────────────────────────────────────────────
  const [isUpdatingServerItem, setIsUpdatingServerItem] = useState(false);

  // ── Payment drawer ──────────────────────────────────────────────────────
  const [showPaymentDrawer, setShowPaymentDrawer] = useState(false);
  // `paymentMethod` now holds the selected method's id (from tenant settings),
  // not the raw category — this is what lets custom methods work.
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');

  // Tenant-configured payment methods (enabled, ordered). Falls back until settings load.
  const settingsPaymentMethods = usePOSStore((s) => s.settings?.paymentMethods);
  const paymentMethods = useMemo<IPaymentMethodConfig[]>(() => {
    const src = settingsPaymentMethods && settingsPaymentMethods.length > 0
      ? settingsPaymentMethods
      : FALLBACK_PAYMENT_METHODS;
    return src.filter((m) => m.enabled).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  }, [settingsPaymentMethods]);

  // Resolve a method id → { category, label, requiresReference } for recording.
  const resolvePaymentMethod = useCallback(
    (id: string): { category: PaymentCategory; label: string; requiresReference: boolean } => {
      const all = settingsPaymentMethods && settingsPaymentMethods.length > 0 ? settingsPaymentMethods : FALLBACK_PAYMENT_METHODS;
      const m = all.find((x) => x.id === id);
      return m
        ? { category: m.category, label: m.label, requiresReference: m.requiresReference }
        : { category: 'cash', label: 'Cash', requiresReference: false };
    },
    [settingsPaymentMethods],
  );

  // Keep the selected method valid as methods load / change.
  useEffect(() => {
    if (paymentMethods.length > 0 && !paymentMethods.some((m) => m.id === paymentMethod)) {
      setPaymentMethod(paymentMethods[0].id);
    }
  }, [paymentMethods, paymentMethod]);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // ── Lifecycle action state ──────────────────────────────────────────────
  const [isPerformingAction, setIsPerformingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // ── Complete order state ────────────────────────────────────────────────
  const [isCompletingOrder, setIsCompletingOrder] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);

  // ── Conflict warning ────────────────────────────────────────────────────
  const [tableConflictWarning, setTableConflictWarning] = useState<string | null>(null);

  // ── Thermal Print Service ───────────────────────────────────────────────
  const {
    printKOT: thermalPrintKOT,
    printBill: thermalPrintBill,
    isConnected: isPrinterConnected,
    isPrinting,
    error: printError,
    clearError: clearPrintError,
  } = usePrintService();

  // ═══════════════════════════════════════════════════════════════════════════
  // Derived
  // ═══════════════════════════════════════════════════════════════════════════

  const activeOrder = order ?? focusedContext.order ?? null;

  const isHistorical = activeOrder
    ? ['completed', 'cancelled'].includes(activeOrder.status)
    : false;

  // ═══════════════════════════════════════════════════════════════════════════
  // Stale-cart guard: clear cart if it belongs to a different order
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const currentOrderId = activeOrder?._id ?? null;
    if (cartOrderId && currentOrderId && cartOrderId !== currentOrderId) {
      // Cart belongs to a different order → purge
      clearCart();
    }
    // Always sync the cartOrderId to the current context
    if (currentOrderId !== cartOrderId) {
      setCartOrderId(currentOrderId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrder?._id]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Smart fetch with cache
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!activeOrder?._id) return;

    if (activeOrder.items && activeOrder.items.length >= 0 && activeOrder.grandTotal !== undefined) {
      setCachedOrder(activeOrder);
    }

    if (!activeOrder.items) {
      const cached = getCachedOrder(activeOrder._id);
      if (cached) {
        onOrderUpdated?.(cached);
        return;
      }

      fetch(`/api/orders/${activeOrder._id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((fullOrder) => {
          if (fullOrder) {
            setCachedOrder(fullOrder);
            onOrderUpdated?.(fullOrder);
          }
        })
        .catch((err) => console.error('Failed to fetch full order:', err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrder?._id]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Table conflict detection
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!activeOrder?.table?.tableId || !isHistorical) {
      setTableConflictWarning(null);
      return;
    }

    fetch(`/api/tables/${activeOrder.table.tableId}?withSessions=true`)
      .then((res) => (res.ok ? res.json() : null))
      .then((table) => {
        if (!table) return;
        if (
          table.status === 'occupied' &&
          table.activeSessionId &&
          typeof table.activeSessionId === 'object'
        ) {
          const activeSessionOrder = table.activeSessionId?.orderId;
          const activeSessionOrderId =
            typeof activeSessionOrder === 'object'
              ? activeSessionOrder?._id
              : activeSessionOrder;
          if (activeSessionOrderId && activeSessionOrderId !== activeOrder._id) {
            setTableConflictWarning(
              `Table ${activeOrder.table?.tableNumber || table.tableNumber} currently has an active session.`,
            );
            return;
          }
        }
        setTableConflictWarning(null);
      })
      .catch(() => setTableConflictWarning(null));
  }, [activeOrder?.table?.tableId, activeOrder?._id, isHistorical, activeOrder?.table?.tableNumber]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Catalog data fetching — draft all items locally for instant search
  // ═══════════════════════════════════════════════════════════════════════════

  const fetchCategories = useCallback(async (skipCache = false) => {
    setIsLoadingCategories(true);
    try {
      const res = await fetch('/api/menu/categories?withCounts=true');
      if (res.ok) {
        const data = await res.json();
        const cats: ICategory[] = data.categories || [];
        setCategories(cats);
        if (cats.length > 0 && !selectedCategoryId) {
          setSelectedCategoryId(cats[0]._id);
        }
        return cats;
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    } finally {
      setIsLoadingCategories(false);
    }
    return null;
  }, [selectedCategoryId]);

  // Load ALL menu items once on mount — enables instant local search + code lookup
  const fetchAllMenuItems = useCallback(async (skipCache = false) => {
    if (allItemsLoadedRef.current && !skipCache) return null;
    setIsLoadingItems(true);
    try {
      const res = await fetch('/api/menu/items?all=true');
      if (res.ok) {
        const data = await res.json();
        const items: IMenuItem[] = data.items || [];
        setAllMenuItemsDraft(items);
        allItemsLoadedRef.current = true;
        return items;
      }
    } catch (err) {
      console.error('Failed to fetch all menu items:', err);
    } finally {
      setIsLoadingItems(false);
    }
    return null;
  }, []);

  // Hydrate from localStorage first, then fetch from API if stale
  useEffect(() => {
    const cached = getCachedCatalog();
    if (cached && cached.items.length > 0) {
      setAllMenuItemsDraft(cached.items);
      allItemsLoadedRef.current = true;
      setCategories(cached.categories);
      if (cached.categories.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(cached.categories[0]._id);
      }
      setIsLoadingCategories(false);
      setIsLoadingItems(false);
    } else {
      // No cache — fetch from API and persist
      Promise.all([fetchCategories(), fetchAllMenuItems()]).then(([cats, items]) => {
        if (cats && items) {
          setCachedCatalog(items, cats);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounce search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [searchQuery]);

  // Local filtering — no API calls needed for search or category switching
  useEffect(() => {
    if (!allItemsLoadedRef.current || allMenuItemsDraft.length === 0) return;

    let filtered = allMenuItemsDraft;

    if (debouncedSearch) {
      const q = debouncedSearch.trim();
      const qLower = q.toLowerCase();

      // ── Precise QuickCode matching ──
      // If the query looks like a quickCode (all digits), find EXACT matches first.
      // Only fall back to fuzzy name search if no exact quickCode match exists.
      const isCodeQuery = /^\d+$/.test(q);

      if (isCodeQuery) {
        const exactCodeMatches = allMenuItemsDraft.filter(
          (item) => item.quickCode === q,
        );
        if (exactCodeMatches.length > 0) {
          // Exact quickCode match found — return ONLY those
          filtered = exactCodeMatches;
        } else {
          // No exact match — fall back to prefix match on quickCode only
          filtered = allMenuItemsDraft.filter(
            (item) => item.quickCode && item.quickCode.startsWith(q),
          );
        }
      } else {
        // Free-text search — match by name, shortName, or sku
        filtered = allMenuItemsDraft.filter((item) => {
          if (item.name.toLowerCase().includes(qLower)) return true;
          if (item.shortName?.toLowerCase().includes(qLower)) return true;
          if (item.sku.toLowerCase().includes(qLower)) return true;
          return false;
        });
      }
    } else if (selectedCategoryId) {
      const catId = selectedCategoryId;
      filtered = allMenuItemsDraft.filter((item) => {
        const itemCatId = typeof item.categoryId === 'object'
          ? (item.categoryId as ICategory)._id
          : item.categoryId;
        return itemCatId === catId;
      });
    } else {
      // Featured items
      filtered = allMenuItemsDraft.filter(
        (item) => item.isFeatured || item.isPopular,
      );
      // Fallback: if no featured items, show first 30
      if (filtered.length === 0) {
        filtered = allMenuItemsDraft.slice(0, 30);
      }
    }

    setMenuItems(filtered);
  }, [debouncedSearch, selectedCategoryId, allMenuItemsDraft]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Refresh order helper — with abort + 2s throttle to prevent stampede
  // ═══════════════════════════════════════════════════════════════════════════

  const refreshAbortRef = useRef<AbortController | null>(null);
  const refreshThrottleRef = useRef<number>(0);

  const refreshOrder = useCallback(async () => {
    if (!activeOrder?._id) return;

    // Throttle: skip if called within 2s of the last successful refresh
    const now = Date.now();
    if (now - refreshThrottleRef.current < 2_000) return;

    // Abort any in-flight refresh
    refreshAbortRef.current?.abort();
    const ctrl = new AbortController();
    refreshAbortRef.current = ctrl;

    try {
      const res = await fetch(`/api/orders/${activeOrder._id}`, { signal: ctrl.signal });
      if (res.ok) {
        const updatedOrder: Order = await res.json();
        setCachedOrder(updatedOrder);
        refreshThrottleRef.current = Date.now();
        onOrderUpdated?.(updatedOrder);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to refresh order:', err);
      }
    }
  }, [activeOrder?._id, onOrderUpdated]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Cart handlers
  // ═══════════════════════════════════════════════════════════════════════════

  const handleQuickAdd = useCallback(
    (item: IMenuItem) => {
      addToCart(item, 1, [], undefined);
    },
    [addToCart],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Server item editing — ALL items are always updatable
  // ═══════════════════════════════════════════════════════════════════════════

  const handleUpdateServerItem = useCallback(
    async (
      itemId: string,
      updates: { quantity?: number; specialInstructions?: string },
    ) => {
      if (!activeOrder?._id) return;
      setIsUpdatingServerItem(true);

      try {
        // Use granular PATCH action — concurrent-safe, does NOT send full items array
        const res = await fetch(`/api/orders/${activeOrder._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_item',
            itemId,
            ...(updates.quantity !== undefined && { quantity: updates.quantity }),
            ...(updates.specialInstructions !== undefined && {
              specialInstructions: updates.specialInstructions,
            }),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to update item');
        }

        const updatedOrder: Order = await res.json();
        setCachedOrder(updatedOrder);
        onOrderUpdated?.(updatedOrder);
      } catch (err) {
        console.error('Failed to update server item:', err);
      } finally {
        setIsUpdatingServerItem(false);
      }
    },
    [activeOrder?._id, onOrderUpdated],
  );

  const handleRemoveServerItem = useCallback(
    async (itemId: string) => {
      if (!activeOrder?._id) return;
      setIsUpdatingServerItem(true);

      try {
        // Use granular PATCH action — concurrent-safe, does NOT send full items array
        const res = await fetch(`/api/orders/${activeOrder._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove_item', itemId }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to remove item');
        }

        const updatedOrder: Order = await res.json();
        setCachedOrder(updatedOrder);
        onOrderUpdated?.(updatedOrder);
      } catch (err) {
        console.error('Failed to remove server item:', err);
      } finally {
        setIsUpdatingServerItem(false);
      }
    },
    [activeOrder?._id, onOrderUpdated],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Commit items → fire to kitchen (OPTIMISTIC — confirm later)
  // ═══════════════════════════════════════════════════════════════════════════

  const handleCommitItems = useCallback(async () => {
    if (cart.items.length === 0) return;

    if (!focusedContext.orderId) {
      setCommitError('No active order. Please select a customer or table first.');
      return;
    }

    // ── Snapshots for rollback ────────────────────────────────────────────
    const cartSnapshot = usePOSStore.getState().cart;
    const itemsSnapshot = [...cart.items];
    const orderSnapshot = activeOrder;
    const orderId = focusedContext.orderId;
    const sessionId = focusedContext.sessionId;
    const tableId = focusedContext.tableId;

    // ── Optimistic UI: clear cart, show success, merge items into order ──
    clearCart();
    setCommitError(null);
    setCommitSuccess(true);
    setTimeout(() => setCommitSuccess(false), 3000);

    if (orderSnapshot) {
      const tempItems = itemsSnapshot.map((item, idx) => ({
        _id: `__optimistic-${Date.now()}-${idx}`,
        itemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        modifiers: item.modifiers.map((m) => ({
          name: m.optionName,
          price: m.priceAdjustment,
        })),
        specialInstructions: item.specialInstructions,
        subtotal: item.totalPrice,
        status: 'pending' as any,
      }));
      const addedSubtotal = itemsSnapshot.reduce((s, i) => s + i.totalPrice, 0);
      const addedTax = itemsSnapshot.reduce(
        (s, i) => s + (i.totalPrice * (i.taxRate || 0)) / 100,
        0,
      );
      const optimistic: Order = {
        ...orderSnapshot,
        items: [...(orderSnapshot.items || []), ...(tempItems as any)],
        subtotal: (orderSnapshot.subtotal || 0) + addedSubtotal,
        taxAmount: (orderSnapshot.taxAmount || 0) + addedTax,
        grandTotal: (orderSnapshot.grandTotal || 0) + addedSubtotal + addedTax,
        amountDue: (orderSnapshot.amountDue || 0) + addedSubtotal + addedTax,
      };
      setCachedOrder(optimistic);
      onOrderUpdated?.(optimistic);
    }

    // ── Fire-and-forget network call; reconcile in background ────────────
    void (async () => {
      try {
        // Session-isolation pre-check
        if (tableId && sessionId) {
          try {
            const snapRes = await fetch('/api/tables/snapshot');
            if (snapRes.ok) {
              const snapshots: Array<{ _id: string; activeSessionId: string | null }> =
                await snapRes.json();
              const snap = snapshots.find((s) => s._id === tableId);
              if (snap && snap.activeSessionId && snap.activeSessionId !== sessionId) {
                throw new Error(
                  'This table has been re-seated with a new session. Please refresh and try again.',
                );
              }
            }
          } catch (checkErr: any) {
            if (checkErr.message?.includes('re-seated')) throw checkErr;
          }
        }

        const payload = {
          orderId,
          sessionId,
          items: itemsSnapshot.map((item) => ({
            menuItemId: item.menuItemId,
            name: item.name,
            shortName: item.shortName || undefined,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            modifiers: item.modifiers.map((mod) => ({
              groupId: mod.groupId,
              groupName: mod.groupName,
              optionId: mod.optionId,
              optionName: mod.optionName,
              priceAdjustment: mod.priceAdjustment,
            })),
            specialInstructions: item.specialInstructions || undefined,
            taxRate: item.taxRate,
          })),
        };

        const res = await fetch('/api/pos/fire-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          if (res.status === 409) {
            if (errorData.code === 'SESSION_MISMATCH') {
              throw new Error(errorData.error || 'Table session has changed. Please refresh.');
            }
            throw new Error('Order was modified by another user. Please refresh and try again.');
          }
          throw new Error(
            errorData.error || errorData.message || `Failed to commit items (${res.status})`,
          );
        }

        // Success — reconcile with the authoritative order
        invalidateCachedOrder(orderId);
        onOrderFired?.();
        await refreshOrder();
      } catch (error: any) {
        console.error('Failed to commit items (optimistic rollback):', error);
        // Rollback cart + order
        usePOSStore.setState({ cart: cartSnapshot });
        if (orderSnapshot) {
          setCachedOrder(orderSnapshot);
          onOrderUpdated?.(orderSnapshot);
        }
        setCommitSuccess(false);
        setCommitError(error.message || 'Failed to send items to kitchen');
        setTimeout(() => setCommitError(null), 5000);
      }
    })();
  }, [
    cart.items,
    activeOrder,
    focusedContext.orderId,
    focusedContext.sessionId,
    focusedContext.tableId,
    clearCart,
    onOrderFired,
    onOrderUpdated,
    refreshOrder,
  ]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Payment
  // ═══════════════════════════════════════════════════════════════════════════

  const handleOpenPayment = useCallback(() => {
    if (!activeOrder) return;
    setPaymentAmount(String(activeOrder.amountDue || activeOrder.grandTotal || 0));
    setPaymentMethod('cash');
    setPaymentRef('');
    setPaymentError(null);
    setPaymentSuccess(false);
    setShowPaymentDrawer(true);
  }, [activeOrder]);

  const handleSubmitPayment = useCallback(async () => {
    if (!activeOrder?._id) return;

    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      setPaymentError('Enter a valid amount');
      return;
    }

    setIsSubmittingPayment(true);
    setPaymentError(null);

    try {
      const res = await fetch(`/api/orders/${activeOrder._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add_payment',
          payment: {
            method: resolvePaymentMethod(paymentMethod).category,
            methodLabel: resolvePaymentMethod(paymentMethod).label,
            amount,
            reference: paymentRef || undefined,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add payment');
      }

      const updatedOrder: Order = await res.json();
      setCachedOrder(updatedOrder);
      onOrderUpdated?.(updatedOrder);
      setPaymentSuccess(true);

      if (updatedOrder.paymentStatus === 'paid') {
        setTimeout(() => {
          setShowPaymentDrawer(false);
          setPaymentSuccess(false);
        }, 1500);
      } else {
        setPaymentAmount(String(updatedOrder.amountDue));
        setTimeout(() => setPaymentSuccess(false), 2000);
      }
    } catch (err: any) {
      setPaymentError(err.message || 'Payment failed');
    } finally {
      setIsSubmittingPayment(false);
    }
  }, [activeOrder, paymentAmount, paymentMethod, paymentRef, resolvePaymentMethod, onOrderUpdated]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle actions (OPTIMISTIC — confirm later)
  // ═══════════════════════════════════════════════════════════════════════════

  // Map a lifecycle action → the optimistic next status it produces.
  // Mirrors the server-side state machine for instant UI feedback.
  const optimisticStatusFor = (action: string, currentStatus: string): string | null => {
    switch (action) {
      case 'confirm':
        return 'confirmed';
      case 'start_preparing':
        return 'preparing';
      case 'mark_ready':
        return 'ready';
      case 'mark_served':
        return 'served';
      case 'mark_out_for_delivery':
        return 'out_for_delivery';
      case 'complete':
        return 'completed';
      default:
        return currentStatus as any;
    }
  };

  const handleLifecycleAction = useCallback(
    async (action: string) => {
      if (!activeOrder?._id) return;

      const orderSnapshot = activeOrder;
      const orderId = activeOrder._id;
      const nextStatus = optimisticStatusFor(action, activeOrder.status);

      // ── Optimistic update ─────────────────────────────────────────────
      setActionError(null);
      if (nextStatus && nextStatus !== orderSnapshot.status) {
        const optimistic: Order = {
          ...orderSnapshot,
          status: nextStatus as any,
          ...(nextStatus === 'completed' ? { completedAt: new Date().toISOString() } : {}),
        };
        setCachedOrder(optimistic);
        onOrderUpdated?.(optimistic);
      }

      // ── Fire-and-forget; reconcile in background ──────────────────────
      void (async () => {
        try {
          const res = await fetch(`/api/orders/${orderId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          });

          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Action failed');
          }

          const updatedOrder: Order = await res.json();
          setCachedOrder(updatedOrder);
          onOrderUpdated?.(updatedOrder);
        } catch (err: any) {
          // Rollback
          setCachedOrder(orderSnapshot);
          onOrderUpdated?.(orderSnapshot);
          setActionError(err.message || 'Action failed');
          setTimeout(() => setActionError(null), 4000);
        }
      })();
    },
    [activeOrder, onOrderUpdated],
  );

  const handleCancelOrder = useCallback(async () => {
    if (!activeOrder?._id) return;
    // Stronger warning when voiding an order that was already completed/paid.
    const isSettled = activeOrder.status === 'completed' || activeOrder.paymentStatus === 'paid';
    const message = isSettled
      ? 'This order is already completed/paid. Cancelling will VOID it and return any deducted stock to inventory. Continue?'
      : 'Are you sure you want to cancel this order?';
    if (!window.confirm(message)) return;

    const orderSnapshot = activeOrder;
    const cartSnapshot = usePOSStore.getState().cart;
    const orderId = activeOrder._id;
    const tableId = activeOrder.table?.tableId || focusedContext.tableId;

    // ── Optimistic update ───────────────────────────────────────────────
    setActionError(null);
    const optimistic: Order = {
      ...orderSnapshot,
      status: 'cancelled' as any,
    };
    setCachedOrder(optimistic);
    onOrderUpdated?.(optimistic);
    clearCart();

    // ── Fire-and-forget; reconcile in background ────────────────────────
    void (async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'cancel',
            tableId,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Cancel failed');
        }

        const updatedOrder: Order = await res.json();
        setCachedOrder(updatedOrder);
        onOrderUpdated?.(updatedOrder);
      } catch (err: any) {
        // Rollback
        usePOSStore.setState({ cart: cartSnapshot });
        setCachedOrder(orderSnapshot);
        onOrderUpdated?.(orderSnapshot);
        setActionError(err.message || 'Cancel failed');
        setTimeout(() => setActionError(null), 4000);
      }
    })();
  }, [activeOrder, focusedContext.tableId, onOrderUpdated, clearCart]);

  const handleCompleteOrder = useCallback(async (methodId?: string, paidAmount?: number) => {
    if (!activeOrder?._id) return;

    const orderSnapshot = activeOrder;
    const cartSnapshot = usePOSStore.getState().cart;
    const orderId = activeOrder._id;
    // Resolve the selected/passed method id → coarse category + custom label.
    const resolved = resolvePaymentMethod(methodId || paymentMethod);

    // ── Optimistic update ───────────────────────────────────────────────
    setCompleteError(null);
    const grandTotal = orderSnapshot.grandTotal || 0;
    const optimistic: Order = {
      ...orderSnapshot,
      status: 'completed' as any,
      paymentStatus: 'paid' as any,
      amountPaid: grandTotal,
      amountDue: 0,
      completedAt: new Date().toISOString(),
    };
    setCachedOrder(optimistic);
    onOrderUpdated?.(optimistic);
    clearCart();

    // ── Fire-and-forget; reconcile in background ────────────────────────
    void (async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'complete_and_pay',
            paymentMethod: resolved.category,
            paymentMethodLabel: resolved.label,
            // Optional tendered amount (record-keeping); omitted = settle exact due.
            ...(typeof paidAmount === 'number' && paidAmount > 0 ? { paidAmount } : {}),
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to complete order');
        }

        const updatedOrder: Order = await res.json();
        setCachedOrder(updatedOrder);
        onOrderUpdated?.(updatedOrder);
      } catch (err: any) {
        // Rollback
        usePOSStore.setState({ cart: cartSnapshot });
        setCachedOrder(orderSnapshot);
        onOrderUpdated?.(orderSnapshot);
        setCompleteError(err.message || 'Complete order failed');
        setTimeout(() => setCompleteError(null), 4000);
      }
    })();
  }, [activeOrder, onOrderUpdated, clearCart, paymentMethod, resolvePaymentMethod]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Bill Adjustments
  // ═══════════════════════════════════════════════════════════════════════════

  const [isUpdatingAdjustment, setIsUpdatingAdjustment] = useState(false);

  const handleAddAdjustment = useCallback(
    async (adj: {
      adjustmentId?: string;
      name: string;
      kind: AdjustmentKind;
      calcMode: AdjustmentCalcMode;
      value: number;
      reason?: string;
    }) => {
      if (!activeOrder?._id) return;
      setIsUpdatingAdjustment(true);
      try {
        const res = await fetch(`/api/orders/${activeOrder._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'add_adjustment', adjustment: adj }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
        const updatedOrder: Order = await res.json();
        setCachedOrder(updatedOrder);
        onOrderUpdated?.(updatedOrder);
      } catch (err) {
        console.error('Failed to add adjustment:', err);
      } finally {
        setIsUpdatingAdjustment(false);
      }
    },
    [activeOrder?._id, onOrderUpdated],
  );

  const handleRemoveAdjustment = useCallback(
    async (adjustmentId: string) => {
      if (!activeOrder?._id) return;
      setIsUpdatingAdjustment(true);
      try {
        const res = await fetch(`/api/orders/${activeOrder._id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'remove_adjustment', adjustmentId }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Failed');
        const updatedOrder: Order = await res.json();
        setCachedOrder(updatedOrder);
        onOrderUpdated?.(updatedOrder);
      } catch (err) {
        console.error('Failed to remove adjustment:', err);
      } finally {
        setIsUpdatingAdjustment(false);
      }
    },
    [activeOrder?._id, onOrderUpdated],
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // Printing
  // ═══════════════════════════════════════════════════════════════════════════

  const handlePrintKOT = useCallback(async () => {
    const serverItems = activeOrder?.items || [];
    if (serverItems.length === 0) return;

    // Read restaurant settings from store
    const settings = usePOSStore.getState().settings;
    const tableNum = focusedContext.table?.tableNumber || activeOrder?.table?.tableNumber || 'N/A';

    // Try thermal printing first if connected
    if (isPrinterConnected && activeOrder) {
      try {
        const kotData = createKOTData(activeOrder, {
          tableNumber: tableNum,
          tableSection: focusedContext.table?.sectionName,
          isPriority: activeOrder.isPriority,
          kitchenNotes: activeOrder.kitchenNotes,
        });

        const result = await thermalPrintKOT(kotData, {
          printerId: 'kitchen', // Use default kitchen printer
          priority: activeOrder.isPriority ? 'high' : 'normal',
        });

        if (result.success) {
          console.log('[Print] KOT sent to thermal printer:', result.jobId);
          return;
        } else {
          console.warn('[Print] Thermal KOT failed:', result.error);
          // Fall through to HTML fallback
        }
      } catch (err) {
        console.warn('[Print] Thermal KOT error:', err);
        // Fall through to HTML fallback
      }
    }

    // HTML fallback for when thermal service is offline
    const bizName = settings?.businessNameShort || settings?.businessName || 'XP POS';
    const kotNum = generateKOTNumber();
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });

    let itemsHTML = '';
    for (const item of serverItems) {
      itemsHTML += `<div class="item-row"><span class="item-qty bold">${item.quantity}x</span><span class="item-name">${item.name}</span></div>`;
      const mods = item.modifiers || [];
      for (const mod of mods) {
        const modLabel = (mod as any).optionName || (mod as any).name || '';
        if (modLabel) itemsHTML += `<div class="modifier">+ ${modLabel}</div>`;
      }
      if (item.specialInstructions) {
        itemsHTML += `<div class="modifier" style="color:#c00;">! ${item.specialInstructions}</div>`;
      }
    }

    openPrintWindow(`
      <div class="center bold large">${bizName} — KITCHEN ORDER</div>
      <div class="center">KOT #${kotNum}</div>
      <div class="divider"></div>
      <div><strong>Table: ${tableNum}</strong></div>
      <div>Time: ${time} | ${date}</div>
      <div class="divider"></div>
      <div class="bold">ITEMS:</div>
      ${itemsHTML}
      <div class="divider"></div>
      <div class="center small">*** Kitchen Copy ***</div><br>
    `);
  }, [activeOrder, focusedContext.table, isPrinterConnected, thermalPrintKOT]);

  const handlePrintInvoice = useCallback(async () => {
    if (!activeOrder) return;

    // Read restaurant settings from store
    const settings = usePOSStore.getState().settings;

    // Try thermal printing first if connected
    if (isPrinterConnected && settings) {
      try {
        const billData = createBillData(activeOrder, settings, {
          showAddress: settings.receipt?.showAddress,
          showPhone: settings.receipt?.showPhone,
          showTaxBreakdown: settings.receipt?.showTaxBreakdown,
          headerText: settings.receipt?.headerText,
          footerText: settings.receipt?.footerText,
        });

        const result = await thermalPrintBill(billData, {
          printerId: 'receipt', // Use default receipt printer
          openCashDrawer: activeOrder.amountDue <= 0, // Open drawer if paid
        });

        if (result.success) {
          console.log('[Print] Invoice sent to thermal printer:', result.jobId);
          return;
        } else {
          console.warn('[Print] Thermal invoice failed:', result.error);
          // Fall through to HTML fallback
        }
      } catch (err) {
        console.warn('[Print] Thermal invoice error:', err);
        // Fall through to HTML fallback
      }
    }

    // HTML fallback for when thermal service is offline
    const bizName = settings?.businessName || 'XP POS';
    const bizAddress = settings?.businessAddress;
    const bizPhone = settings?.phone;
    const bizEmail = settings?.email;
    const bizWebsite = settings?.website;
    const receipt = settings?.receipt;
    const taxLabel = settings?.tax?.taxLabel || 'Tax';
    const taxRate = settings?.tax?.taxRate || 0;
    const taxRegNumber = settings?.tax?.taxRegistrationNumber;

    const tableNum =
      focusedContext.table?.tableNumber || activeOrder.table?.tableNumber || 'N/A';
    const orderMode = activeOrder.mode;
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const date = now.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    });

    // Items with line numbers
    let itemsHTML = '';
    let lineNum = 1;
    for (const item of activeOrder.items || []) {
      itemsHTML += `<div class="item-row">
        <span class="item-num">${lineNum}.</span>
        <span class="item-qty">${item.quantity}x</span>
        <span class="item-name">${item.name}</span>
        <span class="item-price">${formatPrice(item.subtotal)}</span>
      </div>`;
      lineNum++;
    }

    // Payments section
    let txnHTML = '';
    if (activeOrder.transactions?.length) {
      txnHTML = `<div class="divider"></div><div class="section-title">PAYMENTS</div>`;
      for (const txn of activeOrder.transactions) {
        const method = PAYMENT_METHOD_LABELS[txn.method] || txn.method;
        txnHTML += `<div class="item-row small"><span>${method}</span><span>${formatPrice(txn.amount)}</span></div>`;
      }
    }

    // Build address block
    let addressHTML = '';
    if (receipt?.showAddress && bizAddress) {
      const parts = [
        bizAddress.line1, 
        bizAddress.line2, 
        `${bizAddress.city}${bizAddress.postalCode ? ' ' + bizAddress.postalCode : ''}`,
        bizAddress.country
      ].filter(Boolean);
      addressHTML = parts.map((p) => `<div class="center small">${p}</div>`).join('');
    }

    // Contact info
    let contactHTML = '';
    if (receipt?.showPhone && bizPhone) {
      contactHTML += `<div class="center small">Tel: ${bizPhone}</div>`;
    }
    if (bizEmail) {
      contactHTML += `<div class="center small">${bizEmail}</div>`;
    }
    if (bizWebsite) {
      contactHTML += `<div class="center small">${bizWebsite}</div>`;
    }

    // Tax registration number
    let trnHTML = '';
    if (taxRegNumber) {
      trnHTML = `<div class="center small bold">TRN: ${taxRegNumber}</div>`;
    }

    // Order type display
    const orderTypeLabels: Record<string, string> = {
      'dine_in': 'Dine-In',
      'takeaway': 'Takeaway',
      'delivery': 'Delivery',
      'drive_thru': 'Drive-Thru',
      'curbside': 'Curbside'
    };
    const orderTypeLabel = orderTypeLabels[orderMode] || 'Dine-In';

    // Include tax rate in tax line if > 0
    const taxLineLabel = taxRate > 0 ? `${taxLabel} (${taxRate}%)` : taxLabel;

    openPrintWindow(`
      <!-- Header Section -->
      <div class="center bold large">${bizName}</div>
      ${addressHTML}
      ${contactHTML}
      ${trnHTML}
      <div class="divider thick"></div>
      
      <!-- Invoice Title -->
      <div class="center bold" style="font-size:14px;letter-spacing:1px;">${receipt?.headerText || 'TAX INVOICE'}</div>
      <div class="divider"></div>
      
      <!-- Order Details -->
      <table class="info-table">
        ${receipt?.showOrderNumber !== false ? `<tr><td>Invoice No:</td><td class="right bold">${activeOrder.orderNumber}</td></tr>` : ''}
        <tr><td>Date:</td><td class="right">${date}</td></tr>
        <tr><td>Time:</td><td class="right">${time}</td></tr>
        <tr><td>Type:</td><td class="right">${orderTypeLabel}</td></tr>
        ${orderMode === 'dine_in' ? `<tr><td>Table:</td><td class="right bold">${tableNum}</td></tr>` : ''}
        ${activeOrder.table?.guestCount ? `<tr><td>Guests:</td><td class="right">${activeOrder.table.guestCount}</td></tr>` : ''}
      </table>
      <div class="divider"></div>
      
      <!-- Items Section -->
      <div class="section-title">ITEMS</div>
      ${itemsHTML}
      <div class="divider"></div>
      
      <!-- Totals Section -->
      <div class="item-row"><span>Subtotal</span><span>${formatPrice(activeOrder.subtotal)}</span></div>
      ${activeOrder.discountAmount > 0 ? `<div class="item-row discount"><span>Discount</span><span>-${formatPrice(activeOrder.discountAmount)}</span></div>` : ''}
      ${activeOrder.serviceCharge ? `<div class="item-row"><span>${settings?.serviceCharge?.label || 'Service Charge'} (${settings?.serviceCharge?.percentage || 0}%)</span><span>${formatPrice(activeOrder.serviceCharge)}</span></div>` : ''}
      ${(activeOrder.adjustments && activeOrder.adjustments.length > 0) ? activeOrder.adjustments.map(adj => {
        const sign = adj.kind === 'discount' ? '-' : '+';
        const pctNote = adj.calcMode === 'percentage' ? ` (${adj.value}%)` : '';
        const cls = adj.kind === 'discount' ? 'discount' : '';
        return `<div class="item-row small ${cls}"><span>${adj.name}${pctNote}</span><span>${sign}${formatPrice(adj.computedAmount)}</span></div>`;
      }).join('') : ''}
      <div class="item-row"><span>${taxLineLabel}</span><span>${formatPrice(activeOrder.taxAmount)}</span></div>
      <div class="divider thick"></div>
      
      <!-- Grand Total -->
      <div class="item-row grand-total"><span>TOTAL</span><span>${formatPrice(activeOrder.grandTotal)}</span></div>
      
      <!-- Payments -->
      ${txnHTML}
      ${activeOrder.amountDue > 0 ? `
        <div class="divider"></div>
        <div class="item-row bold amount-due"><span>AMOUNT DUE</span><span>${formatPrice(activeOrder.amountDue)}</span></div>
      ` : ''}
      ${activeOrder.amountDue <= 0 && activeOrder.transactions?.length ? `
        <div class="center paid-badge">*** PAID ***</div>
      ` : ''}
      
      <div class="divider thick"></div>
      
      <!-- Footer -->
      <div class="center footer-text">${receipt?.footerText || 'Thank you for your business!'}</div>
      <div class="center small" style="margin-top:4px;">We appreciate your visit</div>
      <div class="divider"></div>
      <div class="center small" style="color:#666;">Powered by XP POS</div>
      <br>
    `);
  }, [activeOrder, focusedContext.table?.tableNumber, isPrinterConnected, thermalPrintBill]);

  // ═══════════════════════════════════════════════════════════════════════════
  // Derived values
  // ═══════════════════════════════════════════════════════════════════════════

  const pendingTotal = cart.items.reduce((sum, item) => sum + item.totalPrice, 0);

  const statusLabel = activeOrder ? ORDER_STATUS_LABELS[activeOrder.status] : 'Draft';
  const statusColor = activeOrder
    ? ORDER_STATUS_COLORS[activeOrder.status]
    : ORDER_STATUS_COLORS.draft;

  const lifecycleActions = useMemo(
    () => (activeOrder ? LIFECYCLE_ACTIONS[activeOrder.status] || [] : []),
    [activeOrder?.status],
  );

  const canPay =
    activeOrder != null &&
    (activeOrder.items?.length ?? 0) > 0 &&
    activeOrder.paymentStatus !== 'paid' &&
    !['cancelled', 'draft'].includes(activeOrder.status);

  // Forced cancellation: any order that isn't already cancelled can be voided —
  // including completed/paid ones (which also returns their deducted stock).
  const canCancel = activeOrder != null && activeOrder.status !== 'cancelled';

  // ═══════════════════════════════════════════════════════════════════════════
  // Error clearing
  // ═══════════════════════════════════════════════════════════════════════════

  const clearErrors = useCallback(() => {
    setCommitError(null);
    setActionError(null);
    setCompleteError(null);
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // Return
  // ═══════════════════════════════════════════════════════════════════════════

  return {
    activeOrder,
    isHistorical,
    focusedContext,

    cart,
    handleQuickAdd,
    updateCartItemQuantity: updateCartQty,
    removeFromCart: removeCart,
    updateCartItemInstructions: updateCartInstr,
    editingInstructionsId,
    setEditingInstructionsId,

    handleUpdateServerItem,
    handleRemoveServerItem,
    isUpdatingServerItem,

    handleCommitItems,
    isCommitting,
    commitError,
    commitSuccess,
    setCommitError,
    setCommitSuccess,

    categories,
    menuItems,
    selectedCategoryId,
    setSelectedCategoryId,
    searchQuery,
    setSearchQuery,
    isLoadingCategories,
    isLoadingItems,
    refreshMenu: useCallback(() => {
      flushCatalogCache();
      allItemsLoadedRef.current = false;
      Promise.all([fetchCategories(true), fetchAllMenuItems(true)]).then(([cats, items]) => {
        if (cats && items) setCachedCatalog(items, cats);
      });
    }, [fetchCategories, fetchAllMenuItems]),

    showPaymentDrawer,
    setShowPaymentDrawer,
    paymentMethods,
    paymentMethod,
    setPaymentMethod,
    paymentAmount,
    setPaymentAmount,
    paymentRef,
    setPaymentRef,
    isSubmittingPayment,
    paymentError,
    paymentSuccess,
    handleOpenPayment,
    handleSubmitPayment,

    handleLifecycleAction,
    handleCancelOrder,
    handleCompleteOrder,
    isPerformingAction,
    actionError,
    isCompletingOrder,
    completeError,

    handlePrintKOT,
    handlePrintInvoice,
    refreshOrder,

    handleAddAdjustment,
    handleRemoveAdjustment,
    isUpdatingAdjustment,

    pendingTotal,
    statusLabel,
    statusColor,
    lifecycleActions,
    canPay,
    canCancel,
    tableConflictWarning,

    clearErrors,
  };
}
