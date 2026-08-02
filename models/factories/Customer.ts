// models/factories/Customer.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Compressed Customer Model Factory
// Uses compressed field names for efficient storage and network payloads
// ═══════════════════════════════════════════════════════════════════════════════

import { Connection, Model } from 'mongoose';
import { CompressedCustomerSchema, ICompressedCustomer } from '../schemas/customer.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Model Factory - Connection-based instantiation
// ─────────────────────────────────────────────────────────────────────────────

export function CompressedCustomerModel(conn: Connection): Model<ICompressedCustomer> {
  return (
    conn.models.Customer ||
    conn.model<ICompressedCustomer>('Customer', CompressedCustomerSchema)
  );
}

// Alias for backward compatibility with existing imports
export const CustomerModel = CompressedCustomerModel;

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Update customer statistics after order
// Field mappings: oc = orderCount, ts = totalSpent, lo = lastOrderAt
// ─────────────────────────────────────────────────────────────────────────────

export async function updateCustomerStats(
  conn: Connection,
  customerId: string,
  orderTotal: number
): Promise<void> {
  const Customer = CompressedCustomerModel(conn);
  
  await Customer.findByIdAndUpdate(customerId, {
    $inc: { oc: 1, ts: orderTotal },
    $set: { lo: new Date() },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Search customers by name or phone
// Field mappings: n = name, p = phone
// ─────────────────────────────────────────────────────────────────────────────

export async function searchCustomers(
  conn: Connection,
  query: string,
  limit: number = 10
): Promise<ICompressedCustomer[]> {
  const Customer = CompressedCustomerModel(conn);
  
  // Try phone search first (exact match prefix)
  const phoneResults = await Customer.find({
    p: { $regex: `^${query}`, $options: 'i' }
  }).limit(limit).lean();
  
  if (phoneResults.length >= limit) {
    return phoneResults;
  }
  
  // Fill remaining with name search
  const remaining = limit - phoneResults.length;
  const phoneIds = phoneResults.map(c => c._id);
  
  const nameResults = await Customer.find({
    _id: { $nin: phoneIds },
    n: { $regex: query, $options: 'i' }
  }).limit(remaining).lean();
  
  return [...phoneResults, ...nameResults];
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get or create customer by phone
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrCreateCustomer(
  conn: Connection,
  data: { n: string; p?: string; e?: string }
): Promise<ICompressedCustomer> {
  const Customer = CompressedCustomerModel(conn);
  
  if (data.p) {
    const existing = await Customer.findOne({ p: data.p });
    if (existing) return existing;
  }
  
  return Customer.create({
    n: data.n,
    p: data.p,
    e: data.e,
    a: [],
    oc: 0,
    ts: 0,
  });
}
