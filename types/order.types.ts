// types/order.types.ts

// ─────────────────────────────────────────────────────────────────────────────
// Client-side Order Types (matching schema but without Document dependency)
// ─────────────────────────────────────────────────────────────────────────────

export type OrderMode = 
  | 'dine_in'
  | 'takeaway'
  | 'delivery'
  | 'drive_thru'
  | 'curbside';

export type OrderStatus = 
  | 'draft'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'served'
  | 'out_for_delivery'
  | 'completed'
  | 'cancelled';

export type PaymentStatus = 
  | 'pending'
  | 'paid'
  | 'partial'
  | 'split'
  | 'credit'
  | 'refunded'
  | 'voided';

export type PaymentMethod = 
  | 'cash'
  | 'card'
  | 'online'
  | 'other';

export type ItemStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';

// ─────────────────────────────────────────────────────────────────────────────
// Adjustment Types (client-side mirrors of schema types)
// ─────────────────────────────────────────────────────────────────────────────

export type AdjustmentKind = 'discount' | 'surcharge' | 'tax' | 'fee';
export type AdjustmentCalcMode = 'percentage' | 'fixed';

export const ADJUSTMENT_KIND_LABELS: Record<AdjustmentKind, string> = {
  discount: 'Discount',
  surcharge: 'Surcharge',
  tax: 'Tax / GST',
  fee: 'Fee',
};

export interface AppliedAdjustment {
  _id: string;
  adjustmentId?: string;
  name: string;
  kind: AdjustmentKind;
  calcMode: AdjustmentCalcMode;
  value: number;
  computedAmount: number;
  reason?: string;
}

export interface BillAdjustmentPreset {
  _id: string;
  name: string;
  kind: AdjustmentKind;
  calcMode: AdjustmentCalcMode;
  value: number;
  isDefault: boolean;
  isActive: boolean;
  appliesTo: 'all' | 'dine_in' | 'takeaway' | 'delivery';
  description?: string;
  sortOrder: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────────────────────

export const ORDER_MODE_LABELS: Record<OrderMode, string> = {
  dine_in: 'Dine-In',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  drive_thru: 'Drive-Thru',
  curbside: 'Curbside',
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  out_for_delivery: 'Out for Delivery',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  partial: 'Partial',
  split: 'Split',
  credit: 'Credit',
  refunded: 'Refunded',
  voided: 'Voided',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  online: 'Online',
  other: 'Other',
};

// ─────────────────────────────────────────────────────────────────────────────
// Status Colors for UI
// ─────────────────────────────────────────────────────────────────────────────

export const ORDER_STATUS_COLORS: Record<OrderStatus, { bg: string; text: string; border: string }> = {
  draft: { bg: 'bg-gray-500/20', text: 'text-gray-400', border: 'border-gray-500' },
  confirmed: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500' },
  preparing: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500' },
  ready: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500' },
  served: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500' },
  out_for_delivery: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500' },
  completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500' },
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  paid: { bg: 'bg-green-500/20', text: 'text-green-400' },
  partial: { bg: 'bg-orange-500/20', text: 'text-orange-400' },
  split: { bg: 'bg-blue-500/20', text: 'text-blue-400' },
  credit: { bg: 'bg-purple-500/20', text: 'text-purple-400' },
  refunded: { bg: 'bg-gray-500/20', text: 'text-gray-400' },
  voided: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

export const ORDER_MODE_COLORS: Record<OrderMode, { bg: string; text: string; icon: string }> = {
  dine_in: { bg: 'bg-cyan-500/20', text: 'text-cyan-400', icon: '🍽️' },
  takeaway: { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: '🥡' },
  delivery: { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: '🚚' },
  drive_thru: { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: '🚗' },
  curbside: { bg: 'bg-green-500/20', text: 'text-green-400', icon: '🅿️' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderItem {
  _id: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers?: { name: string; price: number }[];
  specialInstructions?: string;
  subtotal: number;
  status: ItemStatus;
}

export interface PaymentTransaction {
  _id: string;
  method: PaymentMethod;
  /** Custom method label (e.g. "JazzCash"); falls back to the category label. */
  methodLabel?: string;
  amount: number;
  reference?: string;
  paidAt: string;
  paidBy?: string;
}

export interface CustomerInfo {
  name?: string;
  phone?: string;
  email?: string;
  address?: {
    line1: string;
    line2?: string;
    city: string;
    postalCode: string;
    instructions?: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent Customer (from customers collection)
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomerAddress {
  _id: string;
  label?: string;
  line1: string;
  line2?: string;
  city?: string;
  postalCode?: string;
  instructions?: string;
  isDefault: boolean;
}

export interface TakeawayCustomer {
  _id: string;
  name: string;
  phone?: string;
  email?: string;
  addresses: CustomerAddress[];
  notes?: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TableInfo {
  tableId?: string;
  tableNumber: string;
  sectionName?: string;
  guestCount?: number;
}

export interface Order {
  _id: string;
  orderNumber: string | number;  // Can be number from compressed storage
  mode: OrderMode;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  
  items: OrderItem[];
  
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  discountAmount: number;
  serviceCharge?: number;
  deliveryFee?: number;
  /** Delivery only — optional "assigned to" free text. No dispatch/GPS system. */
  riderName?: string;
  tipAmount?: number;
  grandTotal: number;
  
  adjustments: AppliedAdjustment[];
  adjustmentsTotal: number;
  
  transactions: PaymentTransaction[];
  amountPaid: number;
  amountDue: number;
  
  customerId?: string;
  customer?: CustomerInfo;
  table?: TableInfo;
  
  createdBy: { _id: string; username: string } | string;
  servedBy?: { _id: string; username: string } | string;
  
  createdAt: string;
  updatedAt: string;
  confirmedAt?: string;
  prepStartedAt?: string;
  readyAt?: string;
  completedAt?: string;
  estimatedReadyTime?: string;
  
  kitchenNotes?: string;
  internalNotes?: string;
  
  isPriority: boolean;
  isVoid: boolean;

  /** Mongoose optimistic concurrency version (populated from DB, used for event version guards) */
  __v?: number;
}

export interface OrderStats {
  activeOrders: number;
  todayOrders: number;
  pendingPayments: number;
  todayRevenue: number;
  avgPrepTimeMinutes: number;
  byMode: Record<OrderMode, number>;
  byStatus: Record<OrderStatus, number>;
}

export interface OrdersResponse {
  orders: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter type for the TopBar
// ─────────────────────────────────────────────────────────────────────────────

export type OrderFilterTab = 'all' | OrderMode | OrderStatus;

export interface OrderFilters {
  tab: OrderFilterTab;
  searchQuery: string;
  paymentStatus?: PaymentStatus;
  priorityOnly: boolean;
}
