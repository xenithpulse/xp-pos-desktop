// app/api/analytics/route.ts
// Sales & menu analytics aggregated from the compressed Order collection.
// Population = ALL PLACED ORDERS: confirmed → completed (s ∈ {1..6}), not voided
// (iv≠1). Drafts (s=0, open carts) and cancelled (s=7) are excluded. Revenue is
// the booked grand total (gt) of those orders regardless of payment state; the
// payment-mix breakdown shows how much of it has actually been collected.

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { OrderModel } from '@/models/factories/Order';

const MODE_NAMES = ['dine_in', 'takeaway', 'delivery', 'drive_thru', 'curbside'];
const MODE_LABELS = ['Dine-In', 'Takeaway', 'Delivery', 'Drive-Thru', 'Curbside'];
const PAYMENT_LABELS = ['Pending', 'Paid', 'Partial', 'Split', 'Credit', 'Refunded', 'Voided'];

// Placed = confirmed, preparing, ready, served, out_for_delivery, completed
const PLACED_STATUSES = [1, 2, 3, 4, 5, 6];

// Format a Date to a YYYY-MM-DD key in the given IANA timezone (en-CA yields ISO order).
function dayKeyInTz(d: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ requiredPerm: 'view_reports' });
  if (authResult) return authResult;

  const conn = await mongooseConnect();
  const Order = OrderModel(conn);

  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '30', 10)));
    const tz = searchParams.get('tz') || 'Asia/Karachi';

    // Rolling window: `days` full days including today.
    const now = new Date();
    const since = new Date(now.getTime() - (days - 1) * 86_400_000);
    since.setHours(0, 0, 0, 0);

    const baseMatch = {
      cAt: { $gte: since },
      iv: { $ne: 1 },
      s: { $in: PLACED_STATUSES },
    };

    const [facet] = await Order.aggregate([
      { $match: baseMatch },
      {
        $facet: {
          kpis: [
            {
              $group: {
                _id: null,
                revenue: { $sum: '$gt' },
                collected: { $sum: { $ifNull: ['$ap', 0] } },
                orders: { $sum: 1 },
                guests: { $sum: { $ifNull: ['$cv', 0] } },
              },
            },
          ],
          byDay: [
            {
              $group: {
                _id: { $dateToString: { date: '$cAt', format: '%Y-%m-%d', timezone: tz } },
                revenue: { $sum: '$gt' },
                orders: { $sum: 1 },
              },
            },
          ],
          byHour: [
            {
              $group: {
                _id: { $hour: { date: '$cAt', timezone: tz } },
                revenue: { $sum: '$gt' },
                orders: { $sum: 1 },
              },
            },
          ],
          byMode: [
            { $group: { _id: '$m', revenue: { $sum: '$gt' }, orders: { $sum: 1 } } },
          ],
          byPayment: [
            { $group: { _id: '$ps', revenue: { $sum: '$gt' }, orders: { $sum: 1 } } },
          ],
          topItemsByRevenue: [
            { $unwind: '$i' },
            { $group: { _id: '$i.n', qty: { $sum: '$i.q' }, revenue: { $sum: '$i.st' } } },
            { $sort: { revenue: -1 } },
            { $limit: 15 },
          ],
          topItemsByQty: [
            { $unwind: '$i' },
            { $group: { _id: '$i.n', qty: { $sum: '$i.q' }, revenue: { $sum: '$i.st' } } },
            { $sort: { qty: -1 } },
            { $limit: 15 },
          ],
          itemsAgg: [
            { $unwind: '$i' },
            {
              $group: {
                _id: null,
                qty: { $sum: '$i.q' },
                distinct: { $addToSet: '$i.n' },
              },
            },
            { $project: { qty: 1, distinctCount: { $size: '$distinct' } } },
          ],
          topStaff: [
            { $group: { _id: '$cb', revenue: { $sum: '$gt' }, orders: { $sum: 1 } } },
            { $sort: { revenue: -1 } },
            { $limit: 8 },
            {
              $lookup: {
                from: 'admins',
                localField: '_id',
                foreignField: '_id',
                as: 'admin',
              },
            },
            {
              $project: {
                revenue: 1,
                orders: 1,
                name: { $ifNull: [{ $arrayElemAt: ['$admin.username', 0] }, 'Unknown'] },
              },
            },
          ],
        },
      },
    ]);

    // ── KPIs ──────────────────────────────────────────────────────────────────
    const k = facet.kpis[0] ?? { revenue: 0, collected: 0, orders: 0, guests: 0 };
    const itemsAgg = facet.itemsAgg[0] ?? { qty: 0, distinctCount: 0 };
    const kpis = {
      revenue: k.revenue,
      collected: k.collected,
      orders: k.orders,
      guests: k.guests,
      itemsSold: itemsAgg.qty,
      distinctItems: itemsAgg.distinctCount,
      avgOrderValue: k.orders > 0 ? k.revenue / k.orders : 0,
    };

    // ── Revenue trend — seed a continuous day axis so charts never gap ──────────
    const dayMap = new Map<string, { revenue: number; orders: number }>(
      facet.byDay.map((d: { _id: string; revenue: number; orders: number }) => [
        d._id,
        { revenue: d.revenue, orders: d.orders },
      ])
    );
    const trend: { date: string; revenue: number; orders: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const key = dayKeyInTz(new Date(now.getTime() - i * 86_400_000), tz);
      const v = dayMap.get(key) ?? { revenue: 0, orders: 0 };
      trend.push({ date: key, revenue: v.revenue, orders: v.orders });
    }

    // ── Hour-of-day (0–23), continuous ─────────────────────────────────────────
    const hourMap = new Map<number, { revenue: number; orders: number }>(
      facet.byHour.map((h: { _id: number; revenue: number; orders: number }) => [
        h._id,
        { revenue: h.revenue, orders: h.orders },
      ])
    );
    const byHour = Array.from({ length: 24 }, (_, hour) => {
      const v = hourMap.get(hour) ?? { revenue: 0, orders: 0 };
      return { hour, revenue: v.revenue, orders: v.orders };
    });

    // ── Mode & payment breakdowns (label decoded) ──────────────────────────────
    const byMode = facet.byMode
      .map((m: { _id: number; revenue: number; orders: number }) => ({
        mode: MODE_NAMES[m._id] ?? `mode_${m._id}`,
        label: MODE_LABELS[m._id] ?? `Mode ${m._id}`,
        revenue: m.revenue,
        orders: m.orders,
      }))
      .sort((a: { revenue: number }, b: { revenue: number }) => b.revenue - a.revenue);

    const byPayment = facet.byPayment
      .map((p: { _id: number; revenue: number; orders: number }) => ({
        label: PAYMENT_LABELS[p._id] ?? `Status ${p._id}`,
        revenue: p.revenue,
        orders: p.orders,
      }))
      .sort((a: { revenue: number }, b: { revenue: number }) => b.revenue - a.revenue);

    const mapItems = (arr: { _id: string; qty: number; revenue: number }[]) =>
      arr.map((t) => ({ name: t._id, qty: t.qty, revenue: t.revenue }));

    const topStaff = facet.topStaff.map(
      (s: { name: string; revenue: number; orders: number }) => ({
        name: s.name,
        revenue: s.revenue,
        orders: s.orders,
      })
    );

    return NextResponse.json({
      range: { days, since: since.toISOString(), tz },
      kpis,
      trend,
      byHour,
      byMode,
      byPayment,
      topItemsByRevenue: mapItems(facet.topItemsByRevenue),
      topItemsByQty: mapItems(facet.topItemsByQty),
      topStaff,
    });
  } catch (e) {
    console.error('[Analytics API][GET]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
