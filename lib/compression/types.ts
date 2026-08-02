// lib/compression/types.ts
// ═══════════════════════════════════════════════════════════════════════════════
// TypeScript Types for Compressed Documents
// Client-side types matching compressed schemas
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// COMPRESSED ORDER TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CompressedModifier {
  n: string;     // name
  p: number;     // price
}

export interface CompressedOrderItem {
  _id?: string;
  ii: string;    // itemId
  n: string;     // name
  q: number;     // quantity
  up: number;    // unitPrice
  md?: CompressedModifier[];  // modifiers
  si?: string;   // specialInstructions
  st: number;    // subtotal
  s: number;     // status (0-4)
}

export interface CompressedAppliedAdjustment {
  _id?: string;
  ai?: string;   // adjustmentId
  n: string;     // name
  k: number;     // kind (0-3)
  cm: number;    // calcMode (0-1)
  v: number;     // value
  ca: number;    // computedAmount
  r?: string;    // reason
}

export interface CompressedPaymentTransaction {
  _id?: string;
  m: number;     // method category (0-3)
  mn?: string;   // method label (custom method name)
  a: number;     // amount
  r?: string;    // reference
  pa: string;    // paidAt (ISO date string)
  pb?: string;   // paidBy
}

export interface CompressedAddress {
  l1: string;    // line1
  l2?: string;   // line2
  c: string;     // city
  pc: string;    // postalCode
  in?: string;   // instructions
}

export interface CompressedCustomerInfo {
  n?: string;    // name
  p?: string;    // phone
  e?: string;    // email
  a?: CompressedAddress;  // address
}

export interface CompressedTableInfo {
  ti?: string;   // tableId
  tn: string;    // tableNumber
  sn?: string;   // sectionName
  gc?: number;   // guestCount
}

export interface CompressedOrder {
  _id?: string;
  on: string;    // orderNumber
  m: number;     // mode (0-4)
  s: number;     // status (0-7)
  ps: number;    // paymentStatus (0-6)
  
  // Items
  i: CompressedOrderItem[];
  
  // Pricing
  st: number;    // subtotal
  tr: number;    // taxRate
  ta: number;    // taxAmount
  dt?: number;   // discountType (0-1)
  dv?: number;   // discountValue
  da: number;    // discountAmount
  sc?: number;   // serviceCharge
  df?: number;   // deliveryFee
  tp?: number;   // tipAmount
  gt: number;    // grandTotal

  // Adjustments
  aj: CompressedAppliedAdjustment[];
  at: number;    // adjustmentsTotal
  
  // Payments
  tx: CompressedPaymentTransaction[];
  ap: number;    // amountPaid
  ad: number;    // amountDue
  
  // References
  ci?: string;   // customerId
  cu?: CompressedCustomerInfo;
  tb?: CompressedTableInfo;
  sid?: string;  // sessionId
  cv?: number;   // covers
  
  // Financial Overrides
  scp?: number;  // serviceChargePercentage
  to?: number;   // taxOverride
  dr?: string;   // discountReason
  dab?: string;  // discountApprovedBy
  
  // Staff
  cb: string;    // createdBy
  sb?: string;   // servedBy
  wi?: string;   // waiterId
  
  // Audit
  lsc?: string;  // lastStatusChangeAt
  
  // Timing
  cAt: string;   // createdAt
  uAt: string;   // updatedAt
  cat?: string;  // confirmedAt
  psa?: string;  // prepStartedAt
  ra?: string;   // readyAt
  coa?: string;  // completedAt
  ert?: string;  // estimatedReadyTime
  
  // Notes
  kn?: string;   // kitchenNotes
  in?: string;   // internalNotes
  
  // Flags (0=false, 1=true)
  ip: number;    // isPriority
  iv: number;    // isVoid
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPRESSED CUSTOMER TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CompressedCustomerAddress {
  _id?: string;
  l?: number;    // label (0=Home, 1=Office, 2=Other)
  l1: string;    // line1
  l2?: string;   // line2
  c?: string;    // city
  pc?: string;   // postalCode
  in?: string;   // instructions
  id: number;    // isDefault (0=false, 1=true)
}

export interface CompressedCustomer {
  _id?: string;
  n: string;     // name
  p?: string;    // phone
  e?: string;    // email
  a: CompressedCustomerAddress[];
  nt?: string;   // notes
  oc: number;    // orderCount
  ts: number;    // totalSpent
  lo?: string;   // lastOrderAt (ISO date string)
  cAt: string;   // createdAt
  uAt: string;   // updatedAt
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPRESSED TABLE TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface CompressedReservation {
  _id?: string;
  cn: string;    // customerName
  cp?: string;   // customerPhone
  ps: number;    // partySize
  rt: string;    // reservationTime (ISO date string)
  du?: number;   // durationMinutes (policy override)
  hm?: number;   // holdMinutes (policy override)
  gm?: number;   // graceMinutes (policy override)
  st: number;    // status (0=booked,1=seated,2=cancelled,3=no_show,4=completed)
  nt?: string;   // notes
  sid?: string;  // sessionId
  aAt?: string;  // arrivedAt (ISO date string)
  rn?: string;   // resolutionNote
  cAt: string;   // createdAt (ISO date string)
  uAt?: string;  // updatedAt (ISO date string)
}

export interface CompressedTable {
  _id?: string;
  
  // Identity
  tn: string;    // tableNumber
  n?: string;    // name
  
