// app/api/orders/[id]/route.ts
// Using compressed field names for Order, Table schemas

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { ORDER_WORKSPACE_PERMS, ORDER_READ_PERMS } from '@/types/admin.types';
import { OrderModel } from '@/models/factories/Order';
import { TableModel } from '@/models/factories/Table';
import { TableSessionModel } from '@/models/factories/TableSession';
import { extractId } from '@/utils/extractID';
import { AdminModel } from '@/models/factories/Admin';
import { isVersionConflict, versionConflictBody, withRetry } from '@/lib/concurrency';
import { broadcastEvent } from '@/lib/realtime/eventBus';
import { prepareOrderForResponse } from '@/lib/compression/api-helpers';
import { deductInventoryForOrder, notifyLowStock, revertInventoryForOrder } from '@/lib/inventory';

const log = console.log;

// Compressed field name mappings (for reference)
// Order: on=orderNumber, m=mode, s=status, ps=paymentStatus, i=items, st=subtotal,
//        tr=taxRate, ta=taxAmount, da=discountAmount, gt=grandTotal, tx=transactions,
//        ap=amountPaid, ad=amountDue, tb=table, cu=customer, cb=createdBy, sb=servedBy,
//        aj=adjustments, at=adjustmentsTotal, kn=kitchenNotes, in=internalNotes,
//        ip=isPriority, iv=isVoid, sid=sessionId, ert=estimatedReadyTime, coa=completedAt
// Order Item: ii=itemId, n=name, q=quantity, up=unitPrice, md=modifiers, si=specialInstructions, st=subtotal, s=status
// Table: tn=tableNumber, sn=sectionName, s=status, as=activeSessionId, lsc=lastStatusChangeAt
// Table Info in Order: ti=tableId, tn=tableNumber, sn=sectionName, gc=guestCount

// Status code mappings
const ORDER_STATUS = { draft: 0, confirmed: 1, preparing: 2, ready: 3, served: 4, out_for_delivery: 5, completed: 6, cancelled: 7 };
const PAYMENT_STATUS = { pending: 0, paid: 1, partial: 2, split: 3, credit: 4, refunded: 5, voided: 6 };
const PAYMENT_METHOD = { cash: 0, card: 1, online: 2, other: 3 };
const ITEM_STATUS = { pending: 0, preparing: 1, ready: 2, served: 3, cancelled: 4 };
const TABLE_STATUS = { available: 0, reserved: 1, occupied: 2, cleaning: 3, blocked: 4 };

// Reverse mappings for responses
const STATUS_NAMES = ['draft', 'confirmed', 'preparing', 'ready', 'served', 'out_for_delivery', 'completed', 'cancelled'];
const PAYMENT_STATUS_NAMES = ['pending', 'paid', 'partial', 'split', 'credit', 'refunded', 'voided'];

// ─────────────────────────────────────────────────────────────────────────────
// GET - Retrieve single order by ID
// ─────────────────────────────────────────────────────────────────────────────

