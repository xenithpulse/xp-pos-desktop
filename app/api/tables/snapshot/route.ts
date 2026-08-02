// app/api/tables/snapshot/route.ts
// Lightweight endpoint for delta-detection — returns minimal fields per table.
// Clients compare `uAt` (updatedAt) / `__v` to decide which tables need a full refetch.
// Uses compressed field names: s=status, as=activeSessionId, uAt=updatedAt

import { NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { TableModel } from '@/models/factories/Table';

export const dynamic = 'force-dynamic';

// Status code to name mapping for response
const STATUS_NAMES = ['available', 'reserved', 'occupied', 'cleaning', 'blocked'];

export async function GET() {
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Table = TableModel(conn);

  try {
    // Query using compressed field names
    const snapshots = await Table.find({})
      .select('_id s as uAt __v')  // s=status, as=activeSessionId, uAt=updatedAt
      .lean();

    // Transform response to use human-readable names for client compatibility
    const transformed = snapshots.map((t: any) => ({
      _id: t._id,
      status: STATUS_NAMES[t.s] || 'unknown',
      activeSessionId: t.as,
      updatedAt: t.uAt,
      __v: t.__v,
    }));

    return NextResponse.json(transformed, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (e) {
    console.error('[Tables Snapshot API]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
