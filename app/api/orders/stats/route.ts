// app/api/orders/stats/route.ts
// Uses compressed field names for storage efficiency

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { ORDER_WORKSPACE_PERMS } from '@/types/admin.types';
import { OrderModel } from '@/models/factories/Order';

const log = console.log;

// Compressed field mappings for reference:
// s = status (0=draft, 1=confirmed, 2=preparing, 3=ready, 4=served, 5=out_for_delivery, 6=completed, 7=cancelled)
// ps = paymentStatus (0=pending, 1=paid, 2=partial, 3=split, 4=credit, 5=refunded, 6=voided)
// m = mode (0=dine_in, 1=takeaway, 2=delivery, 3=drive_thru, 4=curbside)
// gt = grandTotal
// cAt = createdAt
// cat = confirmedAt
// ra = readyAt
// iv = isVoid (0=false, 1=true)

const STATUS_NAMES = ['draft', 'confirmed', 'preparing', 'ready', 'served', 'out_for_delivery', 'completed', 'cancelled'];
const MODE_NAMES = ['dine_in', 'takeaway', 'delivery', 'drive_thru', 'curbside'];
const ACTIVE_STATUSES = [0, 1, 2, 3, 4, 5]; // draft through out_for_delivery

// ─────────────────────────────────────────────────────────────────────────────
// Server-side micro-cache.
//
// Stats are refetched by EVERY connected terminal on EVERY order event
// (scheduleRefresh({ stats: true })). Under 30k orders/day with several
// terminals that is a storm of identical, aggregation-heavy queries (this
// endpoint runs 7 of them, including a week-wide prep-time scan). The numbers
// are approximate dashboard figures, so a few seconds of staleness is fine.
//
// This cache collapses the whole fan-out into ONE database computation per
// window no matter how many terminals ask, and the in-flight promise dedup
// prevents a cold-cache thundering herd (concurrent misses share one query).
// The runtime is a single long-lived Node process (standalone output), so this
// module-level state is shared across all requests.
const STATS_CACHE_TTL_MS = 5_000;
let statsCache: { data: unknown; at: number } | null = null;
let statsInflight: Promise<unknown> | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// GET - Order statistics for dashboard
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authResult = await isAdminRequest({ anyPerm: ORDER_WORKSPACE_PERMS });
  if (authResult) return authResult;

  // Serve a warm cache without touching the database.
  if (statsCache && Date.now() - statsCache.at < STATS_CACHE_TTL_MS) {
    return NextResponse.json(statsCache.data, { status: 200 });
  }

  try {
    // Collapse concurrent cache-misses into a single shared computation.
    if (!statsInflight) {
      statsInflight = computeStats().finally(() => { statsInflight = null; });
    }
    const data = await statsInflight;
    statsCache = { data, at: Date.now() };
    return NextResponse.json(data, { status: 200 });
  } catch (e) {
    log('[Orders API][Stats]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

async function computeStats() {
  const conn = await mongooseConnect();
  const Order = OrderModel(conn);

  {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    
    const [
      activeOrders,
      todayOrders,
      pendingPayments,
      byMode,
      byStatus,
      todayRevenue,
      avgPrepTime,
    ] = await Promise.all([
      // Active orders count (not completed/cancelled)
      // s: 0-5 = draft through out_for_delivery, iv:1 = voided
      Order.countDocuments({
        s: { $in: ACTIVE_STATUSES },
        iv: { $ne: 1 },
      }),
      
      // Today's total orders (cAt = createdAt)
      Order.countDocuments({
        cAt: { $gte: startOfDay },
        iv: { $ne: 1 },
      }),
      
      // Orders with pending payments
      // ps: 0=pending, 2=partial; s:7 = cancelled
      Order.countDocuments({
        ps: { $in: [0, 2] },
        s: { $ne: 7 },
        iv: { $ne: 1 },
      }),
      
      // Orders by mode (today)
      // m = mode (numeric)
      Order.aggregate([
        { $match: { cAt: { $gte: startOfDay }, iv: { $ne: 1 } } },
        { $group: { _id: '$m', count: { $sum: 1 } } },
      ]),
      
      // Active orders by status
      Order.aggregate([
        { 
          $match: { 
            s: { $in: ACTIVE_STATUSES },
            iv: { $ne: 1 },
          } 
        },
        { $group: { _id: '$s', count: { $sum: 1 } } },
      ]),
      
      // Today's revenue (gt = grandTotal)
      // ps: 1=paid, 3=split
      Order.aggregate([
        { 
          $match: { 
            cAt: { $gte: startOfDay },
            ps: { $in: [1, 3] },
            iv: { $ne: 1 },
          } 
        },
        { $group: { _id: null, total: { $sum: '$gt' } } },
      ]),
      
      // Average prep time (confirmed to ready)
      // cat = confirmedAt, ra = readyAt
      Order.aggregate([
        {
          $match: {
            cAt: { $gte: startOfWeek },
            cat: { $exists: true },
            ra: { $exists: true },
            iv: { $ne: 1 },
          }
        },
        {
          $project: {
            prepTime: { 
              $divide: [
                { $subtract: ['$ra', '$cat'] },
                60000 // Convert to minutes
              ]
            }
          }
        },
        { $group: { _id: null, avgMinutes: { $avg: '$prepTime' } } },
      ]),
    ]);

    // Transform aggregation results - convert numeric codes to string names
    const modeStats = Object.fromEntries(
      byMode.map((m: { _id: number; count: number }) => [MODE_NAMES[m._id] || `mode_${m._id}`, m.count])
    );
    
    const statusStats = Object.fromEntries(
      byStatus.map((s: { _id: number; count: number }) => [STATUS_NAMES[s._id] || `status_${s._id}`, s.count])
    );

    return {
      activeOrders,
      todayOrders,
      pendingPayments,
      todayRevenue: todayRevenue[0]?.total || 0,
      avgPrepTimeMinutes: Math.round(avgPrepTime[0]?.avgMinutes || 0),
      byMode: modeStats,
      byStatus: statusStats,
    };
  }
}
