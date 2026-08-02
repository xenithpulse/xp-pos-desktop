// app/api/pos/takeaway/route.ts
// Takeaway order management — create draft order linked to a customer
// Uses compressed field names for storage efficiency

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { AdminModel } from '@/models/factories/Admin';
import { isAdminRequest, getSession } from '@/lib/auth';
import { OrderModel, generateOrderNumber } from '@/models/factories/Order';
import { CustomerModel } from '@/models/factories/Customer';
import { broadcastEvent } from '@/lib/realtime/eventBus';
import { prepareOrdersForResponse, prepareOrderForResponse, prepareCustomerForResponse } from '@/lib/compression/api-helpers';

// Mode/status mappings
const MODE_TAKEAWAY = 1;
const STATUS_DRAFT = 0;
const PAYMENT_PENDING = 0;
const STATUS_NAMES = ['draft', 'confirmed', 'preparing', 'ready', 'served', 'out_for_delivery', 'completed', 'cancelled'];

// ─────────────────────────────────────────────────────────────────────────────
// POST — Create a new takeaway draft order linked to a customer
// Body: { customerId: string }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const authSession = await getSession();
  const staffId = authSession?.user?.id;
  if (!staffId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);
  const Customer = CustomerModel(conn);

  try {
    const { customerId } = await request.json();

    if (!customerId) {
      return NextResponse.json({ error: 'customerId is required' }, { status: 400 });
    }

    // Verify customer exists
    const customer = await Customer.findById(customerId).lean();
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Find default address (compressed: a=addresses, id=isDefault)
    const defaultAddr = customer.a?.find((a: { id: number }) => a.id === 1)
      || customer.a?.[0];

    const orderNumber = await generateOrderNumber(conn);

    // Create order with compressed field names
    const order = await Order.create({
      on: orderNumber,           // orderNumber
      m: MODE_TAKEAWAY,          // mode: takeaway
      s: STATUS_DRAFT,           // status: draft
      ps: PAYMENT_PENDING,       // paymentStatus: pending
      i: [],                     // items
      st: 0,                     // subtotal
      tr: 0,                     // taxRate
      ta: 0,                     // taxAmount
      gt: 0,                     // grandTotal
      ci: customerId,            // customerId
      cu: {                      // customer info (compressed: n=name, p=phone, e=email)
        n: customer.n,           // name
        p: customer.p,           // phone
        e: customer.e,           // email
        a: defaultAddr
          ? {
              l1: defaultAddr.l1,   // line1
              l2: defaultAddr.l2,   // line2
              c: defaultAddr.c,     // city
              pc: defaultAddr.pc,   // postalCode
              in: defaultAddr.in,   // instructions
            }
          : undefined,
      },
      cb: staffId,               // createdBy
    });

    broadcastEvent({
      type: 'order:updated',
      entityId: order._id.toString(),
      __v: (order as any).__v,
      payload: {
        action: 'created',
        orderNumber,
        mode: 'takeaway',
        status: 'draft',
        grandTotal: 0,
        subtotal: 0,
      },
      timestamp: Date.now(),
    });

    // Transform compressed data to human-readable format
    const humanReadableOrder = prepareOrderForResponse(order.toObject() as unknown as Record<string, unknown>);
    const humanReadableCustomer = prepareCustomerForResponse(customer as unknown as Record<string, unknown>);

    return NextResponse.json({
      order: humanReadableOrder,
      customer: humanReadableCustomer,
    }, { status: 201 });
  } catch (e: any) {
    console.error('[Takeaway API][POST]', e);
    return NextResponse.json(
      { message: 'Failed to create takeaway order', error: e.message },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — List active takeaway orders (for the order switcher)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);

  try {
    // Query with compressed field names
    // m:1 = takeaway, s: 0-3 = draft/confirmed/preparing/ready, iv:1 = voided
    const orders = await Order.find({
      m: MODE_TAKEAWAY,
      s: { $in: [0, 1, 2, 3] },     // draft, confirmed, preparing, ready
      iv: { $ne: 1 },               // not voided
    })
      .sort({ cAt: -1 })            // createdAt
      .populate('cb', 'username')   // createdBy
      .lean();

    // Transform compressed orders to human-readable format
    const humanReadableOrders = prepareOrdersForResponse(orders as unknown as Record<string, unknown>[]);

    return NextResponse.json({ orders: humanReadableOrders });
  } catch (e) {
    console.error('[Takeaway API][GET]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
