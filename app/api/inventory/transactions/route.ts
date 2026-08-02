// app/api/inventory/transactions/route.ts
// Unified stock-movement ledger: flattens every ingredient's delta history into
// a single time-ordered list, with reason / date filters.

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { IngredientModel } from '@/models/factories/Ingredients';
import { isAdminRequest } from '@/lib/auth';
import { DELTA_REASONS, type DeltaReason } from '@/models/schemas/ingredient.schema';

interface LeanDelta {
  _id?: unknown;
  qty: number;
  reason: DeltaReason;
  unitCost?: number;
  balanceAfter?: number;
  note?: string;
  at: string | Date;
}
interface LeanDoc {
  _id: unknown;
  name: string;
  unit: string;
  deltas?: LeanDelta[];
}

export async function GET(req: NextRequest) {
  const authError = await isAdminRequest({ requiredPerm: 'manage_inventory' });
  if (authError) return authError;

  try {
    const conn = await mongooseConnect();
    const Ingredient = IngredientModel(conn);

    const { searchParams } = new URL(req.url);
    const reason = searchParams.get('reason') as DeltaReason | null;
    const days = parseInt(searchParams.get('days') || '0');
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') || '100')));

    const since = days > 0 ? new Date(Date.now() - days * 86400000) : null;
    const reasonFilter = reason && DELTA_REASONS.includes(reason) ? reason : null;

    const docs = await Ingredient.find({})
      .select('_id name unit deltas')
      .lean<LeanDoc[]>();

    const ledger: Array<{
      ingredientId: unknown;
      name: string;
      unit: string;
      qty: number;
      reason: DeltaReason;
      unitCost?: number;
      balanceAfter?: number;
      note?: string;
      at: Date;
    }> = [];

    for (const doc of docs) {
      for (const d of doc.deltas ?? []) {
        const at = new Date(d.at);
        if (since && at < since) continue;
        if (reasonFilter && d.reason !== reasonFilter) continue;
        ledger.push({
          ingredientId: doc._id,
          name: doc.name,
          unit: doc.unit,
          qty: d.qty,
          reason: d.reason,
          unitCost: d.unitCost,
          balanceAfter: d.balanceAfter,
          note: d.note,
          at,
        });
      }
    }

    ledger.sort((a, b) => b.at.getTime() - a.at.getTime());

    return NextResponse.json({
      transactions: ledger.slice(0, limit),
      total: ledger.length,
    });
  } catch (error) {
    console.error('Failed to build transactions ledger:', error);
    return NextResponse.json({ error: 'Failed to build transactions ledger' }, { status: 500 });
  }
}
