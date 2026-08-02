// lib/compression/api-helpers.ts
// ═══════════════════════════════════════════════════════════════════════════════
// API-Level Compression Helpers
// Use these in API routes and realtime sync to convert between formats
// ═══════════════════════════════════════════════════════════════════════════════

import { 
  encodeOrder, 
  encodeCustomer, 
  encodeTable, 
  encodeOrders, 
  encodeCustomers, 
  encodeTables,
  encodeOrderUpdate,
  encodeCustomerUpdate,
  encodeTableUpdate,
} from './encoders';

import { 
  decodeOrder, 
  decodeCustomer, 
  decodeTable, 
  decodeOrders, 
  decodeCustomers, 
  decodeTables,
  autoDecodeOrder,
  autoDecodeCustomer,
  autoDecodeTable,
} from './decoders';

import type {
  CompressedOrder,
  CompressedCustomer,
  CompressedTable,
  HumanReadableOrder,
  HumanReadableCustomer,
  HumanReadableTable,
} from './types';

type AnyObject = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// API REQUEST HELPERS (Human → Compressed for DB storage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prepare order data from API request for database storage
 * Converts human-readable fields to compressed format
 */
export const prepareOrderForStorage = (
  orderData: Partial<HumanReadableOrder>
): AnyObject => {
  return encodeOrder(orderData as AnyObject);
};

/**
 * Prepare customer data from API request for database storage
 */
export const prepareCustomerForStorage = (
  customerData: Partial<HumanReadableCustomer>
): AnyObject => {
  return encodeCustomer(customerData as AnyObject);
};

/**
 * Prepare table data from API request for database storage
 */
export const prepareTableForStorage = (
  tableData: Partial<HumanReadableTable>
): AnyObject => {
  return encodeTable(tableData as AnyObject);
};

// ─────────────────────────────────────────────────────────────────────────────
// API RESPONSE HELPERS (Compressed → Human for API responses)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert compressed order from DB to human-readable format for API response
 */
export const prepareOrderForResponse = (
  order: CompressedOrder | AnyObject | null
): HumanReadableOrder | null => {
  if (!order) return null;
  return decodeOrder(order as AnyObject) as unknown as HumanReadableOrder;
};

/**
 * Convert compressed customer from DB to human-readable format for API response
 */
export const prepareCustomerForResponse = (
  customer: CompressedCustomer | AnyObject | null
): HumanReadableCustomer | null => {
  if (!customer) return null;
  return decodeCustomer(customer as AnyObject) as unknown as HumanReadableCustomer;
};

/**
 * Convert compressed table from DB to human-readable format for API response
 */
export const prepareTableForResponse = (
  table: CompressedTable | AnyObject | null
): HumanReadableTable | null => {
  if (!table) return null;
  return decodeTable(table as AnyObject) as unknown as HumanReadableTable;
};

// ─────────────────────────────────────────────────────────────────────────────
// BATCH HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert multiple compressed orders to human-readable format
 */
export const prepareOrdersForResponse = (
  orders: (CompressedOrder | AnyObject)[]
): HumanReadableOrder[] => {
  return decodeOrders(orders as AnyObject[]) as unknown as HumanReadableOrder[];
};

/**
 * Convert multiple compressed customers to human-readable format
 */
export const prepareCustomersForResponse = (
  customers: (CompressedCustomer | AnyObject)[]
): HumanReadableCustomer[] => {
  return decodeCustomers(customers as AnyObject[]) as unknown as HumanReadableCustomer[];
};

/**
 * Convert multiple compressed tables to human-readable format
 */
export const prepareTablesForResponse = (
  tables: (CompressedTable | AnyObject)[]
): HumanReadableTable[] => {
  return decodeTables(tables as AnyObject[]) as unknown as HumanReadableTable[];
};

// ─────────────────────────────────────────────────────────────────────────────
// UPDATE HELPERS (for PATCH operations)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prepare partial order update for database
 */
export const prepareOrderUpdateForStorage = (
  update: Partial<HumanReadableOrder>
): AnyObject => {
  return encodeOrderUpdate(update as AnyObject);
};

/**
 * Prepare partial customer update for database
 */
export const prepareCustomerUpdateForStorage = (
  update: Partial<HumanReadableCustomer>
): AnyObject => {
  return encodeCustomerUpdate(update as AnyObject);
};

/**
 * Prepare partial table update for database
 */
export const prepareTableUpdateForStorage = (
  update: Partial<HumanReadableTable>
): AnyObject => {
  return encodeTableUpdate(update as AnyObject);
};

// ─────────────────────────────────────────────────────────────────────────────
// REALTIME SYNC HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Prepare order for realtime broadcast (stays compressed for efficiency)
 * The client will decode it
 */