  // Physical Layout
  si?: string;   // sectionId
  sn?: string;   // sectionName
  x: number;     // x_position
  y: number;     // y_position
  w: number;     // width
  h: number;     // height
  o: number;     // orientation
  sh: number;    // shape (0-3)
  
  // Capacity
  c: number;     // capacity
  mc?: number;   // minCovers
  
  // Status
  s: number;     // status (0-4)
  as?: string;   // activeSessionId
  
  // Reservations
  rs?: CompressedReservation[];
  r?: CompressedReservation;   // legacy single slot

  // Display
  cl?: string;   // color
  ia: number;    // isActive (0=false, 1=true)

  // Grouping
  gi?: string;   // groupId
  so?: number;   // sortOrder
  
  // Timestamps
  cAt: string;   // createdAt
  uAt: string;   // updatedAt
  lsc?: string;  // lastStatusChangeAt
}

// ─────────────────────────────────────────────────────────────────────────────
// HUMAN-READABLE TYPES (for API responses and UI)
// These are the expanded versions that the UI will work with
// ─────────────────────────────────────────────────────────────────────────────

export type OrderMode = 'dine_in' | 'takeaway' | 'delivery' | 'drive_thru' | 'curbside';
export type OrderStatus = 'draft' | 'confirmed' | 'preparing' | 'ready' | 'served' | 'out_for_delivery' | 'completed' | 'cancelled';
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'split' | 'credit' | 'refunded' | 'voided';
export type PaymentMethod = 'cash' | 'card' | 'online' | 'other';
export type ItemStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
export type AdjustmentKind = 'discount' | 'surcharge' | 'tax' | 'fee';
export type AdjustmentCalcMode = 'percentage' | 'fixed';
export type TableStatus = 'available' | 'reserved' | 'occupied' | 'cleaning' | 'blocked';
export type TableShape = 'square' | 'rectangle' | 'round' | 'oval';
export type AddressLabel = 'Home' | 'Office' | 'Other';
export type DiscountType = 'percentage' | 'fixed';

// Human-readable Order
export interface HumanReadableOrder {
  _id?: string;
  orderNumber: string;
  mode: OrderMode;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  items: HumanReadableOrderItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountType?: DiscountType;
  discountValue?: number;
  discountAmount: number;
  serviceCharge?: number;
  deliveryFee?: number;
  tipAmount?: number;
  grandTotal: number;
  adjustments: HumanReadableAdjustment[];
  adjustmentsTotal: number;
  transactions: HumanReadableTransaction[];
  amountPaid: number;
  amountDue: number;
  customerId?: string;
  customer?: HumanReadableCustomerInfo;
  table?: HumanReadableTableInfo;
  sessionId?: string;
  covers?: number;
  serviceChargePercentage?: number;
  taxOverride?: number;
  discountReason?: string;
  discountApprovedBy?: string;
  createdBy: string;
  servedBy?: string;
  waiterId?: string;
  lastStatusChangeAt?: string;
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
}

export interface HumanReadableOrderItem {
  _id?: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  modifiers?: { name: string; price: number }[];
  specialInstructions?: string;
  subtotal: number;
  status: ItemStatus;
}

export interface HumanReadableAdjustment {
  _id?: string;
  adjustmentId?: string;
  name: string;
  kind: AdjustmentKind;
  calcMode: AdjustmentCalcMode;
  value: number;
  computedAmount: number;
  reason?: string;
}

export interface HumanReadableTransaction {
  _id?: string;
  method: PaymentMethod;
  /** Custom method label (e.g. "JazzCash"); falls back to the category label. */
  methodLabel?: string;
  amount: number;
  reference?: string;
  paidAt: string;
  paidBy?: string;
}

export interface HumanReadableCustomerInfo {
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

export interface HumanReadableTableInfo {
  tableId?: string;
  tableNumber: string;
  sectionName?: string;
  guestCount?: number;
}

// Human-readable Customer
export interface HumanReadableCustomer {
  _id?: string;
  name: string;
  phone?: string;
  email?: string;
  addresses: HumanReadableAddress[];
  notes?: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface HumanReadableAddress {
  _id?: string;
  label?: AddressLabel;
  line1: string;
  line2?: string;
  city?: string;
  postalCode?: string;
  instructions?: string;
  isDefault: boolean;
}

// Human-readable Table
export interface HumanReadableTable {
  _id?: string;
  tableNumber: string;
  name?: string;
  sectionId?: string;
  sectionName?: string;
  x_position: number;
  y_position: number;
  width: number;
  height: number;
  orientation: number;
  shape: TableShape;
  capacity: number;
  minCovers?: number;
  status: TableStatus;
  activeSessionId?: string;
  reservations?: HumanReadableReservation[];
  currentReservation?: HumanReadableReservation;
  color?: string;
  isActive: boolean;
  groupId?: string;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
  lastStatusChangeAt?: string;
}

export interface HumanReadableReservation {
  _id?: string;
  customerName: string;
  customerPhone?: string;
  partySize: number;
  reservationTime: string;
  durationMinutes?: number;
  holdMinutes?: number;
  graceMinutes?: number;
  status: 'booked' | 'seated' | 'cancelled' | 'no_show' | 'completed';
  notes?: string;
  sessionId?: string;
  arrivedAt?: string;
  resolutionNote?: string;
  createdAt: string;
  updatedAt?: string;
}
