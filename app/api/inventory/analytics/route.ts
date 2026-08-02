// app/api/inventory/analytics/route.ts
// Consumption / restock trends and reason breakdown from ingredient delta history.

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { IngredientModel } from '@/models/factories/Ingredients';
import { isAdminRequest } from '@/lib/auth';
import type { DeltaReason } from '@/models/schemas/ingredient.schema';

interface LeanDelta {
  qty: number;
  reason: DeltaReason;
  at: string | Date;
}
interface LeanDoc {
  deltas?: LeanDelta[];
}

// Local YYYY-MM-DD key
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function GET(req: NextRequest) {
  const authError = await isAdminRequest({ requiredPerm: 'manage_inventory' });
  if (authError) return authError;

  try {
    const conn = await mongooseConnect();
    const Ingredient = IngredientModel(conn);

    const { searchParams } = new URL(req.url);
    const days = Math.min(365, Math.max(1, parseInt(searchParams.get('days') || '30')));

    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const docs = await Ingredient.find({}).select('deltas').lean<LeanDoc[]>();

    // Seed empty buckets for every day in the window (so charts have a continuous axis)
    const seriesMap = new Map<string, { consumed: number; restocked: number; wasted: number }>();
    for (let d = new Date(since); d <= new Date(); d.setDate(d.getDate() + 1)) {
      seriesMap.set(dayKey(new Date(d)), { consumed: 0, restocked: 0, wasted: 0 });
    }

    const byReasonMap = new Map<DeltaReason, { qty: number; count: number }>();

    for (const doc of docs) {
      for (const delta of doc.deltas ?? []) {
        const at = new Date(delta.at);
        if (at < since) continue;

        const r = byReasonMap.get(delta.reason) ?? { qty: 0, count: 0 };
        r.qty += Math.abs(delta.qty);
        r.count += 1;
        byReasonMap.set(delta.reason, r);

        const key = dayKey(at);
        const bucket = seriesMap.get(key);
        if (!bucket) continue;

        if (delta.reason === 'order_deduction') bucket.consumed += Math.abs(delta.qty);
        else if (delta.reason === 'waste') bucket.wasted += Math.abs(delta.qty);
        else if (delta.reason === 'restock' && delta.qty > 0) bucket.restocked += delta.qty;
      }
    }

    const series = [...seriesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    const byReason = [...byReasonMap.entries()]
      .map(([reason, v]) => ({ reason, ...v }))
      .sort((a, b) => b.qty - a.qty);

    return NextResponse.json({ days, series, byReason });
  } catch (error) {
    console.error('Failed to build inventory analytics:', error);
    return NextResponse.json({ error: 'Failed to build inventory analytics' }, { status: 500 });
  }
}
