// app/api/customers/route.ts
// Customer management API — search, create, list

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { CustomerModel } from '@/models/factories/Customer';
import {
  prepareCustomerForStorage,
  prepareCustomerForResponse,
  prepareCustomersForResponse,
} from '@/lib/compression/api-helpers';

// ─────────────────────────────────────────────────────────────────────────────
// GET — Search / list customers
// Supports: ?q=<search_term> for name/phone fuzzy search
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Customer = CustomerModel(conn);

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.trim();
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

    if (!q) {
      // Return recent customers (for initial display)
      // Note: Using compressed field names lo=lastOrderAt, uAt=updatedAt
      const customers = await Customer.find()
        .sort({ lo: -1, uAt: -1 })
        .limit(limit)
        .lean() as unknown as Record<string, unknown>[];
      return NextResponse.json({ customers: prepareCustomersForResponse(customers) });
    }

    // Build a fuzzy search — match name or phone with regex
    // Note: Using compressed field names n=name, p=phone
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');

    const customers = await Customer.find({
      $or: [
        { n: regex },  // name -> n
        { p: regex },  // phone -> p
      ],
    })
      .sort({ oc: -1, lo: -1 }) // orderCount -> oc, lastOrderAt -> lo
      .limit(limit)
      .lean() as unknown as Record<string, unknown>[];

    return NextResponse.json({ customers: prepareCustomersForResponse(customers) });
  } catch (e) {
    console.error('[Customers API][GET]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Create a new customer
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Customer = CustomerModel(conn);

  try {
    const body = await req.json();
    const { name, phone, email, address } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 });
    }

    // Prepare customer data with compression
    const customerData = prepareCustomerForStorage({
      name: name.trim(),
      phone: phone?.trim() || undefined,
      email: email?.trim() || undefined,
      addresses: address ? [{ ...address, isDefault: true }] : [],
    } as any);

    const customer = await Customer.create(customerData);

    // Return human-readable response
    return NextResponse.json(prepareCustomerForResponse(customer.toObject() as unknown as Record<string, unknown>), { status: 201 });
  } catch (e) {
    console.error('[Customers API][POST]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
