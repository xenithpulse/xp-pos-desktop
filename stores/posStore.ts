// stores/posStore.ts
// Global state management for POS operations using Zustand

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  ICartItem,
  ICart,
  IMenuItem,
  ISelectedModifier,
  createCartItem,
  calculateCartTotals,
} from '@/types/menu.types';
import { ITable, ITableSession } from '@/types/table.types';
import { Order } from '@/types/order.types';
import type { SupportedCurrency, CurrencySymbolPosition, IHubConfig, IReceiptConfig, IPaymentMethodConfig } from '@/types/settings.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ActiveTab = 'floor-plan' | 'orders' | 'order-editor' | 'order-list' | 'takeaway' | 'delivery';

export type NetworkQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

export interface PosError {
  id: string;
  message: string;
  source?: string;
  ts: number;
}

export interface RestaurantSettings {
  businessName: string;
  businessNameShort?: string;
  businessAddress: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postalCode?: string;
    country: string;
  };
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  currency: SupportedCurrency;
  currencySymbol: string;
  currencyLocale: string;
  currencyDecimals: number;
  currencySymbolPosition: CurrencySymbolPosition;
  timezone: string;
  tax: {
    taxRate: number;
    taxInclusive: boolean;
    taxLabel: string;
    taxRegistrationNumber?: string;
  };
  serviceCharge: {
    enabled: boolean;
    percentage: number;
    label: string;
  };
  receipt: IReceiptConfig;
  paymentMethods: IPaymentMethodConfig[];

  // Operational
  autoConfirmOrders: boolean;
  defaultOrderMode: string;
  kitchenDisplayEnabled: boolean;

  // Hub (POS workspace) configuration
  hub: IHubConfig;
}

export interface FocusedContext {
  tableId?: string;
  table?: ITable;
  sessionId?: string;
  session?: ITableSession;
  orderId?: string;
  order?: Order;
}

export interface POSState {
  // Navigation
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;

  // Focus State - tracks the currently focused table/session/order
  focusedContext: FocusedContext;
  setFocusedContext: (context: Partial<FocusedContext>) => void;
  /**
   * Replace the entire focused context atomically AND clear the cart.
   * Use this when switching between different orders/tables to avoid
   * stale data bleeding across contexts.
   */
  switchOrderContext: (context: FocusedContext) => void;
  clearFocusedContext: () => void;

  // Cart State
  cart: ICart;
  addToCart: (
    menuItem: IMenuItem,
    quantity: number,
    modifiers: ISelectedModifier[],
    specialInstructions?: string
  ) => void;
  updateCartItemQuantity: (cartItemId: string, quantity: number) => void;
  removeFromCart: (cartItemId: string) => void;
  clearCart: () => void;
  updateCartItemInstructions: (cartItemId: string, instructions: string) => void;

  /** Track which orderId the current cart belongs to, to detect stale carts */
  cartOrderId: string | null;
  setCartOrderId: (orderId: string | null) => void;

  // Global Actions
  isRefreshing: boolean;
  setIsRefreshing: (refreshing: boolean) => void;
  triggerGlobalRefresh: () => void;
  refreshCallbacks: Set<() => void>;
  registerRefreshCallback: (callback: () => void) => void;
  unregisterRefreshCallback: (callback: () => void) => void;

  // UI State
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;

  // Sidebar visibility (for full-screen hub mode).
  //
  // A DESKTOP preference only. Phase 17 §2.1: below `lg` the nav is a drawer,
  // and a closed drawer is not the same thing as a nav that does not exist —
  // this flag used to remove the only navigation on a phone with no control
  // left to bring it back. Read it through `useSidebarHidden()` in
  // app/layout.tsx rather than directly, so the width check is not forgotten.
  sidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;

  // Mobile nav drawer (below `lg`).
  //
  // Lives in the store rather than inside MobileSidebar because Phase 17 §1.1
  // moved the TRIGGER out of the sidebar: on a POS screen the context bar owns
  // it, so the opener and the drawer are now different components.
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  toggleMobileNav: () => void;

