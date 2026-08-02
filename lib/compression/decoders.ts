// lib/compression/decoders.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Data Compression Decoders
// Converts compressed format back to human-readable for API responses/UI
// ═══════════════════════════════════════════════════════════════════════════════

import {
  ORDER_MODE_VALUES,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
  PAYMENT_METHOD_VALUES,
  ITEM_STATUS_VALUES,
  ADJUSTMENT_KIND_VALUES,
  ADJUSTMENT_CALC_MODE_VALUES,
  TABLE_STATUS_VALUES,
  TABLE_SHAPE_VALUES,
  ADDRESS_LABEL_VALUES,
  DISCOUNT_TYPE_VALUES,
  ORDER_FIELD_REVERSE,
  ORDER_ITEM_FIELD_REVERSE,
  MODIFIER_FIELD_REVERSE,
  ADJUSTMENT_FIELD_REVERSE,
  TRANSACTION_FIELD_REVERSE,
  CUSTOMER_INFO_FIELD_REVERSE,
  ADDRESS_FIELD_REVERSE,
  TABLE_INFO_FIELD_REVERSE,
  CUSTOMER_FIELD_REVERSE,
  TABLE_FIELD_REVERSE,
  RESERVATION_FIELD_REVERSE,
  RESERVATION_STATUS_VALUES,
} from './index';

// ─────────────────────────────────────────────────────────────────────────────
// VALUE DECODERS - Number to String
// ─────────────────────────────────────────────────────────────────────────────

export const decodeOrderMode = (code: number): string => 
  ORDER_MODE_VALUES[code] ?? 'dine_in';

export const decodeOrderStatus = (code: number): string => 
  ORDER_STATUS_VALUES[code] ?? 'draft';

export const decodePaymentStatus = (code: number): string => 
  PAYMENT_STATUS_VALUES[code] ?? 'pending';

export const decodePaymentMethod = (code: number): string => 
  PAYMENT_METHOD_VALUES[code] ?? 'cash';

export const decodeItemStatus = (code: number): string => 
  ITEM_STATUS_VALUES[code] ?? 'pending';

export const decodeAdjustmentKind = (code: number): string => 
  ADJUSTMENT_KIND_VALUES[code] ?? 'discount';

export const decodeAdjustmentCalcMode = (code: number): string => 
  ADJUSTMENT_CALC_MODE_VALUES[code] ?? 'percentage';

export const decodeTableStatus = (code: number): string => 
  TABLE_STATUS_VALUES[code] ?? 'available';

export const decodeTableShape = (code: number): string =>
  TABLE_SHAPE_VALUES[code] ?? 'square';

export const decodeReservationStatus = (code: number | undefined): string =>
  RESERVATION_STATUS_VALUES[code ?? 0] ?? 'booked';

export const decodeAddressLabel = (code: number): string => 
  ADDRESS_LABEL_VALUES[code] ?? 'Other';

export const decodeDiscountType = (code: number | undefined): string | undefined => 
  code !== undefined ? DISCOUNT_TYPE_VALUES[code] : undefined;

// ─────────────────────────────────────────────────────────────────────────────
// OBJECT DECODERS - Compressed to Full
// ─────────────────────────────────────────────────────────────────────────────

type AnyObject = Record<string, unknown>;

/**
 * Generic field unmapper that expands compressed keys to full names
 */
const unmapFields = <T extends AnyObject>(
  obj: T | undefined | null,
  reverseMap: Record<string, string>,
  valueTransformers?: Record<string, (val: unknown) => unknown>
): AnyObject | undefined => {
  if (!obj) return undefined;
  
  const result: AnyObject = {};
  
  for (const [compressedKey, fullKey] of Object.entries(reverseMap)) {
    if (compressedKey in obj && obj[compressedKey] !== undefined) {
      const value = obj[compressedKey];
      const transformer = valueTransformers?.[fullKey];
      result[fullKey] = transformer ? transformer(value) : value;
    }
  }
  
  // Preserve _id if present
  if ('_id' in obj) {
    result._id = obj._id;
  }
  
  return Object.keys(result).length > 0 ? result : undefined;
};

/**
 * Decode modifier from compressed format
 */
export const decodeModifier = (modifier: AnyObject): AnyObject => {
  return unmapFields(modifier, MODIFIER_FIELD_REVERSE as Record<string, string>) || {};
};

/**
 * Decode order item from compressed format
 */
export const decodeOrderItem = (item: AnyObject): AnyObject => {
  return unmapFields(item, ORDER_ITEM_FIELD_REVERSE as Record<string, string>, {
    status: (v) => decodeItemStatus(v as number),
    modifiers: (v) => (v as AnyObject[])?.map(decodeModifier),
  }) || {};
};

/**
 * Decode applied adjustment from compressed format
 */
export const decodeAppliedAdjustment = (adj: AnyObject): AnyObject => {
  return unmapFields(adj, ADJUSTMENT_FIELD_REVERSE as Record<string, string>, {
    kind: (v) => decodeAdjustmentKind(v as number),
    calcMode: (v) => decodeAdjustmentCalcMode(v as number),
  }) || {};
};

/**
 * Decode payment transaction from compressed format
 */
export const decodeTransaction = (tx: AnyObject): AnyObject => {
  return unmapFields(tx, TRANSACTION_FIELD_REVERSE as Record<string, string>, {
    method: (v) => decodePaymentMethod(v as number),
  }) || {};
};

