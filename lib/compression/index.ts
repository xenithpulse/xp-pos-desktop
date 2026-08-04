// lib/compression/index.ts
// ═══════════════════════════════════════════════════════════════════════════════
// POS Data Compression Library
// Reduces payload size by using short field names and numeric codes for enums
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// VALUE CODE MAPPINGS - Encode string enums to numbers
// ─────────────────────────────────────────────────────────────────────────────

// Order Mode: dine_in=0, takeaway=1, delivery=2, drive_thru=3, curbside=4
export const ORDER_MODE_CODES = {
  dine_in: 0,
  takeaway: 1,
  delivery: 2,
  drive_thru: 3,
  curbside: 4,
} as const;

export const ORDER_MODE_VALUES = ['dine_in', 'takeaway', 'delivery', 'drive_thru', 'curbside'] as const;

// Order Status: draft=0, confirmed=1, preparing=2, ready=3, served=4, out_for_delivery=5, completed=6, cancelled=7
export const ORDER_STATUS_CODES = {
  draft: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  served: 4,
  out_for_delivery: 5,
  completed: 6,
  cancelled: 7,
} as const;

export const ORDER_STATUS_VALUES = ['draft', 'confirmed', 'preparing', 'ready', 'served', 'out_for_delivery', 'completed', 'cancelled'] as const;

// Payment Status: pending=0, paid=1, partial=2, split=3, credit=4, refunded=5, voided=6
export const PAYMENT_STATUS_CODES = {
  pending: 0,
  paid: 1,
  partial: 2,
  split: 3,
  credit: 4,
  refunded: 5,
  voided: 6,
} as const;

export const PAYMENT_STATUS_VALUES = ['pending', 'paid', 'partial', 'split', 'credit', 'refunded', 'voided'] as const;

// Payment Method: cash=0, card=1, online=2, other=3
export const PAYMENT_METHOD_CODES = {
  cash: 0,
  card: 1,
  online: 2,
  other: 3,
} as const;

export const PAYMENT_METHOD_VALUES = ['cash', 'card', 'online', 'other'] as const;

// Item Status: pending=0, preparing=1, ready=2, served=3, cancelled=4
export const ITEM_STATUS_CODES = {
  pending: 0,
  preparing: 1,
  ready: 2,
  served: 3,
  cancelled: 4,
} as const;

export const ITEM_STATUS_VALUES = ['pending', 'preparing', 'ready', 'served', 'cancelled'] as const;

// Adjustment Kind: discount=0, surcharge=1, tax=2, fee=3
export const ADJUSTMENT_KIND_CODES = {
  discount: 0,
  surcharge: 1,
  tax: 2,
  fee: 3,
} as const;

export const ADJUSTMENT_KIND_VALUES = ['discount', 'surcharge', 'tax', 'fee'] as const;

// Adjustment CalcMode: percentage=0, fixed=1
export const ADJUSTMENT_CALC_MODE_CODES = {
  percentage: 0,
  fixed: 1,
} as const;

export const ADJUSTMENT_CALC_MODE_VALUES = ['percentage', 'fixed'] as const;

// Table Status: available=0, reserved=1, occupied=2, cleaning=3, blocked=4
export const TABLE_STATUS_CODES = {
  available: 0,
  reserved: 1,
  occupied: 2,
  cleaning: 3,
  blocked: 4,
} as const;

export const TABLE_STATUS_VALUES = ['available', 'reserved', 'occupied', 'cleaning', 'blocked'] as const;

// Table Shape: square=0, rectangle=1, round=2, oval=3
export const TABLE_SHAPE_CODES = {
  square: 0,
  rectangle: 1,
  round: 2,
  oval: 3,
} as const;

export const TABLE_SHAPE_VALUES = ['square', 'rectangle', 'round', 'oval'] as const;

// Customer Address Label: home=0, office=1, other=2
export const ADDRESS_LABEL_CODES = {
  Home: 0,
  Office: 1,
  Other: 2,
} as const;

export const ADDRESS_LABEL_VALUES = ['Home', 'Office', 'Other'] as const;

// Discount Type: percentage=0, fixed=1
export const DISCOUNT_TYPE_CODES = {
  percentage: 0,
  fixed: 1,
} as const;