export const prepareOrderForBroadcast = (
  order: AnyObject
): CompressedOrder => {
  // If already compressed, return as-is
  if ('m' in order && typeof order.m === 'number') {
    return order as unknown as CompressedOrder;
  }
  // Otherwise compress it
  return encodeOrder(order) as unknown as CompressedOrder;
};

/**
 * Prepare table for realtime broadcast (stays compressed for efficiency)
 */
export const prepareTableForBroadcast = (
  table: AnyObject
): CompressedTable => {
  if ('tn' in table && 's' in table && typeof table.s === 'number') {
    return table as unknown as CompressedTable;
  }
  return encodeTable(table) as unknown as CompressedTable;
};

/**
 * Prepare customer for realtime broadcast (stays compressed for efficiency)
 */
export const prepareCustomerForBroadcast = (
  customer: AnyObject
): CompressedCustomer => {
  if ('n' in customer && !('name' in customer)) {
    return customer as unknown as CompressedCustomer;
  }
  return encodeCustomer(customer) as unknown as CompressedCustomer;
};

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT-SIDE HELPERS (for use in browser/React)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Auto-detect and decode order (safe to call on already-decoded data)
 */
export const ensureOrderDecoded = (
  order: CompressedOrder | HumanReadableOrder | AnyObject
): HumanReadableOrder => {
  return autoDecodeOrder(order as AnyObject) as unknown as HumanReadableOrder;
};

/**
 * Auto-detect and decode customer (safe to call on already-decoded data)
 */
export const ensureCustomerDecoded = (
  customer: CompressedCustomer | HumanReadableCustomer | AnyObject
): HumanReadableCustomer => {
  return autoDecodeCustomer(customer as AnyObject) as unknown as HumanReadableCustomer;
};

/**
 * Auto-detect and decode table (safe to call on already-decoded data)
 */
export const ensureTableDecoded = (
  table: CompressedTable | HumanReadableTable | AnyObject
): HumanReadableTable => {
  return autoDecodeTable(table as AnyObject) as unknown as HumanReadableTable;
};

// ─────────────────────────────────────────────────────────────────────────────
// MONGODB QUERY HELPERS
// ─────────────────────────────────────────────────────────────────────────────

import {
  ORDER_MODE_CODES,
  ORDER_STATUS_CODES,
  PAYMENT_STATUS_CODES,
  PAYMENT_METHOD_CODES,
  TABLE_STATUS_CODES,
  TABLE_SHAPE_CODES,
} from './index';

/**
 * Helper to convert a value or MongoDB operator to compressed form
 * Handles: single value, { $in: [...] }, { $ne: value }, { $nin: [...] }, etc.
 */
const convertValueOrOperator = (
  value: unknown,
  codeMap?: Record<string, number>,
  isBoolean?: boolean
): unknown => {
  if (value === null || value === undefined) return value;

  // Handle MongoDB operators
  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const [op, opValue] of Object.entries(obj)) {
      if (op.startsWith('$')) {
        // Convert operator values
        if (op === '$in' || op === '$nin') {
          // Array operators
          if (Array.isArray(opValue)) {
            result[op] = opValue.map((v) => {
              if (isBoolean) return v ? 1 : 0;
              if (codeMap && typeof v === 'string') return codeMap[v] ?? v;
              return v;
            });
          } else {
            result[op] = opValue;
          }
        } else if (op === '$ne' || op === '$eq' || op === '$gt' || op === '$gte' || op === '$lt' || op === '$lte') {
          // Single value operators
          if (isBoolean) {
            result[op] = opValue ? 1 : 0;
          } else if (codeMap && typeof opValue === 'string') {
            result[op] = codeMap[opValue] ?? opValue;
          } else {
            result[op] = opValue;
          }
        } else {
          // Pass through other operators unchanged
          result[op] = opValue;
        }
      } else {
        // Not an operator, pass through
        result[op] = opValue;
      }
    }
    return result;
  }

  // Handle array value (for $in shorthand)
  if (Array.isArray(value)) {
    return value.map((v) => {
      if (isBoolean) return v ? 1 : 0;
      if (codeMap && typeof v === 'string') return codeMap[v] ?? v;
      return v;
    });
  }

  // Handle single value
  if (isBoolean) return value ? 1 : 0;
  if (codeMap && typeof value === 'string') return codeMap[value] ?? value;
  return value;
};

/**
 * Build compressed MongoDB query from human-readable filter
 * Example: { mode: 'dine_in', status: 'preparing' } → { m: 0, s: 2 }
 * Also handles operators: { status: { $in: ['draft', 'confirmed'] } } → { s: { $in: [0, 1] } }
 */
