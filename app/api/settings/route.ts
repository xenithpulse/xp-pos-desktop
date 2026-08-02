// app/api/settings/route.ts
// GET  — fetch singleton settings (auto-creates with defaults)
// PUT  — update settings (upsert)

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { getSettings, upsertSettings } from '@/models/factories/Settings';
import { broadcastEvent } from '@/lib/realtime/eventBus';

const log = console.log;

/* ===================== GET ===================== */
export async function GET(_req: NextRequest) {
  // Any authenticated user can read settings
  const authResult = await isAdminRequest({});
  if (authResult) return authResult;

  try {
    const conn = await mongooseConnect();
    const settings = await getSettings(conn);
    return NextResponse.json(settings, { status: 200 });
  } catch (e) {
    log('[Settings API][GET]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

/* ===================== PUT ===================== */
export async function PUT(req: NextRequest) {
  // Only users with manage_settings (super_admin will have it) can update
  const authResult = await isAdminRequest({ requiredRole: 'super_admin' });
  if (authResult) return authResult;

  try {
    const conn = await mongooseConnect();
    const body = await req.json();

    // Strip read-only fields just in case
    delete body._id;
    delete body.createdAt;
    delete body.updatedAt;

    const settings = await upsertSettings(conn, body);

    // Notify every open terminal so they refetch settings live (currency,
    // receipt, payment methods, hub config, …) without a manual reload.
    broadcastEvent({
      type: 'settings:updated',
      entityId: 'settings',
      payload: { action: 'updated' },
      timestamp: Date.now(),
    });

    return NextResponse.json(settings, { status: 200 });
  } catch (e) {
    log('[Settings API][PUT]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
