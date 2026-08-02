// models/schemas/order.schema.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Order Schema (Compressed Storage)
// Uses short field names and numeric codes to minimize storage and network payload
// Human-readable types and labels are exported for UI/API layer
// ═══════════════════════════════════════════════════════════════════════════════

import { Document, Schema, Types } from 'mongoose';

// ─────────────────────────────────────────────────────────────────────────────
// Order Modes - How the order is being fulfilled
// ─────────────────────────────────────────────────────────────────────────────

export type OrderMode = 
  | 'dine_in'       // Customer eating at the restaurant
  | 'takeaway'      // Customer picking up the order
  | 'delivery'      // Order being delivered to customer
  | 'drive_thru'    // Quick service drive-through
  | 'curbside';     // Curbside pickup

export const ORDER_MODE_LABELS: Record<OrderMode, string> = {
  dine_in: 'Dine-In',
  takeaway: 'Takeaway',
  delivery: 'Delivery',
  drive_thru: 'Drive-Thru',
  curbside: 'Curbside',
};

// ─────────────────────────────────────────────────────────────────────────────
// Payment Status - Current state of payment
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentStatus = 
  | 'pending'       // Not yet paid
  | 'paid'          // Fully paid
  | 'partial'       // Partially paid (deposit or installment)
  | 'split'         // Split between multiple payment methods
  | 'credit'        // On credit/tab
  | 'refunded'      // Payment was refunded
  | 'voided';       // Order was voided

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pending',
  paid: 'Paid',
  partial: 'Partial',
  split: 'Split',
  credit: 'Credit',
  refunded: 'Refunded',
  voided: 'Voided',
};

// ─────────────────────────────────────────────────────────────────────────────
// Payment Methods
// ─────────────────────────────────────────────────────────────────────────────

export type PaymentMethod = 
  | 'cash'
  | 'card'
  | 'online'
  | 'other';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  online: 'Online',
  other: 'Other',
};

// ─────────────────────────────────────────────────────────────────────────────
// Order Status - Lifecycle of an order
// ─────────────────────────────────────────────────────────────────────────────

export type OrderStatus = 
  | 'draft'          // Order is being created
  | 'confirmed'      // Order confirmed, pending preparation
  | 'preparing'      // Kitchen/bar is preparing the order
  | 'ready'          // Order is ready for pickup/serving
  | 'served'         // Order has been served (dine-in)
  | 'out_for_delivery'// Order is being delivered
  | 'completed'      // Order fully completed
  | 'cancelled';     // Order was cancelled

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