export const DISCOUNT_TYPE_VALUES = ['percentage', 'fixed'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// FIELD KEY MAPPINGS - Compressed field names
// ─────────────────────────────────────────────────────────────────────────────

// Order Field Mappings (full → compressed)
export const ORDER_FIELD_MAP = {
  // Core fields
  orderNumber: 'on',
  mode: 'm',
  status: 's',
  paymentStatus: 'ps',
  items: 'i',
  
  // Pricing
  subtotal: 'st',
  taxRate: 'tr',
  taxAmount: 'ta',
  discountType: 'dt',
  discountValue: 'dv',
  discountAmount: 'da',
  serviceCharge: 'sc',
  deliveryFee: 'df',
  riderName: 'rn',
  tipAmount: 'tp',
  grandTotal: 'gt',
  
  // Adjustments
  adjustments: 'aj',
  adjustmentsTotal: 'at',
  
  // Payments
  transactions: 'tx',
  amountPaid: 'ap',
  amountDue: 'ad',
  
  // References
  customerId: 'ci',
  customer: 'cu',
  table: 'tb',
  sessionId: 'sid',
  covers: 'cv',
  
  // Overrides
  serviceChargePercentage: 'scp',
  taxOverride: 'to',
  discountReason: 'dr',
  discountApprovedBy: 'dab',
  
  // Staff
  createdBy: 'cb',
  servedBy: 'sb',
  waiterId: 'wi',
  
  // Timing
  lastStatusChangeAt: 'lsc',
  confirmedAt: 'cat',
  prepStartedAt: 'psa',
  readyAt: 'ra',
  completedAt: 'coa',
  estimatedReadyTime: 'ert',
  createdAt: 'cAt',
  updatedAt: 'uAt',
  
  // Notes
  kitchenNotes: 'kn',
  internalNotes: 'in',
  
  // Flags
  isPriority: 'ip',
  isVoid: 'iv',
} as const;

// Order Item Field Mappings
export const ORDER_ITEM_FIELD_MAP = {
  itemId: 'ii',
  name: 'n',
  quantity: 'q',
  unitPrice: 'up',
  modifiers: 'md',
  specialInstructions: 'si',
  subtotal: 'st',
  status: 's',
} as const;

// Modifier Field Mappings
export const MODIFIER_FIELD_MAP = {
  name: 'n',
  price: 'p',
} as const;

// Applied Adjustment Field Mappings
export const ADJUSTMENT_FIELD_MAP = {
  adjustmentId: 'ai',
  name: 'n',
  kind: 'k',
  calcMode: 'cm',
  value: 'v',
  computedAmount: 'ca',
  reason: 'r',
} as const;

// Payment Transaction Field Mappings
export const TRANSACTION_FIELD_MAP = {
  method: 'm',
  methodLabel: 'mn',
  amount: 'a',
  reference: 'r',
  paidAt: 'pa',
  paidBy: 'pb',
} as const;

// Customer Info (embedded) Field Mappings
export const CUSTOMER_INFO_FIELD_MAP = {
  name: 'n',
  phone: 'p',
  email: 'e',
  address: 'a',
} as const;

// Address Field Mappings
export const ADDRESS_FIELD_MAP = {
  label: 'l',
  line1: 'l1',
  line2: 'l2',
  city: 'c',
  postalCode: 'pc',
  instructions: 'in',
  isDefault: 'id',
} as const;

// Table Info (embedded in Order) Field Mappings
export const TABLE_INFO_FIELD_MAP = {
  tableId: 'ti',
  tableNumber: 'tn',
  sectionName: 'sn',
  guestCount: 'gc',
} as const;

// Customer Field Mappings
export const CUSTOMER_FIELD_MAP = {
  name: 'n',
  phone: 'p',
  email: 'e',
  addresses: 'a',
  notes: 'nt',
  orderCount: 'oc',
  totalSpent: 'ts',
  lastOrderAt: 'lo',
  createdAt: 'cAt',
  updatedAt: 'uAt',
} as const;

// Table Field Mappings
export const TABLE_FIELD_MAP = {
  tableNumber: 'tn',
  name: 'n',
  sectionId: 'si',
  sectionName: 'sn',
  x_position: 'x',
  y_position: 'y',
  width: 'w',
  height: 'h',
  orientation: 'o',
  shape: 'sh',
  capacity: 'c',
  minCovers: 'mc',
  status: 's',
  activeSessionId: 'as',
  reservations: 'rs',
  currentReservation: 'r',
  color: 'cl',
  isActive: 'ia',
  groupId: 'gi',
  sortOrder: 'so',
  lastStatusChangeAt: 'lsc',
  createdAt: 'cAt',
  updatedAt: 'uAt',
} as const;

// Reservation Field Mappings
export const RESERVATION_FIELD_MAP = {
  customerName: 'cn',
  customerPhone: 'cp',
  partySize: 'ps',
  reservationTime: 'rt',
  durationMinutes: 'du',
  holdMinutes: 'hm',
  graceMinutes: 'gm',
  status: 'st',
  notes: 'nt',
  sessionId: 'sid',
  arrivedAt: 'aAt',
  resolutionNote: 'rn',
  createdAt: 'cAt',
  updatedAt: 'uAt',
} as const;

// Reservation lifecycle codes (field `st`)
export const RESERVATION_STATUS_CODES = {
  booked: 0, seated: 1, cancelled: 2, no_show: 3, completed: 4,
} as const;

export const RESERVATION_STATUS_VALUES = [
  'booked', 'seated', 'cancelled', 'no_show', 'completed',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// REVERSE MAPPINGS (compressed → full) - Auto-generated
// ─────────────────────────────────────────────────────────────────────────────

const reverseMap = <T extends Record<string, string>>(map: T): Record<T[keyof T], keyof T> => {
  return Object.entries(map).reduce((acc, [key, value]) => {
    acc[value as T[keyof T]] = key as keyof T;
    return acc;
  }, {} as Record<T[keyof T], keyof T>);
};

export const ORDER_FIELD_REVERSE = reverseMap(ORDER_FIELD_MAP);
export const ORDER_ITEM_FIELD_REVERSE = reverseMap(ORDER_ITEM_FIELD_MAP);
export const MODIFIER_FIELD_REVERSE = reverseMap(MODIFIER_FIELD_MAP);
export const ADJUSTMENT_FIELD_REVERSE = reverseMap(ADJUSTMENT_FIELD_MAP);
export const TRANSACTION_FIELD_REVERSE = reverseMap(TRANSACTION_FIELD_MAP);
export const CUSTOMER_INFO_FIELD_REVERSE = reverseMap(CUSTOMER_INFO_FIELD_MAP);
export const ADDRESS_FIELD_REVERSE = reverseMap(ADDRESS_FIELD_MAP);
export const TABLE_INFO_FIELD_REVERSE = reverseMap(TABLE_INFO_FIELD_MAP);
export const CUSTOMER_FIELD_REVERSE = reverseMap(CUSTOMER_FIELD_MAP);
export const TABLE_FIELD_REVERSE = reverseMap(TABLE_FIELD_MAP);
export const RESERVATION_FIELD_REVERSE = reverseMap(RESERVATION_FIELD_MAP);

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS FOR COMPRESSED SCHEMAS
// ─────────────────────────────────────────────────────────────────────────────

export type CompressedOrderMode = typeof ORDER_MODE_CODES[keyof typeof ORDER_MODE_CODES];
export type CompressedOrderStatus = typeof ORDER_STATUS_CODES[keyof typeof ORDER_STATUS_CODES];
export type CompressedPaymentStatus = typeof PAYMENT_STATUS_CODES[keyof typeof PAYMENT_STATUS_CODES];
export type CompressedPaymentMethod = typeof PAYMENT_METHOD_CODES[keyof typeof PAYMENT_METHOD_CODES];
export type CompressedItemStatus = typeof ITEM_STATUS_CODES[keyof typeof ITEM_STATUS_CODES];
export type CompressedAdjustmentKind = typeof ADJUSTMENT_KIND_CODES[keyof typeof ADJUSTMENT_KIND_CODES];
export type CompressedAdjustmentCalcMode = typeof ADJUSTMENT_CALC_MODE_CODES[keyof typeof ADJUSTMENT_CALC_MODE_CODES];
export type CompressedTableStatus = typeof TABLE_STATUS_CODES[keyof typeof TABLE_STATUS_CODES];
export type CompressedTableShape = typeof TABLE_SHAPE_CODES[keyof typeof TABLE_SHAPE_CODES];
export type CompressedDiscountType = typeof DISCOUNT_TYPE_CODES[keyof typeof DISCOUNT_TYPE_CODES];

// Re-export from other modules for convenience
// Note: Import encoders/decoders/api-helpers separately to avoid circular deps
// import { encodeOrder, decodeOrder } from '@/lib/compression/encoders';
// import { decodeOrder } from '@/lib/compression/decoders';
// import { prepareOrderForResponse } from '@/lib/compression/api-helpers';
