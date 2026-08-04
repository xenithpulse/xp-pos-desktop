// app/api/pos/fire-order/route.ts
// Fire pending items to the kitchen - transitions items from cart to order

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest, getSession } from '@/lib/auth';
import { OrderModel } from '@/models/factories/Order';
import { TableModel } from '@/models/factories/Table';
import { TableSessionModel } from '@/models/factories/TableSession';
import { Types } from 'mongoose';
import { isVersionConflict, versionConflictBody } from '@/lib/concurrency';
import { broadcastEvent } from '@/lib/realtime/eventBus';
import { isWhatsAppConfigured, sendWhatsAppMessage } from '@/lib/whatsapp';
import { isWhatsAppEntitled } from '@/lib/entitlements/status';

const log = console.log;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FiredItem {
  menuItemId: string;
  name: string;
  shortName?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  modifiers: {
    groupId: string;
    groupName: string;
    optionId: string;
    optionName: string;
    priceAdjustment: number;
  }[];
  specialInstructions?: string;
  taxRate: number;
}

interface FireOrderRequest {
  orderId: string;
  items: FiredItem[];
  sessionId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST - Fire items to the kitchen
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
  const TableSession = TableSessionModel(conn);

  // Start a transaction for atomic updates
  const mongoSession = await conn.startSession();
  mongoSession.startTransaction();

  try {
    const data: FireOrderRequest = await request.json();

    if (!data.orderId || !data.items || data.items.length === 0) {
      return NextResponse.json(
        { error: 'orderId and items are required' },
        { status: 400 }
      );
    }

    // 1. Get the order
    const order = await Order.findById(data.orderId).session(mongoSession);
    if (!order) {
      throw new Error('Order not found');
    }

    // ── Session-isolation guard ───────────────────────────────────────────
    // Verify that the order's session matches the table's current active
    // session. This prevents firing items to a stale order after the table
    // has been re-seated with a new session.
    // Using compressed field names: tb=table, ti=tableId, as=activeSessionId
    if (data.sessionId && order.tb?.ti) {
      const Table = TableModel(conn);
      const table = await Table.findById(order.tb.ti).session(mongoSession);
      if (table && table.as) {
        const activeId = table.as.toString();
        const requestedId = data.sessionId.toString();
        if (activeId !== requestedId) {
          throw new Error(
            'SESSION_MISMATCH: Table has been re-seated with a new session. ' +
            'Please refresh and try again.'
          );
        }
      }
    }

    // 2. Convert cart items to order items (using compressed field names)
    // ii=itemId, n=name, q=quantity, up=unitPrice, md=modifiers, si=specialInstructions, st=subtotal, s=status
    const ITEM_STATUS = { pending: 0, preparing: 1, ready: 2, served: 3, cancelled: 4 };
    const newItems = data.items.map((item) => ({
      ii: new Types.ObjectId(item.menuItemId),
      n: item.name,
      q: item.quantity,
      up: item.unitPrice,
      md: item.modifiers.map((mod) => ({
        n: `${mod.groupName}: ${mod.optionName}`,
        p: mod.priceAdjustment,
      })),
      si: item.specialInstructions,
      st: item.totalPrice,
      s: ITEM_STATUS.pending,
    }));

    // 3. Add items to order (i=items)
    order.i.push(...newItems);

    // 4. Update order status if it's a draft → confirmed
    // s=status, 0=draft, 1=confirmed
    const justConfirmed = order.s === 0;
    if (justConfirmed) {
      order.s = 1;  // confirmed
    }

    // 5. Save order (pre-save hook will recalculate totals)
    await order.save({ session: mongoSession });

    // 6. Update session if provided (track first order time)
    if (data.sessionId) {
      const session = await TableSession.findById(data.sessionId).session(mongoSession);
      if (session && !session.firstOrderAt) {
        session.firstOrderAt = new Date();
        session.events.push({
          event: 'order_added',
          details: `${data.items.length} items fired to kitchen`,
          staffId: new Types.ObjectId(staffId),
          timestamp: new Date(),
        });
        await session.save({ session: mongoSession });
      }
    }

    // 7. Commit transaction
    await mongoSession.commitTransaction();

    // Order-confirmation WhatsApp message. This is the real "order confirmed"
    // moment — draft orders have no manual confirm button anywhere in the UI,
    // this is where a draft actually becomes confirmed. Only fires when a
    // phone number is on file (dine-in orders normally don't have one, so
    // this naturally only reaches takeaway/delivery customers), the
    // WHATSAPP_* env vars are configured, AND the site's WhatsApp add-on
    // subscription is currently entitled (lib/entitlements — no-op true when
    // POS_ENTITLEMENTS_URL isn't set, i.e. every site not on that billing
    // scheme). Free-text only: valid inside Meta's 24h customer-initiated
    // window. A business-initiated confirmation sent outside that window
    // needs an approved message template — no templates are approved yet, so
    // that case is a known gap, not a silent failure.
    if (justConfirmed && order.cu?.p && isWhatsAppConfigured() && (await isWhatsAppEntitled())) {
      const itemCount = order.i.reduce((sum: number, item: any) => sum + item.q, 0);
      const message = `Hi${order.cu?.n ? ' ' + order.cu.n : ''}, your order ${order.on} (${itemCount} item${itemCount === 1 ? '' : 's'}) has been confirmed and is being prepared. Total: ${order.gt}.`;
      sendWhatsAppMessage(order.cu.p, message).catch((err) => {
        console.error('[Fire Order API] WhatsApp confirmation failed to send:', err);
      });
    }

    // Broadcast item-fired event for real-time listeners
    // Using compressed field names: on=orderNumber, i=items, s=status, gt=grandTotal, st=subtotal
    const STATUS_NAMES = ['draft', 'confirmed', 'preparing', 'ready', 'served', 'out_for_delivery', 'completed', 'cancelled'];
    broadcastEvent({
      type: 'order:items_fired',
      entityId: data.orderId,
      __v: (order as any).__v,
      payload: {
        orderNumber: order.on,
        firedCount: newItems.length,
        totalItemCount: order.i.length,
        status: STATUS_NAMES[order.s] || 'unknown',
        grandTotal: order.gt,
        subtotal: order.st,
        // tableId lets the hub skip the takeaway-list refetch for dine-in
        // fires (its heuristic is "no tableId → probably takeaway").
        tableId: (order as any).tb?.ti?.toString(),
        tableNumber: (order as any).tb?.tn,
        action: 'items_fired',
      },
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      order: {
        _id: order._id,
        orderNumber: order.on,
        status: STATUS_NAMES[order.s] || 'unknown',
        itemCount: order.i.length,
        subtotal: order.st,
        grandTotal: order.gt,
      },
      firedCount: newItems.length,
      message: `${newItems.length} items sent to kitchen`,
    });
  } catch (e: any) {
    // Rollback transaction on error
    await mongoSession.abortTransaction();

    if (isVersionConflict(e)) {
      return NextResponse.json(versionConflictBody('Order'), { status: 409 });
    }

    log('[Fire Order API][POST]', e);

    if (e.message === 'Order not found') {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (e.message?.startsWith('SESSION_MISMATCH')) {
      return NextResponse.json(
        { error: e.message, code: 'SESSION_MISMATCH', retryable: false },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: 'Failed to fire order', error: e.message },
      { status: 500 }
    );
  } finally {
    mongoSession.endSession();
  }
}
