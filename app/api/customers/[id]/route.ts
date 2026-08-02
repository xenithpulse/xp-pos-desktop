// app/api/customers/[id]/route.ts
// Individual customer operations — get, update, add address
// Uses compressed field names for storage efficiency

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { CustomerModel } from '@/models/factories/Customer';

// Label mappings: string -> numeric code
const LABEL_CODES: Record<string, number> = { Home: 0, Office: 1, Other: 2 };

// ─────────────────────────────────────────────────────────────────────────────
// GET — Fetch a single customer by ID
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Customer = CustomerModel(conn);
  const { id } = await params;

  try {
    const customer = await Customer.findById(id).lean();
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    return NextResponse.json(customer);
  } catch (e) {
    console.error('[Customers API][GET/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — Update customer details or manage addresses
// Actions: update_info | add_address | update_address | remove_address | increment_stats
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Customer = CustomerModel(conn);
  const { id } = await params;

  try {
    const body = await req.json();
    const { action } = body;

    const customer = await Customer.findById(id);
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    switch (action) {
      case 'update_info': {
        // Compressed: n=name, p=phone, e=email, nt=notes
        if (body.name) customer.n = body.name.trim();
        if (body.phone !== undefined) customer.p = body.phone?.trim() || undefined;
        if (body.email !== undefined) customer.e = body.email?.trim() || undefined;
        if (body.notes !== undefined) customer.nt = body.notes;
        break;
      }

      case 'add_address': {
        const addr = body.address;
        if (!addr?.line1) {
          return NextResponse.json({ error: 'Address line1 is required' }, { status: 400 });
        }
        // If this is set as default, unset existing defaults
        // Compressed: id = isDefault (0=false, 1=true)
        if (addr.isDefault) {
          customer.a.forEach((a: { id: number }) => { a.id = 0; });
        }
        // Compressed address fields: l=label, l1=line1, l2=line2, c=city, pc=postalCode, in=instructions, id=isDefault
        customer.a.push({
          l: LABEL_CODES[addr.label] ?? 0,        // label (0=Home, 1=Office, 2=Other)
          l1: addr.line1,                          // line1
          l2: addr.line2,                          // line2
          c: addr.city,                            // city
          pc: addr.postalCode,                     // postalCode
          in: addr.instructions,                   // instructions
          id: addr.isDefault ? 1 : (customer.a.length === 0 ? 1 : 0), // isDefault
        });
        break;
      }

      case 'update_address': {
        const { addressId, ...addrUpdates } = body.address || {};
        if (!addressId) {
          return NextResponse.json({ error: 'addressId is required' }, { status: 400 });
        }
        const addr = (customer.a as any).id(addressId);
        if (!addr) {
          return NextResponse.json({ error: 'Address not found' }, { status: 404 });
        }
        // Compressed: l=label, l1=line1, l2=line2, c=city, pc=postalCode, in=instructions, id=isDefault
        if (addrUpdates.label !== undefined) addr.l = LABEL_CODES[addrUpdates.label] ?? addr.l;
        if (addrUpdates.line1 !== undefined) addr.l1 = addrUpdates.line1;
        if (addrUpdates.line2 !== undefined) addr.l2 = addrUpdates.line2;
        if (addrUpdates.city !== undefined) addr.c = addrUpdates.city;
        if (addrUpdates.postalCode !== undefined) addr.pc = addrUpdates.postalCode;
        if (addrUpdates.instructions !== undefined) addr.in = addrUpdates.instructions;
        if (addrUpdates.isDefault) {
          customer.a.forEach((a: { id: number }) => { a.id = 0; });
          addr.id = 1;
        }
        break;
      }

      case 'remove_address': {
        const { addressId } = body;
        if (!addressId) {
          return NextResponse.json({ error: 'addressId is required' }, { status: 400 });
        }
        (customer.a as any).pull({ _id: addressId });
        break;
      }

      case 'increment_stats': {
        // Called after order completion to update customer stats
        // Compressed: oc=orderCount, ts=totalSpent, lo=lastOrderAt
        if (body.orderTotal && typeof body.orderTotal === 'number') {
          customer.oc += 1;
          customer.ts += body.orderTotal;
          customer.lo = new Date();
        }
        break;
      }

      default: {
        // Generic field update (no action specified)
        // Compressed: n=name, p=phone, e=email, nt=notes
        if (body.name) customer.n = body.name.trim();
        if (body.phone !== undefined) customer.p = body.phone?.trim() || undefined;
        if (body.email !== undefined) customer.e = body.email?.trim() || undefined;
        if (body.notes !== undefined) customer.nt = body.notes;
        break;
      }
    }

    await customer.save();
    return NextResponse.json(customer);
  } catch (e) {
    console.error('[Customers API][PATCH/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
