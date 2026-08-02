// models/factories/Order.ts

import { Connection, Model } from 'mongoose';
import { 
  OrderSchema, 
  IOrder, 
  IOrderItem,
  IAppliedAdjustment,
  ORDER_STATUS_LABELS 
} from '../schemas/order.schema';

// Status code mappings for pre-save hooks
const STATUS_CODES = {
  draft: 0, confirmed: 1, preparing: 2, ready: 3, 
  served: 4, out_for_delivery: 5, completed: 6, cancelled: 7
};
const PAYMENT_STATUS_CODES = {
  pending: 0, paid: 1, partial: 2, split: 3, credit: 4, refunded: 5, voided: 6
};
const ADJUSTMENT_KIND_CODES = { discount: 0, surcharge: 1, tax: 2, fee: 3 };

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save hook: Calculate derived fields (compressed field names)
// ─────────────────────────────────────────────────────────────────────────────

OrderSchema.pre<IOrder>('save', function () {
  // Coerce any value to a finite number — Mongoose REJECTS NaN on Number paths
  // (throws a CastError → 500). A single undefined/NaN input (e.g. a legacy
  // order with no subtotal) must never poison the whole totals recompute.
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  // Calculate item subtotals and order subtotal
  // i=items, st=subtotal, md=modifiers, up=unitPrice, q=quantity
  if (this.isModified('i') || this.isNew) {
    this.i.forEach((item: IOrderItem) => {
      const modifiersTotal = item.md?.reduce((sum, mod) => sum + num(mod.p), 0) || 0;
      item.st = (num(item.up) + modifiersTotal) * num(item.q);
    });
    this.st = this.i.reduce((sum, item) => sum + num(item.st), 0);
  }
  // Guarantee subtotal is always a finite number even when items weren't touched.
  this.st = num(this.st);

  // Calculate discount amount
  // dt=discountType, dv=discountValue, da=discountAmount
  if (this.dt !== undefined && this.dv) {
    if (this.dt === 0) { // 0 = percentage
      this.da = (this.st * num(this.dv)) / 100;
    } else { // 1 = fixed
      this.da = Math.min(num(this.dv), this.st);
    }
  } else {
    this.da = 0;
  }

  // Calculate tax
  // tr=taxRate, ta=taxAmount
  const taxableAmount = this.st - this.da;
  this.ta = (taxableAmount * num(this.tr)) / 100;

  // ── Bill Adjustments (aj) ─────────────────────────────────────────────
  // Compute each adjustment's resolved amount and aggregate totals.
  // k=kind, cm=calcMode, v=value, ca=computedAmount
  let discountAdjTotal = 0;   // total from kind === 0 (discount)
  let surchargeAdjTotal = 0;  // total from kind === 1,2,3 (surcharge/tax/fee)

  if (this.aj && this.aj.length > 0) {
    const baseForAdj = taxableAmount + this.ta;
    for (const adj of this.aj as IAppliedAdjustment[]) {
      if (adj.cm === 0) { // 0 = percentage
        adj.ca = Math.round(((baseForAdj * num(adj.v)) / 100) * 100) / 100;
      } else { // 1 = fixed
        adj.ca = num(adj.v);
      }
      if (adj.k === 0) { // 0 = discount
        discountAdjTotal += adj.ca;
      } else {
        surchargeAdjTotal += adj.ca;
      }
    }
  }

  // Net adjustments impact (at=adjustmentsTotal)
  this.at = surchargeAdjTotal - discountAdjTotal;

  // Calculate grand total (gt)
  // sc=serviceCharge, df=deliveryFee, tp=tipAmount
  // Clamp at 0: discounts/adjustments can exceed the base (e.g. a fixed discount
  // on an order with no items yet) but a bill can never be negative — and the
  // schema enforces gt >= 0, so an un-clamped negative total blocks the save
  // (firing to kitchen, adding items, etc.).
  this.gt = Math.max(
    0,
    taxableAmount +
    this.ta +
    num(this.sc) +
    num(this.df) +
    num(this.tp) +
    this.at,
  );

  // Calculate amount paid and due (ap, ad)
  // tx=transactions, a=amount
  this.ap = this.tx?.reduce((sum, t) => sum + num(t.a), 0) || 0;
  this.ad = Math.max(0, this.gt - this.ap);

  // Update payment status (ps) based on amounts
  // iv=isVoid
  if (this.iv === 1) {
    this.ps = PAYMENT_STATUS_CODES.voided; // 6
  } else if (this.ap === 0 && this.gt > 0) {
    if (this.ps !== PAYMENT_STATUS_CODES.credit) { // 4
      this.ps = PAYMENT_STATUS_CODES.pending; // 0
    }
  } else if (this.ap >= this.gt) {
    if (this.tx && this.tx.length > 1) {
      this.ps = PAYMENT_STATUS_CODES.split; // 3
    } else {
      this.ps = PAYMENT_STATUS_CODES.paid; // 1
    }
  } else if (this.ap > 0) {
    this.ps = PAYMENT_STATUS_CODES.partial; // 2
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save hook: Generate order number if not exists
// ─────────────────────────────────────────────────────────────────────────────

OrderSchema.pre<IOrder>('save', function () {
  // on=orderNumber
  if (!this.on) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.on = `ORD-${datePart}-${randomPart}`;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save hook: Track status timestamps
// ─────────────────────────────────────────────────────────────────────────────

OrderSchema.pre<IOrder>('save', function () {
  const now = new Date();
  
  // s=status, lsc=lastStatusChangeAt
  if (this.isModified('s')) {
    this.lsc = now;
    
    // cat=confirmedAt, psa=prepStartedAt, ra=readyAt, coa=completedAt
    switch (this.s) {
      case STATUS_CODES.confirmed: // 1
        if (!this.cat) this.cat = now;
        break;
      case STATUS_CODES.preparing: // 2
        if (!this.psa) this.psa = now;
        break;
      case STATUS_CODES.ready: // 3
        if (!this.ra) this.ra = now;
        break;
      case STATUS_CODES.completed: // 6
        if (!this.coa) this.coa = now;
        break;
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Virtual: Time since order was created
// ─────────────────────────────────────────────────────────────────────────────

OrderSchema.virtual('elapsedMinutes').get(function (this: IOrder) {
  // cAt=createdAt
  return Math.floor((Date.now() - this.cAt.getTime()) / 60000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Instance method: Get status display label
// ─────────────────────────────────────────────────────────────────────────────

// Reverse map for status code to string
const STATUS_NAMES: Record<number, string> = {
  0: 'draft', 1: 'confirmed', 2: 'preparing', 3: 'ready',
  4: 'served', 5: 'out_for_delivery', 6: 'completed', 7: 'cancelled'
};

OrderSchema.methods.getStatusLabel = function (): string {
  const statusName = STATUS_NAMES[this.s] as keyof typeof ORDER_STATUS_LABELS;
  return ORDER_STATUS_LABELS[statusName] || String(this.s);
};

// ─────────────────────────────────────────────────────────────────────────────
// Model Factory - Connection-based instantiation
// ─────────────────────────────────────────────────────────────────────────────

export function OrderModel(conn: Connection): Model<IOrder> {
  return (
    conn.models.Order ||
    conn.model<IOrder>('Order', OrderSchema)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Generate unique order number (atomic — no duplicates under concurrency)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateOrderNumber(conn: Connection): Promise<string> {
  const { nextSequence, invalidateCounterCache } = await import('./Counter');
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counterName = `order_${datePart}`;
  const prefix = `ORD-${datePart}-`;
  const Order = OrderModel(conn);

  // Seed function: scan existing orders for today's max sequence
  // on=orderNumber
  const seedFn = async (): Promise<number> => {
    const latest = await Order.findOne(
      { on: { $regex: `^${prefix}` } },
    )
      .sort({ on: -1 })
      .select('on')
      .lean();
    if (!latest) return 0;
    const tail = (latest as any).on.replace(prefix, '');
    const num = parseInt(tail, 10);
    return isNaN(num) ? 0 : num;
  };

  // Keep incrementing until we find a number not already in the DB.
  for (let attempt = 0; attempt < 10; attempt++) {
    if (attempt > 0) invalidateCounterCache(counterName);

    const seq = await nextSequence(conn, counterName, seedFn);
    const orderNumber = `${prefix}${String(seq).padStart(4, '0')}`;

    const exists = await Order.exists({ on: orderNumber }).lean();
    if (!exists) return orderNumber;

    console.warn(`[generateOrderNumber] ${orderNumber} already exists, advancing counter…`);
  }

  // Ultimate fallback
  const fallbackSeq = await nextSequence(conn, counterName);
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}${String(fallbackSeq).padStart(4, '0')}-${rand}`;
}
