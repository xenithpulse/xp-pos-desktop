// lib/compression/encoders.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Data Compression Encoders
// Converts human-readable data to compressed format for storage/network
// ═══════════════════════════════════════════════════════════════════════════════

import {
  ORDER_MODE_CODES,
  ORDER_STATUS_CODES,
  PAYMENT_STATUS_CODES,
  PAYMENT_METHOD_CODES,
  ITEM_STATUS_CODES,
  ADJUSTMENT_KIND_CODES,
  ADJUSTMENT_CALC_MODE_CODES,
  TABLE_STATUS_CODES,
  TABLE_SHAPE_CODES,
  ADDRESS_LABEL_CODES,
  DISCOUNT_TYPE_CODES,
  ORDER_FIELD_MAP,
  ORDER_ITEM_FIELD_MAP,
  MODIFIER_FIELD_MAP,
  ADJUSTMENT_FIELD_MAP,
  TRANSACTION_FIELD_MAP,
  CUSTOMER_INFO_FIELD_MAP,
  ADDRESS_FIELD_MAP,
  TABLE_INFO_FIELD_MAP,
  CUSTOMER_FIELD_MAP,
  TABLE_FIELD_MAP,
  RESERVATION_FIELD_MAP,
  RESERVATION_STATUS_CODES,
} from './index';

// ─────────────────────────────────────────────────────────────────────────────
// VALUE ENCODERS - String to Number
// ─────────────────────────────────────────────────────────────────────────────

export const encodeOrderMode = (mode: string): number => 
  ORDER_MODE_CODES[mode as keyof typeof ORDER_MODE_CODES] ?? 0;

export const encodeOrderStatus = (status: string): number => 
  ORDER_STATUS_CODES[status as keyof typeof ORDER_STATUS_CODES] ?? 0;

export const encodePaymentStatus = (status: string): number => 
  PAYMENT_STATUS_CODES[status as keyof typeof PAYMENT_STATUS_CODES] ?? 0;

export const encodePaymentMethod = (method: string): number => 
  PAYMENT_METHOD_CODES[method as keyof typeof PAYMENT_METHOD_CODES] ?? 0;

export const encodeItemStatus = (status: string): number => 
  ITEM_STATUS_CODES[status as keyof typeof ITEM_STATUS_CODES] ?? 0;

export const encodeAdjustmentKind = (kind: string): number => 
  ADJUSTMENT_KIND_CODES[kind as keyof typeof ADJUSTMENT_KIND_CODES] ?? 0;

export const encodeAdjustmentCalcMode = (mode: string): number => 
  ADJUSTMENT_CALC_MODE_CODES[mode as keyof typeof ADJUSTMENT_CALC_MODE_CODES] ?? 0;

export const encodeTableStatus = (status: string): number => 
  TABLE_STATUS_CODES[status as keyof typeof TABLE_STATUS_CODES] ?? 0;

export const encodeTableShape = (shape: string): number =>
  TABLE_SHAPE_CODES[shape as keyof typeof TABLE_SHAPE_CODES] ?? 0;

export const encodeReservationStatus = (status: string): number =>
  RESERVATION_STATUS_CODES[status as keyof typeof RESERVATION_STATUS_CODES] ?? 0;

export const encodeAddressLabel = (label: string): number => 
  ADDRESS_LABEL_CODES[label as keyof typeof ADDRESS_LABEL_CODES] ?? 2; // default to 'Other'

export const encodeDiscountType = (type: string | undefined): number | undefined => 
  type ? DISCOUNT_TYPE_CODES[type as keyof typeof DISCOUNT_TYPE_CODES] : undefined;

// ─────────────────────────────────────────────────────────────────────────────
// OBJECT ENCODERS - Full to Compressed
// ─────────────────────────────────────────────────────────────────────────────

type AnyObject = Record<string, unknown>;

/**
 * Generic field mapper that compresses object keys
 */
const mapFields = <T extends AnyObject>(
  obj: T | undefined | null,
  fieldMap: Record<string, string>,
  valueTransformers?: Record<string, (val: unknown) => unknown>
): AnyObject | undefined => {
  if (!obj) return undefined;
  
  const result: AnyObject = {};
  
  for (const [fullKey, compressedKey] of Object.entries(fieldMap)) {
    if (fullKey in obj && obj[fullKey] !== undefined) {
      const value = obj[fullKey];
      const transformer = valueTransformers?.[fullKey];
      result[compressedKey] = transformer ? transformer(value) : value;
    }
  }
  
  // Preserve _id if present
  if ('_id' in obj) {
    result._id = obj._id;
  }
  
  return result;
};

/**
 * Encode modifier to compressed format
 */
export const encodeModifier = (modifier: AnyObject): AnyObject => {
  return mapFields(modifier, MODIFIER_FIELD_MAP) || {};
};

/**
 * Encode order item to compressed format
 */
