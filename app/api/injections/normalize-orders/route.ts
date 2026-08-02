/**
 * Order Normalize Injection API
 *
 * Bulk updates **all** orders to:
 * 1. Mark status as "completed" (s = 6) — except cancelled orders
 * 2. Mark payment status as "paid" (ps = 1)
 * 3. Clear due amounts: set ap (amountPaid) = gt (grandTotal), ad = 0
 * 4. Re-number orders sequentially using the generateOrderNumber pattern
 *    (ORD-YYYYMMDD-XXXX) — sequence continues from existing order count.
 *
 * Uses batch processing for efficiency with large datasets (6000+ orders).
 *
 * GET /api/injections/normalize-orders - Run the injection
 */

import { NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';

const BATCH_SIZE = 500;
const COMPLETED_STATUS = 6;
const CANCELLED_STATUS = 7;
const PAID_STATUS = 1;

interface BatchStats {
  total: number;
  markedCompleted: number;
  markedPaid: number;
  dueCleared: number;
  renumbered: number;
  skippedCancelled: number;
  batches: number;
  orderNumberRange: { first: string; last: string };
  errors: string[];
}

/**
 * Generate a sequential order number following the same pattern as
 * generateOrderNumber in models/factories/Order.ts:
 *   ORD-YYYYMMDD-XXXX  (4-digit zero-padded sequence)
 */
function buildOrderNumber(seq: number): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `ORD-${datePart}-${String(seq).padStart(4, '0')}`;
}

export async function GET() {
  const startTime = Date.now();

  try {
    const conn = await mongooseConnect();
    const collection = conn.collection('orders');

    const stats: BatchStats = {
      total: 0,
      markedCompleted: 0,
      markedPaid: 0,
      dueCleared: 0,
      renumbered: 0,
      skippedCancelled: 0,
      batches: 0,
      orderNumberRange: { first: '', last: '' },
      errors: [],
    };

    // Count total orders
    stats.total = await collection.countDocuments({});
    console.log(`[Order Injection] Found ${stats.total} orders to process`);

    // Count cancelled orders (will be skipped for status update)
    stats.skippedCancelled = await collection.countDocuments({
      $or: [{ s: CANCELLED_STATUS }, { status: 'cancelled' }],
    });

    const totalBatches = Math.ceil(stats.total / BATCH_SIZE);
    console.log(`[Order Injection] Processing in ${totalBatches} batches of ${BATCH_SIZE}`);

    // Fetch all orders sorted by creation date so numbering is chronological
    // on=orderNumber, s=status, gt=grandTotal, ap=amountPaid, cAt=createdAt
    const allOrders = await collection
      .find({}, { projection: { _id: 1, s: 1, status: 1, gt: 1, ap: 1 } })
      .sort({ cAt: 1 })
      .toArray();

    // Sequence starts from 1 (continuing onward, length-based)
    let seq = 0;
    stats.orderNumberRange.first = buildOrderNumber(1);

    for (let batch = 0; batch < totalBatches; batch++) {
      const start = batch * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, allOrders.length);
      const batchOrders = allOrders.slice(start, end);

      try {
        const bulkOps = batchOrders.map((order) => {
          seq++;
          const isCancelled =
            order.s === CANCELLED_STATUS || order.status === 'cancelled';

          const grandTotal: number = order.gt || 0;
          const newOrderNumber = buildOrderNumber(seq);

          return {
            updateOne: {
              filter: { _id: order._id },
              update: {
                $set: {
                  // Status
                  s: isCancelled ? CANCELLED_STATUS : COMPLETED_STATUS,
                  ps: PAID_STATUS,
                  coa: new Date(),
                  // Clear dues: ap = gt, ad = 0
                  ap: grandTotal,
                  ad: 0,
                  // Re-number
                  on: newOrderNumber,
                },
                $unset: {
                  status: '',
                  paymentStatus: '',
                },
              },
            },
          };
        });

        const result = await collection.bulkWrite(bulkOps, { ordered: false });

        stats.markedCompleted += result.modifiedCount;
        stats.markedPaid += result.modifiedCount;
        stats.dueCleared += result.modifiedCount;
        stats.renumbered += result.modifiedCount;
        stats.batches++;

        console.log(
          `[Order Injection] Batch ${batch + 1}/${totalBatches}: Updated ${result.modifiedCount} orders`,
        );
      } catch (error) {
        const errorMsg = `Batch ${batch + 1}: ${(error as Error).message}`;
        stats.errors.push(errorMsg);
        console.error(`[Order Injection] Error:`, errorMsg);
      }
    }

    stats.orderNumberRange.last = buildOrderNumber(seq);

    // Update the Counter document so future generateOrderNumber calls
    // continue from where this injection left off (no collisions).
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const counterName = `order_${datePart}`;
    await conn.collection('counters').updateOne(
      { _id: counterName as any },
      { $max: { seq } },
      { upsert: true },
    );
    console.log(`[Order Injection] Counter "${counterName}" synced to seq=${seq}`);

    const duration = Date.now() - startTime;

    console.log(`[Order Injection] Complete!`);
    console.log(`  - Total orders: ${stats.total}`);
    console.log(`  - Marked completed: ${stats.markedCompleted - stats.skippedCancelled}`);
    console.log(`  - Marked paid: ${stats.markedPaid}`);
    console.log(`  - Dues cleared: ${stats.dueCleared}`);
    console.log(`  - Renumbered: ${stats.renumbered} (${stats.orderNumberRange.first} → ${stats.orderNumberRange.last})`);
    console.log(`  - Skipped (cancelled): ${stats.skippedCancelled}`);
    console.log(`  - Batches processed: ${stats.batches}`);
    console.log(`  - Errors: ${stats.errors.length}`);
    console.log(`  - Duration: ${duration}ms`);

    return NextResponse.json({
      success: true,
      message: 'Order normalize complete — status, payment, dues, and numbering updated',
      stats,
      duration: `${duration}ms`,
    });
  } catch (error) {
    console.error('[Order Injection] Fatal error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 },
    );
  }
}