  // How many mounted components are supplying their own nav trigger.
  //
  // A count, not a boolean: during a route transition the outgoing and incoming
  // context bars are both mounted for a moment, and a boolean would be cleared
  // by the one unmounting — leaving a POS screen with no trigger at all.
  // Register with `useNavTriggerHost()`, never by calling these directly.
  navTriggerHosts: number;
  registerNavTriggerHost: () => void;
  unregisterNavTriggerHost: () => void;

  // Restaurant settings (loaded from API)
  settings: RestaurantSettings | null;
  setSettings: (settings: RestaurantSettings | null) => void;

  // Error toast queue
  errors: PosError[];
  pushError: (message: string, source?: string) => void;
  dismissError: (id: string) => void;
  clearErrors: () => void;

  // Network quality
  networkQuality: NetworkQuality;
  setNetworkQuality: (quality: NetworkQuality) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────────────────────

const initialCart: ICart = {
  items: [],
  subtotal: 0,
  taxTotal: 0,
  grandTotal: 0,
  itemCount: 0,
};

const initialFocusedContext: FocusedContext = {};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const usePOSStore = create<POSState>()(
  devtools(
    (set, get) => ({
      // ─────────────────────────────────────────────────────────────────────
      // Navigation
      // ─────────────────────────────────────────────────────────────────────
      activeTab: 'floor-plan',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // ─────────────────────────────────────────────────────────────────────
      // Focus State
      // ─────────────────────────────────────────────────────────────────────
      focusedContext: initialFocusedContext,
      
      setFocusedContext: (context) =>
        set((state) => ({
          focusedContext: { ...state.focusedContext, ...context },
        })),

      switchOrderContext: (context) =>
        set({
          focusedContext: context,
          cart: initialCart,
          cartOrderId: context.orderId ?? null,
        }),

      clearFocusedContext: () =>
        set({
          focusedContext: initialFocusedContext,
          cart: initialCart,
          cartOrderId: null,
        }),

      // ─────────────────────────────────────────────────────────────────────
      // Cart State
      // ─────────────────────────────────────────────────────────────────────
      cart: initialCart,

      cartOrderId: null as string | null,
      setCartOrderId: (orderId) => set({ cartOrderId: orderId }),

      addToCart: (menuItem, quantity, modifiers, specialInstructions) =>
        set((state) => {
          // Check if identical item exists (same menuItemId, modifiers, instructions)
          const existingIndex = state.cart.items.findIndex((item) => {
            // Same menu item
            if (item.menuItemId !== menuItem._id) return false;
            
            // Same special instructions (or both empty/undefined)
            const sameInstructions = 
              (!item.specialInstructions && !specialInstructions) ||
              item.specialInstructions === specialInstructions;
            if (!sameInstructions) return false;
            
            // Same modifiers (compare by optionId)
            if (item.modifiers.length !== modifiers.length) return false;
            const existingModIds = item.modifiers.map((m) => m.optionId).sort();
            const newModIds = modifiers.map((m) => m.optionId).sort();
            return existingModIds.every((id, i) => id === newModIds[i]);
          });

          let newItems: typeof state.cart.items;
          
          if (existingIndex >= 0) {
            // Merge with existing item
            newItems = state.cart.items.map((item, index) => {
              if (index === existingIndex) {
                const newQuantity = item.quantity + quantity;
                const totalPrice = item.unitPrice * newQuantity;
                const taxAmount = (totalPrice * item.taxRate) / 100;
                return {
                  ...item,
                  quantity: newQuantity,
                  totalPrice,
                  taxAmount,
                };
              }
              return item;
            });
          } else {
            // Create new item
            const newItem = createCartItem(
              menuItem,
              quantity,
              modifiers,
              specialInstructions
            );
            newItems = [...state.cart.items, newItem];
          }
          
          const totals = calculateCartTotals(newItems);

          return {
            cart: {
              items: newItems,
              ...totals,
            },
          };
        }),

      updateCartItemQuantity: (cartItemId, quantity) =>
        set((state) => {
          if (quantity <= 0) {
            // Remove item if quantity is 0 or less
            const newItems = state.cart.items.filter((i) => i.id !== cartItemId);
            const totals = calculateCartTotals(newItems);
            return {
              cart: {
                items: newItems,
                ...totals,
              },
            };
          }

          const newItems = state.cart.items.map((item) => {
            if (item.id === cartItemId) {
              const totalPrice = item.unitPrice * quantity;
              const taxAmount =
                (totalPrice * item.taxRate) / 100;
              return {
                ...item,
                quantity,
                totalPrice,
                taxAmount,
              };
            }
            return item;
          });
          const totals = calculateCartTotals(newItems);

          return {
            cart: {
              items: newItems,
              ...totals,
            },
          };
        }),

      removeFromCart: (cartItemId) =>
        set((state) => {
          const newItems = state.cart.items.filter((i) => i.id !== cartItemId);
          const totals = calculateCartTotals(newItems);

          return {
            cart: {
              items: newItems,
              ...totals,
            },
          };
        }),

      clearCart: () => set({ cart: initialCart }),

      updateCartItemInstructions: (cartItemId, instructions) =>
        set((state) => ({
          cart: {
            ...state.cart,
            items: state.cart.items.map((item) =>
              item.id === cartItemId
                ? { ...item, specialInstructions: instructions || undefined }
                : item
            ),
          },
        })),

      // ─────────────────────────────────────────────────────────────────────
      // Global Actions
      // ─────────────────────────────────────────────────────────────────────
      isRefreshing: false,
      setIsRefreshing: (refreshing) => set({ isRefreshing: refreshing }),

      triggerGlobalRefresh: () => {
        const { refreshCallbacks } = get();
        set({ isRefreshing: true });
        refreshCallbacks.forEach((callback) => {
          try { callback(); } catch (e) { console.error('[POS] Refresh callback failed:', e); }
        });
        // Reset refreshing state after a short delay
        setTimeout(() => set({ isRefreshing: false }), 500);
      },

      refreshCallbacks: new Set(),

      registerRefreshCallback: (callback) =>
        set((state) => ({
          refreshCallbacks: new Set(state.refreshCallbacks).add(callback),
        })),

      unregisterRefreshCallback: (callback) =>
        set((state) => {
          const newCallbacks = new Set(state.refreshCallbacks);
          newCallbacks.delete(callback);
          return { refreshCallbacks: newCallbacks };
        }),

      // ─────────────────────────────────────────────────────────────────────
      // UI State
      // ─────────────────────────────────────────────────────────────────────
      isLoading: false,
      setIsLoading: (loading) => set({ isLoading: loading }),

      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),

      // Sidebar visibility
      sidebarVisible: true,
      setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
      toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),

      // Mobile nav drawer
      mobileNavOpen: false,
      setMobileNavOpen: (open) => set({ mobileNavOpen: open }),
      toggleMobileNav: () => set((state) => ({ mobileNavOpen: !state.mobileNavOpen })),

      navTriggerHosts: 0,
      registerNavTriggerHost: () => set((s) => ({ navTriggerHosts: s.navTriggerHosts + 1 })),
      unregisterNavTriggerHost: () =>
        set((s) => ({ navTriggerHosts: Math.max(0, s.navTriggerHosts - 1) })),

      // Settings
      settings: null,
      setSettings: (settings) => set({ settings }),

      // Errors — dedup by source within a 5s window to avoid toast spam under high traffic
      errors: [],
      pushError: (message, source) =>
        set((state) => {
          // Dedup: if the same source fired an error within the last 5 seconds, skip
          if (source) {
            const recentDup = state.errors.find(
              (e) => e.source === source && Date.now() - e.ts < 5_000
            );
            if (recentDup) return state; // no-op
          }
          return {
            errors: [
              ...state.errors,
              { id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, message, source, ts: Date.now() },
            ].slice(-5),
          };
        }),
      dismissError: (id) =>
        set((state) => ({
          errors: state.errors.filter((e) => e.id !== id),
        })),
      clearErrors: () => set({ errors: [] }),

      // Network
      networkQuality: 'good' as NetworkQuality,
      setNetworkQuality: (quality) => set({ networkQuality: quality }),
    }),
    {
      name: 'pos-store',
    }
  )
);