export const encodeOrderItem = (item: AnyObject): AnyObject => {
  return mapFields(item, ORDER_ITEM_FIELD_MAP, {
    status: (v) => encodeItemStatus(v as string),
    modifiers: (v) => (v as AnyObject[])?.map(encodeModifier),
  }) || {};
};

/**
 * Encode applied adjustment to compressed format
 */
export const encodeAppliedAdjustment = (adj: AnyObject): AnyObject => {
  return mapFields(adj, ADJUSTMENT_FIELD_MAP, {
    kind: (v) => encodeAdjustmentKind(v as string),
    calcMode: (v) => encodeAdjustmentCalcMode(v as string),
  }) || {};
};

/**
 * Encode payment transaction to compressed format
 */
export const encodeTransaction = (tx: AnyObject): AnyObject => {
  return mapFields(tx, TRANSACTION_FIELD_MAP, {
    method: (v) => encodePaymentMethod(v as string),
  }) || {};
};

/**
 * Encode address to compressed format
 */
export const encodeAddress = (address: AnyObject): AnyObject => {
  return mapFields(address, ADDRESS_FIELD_MAP, {
    label: (v) => encodeAddressLabel(v as string),
    isDefault: (v) => v ? 1 : 0,
  }) || {};
};

/**
 * Encode customer info (embedded in order) to compressed format
 */
export const encodeCustomerInfo = (customer: AnyObject): AnyObject => {
  return mapFields(customer, CUSTOMER_INFO_FIELD_MAP, {
    address: (v) => encodeAddress(v as AnyObject),
  }) || {};
};

/**
 * Encode table info (embedded in order) to compressed format
 */
export const encodeTableInfo = (table: AnyObject): AnyObject => {
  return mapFields(table, TABLE_INFO_FIELD_MAP) || {};
};

/**
 * Encode reservation to compressed format
 */
export const encodeReservation = (reservation: AnyObject): AnyObject | undefined => {
  return mapFields(reservation, RESERVATION_FIELD_MAP, {
    status: (v) => encodeReservationStatus(v as string),
  });
};

/**
 * Encode a reservation queue (table.reservations → table.rs)
 */
export const encodeReservations = (list: AnyObject[]): AnyObject[] =>
  (list || []).map((r) => encodeReservation(r) || {});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DOCUMENT ENCODERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode full order to compressed format
 */
export const encodeOrder = (order: AnyObject): AnyObject => {
  const encoded = mapFields(order, ORDER_FIELD_MAP, {
    mode: (v) => encodeOrderMode(v as string),
    status: (v) => encodeOrderStatus(v as string),
    paymentStatus: (v) => encodePaymentStatus(v as string),
    discountType: (v) => encodeDiscountType(v as string | undefined),
    items: (v) => (v as AnyObject[])?.map(encodeOrderItem),
    adjustments: (v) => (v as AnyObject[])?.map(encodeAppliedAdjustment),
    transactions: (v) => (v as AnyObject[])?.map(encodeTransaction),
    customer: (v) => encodeCustomerInfo(v as AnyObject),
    table: (v) => encodeTableInfo(v as AnyObject),
    isPriority: (v) => v ? 1 : 0,
    isVoid: (v) => v ? 1 : 0,
  });
  
  return encoded || {};
};

/**
 * Encode full customer to compressed format
 */
export const encodeCustomer = (customer: AnyObject): AnyObject => {
  const encoded = mapFields(customer, CUSTOMER_FIELD_MAP, {
    addresses: (v) => (v as AnyObject[])?.map(encodeAddress),
  });
  
  return encoded || {};
};

/**
 * Encode full table to compressed format
 */
export const encodeTable = (table: AnyObject): AnyObject => {
  const encoded = mapFields(table, TABLE_FIELD_MAP, {
    shape: (v) => encodeTableShape(v as string),
    status: (v) => encodeTableStatus(v as string),
    reservations: (v) => encodeReservations(v as AnyObject[]),
    currentReservation: (v) => encodeReservation(v as AnyObject),
    isActive: (v) => v ? 1 : 0,
  });
  
  return encoded || {};
};

// ─────────────────────────────────────────────────────────────────────────────
// BATCH ENCODERS
// ─────────────────────────────────────────────────────────────────────────────

export const encodeOrders = (orders: AnyObject[]): AnyObject[] => orders.map(encodeOrder);
export const encodeCustomers = (customers: AnyObject[]): AnyObject[] => customers.map(encodeCustomer);
export const encodeTables = (tables: AnyObject[]): AnyObject[] => tables.map(encodeTable);

// ─────────────────────────────────────────────────────────────────────────────
// PARTIAL ENCODERS (for updates with specific fields)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Encode only specified fields from an order update
 */
export const encodeOrderUpdate = (update: AnyObject): AnyObject => {
  return encodeOrder(update);
};

/**
 * Encode only specified fields from a table update
 */
export const encodeTableUpdate = (update: AnyObject): AnyObject => {
  return encodeTable(update);
};

/**
 * Encode only specified fields from a customer update
 */
export const encodeCustomerUpdate = (update: AnyObject): AnyObject => {
  return encodeCustomer(update);
};
