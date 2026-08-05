// pos_modules/orders/order-editor/types.ts
// Local types for the Order Editor sub-module

import { Order, PaymentMethod, OrderStatus, AdjustmentKind, AdjustmentCalcMode } from '@/types/order.types';
import type { IPaymentMethodConfig } from '@/types/settings.types';
import { ICategory, IMenuItem, ICart } from '@/types/menu.types';
import { FocusedContext } from '@/stores/posStore';
import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Imperative Handle (exposed to parent via ref)
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderEditorHandle {
  printKOT: () => void;
  printInvoice: () => void;
  refreshMenu: () => void;
  refreshOrder: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props for the root OrderEditor component
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderEditorProps {
  /** Externally-loaded order (from Order List or Floor Plan). Null = new unsaved order. */
  order?: Order | null;
  /** Called after a successful fire-to-kitchen */
  onOrderFired?: () => void;
  /** Called when the order object changes (status updates, payments, etc.) */
  onOrderUpdated?: (order: Order) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle action descriptor
// ─────────────────────────────────────────────────────────────────────────────

export interface LifecycleAction {
  label: string;
  action: string;
  icon: React.ReactNode;
  color: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregated state & actions returned by useOrderEditorState
// ─────────────────────────────────────────────────────────────────────────────

export interface UseOrderEditorReturn {
  // ── Core order state ──────────────────────────────────────────────────
  activeOrder: Order | null;
  isHistorical: boolean;
  focusedContext: FocusedContext;

  // ── Cart ──────────────────────────────────────────────────────────────
  cart: ICart;
  handleQuickAdd: (item: IMenuItem) => void;
  updateCartItemQuantity: (cartItemId: string, quantity: number) => void;
  removeFromCart: (cartItemId: string) => void;
  updateCartItemInstructions: (cartItemId: string, instructions: string) => void;
  editingInstructionsId: string | null;
  setEditingInstructionsId: (id: string | null) => void;

  // ── Server item editing (all items are updatable) ─────────────────────
  handleUpdateServerItem: (
    itemId: string,
    updates: { quantity?: number; specialInstructions?: string },
  ) => Promise<void>;
  handleRemoveServerItem: (itemId: string) => Promise<void>;
  isUpdatingServerItem: boolean;

  // ── Commit / fire to kitchen ──────────────────────────────────────────
  handleCommitItems: () => Promise<void>;
  isCommitting: boolean;
  commitError: string | null;
  commitSuccess: boolean;
  setCommitError: (err: string | null) => void;
  setCommitSuccess: (ok: boolean) => void;

  // ── Catalog data ──────────────────────────────────────────────────────
  categories: ICategory[];
  menuItems: IMenuItem[];
  selectedCategoryId: string | null;
  setSelectedCategoryId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isLoadingCategories: boolean;
  isLoadingItems: boolean;
  refreshMenu: () => void;
  refreshOrder: () => Promise<void>;

  // ── Payment drawer ────────────────────────────────────────────────────
  showPaymentDrawer: boolean;
  setShowPaymentDrawer: (show: boolean) => void;
  /** Tenant-configured, enabled payment methods (ordered) shown in the drawer. */
  paymentMethods: IPaymentMethodConfig[];
  /** Selected method id (not the raw category). */
  paymentMethod: string;
  setPaymentMethod: (id: string) => void;
  paymentAmount: string;
  setPaymentAmount: (a: string) => void;
  paymentRef: string;
  setPaymentRef: (r: string) => void;
  isSubmittingPayment: boolean;
  paymentError: string | null;
  paymentSuccess: boolean;
  handleOpenPayment: () => void;
  handleSubmitPayment: () => Promise<void>;
  /** Undo one recorded payment on the active order. */
  handleRemovePayment: (paymentId: string) => Promise<void>;

  // ── Lifecycle actions ─────────────────────────────────────────────────
  handleLifecycleAction: (action: string) => Promise<void>;
  handleCancelOrder: () => Promise<void>;
  handleCompleteOrder: (methodId?: string, paidAmount?: number) => Promise<void>;
  isPerformingAction: boolean;
  actionError: string | null;
  isCompletingOrder: boolean;
  completeError: string | null;

  // ── Print ─────────────────────────────────────────────────────────────
  handlePrintKOT: () => void;
  handlePrintInvoice: () => void;

  // ── Bill adjustments ──────────────────────────────────────────────────
  handleAddAdjustment: (adj: {
    adjustmentId?: string;
    name: string;
    kind: AdjustmentKind;
    calcMode: AdjustmentCalcMode;
    value: number;
    reason?: string;
  }) => Promise<void>;
  handleRemoveAdjustment: (adjustmentId: string) => Promise<void>;
  isUpdatingAdjustment: boolean;

  // ── Derived values ────────────────────────────────────────────────────
  pendingTotal: number;
  statusLabel: string;
  statusColor: { bg: string; text: string; border: string };
  lifecycleActions: LifecycleAction[];
  /**
   * The payment panel is relevant on this order — it has items and is neither
   * a draft nor cancelled. Not the same as "money is still owed": a settled
   * order keeps the panel so a mis-keyed payment can be removed. Use
   * `activeOrder.amountDue` for whether anything is left to take.
   */
  canPay: boolean;
  canCancel: boolean;
  tableConflictWarning: string | null;

  // ── Error management ──────────────────────────────────────────────────
  clearErrors: () => void;
}