export const buildCompressedOrderQuery = (
  filter: Partial<Record<string, unknown>>
): Record<string, unknown> => {
  const query: Record<string, unknown> = {};

  if (filter.mode !== undefined) {
    query.m = convertValueOrOperator(filter.mode, ORDER_MODE_CODES as unknown as Record<string, number>);
  }
  if (filter.status !== undefined) {
    query.s = convertValueOrOperator(filter.status, ORDER_STATUS_CODES as unknown as Record<string, number>);
  }
  if (filter.paymentStatus !== undefined) {
    query.ps = convertValueOrOperator(filter.paymentStatus, PAYMENT_STATUS_CODES as unknown as Record<string, number>);
  }
  if (filter.orderNumber !== undefined) {
    query.on = filter.orderNumber;
  }
  if (filter.customerId !== undefined) {
    query.ci = filter.customerId;
  }
  if (filter.sessionId !== undefined) {
    query.sid = filter.sessionId;
  }
  if (filter.createdBy !== undefined) {
    query.cb = filter.createdBy;
  }
  if (filter.waiterId !== undefined) {
    query.wi = filter.waiterId;
  }
  if (filter.isPriority !== undefined) {
    query.ip = convertValueOrOperator(filter.isPriority, undefined, true);
  }
  if (filter.isVoid !== undefined) {
    query.iv = convertValueOrOperator(filter.isVoid, undefined, true);
  }
  if (filter['table.tableNumber'] !== undefined) {
    query['tb.tn'] = filter['table.tableNumber'];
  }
  // Pass through date filters as-is (field name stays same: createdAt → cAt)
  if (filter.createdAt !== undefined) {
    query.cAt = filter.createdAt;
  }
  if (filter.updatedAt !== undefined) {
    query.uAt = filter.updatedAt;
  }

  return query;
};

/**
 * Build compressed MongoDB query for tables
 * Handles operators like { $in: [...] }, { $ne: value }, etc.
 */
export const buildCompressedTableQuery = (
  filter: Partial<Record<string, unknown>>
): Record<string, unknown> => {
  const query: Record<string, unknown> = {};

  if (filter.status !== undefined) {
    query.s = convertValueOrOperator(filter.status, TABLE_STATUS_CODES as unknown as Record<string, number>);
  }
  if (filter.shape !== undefined) {
    query.sh = convertValueOrOperator(filter.shape, TABLE_SHAPE_CODES as unknown as Record<string, number>);
  }
  if (filter.tableNumber !== undefined) {
    query.tn = filter.tableNumber;
  }
  if (filter.sectionId !== undefined) {
    query.si = filter.sectionId;
  }
  if (filter.isActive !== undefined) {
    query.ia = convertValueOrOperator(filter.isActive, undefined, true);
  }
  if (filter.activeSessionId !== undefined) {
    query.as = filter.activeSessionId;
  }
  // Pass through date filters
  if (filter.createdAt !== undefined) {
    query.cAt = filter.createdAt;
  }
  if (filter.updatedAt !== undefined) {
    query.uAt = filter.updatedAt;
  }

  return query;
};

/**
 * Build compressed MongoDB query for customers
 */
export const buildCompressedCustomerQuery = (
  filter: Partial<Record<string, unknown>>
): Record<string, unknown> => {
  const query: Record<string, unknown> = {};
  
  if (filter.name !== undefined) {
    query.n = filter.name;
  }
  if (filter.phone !== undefined) {
    query.p = filter.phone;
  }
  if (filter.email !== undefined) {
    query.e = filter.email;
  }
  
  return query;
};

// ─────────────────────────────────────────────────────────────────────────────
// SORT FIELD MAPPING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert human-readable sort field to compressed field
 */
export const getCompressedSortField = (
  collection: 'order' | 'customer' | 'table',
  field: string
): string => {
  const orderSortMap: Record<string, string> = {
    orderNumber: 'on',
    mode: 'm',
    status: 's',
    paymentStatus: 'ps',
    grandTotal: 'gt',
    createdAt: 'cAt',
    updatedAt: 'uAt',
  };
  
  const customerSortMap: Record<string, string> = {
    name: 'n',
    phone: 'p',
    orderCount: 'oc',
    totalSpent: 'ts',
    lastOrderAt: 'lo',
    createdAt: 'cAt',
    updatedAt: 'uAt',
  };
  
  const tableSortMap: Record<string, string> = {
    tableNumber: 'tn',
    status: 's',
    capacity: 'c',
    sortOrder: 'so',
    createdAt: 'cAt',
    updatedAt: 'uAt',
  };
  
  switch (collection) {
    case 'order':
      return orderSortMap[field] || field;
    case 'customer':
      return customerSortMap[field] || field;
    case 'table':
      return tableSortMap[field] || field;
    default:
      return field;
  }
};