// Readable by the kitchen too - see ORDER_READ_PERMS.
export async function GET(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ anyPerm: ORDER_READ_PERMS });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);
  const Admin = AdminModel(conn);
  
  try {
    const order = await Order.findById(id)
      .populate('cb', 'username')  // createdBy
      .populate('sb', 'username')  // servedBy
      .lean();
      
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    
    // Decode for human-readable response
    return NextResponse.json(prepareOrderForResponse(order as unknown as Record<string, unknown>));
  } catch (e) {
    log('[Orders API][GET/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT - Update order details
// ─────────────────────────────────────────────────────────────────────────────

interface OrderUpdatePayload {
  status?: string;
  paymentStatus?: string;
  items?: any[];
  table?: { tableNumber: string; sectionName?: string; guestCount?: number };
  customer?: { name?: string; phone?: string; email?: string; address?: any };
  taxRate?: number;
  discountType?: 'percentage' | 'fixed';
  discountValue?: number;
  serviceCharge?: number;
  deliveryFee?: number;
  riderName?: string;
  tipAmount?: number;
  kitchenNotes?: string;
  internalNotes?: string;
  isPriority?: boolean;
  estimatedReadyTime?: string;
  servedBy?: string;
}

export async function PUT(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ anyPerm: ORDER_WORKSPACE_PERMS });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);
  const Admin = AdminModel(conn);

  try {
    const data: OrderUpdatePayload = await request.json();
    
    const order = await withRetry(async () => {
      const o = await Order.findById(id);
      if (!o) {
        throw Object.assign(new Error('Order not found'), { httpStatus: 404 });
      }

      // Apply updates using compressed field names
      if (data.status !== undefined) o.s = ORDER_STATUS[data.status as keyof typeof ORDER_STATUS] ?? o.s;
      if (data.paymentStatus !== undefined) o.ps = PAYMENT_STATUS[data.paymentStatus as keyof typeof PAYMENT_STATUS] ?? o.ps;
      if (data.items !== undefined) {
        // Convert items to compressed format
        o.i = data.items.map((item: any) => ({
          ii: item.itemId,
          n: item.name,
          q: item.quantity,
          up: item.unitPrice,
          md: item.modifiers?.map((m: any) => ({ n: m.name, p: m.price })),
          si: item.specialInstructions,
          st: item.subtotal || 0,
          s: ITEM_STATUS[item.status as keyof typeof ITEM_STATUS] ?? 0,
        }));
      }
      if (data.table !== undefined) {
        o.tb = {
          tn: data.table.tableNumber,
          sn: data.table.sectionName,
          gc: data.table.guestCount,
        };
      }
      if (data.customer !== undefined) {
        o.cu = {
          n: data.customer.name,
          p: data.customer.phone,
          e: data.customer.email,
          a: data.customer.address ? {
            l1: data.customer.address.line1,
            l2: data.customer.address.line2,
            c: data.customer.address.city,
            pc: data.customer.address.postalCode,
            in: data.customer.address.instructions,
          } : undefined,
        };
      }
      if (data.taxRate !== undefined) o.tr = data.taxRate;
      if (data.discountType !== undefined) o.dt = data.discountType === 'percentage' ? 0 : 1;
      if (data.discountValue !== undefined) o.dv = data.discountValue;
      if (data.serviceCharge !== undefined) o.sc = data.serviceCharge;
      if (data.deliveryFee !== undefined) o.df = data.deliveryFee;
      if (data.riderName !== undefined) o.rn = data.riderName;
      if (data.tipAmount !== undefined) o.tp = data.tipAmount;
      if (data.kitchenNotes !== undefined) o.kn = data.kitchenNotes;
      if (data.internalNotes !== undefined) o.in = data.internalNotes;
      if (data.isPriority !== undefined) o.ip = data.isPriority ? 1 : 0;
      if (data.estimatedReadyTime !== undefined) o.ert = new Date(data.estimatedReadyTime);
      if (data.servedBy !== undefined) o.sb = data.servedBy as any;

      await o.save();
      return o;
    });

    // Broadcast a decoded summary (NOT the compressed order) — the hub patches
    // its lists in-place from payload.status/paymentStatus/totals, so long
    // field names here save every client a full refetch per edit.
    const isItemChange = data.items !== undefined;
    broadcastEvent({
      type: isItemChange ? 'order:items_updated' : 'order:updated',
      entityId: id,
      __v: (order as any).__v,
      payload: {
        orderNumber: (order as any).on,
        status: STATUS_NAMES[(order as any).s] || 'unknown',
        paymentStatus: PAYMENT_STATUS_NAMES[(order as any).ps] || 'unknown',
        grandTotal: (order as any).gt,
        subtotal: (order as any).st,
        amountPaid: (order as any).ap,
        amountDue: (order as any).ad,
        itemCount: (order as any).i?.length,
        tableId: (order as any).tb?.ti?.toString(),
        tableNumber: (order as any).tb?.tn,
        action: isItemChange ? 'items_updated' : 'updated',
      },
      timestamp: Date.now(),
    });

    return NextResponse.json(prepareOrderForResponse(order.toObject() as unknown as Record<string, unknown>));
  } catch (e) {
    if (isVersionConflict(e)) {
      return NextResponse.json(versionConflictBody('Order'), { status: 409 });
    }
    log('[Orders API][PUT/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE - Cancel/void an order
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ anyPerm: ORDER_WORKSPACE_PERMS });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);
  const Admin = AdminModel(conn);

  try {
    const { searchParams } = new URL(request.url);
    const hardDelete = searchParams.get('hardDelete') === 'true';

    const order = await Order.findById(id);
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (hardDelete) {
      await Order.findByIdAndDelete(id);

      broadcastEvent({
        type: 'order:cancelled',
        entityId: id,
        payload: { orderNumber: order.on, action: 'hard_deleted' },
        timestamp: Date.now(),
      });

      return NextResponse.json({ success: true, message: 'Order permanently deleted' });
    } else {
      const voidedOrder = await withRetry(async () => {
        const o = await Order.findById(id);
        if (!o) throw Object.assign(new Error('Order not found'), { httpStatus: 404 });
        o.s = ORDER_STATUS.cancelled;  // status = cancelled
        o.iv = 1;  // isVoid = true
        await o.save();
        return o;
      });

      broadcastEvent({
        type: 'order:cancelled',
        entityId: id,
        __v: (voidedOrder as any).__v,
        payload: { orderNumber: voidedOrder.on, action: 'voided', status: 'cancelled' },
        timestamp: Date.now(),
      });

      return NextResponse.json({ success: true, message: 'Order voided' });
    }
  } catch (e) {
    if (isVersionConflict(e)) {
      return NextResponse.json(versionConflictBody('Order'), { status: 409 });
    }
    log('[Orders API][DELETE/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH - Quick status update (with optimistic concurrency)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PATCH actions that move money. Gated a second time, on the narrower
 * ORDER_WORKSPACE_PERMS, inside the handler.
 */
const MONEY_ACTIONS = new Set(['add_payment', 'remove_payment', 'set_credit', 'complete_and_pay']);

// Status transitions, which is how the kitchen moves a ticket from preparing
// to ready. Wider than PUT and DELETE above on purpose: a chef may advance an
// order, and must not be able to rewrite or delete one.
export async function PATCH(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ anyPerm: ORDER_READ_PERMS });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);
  const Admin = AdminModel(conn);
  
  try {
    const { action, ...data } = await request.json();

    // PATCH is deliberately open to the kitchen so a chef can advance a ticket
    // (see ORDER_READ_PERMS). Money is a different job: recording or undoing a
    // payment is the till's, and `view_kitchen` must not carry it.
    if (MONEY_ACTIONS.has(action)) {
      const moneyDenied = await isAdminRequest({ anyPerm: ORDER_WORKSPACE_PERMS });
      if (moneyDenied) return moneyDenied;
    }

    const result = await withRetry(async () => {
      const order = await Order.findById(id);
      if (!order) {
        return { __notFound: true } as any;
      }

      switch (action) {
        // ─── Granular item mutations ────────────────────────────────────
        case 'update_item': {
          const item = order.i.find((i: any) => i._id?.toString() === data.itemId);
          if (!item) return { __itemNotFound: true } as any;
          if (data.quantity !== undefined) item.q = data.quantity;
          if (data.specialInstructions !== undefined) item.si = data.specialInstructions;
          break;
        }

        case 'remove_item': {
          const idx = order.i.findIndex((i: any) => i._id?.toString() === data.itemId);
          if (idx === -1) return { __itemNotFound: true } as any;
          order.i.splice(idx, 1);
          break;
        }

        case 'confirm':
          order.s = ORDER_STATUS.confirmed;
          break;
          
        case 'start_preparing':
          order.s = ORDER_STATUS.preparing;
          break;
          
        case 'mark_ready':
          order.s = ORDER_STATUS.ready;
          break;
          
        case 'mark_served':
          order.s = ORDER_STATUS.served;
          break;
          
        case 'out_for_delivery':
          order.s = ORDER_STATUS.out_for_delivery;
          break;
          
        case 'complete':
          // Guard: prevent double-completion (and double inventory deduction)
          if (order.s === ORDER_STATUS.completed) {
            return { __alreadyCompleted: true } as any;
          }
          order.s = ORDER_STATUS.completed;
          order.coa = new Date();
          // Inventory deduction happens after save (below)
          break;

        // ─── Atomic Complete + Pay + Table transition ─────────────────────
        case 'complete_and_pay': {
          const Table = TableModel(conn);
          const Session = TableSessionModel(conn);
          const txn = await conn.startSession();
          txn.startTransaction();

          // Get payment method from request (default to cash)
          const paymentMethodStr = data.paymentMethod || 'cash';
          const paymentMethodCode = PAYMENT_METHOD[paymentMethodStr as keyof typeof PAYMENT_METHOD] ?? PAYMENT_METHOD.cash;

          try {
            const txnOrder = await Order.findById(id).session(txn);
            if (!txnOrder) throw new Error('Order not found');

            // Guard: prevent double-completion (and double inventory deduction)
            if (txnOrder.s === ORDER_STATUS.completed) {
              await txn.abortTransaction();
              txn.endSession();
              return NextResponse.json({ error: 'Order is already completed' }, { status: 409 });
            }

            txnOrder.s = ORDER_STATUS.completed;
            txnOrder.coa = new Date();  // completedAt
            txnOrder.ps = PAYMENT_STATUS.paid;
            if (txnOrder.ad > 0) {  // amountDue
              // Optional tendered amount (record-keeping, e.g. cash given). When
              // provided, record what was handed over so the receipt shows the
              // change; otherwise settle exactly the amount due.
              const tendered = typeof data.paidAmount === 'number' && data.paidAmount > 0
                ? data.paidAmount
                : txnOrder.ad;
              txnOrder.tx.push({
                m: paymentMethodCode,
                mn: data.paymentMethodLabel,  // preserve custom method name if provided
                a: tendered,
                pa: new Date(),
                r: 'auto-complete',
              });
            }
            await txnOrder.save({ session: txn });

            if (txnOrder.tb?.ti) {  // table.tableId
              const table = await Table.findById(txnOrder.tb.ti).session(txn);
              if (table && table.s === TABLE_STATUS.occupied) {
                table.s = TABLE_STATUS.cleaning;
                table.as = undefined;  // activeSessionId
                table.lsc = new Date();  // lastStatusChangeAt
                await table.save({ session: txn });
              }
            }

            if (txnOrder.sid) {  // sessionId
              const session = await Session.findById(txnOrder.sid).session(txn);
              if (session && session.status !== 'closed') {
                session.status = 'closed';
                session.closedAt = new Date();
                session.paidAt = new Date();
                session.events.push({
                  event: 'completed',
                  timestamp: new Date(),
                  details: 'Order completed and paid via quick-complete',
                });
                await session.save({ session: txn });
              }
            }

            await txn.commitTransaction();

            broadcastEvent({
              type: 'order:completed',
              entityId: id,
              __v: (txnOrder as any).__v,
              payload: {
                orderNumber: txnOrder.on,
                status: 'completed',
                paymentStatus: 'paid',
                paymentMethod: paymentMethodStr,
                grandTotal: txnOrder.gt,
                amountPaid: txnOrder.ap,
                amountDue: 0,
                tableId: txnOrder.tb?.ti?.toString(),
                tableNumber: txnOrder.tb?.tn,
                action: 'complete_and_pay',
              },
              timestamp: Date.now(),
            });

            if (txnOrder.tb?.ti) {
              broadcastEvent({
                type: 'table:session_closed',
                entityId: txnOrder.tb.ti.toString(),
                payload: { status: 'cleaning', tableNumber: txnOrder.tb?.tn },
                timestamp: Date.now(),
              });
            }

            // Deduct inventory based on order items' recipes (txn already committed above)
            const deductionResult = await deductInventoryForOrder(conn, id, txnOrder.i);
            if (deductionResult.warnings.length > 0) {
              console.warn('[Orders API][complete_and_pay] Inventory warnings:', deductionResult.warnings);
            }
            if (deductionResult.lowStockAlerts.length > 0) {
              await notifyLowStock(deductionResult.lowStockAlerts);
            }
          } catch (txnErr) {
            await txn.abortTransaction();
            throw txnErr;
          } finally {
            txn.endSession();
          }

          const completedOrder = await Order.findById(id)
            .populate('cb', 'username')
            .populate('sb', 'username')
            .lean();
          return NextResponse.json(prepareOrderForResponse(completedOrder as unknown as Record<string, unknown>));
        }

        // ─── Atomic Cancel + release table/session ───────────────────────
        case 'cancel': {
          const Table2 = TableModel(conn);
          const Session2 = TableSessionModel(conn);
          const txn2 = await conn.startSession();
          txn2.startTransaction();

          const originalTableId = order.tb?.ti?.toString() || data.tableId;
          const originalSessionId = order.sid?.toString();

          try {
            const txnOrder = await Order.findById(id).session(txn2);
            if (!txnOrder) throw new Error('Order not found');

            txnOrder.s = ORDER_STATUS.cancelled;
            txnOrder.iv = 1;  // isVoid = true
            if (txnOrder.tb) {
              txnOrder.tb.ti = undefined;
            }
            // FORCE / brutal cancel: skip schema validation so an order stuck in
            // an invalid state (e.g. a negative computed grand total from a
            // discount applied to an empty bill) can ALWAYS be cancelled. A
            // cancelled/void order's totals are irrelevant.
            await txnOrder.save({ session: txn2, validateBeforeSave: false });

            if (originalTableId) {
              const table = await Table2.findById(originalTableId).session(txn2);
              if (table && table.s === TABLE_STATUS.occupied) {
                table.s = TABLE_STATUS.available;
                table.as = undefined;
                table.lsc = new Date();
                await table.save({ session: txn2 });
              }
            }

            if (originalSessionId) {
              const session = await Session2.findById(originalSessionId).session(txn2);
              if (session && session.status !== 'closed') {
                session.status = 'closed';
                session.closedAt = new Date();
                session.events.push({
                  event: 'cancelled',
                  timestamp: new Date(),
                  details: 'Order cancelled — session closed',
                });
                await session.save({ session: txn2 });
              }
            }

            await txn2.commitTransaction();

            // Return any ingredients deducted for this order back to stock.
            // No-op if nothing was deducted (e.g. cancelling a draft); idempotent.
            const revert = await revertInventoryForOrder(conn, id);
            if (revert.reverted > 0) {
              console.log(`[Orders API][cancel] Reverted inventory for ${revert.reverted} ingredient(s)`);
            }

            broadcastEvent({
              type: 'order:cancelled',
              entityId: id,
              __v: (txnOrder as any).__v,
              payload: {
                orderNumber: txnOrder.on,
                status: 'cancelled',
                tableId: originalTableId,
                action: 'cancel',
              },
              timestamp: Date.now(),
            });

            if (originalTableId) {
              broadcastEvent({
                type: 'table:updated',
                entityId: originalTableId,
                payload: { status: 'available', action: 'session_released' },
                timestamp: Date.now(),
              });
            }
          } catch (txnErr) {
            await txn2.abortTransaction();
            throw txnErr;
          } finally {
            txn2.endSession();
          }

          const cancelledOrder = await Order.findById(id)
            .populate('cb', 'username')
            .populate('sb', 'username')
            .lean();
          return NextResponse.json(prepareOrderForResponse(cancelledOrder as unknown as Record<string, unknown>));
        }
          
        case 'toggle_priority':
          order.ip = order.ip === 1 ? 0 : 1;  // isPriority
          break;
          
        case 'add_payment':
          if (data.payment) {
            // Phase 16 §2.3 — nothing owed, nothing to take. An extra payment
            // on a settled order is a cash-drawer discrepancy at close, and by
            // then the person who caused it has gone home. Tips are a separate,
            // labelled thing (tp), never a silent extra payment.
            // `ad` is recomputed from `tx` on every save, so this is current.
            if (order.ad <= 0) {
              return NextResponse.json(
                { error: 'This order is fully paid. Nothing left to pay.' },
                { status: 409 },
              );
            }
            order.tx.push({
              // `method` is the coarse category (cash/card/online/other);
              // `methodLabel` preserves the tenant's custom method name.
              m: PAYMENT_METHOD[data.payment.method as keyof typeof PAYMENT_METHOD] ?? PAYMENT_METHOD.other,
              mn: data.payment.methodLabel,
              a: data.payment.amount,
              r: data.payment.reference,
              pa: new Date(),
              pb: data.payment.paidBy,
            });
          }
          break;

        // Undo a payment recorded on this order. Wrong method or wrong amount
        // is a normal thing to happen at a till mid-service; without this the
        // only remedy was editing the database. Totals (ap/ad/ps) are derived
        // from `tx` in the model's pre-save hook, so removing the entry is the
        // whole fix.
        case 'remove_payment': {
          // `_id` is a Mongoose subdocument id — present at runtime, absent
          // from IPaymentTransaction, hence the narrow cast.
          const txIdx = order.tx.findIndex(
            (t) => (t as unknown as { _id?: { toString(): string } })._id?.toString() === data.paymentId,
          );
          if (txIdx === -1) {
            return NextResponse.json({ error: 'Payment not found on this order' }, { status: 404 });
          }
          // A closed order's payments are an accounting record, not a draft.
          if (order.s === ORDER_STATUS.completed) {
            return NextResponse.json(
              { error: 'This order is closed. Payments on a closed order cannot be removed.' },
              { status: 409 },
            );
          }
          order.tx.splice(txIdx, 1);
          break;
        }


        case 'update_item_status':
          if (data.itemId && data.itemStatus) {
            const item = order.i.find((i: any) => i._id?.toString() === data.itemId);
            if (item) {
              item.s = ITEM_STATUS[data.itemStatus as keyof typeof ITEM_STATUS] ?? item.s;
            }
          }
          break;
          
        case 'set_credit':
          order.ps = PAYMENT_STATUS.credit;
          break;

        // ─── Bill adjustment mutations ────────────────────────────────────
        case 'add_adjustment': {
          if (!data.adjustment?.name || !data.adjustment?.kind || !data.adjustment?.calcMode || data.adjustment?.value == null) {
            return NextResponse.json({ error: 'Invalid adjustment payload' }, { status: 400 });
          }
          const ADJUSTMENT_KIND = { discount: 0, surcharge: 1, tax: 2, fee: 3 };
          const ADJUSTMENT_CALC_MODE = { percentage: 0, fixed: 1 };
          order.aj.push({
            ai: data.adjustment.adjustmentId || undefined,
            n: data.adjustment.name,
            k: ADJUSTMENT_KIND[data.adjustment.kind as keyof typeof ADJUSTMENT_KIND] ?? 0,
            cm: ADJUSTMENT_CALC_MODE[data.adjustment.calcMode as keyof typeof ADJUSTMENT_CALC_MODE] ?? 0,
            v: data.adjustment.value,
            ca: 0,
            r: data.adjustment.reason,
          });
          break;
        }

        case 'remove_adjustment': {
          const adjIdx = order.aj.findIndex((a: any) => a._id?.toString() === data.adjustmentId);
          if (adjIdx === -1) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 });
          order.aj.splice(adjIdx, 1);
          break;
        }

        case 'update_adjustment': {
          const adj = order.aj.find((a: any) => a._id?.toString() === data.adjustmentId);
          if (!adj) return NextResponse.json({ error: 'Adjustment not found' }, { status: 404 });
          if (data.value !== undefined) adj.v = data.value;
          if (data.reason !== undefined) adj.r = data.reason;
          if (data.name !== undefined) adj.n = data.name;
          break;
        }
          
        default:
          return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
      }

      await order.save();
      return order;
    });

    // Transactional cases already broadcast and return NextResponse
    if (result instanceof NextResponse) {
      return result;
    }

    if (result && (result as any).__notFound) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }
    if (result && (result as any).__alreadyCompleted) {
      return NextResponse.json({ error: 'Order is already completed' }, { status: 409 });
    }
    if (result && (result as any).__itemNotFound) {
      return NextResponse.json({ error: 'Item not found on this order' }, { status: 404 });
    }

    // Broadcast
    const isItemAction = action === 'update_item' || action === 'remove_item';
    broadcastEvent({
      type: isItemAction ? 'order:items_updated' : 'order:updated',
      entityId: id,
      __v: (result as any).__v,
      payload: {
        orderNumber: (result as any).on,
        status: STATUS_NAMES[(result as any).s] || 'unknown',
        paymentStatus: PAYMENT_STATUS_NAMES[(result as any).ps] || 'unknown',
        grandTotal: (result as any).gt,
        subtotal: (result as any).st,
        amountPaid: (result as any).ap,
        amountDue: (result as any).ad,
        itemCount: (result as any).i?.length,
        action,
      },
      timestamp: Date.now(),
    });

    // Deduct inventory when order is completed via simple 'complete' action
    if (action === 'complete') {
      const deductionResult = await deductInventoryForOrder(conn, id, (result as any).i);
      if (deductionResult.warnings.length > 0) {
        console.warn('[Orders API][complete] Inventory warnings:', deductionResult.warnings);
      }
      if (deductionResult.lowStockAlerts.length > 0) {
        await notifyLowStock(deductionResult.lowStockAlerts);
      }
    }

    return NextResponse.json(prepareOrderForResponse((result as any).toObject() as unknown as Record<string, unknown>));
  } catch (e) {
    if (isVersionConflict(e)) {
      return NextResponse.json(versionConflictBody('Order'), { status: 409 });
    }
    log('[Orders API][PATCH/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
