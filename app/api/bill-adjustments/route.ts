// app/api/bill-adjustments/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { BillAdjustmentModel } from '@/models/factories/BillAdjustment';

// ─────────────────────────────────────────────────────────────────────────────
// GET — List all bill adjustments (optionally filter by kind / active)
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const BA = BillAdjustmentModel(conn);

  const { searchParams } = new URL(req.url);
  const filter: Record<string, unknown> = {};

  const kind = searchParams.get('kind');
  if (kind) filter.kind = kind;

  const activeOnly = searchParams.get('activeOnly');
  if (activeOnly === 'true') filter.isActive = true;

  const appliesTo = searchParams.get('appliesTo');
  if (appliesTo) filter.appliesTo = { $in: ['all', appliesTo] };

  try {
    const adjustments = await BA.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();
    return NextResponse.json({ adjustments });
  } catch (e) {
    console.error('[BillAdjustments][GET]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — Create a new adjustment preset
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const BA = BillAdjustmentModel(conn);

  try {
    const body = await req.json();

    if (!body.name || !body.kind || !body.calcMode || body.value == null) {
      return NextResponse.json(
        { message: 'name, kind, calcMode, and value are required' },
        { status: 400 },
      );
    }

    const adj = await BA.create({
      name: body.name,
      kind: body.kind,
      calcMode: body.calcMode,
      value: body.value,
      isDefault: body.isDefault ?? false,
      isActive: body.isActive ?? true,
      appliesTo: body.appliesTo ?? 'all',
      description: body.description,
      sortOrder: body.sortOrder ?? 0,
    });

    return NextResponse.json(adj, { status: 201 });
  } catch (e) {
    console.error('[BillAdjustments][POST]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