/**
 * Decode address from compressed format
 */
export const decodeAddress = (address: AnyObject): AnyObject => {
  return unmapFields(address, ADDRESS_FIELD_REVERSE as Record<string, string>, {
    label: (v) => decodeAddressLabel(v as number),
    isDefault: (v) => v === 1,
  }) || {};
};

/**
 * Decode customer info (embedded in order) from compressed format
 */
export const decodeCustomerInfo = (customer: AnyObject): AnyObject => {
  return unmapFields(customer, CUSTOMER_INFO_FIELD_REVERSE as Record<string, string>, {
    address: (v) => decodeAddress(v as AnyObject),
  }) || {};
};

/**
 * Decode table info (embedded in order) from compressed format
 */
export const decodeTableInfo = (table: AnyObject): AnyObject => {
  return unmapFields(table, TABLE_INFO_FIELD_REVERSE as Record<string, string>) || {};
};

/**
 * Decode reservation from compressed format.
 * Legacy rows predate the `st` lifecycle field — they default to 'booked'.
 */
export const decodeReservation = (reservation: AnyObject): AnyObject | undefined => {
  const decoded = unmapFields(reservation, RESERVATION_FIELD_REVERSE as Record<string, string>, {
    status: (v) => decodeReservationStatus(v as number),
  });
  if (decoded && decoded.status === undefined) decoded.status = 'booked';
  return decoded;
};

/**
 * Decode a reservation queue (table.rs → table.reservations)
 */
export const decodeReservations = (list: AnyObject[]): AnyObject[] =>
  (list || []).map((r) => decodeReservation(r) || {});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DOCUMENT DECODERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode compressed order to full format
 */
export const decodeOrder = (order: AnyObject): AnyObject => {
  const decoded = unmapFields(order, ORDER_FIELD_REVERSE as Record<string, string>, {
    mode: (v) => decodeOrderMode(v as number),
    status: (v) => decodeOrderStatus(v as number),
    paymentStatus: (v) => decodePaymentStatus(v as number),
    discountType: (v) => decodeDiscountType(v as number | undefined),
    items: (v) => (v as AnyObject[])?.map(decodeOrderItem),
    adjustments: (v) => (v as AnyObject[])?.map(decodeAppliedAdjustment),
    transactions: (v) => (v as AnyObject[])?.map(decodeTransaction),
    customer: (v) => decodeCustomerInfo(v as AnyObject),
    table: (v) => decodeTableInfo(v as AnyObject),
    isPriority: (v) => v === 1,
    isVoid: (v) => v === 1,
  });
  
  return decoded || {};
};

/**
 * Decode compressed customer to full format
 */
export const decodeCustomer = (customer: AnyObject): AnyObject => {
  const decoded = unmapFields(customer, CUSTOMER_FIELD_REVERSE as Record<string, string>, {
    addresses: (v) => (v as AnyObject[])?.map(decodeAddress),
  });
  
  return decoded || {};
};

/**
 * Decode compressed table to full format
 */
export const decodeTable = (table: AnyObject): AnyObject => {
  const decoded = unmapFields(table, TABLE_FIELD_REVERSE as Record<string, string>, {
    shape: (v) => decodeTableShape(v as number),
    status: (v) => decodeTableStatus(v as number),
    reservations: (v) => decodeReservations(v as AnyObject[]),
    currentReservation: (v) => decodeReservation(v as AnyObject),
    isActive: (v) => v === 1,
  }) || {};

  // Tables written before the reservation queue carry a single `r`. Surface it
  // through the same array the UI reads so no consumer needs a legacy branch —
  // reconcileTableReservations() persists the same lift on the next write.
  const list = decoded.reservations as AnyObject[] | undefined;
  if ((!list || list.length === 0) && decoded.currentReservation) {
    decoded.reservations = [decoded.currentReservation];
  } else if (!list) {
    decoded.reservations = [];
  }

  return decoded;
};

// ─────────────────────────────────────────────────────────────────────────────
// BATCH DECODERS
// ─────────────────────────────────────────────────────────────────────────────

export const decodeOrders = (orders: AnyObject[]): AnyObject[] => orders.map(decodeOrder);
export const decodeCustomers = (customers: AnyObject[]): AnyObject[] => customers.map(decodeCustomer);
export const decodeTables = (tables: AnyObject[]): AnyObject[] => tables.map(decodeTable);

// ─────────────────────────────────────────────────────────────────────────────
// HYBRID DECODERS (detect if already decoded)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-detect if order is compressed and decode if needed
 */
export const autoDecodeOrder = (order: AnyObject): AnyObject => {
  // Check if it's compressed by looking for compressed field names
  if ('m' in order || 's' in order && typeof order.s === 'number') {
    return decodeOrder(order);
  }
  return order;
};

/**
 * Auto-detect if customer is compressed and decode if needed
 */
export const autoDecodeCustomer = (customer: AnyObject): AnyObject => {
  if ('n' in customer && !('name' in customer)) {
    return decodeCustomer(customer);
  }
  return customer;
};

/**
 * Auto-detect if table is compressed and decode if needed
 */
export const autoDecodeTable = (table: AnyObject): AnyObject => {
  if ('tn' in table && !('tableNumber' in table)) {
    return decodeTable(table);
  }
  return table;
};
