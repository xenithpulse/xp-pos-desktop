// app/api/bill-adjustments/[id]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { BillAdjustmentModel } from '@/models/factories/BillAdjustment';
import { extractId } from '@/utils/extractID';

// ─────────────────────────────────────────────────────────────────────────────
// GET — Single adjustment
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const id = extractId(request, 3);
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const BA = BillAdjustmentModel(conn);

  try {
    const adj = await BA.findById(id).lean();
    if (!adj) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(adj);
  } catch (e) {
    console.error('[BillAdjustments][GET/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT — Update adjustment
// ─────────────────────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  const id = extractId(request, 3);
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const BA = BillAdjustmentModel(conn);

  try {
    const body = await request.json();
    const adj = await BA.findByIdAndUpdate(id, body, { new: true, runValidators: true }).lean();
    if (!adj) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(adj);
  } catch (e) {
    console.error('[BillAdjustments][PUT/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE — Remove adjustment
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const id = extractId(request, 3);
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const BA = BillAdjustmentModel(conn);

  try {
    const adj = await BA.findByIdAndDelete(id);
    if (!adj) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[BillAdjustments][DELETE/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