// Status flow configuration for UI
export const ORDER_STATUS_FLOW: Record<OrderMode, OrderStatus[]> = {
  dine_in: ['draft', 'confirmed', 'preparing', 'ready', 'served', 'completed'],
  takeaway: ['draft', 'confirmed', 'preparing', 'ready', 'completed'],
  delivery: ['draft', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed'],
  drive_thru: ['draft', 'confirmed', 'preparing', 'ready', 'completed'],
  curbside: ['draft', 'confirmed', 'preparing', 'ready', 'completed'],
};

// ─────────────────────────────────────────────────────────────────────────────
// Adjustment Types
// ─────────────────────────────────────────────────────────────────────────────

export type AdjustmentKind = 'discount' | 'surcharge' | 'tax' | 'fee';
export type AdjustmentCalcMode = 'percentage' | 'fixed';

// ─────────────────────────────────────────────────────────────────────────────
// Compressed Value Mappings (for reference)
// ─────────────────────────────────────────────────────────────────────────────
// Order Mode (m): 0=dine_in, 1=takeaway, 2=delivery, 3=drive_thru, 4=curbside
// Order Status (s): 0=draft, 1=confirmed, 2=preparing, 3=ready, 4=served, 5=out_for_delivery, 6=completed, 7=cancelled
// Payment Status (ps): 0=pending, 1=paid, 2=partial, 3=split, 4=credit, 5=refunded, 6=voided  
// Payment Method (m in tx): 0=cash, 1=card, 2=online, 3=other
// Item Status (s in items): 0=pending, 1=preparing, 2=ready, 3=served, 4=cancelled
// Adjustment Kind (k): 0=discount, 1=surcharge, 2=tax, 3=fee
// Adjustment CalcMode (cm): 0=percentage, 1=fixed
// Discount Type (dt): 0=percentage, 1=fixed

// ─────────────────────────────────────────────────────────────────────────────
// Order Item Interface (Compressed)
// ─────────────────────────────────────────────────────────────────────────────

export interface IOrderItem {
  _id?: Types.ObjectId;
  ii: Types.ObjectId;            // itemId
  n: string;                     // name
  q: number;                     // quantity
  up: number;                    // unitPrice
  md?: {                         // modifiers
    n: string;                   // name
    p: number;                   // price
  }[];
  si?: string;                   // specialInstructions
  st: number;                    // subtotal
  s: number;                     // status (0-4)
}

const OrderItemSchema = new Schema<IOrderItem>({
  ii: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
  n: { type: String, required: true },
  q: { type: Number, required: true, min: 1 },
  up: { type: Number, required: true, min: 0 },
  md: [{
    n: { type: String, required: true },
    p: { type: Number, required: true, default: 0 },
  }],
  si: { type: String },
  st: { type: Number, required: true, min: 0 },
  s: { type: Number, enum: [0, 1, 2, 3, 4], default: 0 },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// Applied Adjustment Interface (Compressed)
// ─────────────────────────────────────────────────────────────────────────────

export interface IAppliedAdjustment {
  _id?: Types.ObjectId;
  ai?: Types.ObjectId;           // adjustmentId
  n: string;                     // name
  k: number;                     // kind (0-3)
  cm: number;                    // calcMode (0-1)
  v: number;                     // value
  ca: number;                    // computedAmount
  r?: string;                    // reason
}

const AppliedAdjustmentSchema = new Schema<IAppliedAdjustment>({
  ai: { type: Schema.Types.ObjectId, ref: 'BillAdjustment' },
  n: { type: String, required: true },
  k: { type: Number, enum: [0, 1, 2, 3], required: true },
  cm: { type: Number, enum: [0, 1], required: true },
  v: { type: Number, required: true, min: 0 },
  ca: { type: Number, default: 0 },
  r: { type: String },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// Payment Transaction Interface (Compressed)
// ─────────────────────────────────────────────────────────────────────────────

export interface IPaymentTransaction {
  m: number;                     // method category (0=cash,1=card,2=online,3=other)
  mn?: string;                   // method label (preserves custom method names, e.g. "JazzCash")
  a: number;                     // amount
  r?: string;                    // reference
  pa: Date;                      // paidAt
  pb?: string;                   // paidBy
}

const PaymentTransactionSchema = new Schema<IPaymentTransaction>({
  m: { type: Number, enum: [0, 1, 2, 3], required: true },
  mn: { type: String },
  a: { type: Number, required: true, min: 0 },
  r: { type: String },
  pa: { type: Date, default: Date.now },
  pb: { type: String },
}, { _id: true });

// ─────────────────────────────────────────────────────────────────────────────
// Customer Info (Compressed, embedded)
// ─────────────────────────────────────────────────────────────────────────────

export interface ICustomerInfo {
  n?: string;                    // name
  p?: string;                    // phone
  e?: string;                    // email
  a?: {                          // address
    l1: string;                  // line1
    l2?: string;                 // line2
    c: string;                   // city
    pc: string;                  // postalCode
    in?: string;                 // instructions
  };
}

const CustomerInfoSchema = new Schema<ICustomerInfo>({
  n: { type: String },
  p: { type: String },
  e: { type: String },
  a: {
    l1: { type: String },
    l2: { type: String },
    c: { type: String },
    pc: { type: String },
    in: { type: String },
  },
}, { _id: false });

// ─────────────────────────────────────────────────────────────────────────────
// Table Info (Compressed, embedded)
// ─────────────────────────────────────────────────────────────────────────────

export interface ITableInfo {
  ti?: Types.ObjectId;           // tableId
  tn: string;                    // tableNumber
  sn?: string;                   // sectionName
  gc?: number;                   // guestCount
}

const TableInfoSchema = new Schema<ITableInfo>({
  ti: { type: Schema.Types.ObjectId, ref: 'Table' },
  tn: { type: String, required: true },
  sn: { type: String },
  gc: { type: Number, min: 1 },
}, { _id: false });

// ─────────────────────────────────────────────────────────────────────────────
// Main Order Interface (Compressed Storage)
// ─────────────────────────────────────────────────────────────────────────────

export interface IOrder extends Document {
  on: string;                    // orderNumber
  m: number;                     // mode (0-4)
  s: number;                     // status (0-7)
  ps: number;                    // paymentStatus (0-6)
  
  // Items
  i: IOrderItem[];
  
  // Pricing
  st: number;                    // subtotal
  tr: number;                    // taxRate
  ta: number;                    // taxAmount
  dt?: number;                   // discountType (0-1)
  dv?: number;                   // discountValue
  da: number;                    // discountAmount
  sc?: number;                   // serviceCharge
  df?: number;                   // deliveryFee
  tp?: number;                   // tipAmount
  gt: number;                    // grandTotal

  // Adjustments
  aj: IAppliedAdjustment[];
  at: number;                    // adjustmentsTotal
  
  // Payments
  tx: IPaymentTransaction[];
  ap: number;                    // amountPaid
  ad: number;                    // amountDue
  
  // References
  ci?: Types.ObjectId;           // customerId
  cu?: ICustomerInfo;            // customer
  tb?: ITableInfo;               // table
  sid?: Types.ObjectId;          // sessionId
  cv?: number;                   // covers
  
  // Financial Overrides
  scp?: number;                  // serviceChargePercentage
  to?: number;                   // taxOverride
  dr?: string;                   // discountReason
  dab?: Types.ObjectId;          // discountApprovedBy
  
  // Staff
  cb: Types.ObjectId;            // createdBy
  sb?: Types.ObjectId;           // servedBy
  wi?: Types.ObjectId;           // waiterId
  
  // Audit
  lsc?: Date;                    // lastStatusChangeAt
  
  // Timing
  cAt: Date;                     // createdAt
  uAt: Date;                     // updatedAt
  cat?: Date;                    // confirmedAt
  psa?: Date;                    // prepStartedAt
  ra?: Date;                     // readyAt
  coa?: Date;                    // completedAt
  ert?: Date;                    // estimatedReadyTime
  
  // Notes
  kn?: string;                   // kitchenNotes
  in?: string;                   // internalNotes
  
  // Flags (1=true, 0=false)
  ip: number;                    // isPriority
  iv: number;                    // isVoid
}

// ─────────────────────────────────────────────────────────────────────────────
// Order Schema (Compressed)
// ─────────────────────────────────────────────────────────────────────────────

export const OrderSchema: Schema = new Schema<IOrder>(
  {
    on: { type: String, required: true, unique: true, index: true },
    m: { type: Number, enum: [0, 1, 2, 3, 4], required: true },
    s: { type: Number, enum: [0, 1, 2, 3, 4, 5, 6, 7], default: 0 },
    ps: { type: Number, enum: [0, 1, 2, 3, 4, 5, 6], default: 0 },
    
    // Items
    i: [OrderItemSchema],
    
    // Pricing
    st: { type: Number, required: true, default: 0, min: 0 },
    tr: { type: Number, required: true, default: 0, min: 0 },
    ta: { type: Number, required: true, default: 0, min: 0 },
    dt: { type: Number, enum: [0, 1] },
    dv: { type: Number, min: 0 },
    da: { type: Number, default: 0, min: 0 },
    sc: { type: Number, min: 0 },
    df: { type: Number, min: 0 },
    tp: { type: Number, min: 0 },
    // Clamping setter: a discount/adjustment can exceed the base and briefly
    // drive the raw total negative — a bill can't be negative, and this guards
    // the min:0 validator against ever rejecting the save (belt-and-suspenders
    // alongside the recompute clamp in models/factories/Order.ts).
    gt: { type: Number, required: true, default: 0, min: 0, set: (v: number) => (typeof v === 'number' && v < 0 ? 0 : v) },
    aj: [AppliedAdjustmentSchema],
    at: { type: Number, default: 0 },
    
    // Payments
    tx: [PaymentTransactionSchema],
    ap: { type: Number, default: 0, min: 0 },
    ad: { type: Number, default: 0, min: 0 },
    
    // References
    ci: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    cu: CustomerInfoSchema,
    tb: TableInfoSchema,
    sid: { type: Schema.Types.ObjectId, ref: 'TableSession', index: true },
    cv: { type: Number, min: 1 },
    
    // Financial Overrides
    scp: { type: Number, min: 0, max: 100 },
    to: { type: Number, min: 0, max: 100 },
    dr: { type: String },
    dab: { type: Schema.Types.ObjectId, ref: 'Admin' },
    
    // Staff
    cb: { type: Schema.Types.ObjectId, ref: 'Admin', required: true },
    sb: { type: Schema.Types.ObjectId, ref: 'Admin' },
    wi: { type: Schema.Types.ObjectId, ref: 'Admin', index: true },
    
    // Audit
    lsc: { type: Date },
    
    // Timing
    cat: { type: Date },
    psa: { type: Date },
    ra: { type: Date },
    coa: { type: Date },
    ert: { type: Date },
    
    // Notes
    kn: { type: String },
    in: { type: String },
    
    // Flags
    ip: { type: Number, enum: [0, 1], default: 0 },
    iv: { type: Number, enum: [0, 1], default: 0 },
  },
  {
    collection: 'orders',
    timestamps: { createdAt: 'cAt', updatedAt: 'uAt' },
    optimisticConcurrency: true,
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Indexes for common queries
// ─────────────────────────────────────────────────────────────────────────────

OrderSchema.index({ s: 1, m: 1 });         // status + mode
OrderSchema.index({ cAt: -1 });            // createdAt desc
OrderSchema.index({ 'tb.tn': 1 });         // table.tableNumber
OrderSchema.index({ ps: 1 });              // paymentStatus
OrderSchema.index({ cb: 1 });              // createdBy
// Status-scoped, time-ordered: powers the Order List "history" view
// ({ s: completed/cancelled } sorted by cAt desc) and the "ongoing" list without
// an in-memory sort. Critical once the collection reaches millions of rows —
// lets deep pagination seek the index instead of scanning + sorting in RAM.
OrderSchema.index({ s: 1, cAt: -1 });
