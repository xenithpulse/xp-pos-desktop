// app/api/orders/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { ORDER_WORKSPACE_PERMS, ORDER_READ_PERMS } from '@/types/admin.types';
import { OrderModel, generateOrderNumber } from '@/models/factories/Order';
import { 
  IOrder, 
  OrderMode, 
  OrderStatus, 
  PaymentStatus 
} from '@/models/schemas/order.schema';
import { AdminModel } from '@/models/factories/Admin';
import { broadcastEvent } from '@/lib/realtime/eventBus';
import {
  prepareOrderForStorage,
  prepareOrderForResponse,
  prepareOrdersForResponse,
  buildCompressedOrderQuery,
} from '@/lib/compression/api-helpers';

const log = console.log;

// ─────────────────────────────────────────────────────────────────────────────
// GET - Retrieve orders with optional filters
// ─────────────────────────────────────────────────────────────────────────────

// Wider than POST below: the kitchen display reads this queue, and a chef
// holds view_kitchen rather than any order permission. See ORDER_READ_PERMS.
export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ anyPerm: ORDER_READ_PERMS });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);
  const Admin = AdminModel(conn);
  void Admin; // registered for populate side-effects

  try {
    const { searchParams } = new URL(req.url);
    
    // Build filter query from search params
    const filter: Record<string, unknown> = {};
    
    const status = searchParams.get('status');
    if (status) filter.status = status;
    
    const mode = searchParams.get('mode');
    if (mode) filter.mode = mode;
    
    const paymentStatus = searchParams.get('paymentStatus');
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    
    const tableNumber = searchParams.get('tableNumber');
    if (tableNumber) filter['table.tableNumber'] = tableNumber;
    
    const isPriority = searchParams.get('isPriority');
    if (isPriority === 'true') filter.isPriority = true;
    
    // Date range filter
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    if (dateFrom || dateTo) {
      filter.createdAt = {};
      if (dateFrom) (filter.createdAt as Record<string, Date>).$gte = new Date(dateFrom);
      if (dateTo) (filter.createdAt as Record<string, Date>).$lte = new Date(dateTo);
    }
    
    // Exclude voided orders by default
    const includeVoid = searchParams.get('includeVoid');
    if (includeVoid !== 'true') {
      filter.isVoid = { $ne: true };
    }
    
    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const skip = (page - 1) * limit;
    
    // Active orders only (for real-time view)
    const activeOnly = searchParams.get('activeOnly');
    if (activeOnly === 'true') {
      filter.status = { 
        $in: ['draft', 'confirmed', 'preparing', 'ready', 'served', 'out_for_delivery'] 
      };
    }

    // Convert human-readable filter to compressed query
    const compressedFilter = buildCompressedOrderQuery(filter);
    
    const [orders, total] = await Promise.all([
      Order.find(compressedFilter)
        .sort({ ip: -1, cAt: -1 }) // isPriority, createdAt in compressed format
        .skip(skip)
        .limit(limit)
        .populate('cb', 'username') // createdBy
        .populate('sb', 'username') // servedBy
        .lean() as unknown as Record<string, unknown>[],
      Order.countDocuments(compressedFilter),
    ]);

    // Decode orders for API response
    return NextResponse.json({
      orders: prepareOrdersForResponse(orders),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    }, { status: 200 });
  } catch (e) {
    log('[Orders API][GET]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST - Create a new order
// ─────────────────────────────────────────────────────────────────────────────

// Human-readable payload for API (will be converted to compressed format)
interface CreateOrderPayload {
  mode: OrderMode;
  items: any[];  // Human-readable item format
  table?: { tableId?: string; tableNumber: string; sectionName?: string; guestCount?: number };
  customer?: { name?: string; phone?: string; email?: string; address?: any };
  taxRate?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  serviceCharge?: number;
  deliveryFee?: number;
  kitchenNotes?: string;
  internalNotes?: string;
  isPriority?: boolean;
  estimatedReadyTime?: string;
  createdBy: string;
}

export async function POST(req: NextRequest) {
  // `license: 'write'` is on the CREATE path only. An unlicensed box goes
  // read-only, and read-only for a restaurant means "no new orders" - the
  // fifteen tables already mid-meal must still be editable, payable and
  // printable, so PATCH/PUT on an existing order is deliberately not gated.
  const authResult = await isAdminRequest({ anyPerm: ORDER_WORKSPACE_PERMS, license: 'write' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);
  const Admin = AdminModel(conn);
  void Admin; // registered for populate side-effects

  try {
    const payload: CreateOrderPayload = await req.json();

    // Validate required fields
    if (!payload.mode) {
      return NextResponse.json(
        { message: 'Order mode is required' },
        { status: 400 }
      );
    }

    if (!payload.items || payload.items.length === 0) {
      return NextResponse.json(
        { message: 'At least one item is required' },
        { status: 400 }
      );
    }

    if (!payload.createdBy) {
      return NextResponse.json(
        { message: 'createdBy (admin ID) is required' },
        { status: 400 }
      );
    }

    // Validate dine-in requires table
    if (payload.mode === 'dine_in' && !payload.table?.tableNumber) {
      return NextResponse.json(
        { message: 'Table number is required for dine-in orders' },
        { status: 400 }
      );
    }

    // Validate delivery requires customer info
    if (payload.mode === 'delivery' && !payload.customer?.address?.line1) {
      return NextResponse.json(
        { message: 'Delivery address is required for delivery orders' },
        { status: 400 }
      );
    }

    // Generate unique order number
    const orderNumber = await generateOrderNumber(conn);

    // Prepare order data with compression
    const orderData = prepareOrderForStorage({
      orderNumber,
      mode: payload.mode,
      status: 'draft',
      paymentStatus: 'pending',
      items: payload.items,
      table: payload.table,
      customer: payload.customer,
      taxRate: payload.taxRate || 0,
      discountType: payload.discountType,
      discountValue: payload.discountValue,
      serviceCharge: payload.serviceCharge,
      deliveryFee: payload.mode === 'delivery' ? (payload.deliveryFee || 0) : undefined,
      kitchenNotes: payload.kitchenNotes,
      internalNotes: payload.internalNotes,
      isPriority: payload.isPriority || false,
      estimatedReadyTime: payload.estimatedReadyTime 
        ? new Date(payload.estimatedReadyTime) 
        : undefined,
      createdBy: payload.createdBy,
    } as any);

    const order = await Order.create(orderData);
    
    // Decode for response and broadcast
    const decodedOrder = prepareOrderForResponse(order.toObject() as unknown as Record<string, unknown>);

    // Broadcast a decoded summary (NOT the compressed order) — small payload,
    // and the hub's rich-payload patching reads long field names.
    broadcastEvent({
      type: 'order:updated',
      entityId: order._id.toString(),
      __v: (order as any).__v,
      payload: {
        orderNumber,
        status: 'draft',
        paymentStatus: 'pending',
        grandTotal: (order as any).gt,
        subtotal: (order as any).st,
        amountDue: (order as any).ad,
        itemCount: (order as any).i?.length,
        tableId: (order as any).tb?.ti?.toString(),
        tableNumber: (order as any).tb?.tn,
        action: 'created',
      },
      timestamp: Date.now(),
    });

    // Return human-readable response
    return NextResponse.json(decodedOrder, { status: 201 });
  } catch (e) {
    log('[Orders API][POST]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET Statistics - Summary counts for dashboard
// ─────────────────────────────────────────────────────────────────────────────

export async function statsHandler(req: NextRequest) {
  const authResult = await isAdminRequest({ anyPerm: ORDER_WORKSPACE_PERMS });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);
  const Admin = AdminModel(conn);
  void Admin; // registered for populate side-effects
  
  try {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    // Compressed field codes
    const ACTIVE_STATUSES = [0, 1, 2, 3, 4, 5]; // draft, confirmed, preparing, ready, served, out_for_delivery
    const PENDING_PAYMENT = [0, 2]; // pending, partial (paymentStatus)
    const CANCELLED_STATUS = 7;
    
    const [
      activeOrders,
      todayOrders,
      pendingPayments,
      byMode,
      byStatus,
    ] = await Promise.all([
      // Active orders count (s=status, iv=isVoid)
      Order.countDocuments({
        s: { $in: ACTIVE_STATUSES },
        iv: { $ne: 1 },
      }),
      // Today's orders count (cAt=createdAt)
      Order.countDocuments({
        cAt: { $gte: startOfDay },
        iv: { $ne: 1 },
      }),
      // Pending payment orders (ps=paymentStatus)
      Order.countDocuments({
        ps: { $in: PENDING_PAYMENT },
        s: { $ne: CANCELLED_STATUS },
        iv: { $ne: 1 },
      }),
      // Group by mode (m=mode)
      Order.aggregate([
        { $match: { cAt: { $gte: startOfDay }, iv: { $ne: 1 } } },
        { $group: { _id: '$m', count: { $sum: 1 } } },
      ]),
      // Group by status
      Order.aggregate([
        { 
          $match: { 
            s: { $in: ACTIVE_STATUSES },
            iv: { $ne: 1 },
          } 
        },
        { $group: { _id: '$s', count: { $sum: 1 } } },
      ]),
    ]);

    // Convert numeric codes back to human-readable names for response
    const STATUS_NAMES = ['draft', 'confirmed', 'preparing', 'ready', 'served', 'out_for_delivery', 'completed', 'cancelled'];
    const MODE_NAMES = ['dine_in', 'takeaway', 'delivery', 'drive_thru', 'curbside'];

    return NextResponse.json({
      activeOrders,
      todayOrders,
      pendingPayments,
      byMode: Object.fromEntries(byMode.map(m => [MODE_NAMES[m._id] || m._id, m.count])),
      byStatus: Object.fromEntries(byStatus.map(s => [STATUS_NAMES[s._id] || s._id, s.count])),
    }, { status: 200 });
  } catch (e) {
    log('[Orders API][Stats]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
