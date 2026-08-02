// app/api/inventory/config/route.ts
// Read / update the inventory financial controls (Cash In Hand + value tiers).

import { NextRequest, NextResponse } from 'next/server';
import { Types } from 'mongoose';
import { mongooseConnect } from '@/lib/mongoose';
import { InventoryConfigModel, getInventoryConfig } from '@/models/factories/InventoryConfig';
import { isAdminRequest, getSession } from '@/lib/auth';

export async function GET() {
  const authError = await isAdminRequest({ requiredPerm: 'manage_inventory' });
  if (authError) return authError;

  try {
    const conn = await mongooseConnect();
    const config = await getInventoryConfig(conn);
    return NextResponse.json(config.toObject());
  } catch (error) {
    console.error('Failed to fetch inventory config:', error);
    return NextResponse.json({ error: 'Failed to fetch inventory config' }, { status: 500 });
  }
}

interface UpdateConfigPayload {
  cashInHand?: number;
  cashNote?: string;
  tierHigh?: number;
  tierLow?: number;
}

export async function PUT(req: NextRequest) {
  const authError = await isAdminRequest({ requiredPerm: 'manage_inventory' });
  if (authError) return authError;

  try {
    const conn = await mongooseConnect();
    const Config = InventoryConfigModel(conn);
    const session = await getSession();
    const byId = session?.user?.id && Types.ObjectId.isValid(session.user.id)
      ? new Types.ObjectId(session.user.id)
      : undefined;

    const data: UpdateConfigPayload = await req.json();
    const config = await getInventoryConfig(conn);

    const set: Record<string, unknown> = {};
    const cashChanged = data.cashInHand !== undefined && data.cashInHand !== config.cashInHand;

    if (data.cashInHand !== undefined) {
      set.cashInHand = data.cashInHand;
      set.cashUpdatedAt = new Date();
      if (byId) set.cashUpdatedBy = byId;
    }
    if (data.cashNote !== undefined) set.cashNote = data.cashNote;
    if (data.tierHigh !== undefined) set.tierHigh = data.tierHigh;
    if (data.tierLow !== undefined) set.tierLow = data.tierLow;

    const update: Record<string, unknown> = { $set: set };
    if (cashChanged) {
      update.$push = {
        cashHistory: {
          $each: [{
            amount: data.cashInHand,
            note: data.cashNote,
            by: byId,
            at: new Date(),
          }],
          $slice: -50,
        },
      };
    }

    const updated = await Config.findByIdAndUpdate(config._id, update, {
      new: true,
      runValidators: true,
    }).lean();

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update inventory config:', error);
    return NextResponse.json({ error: 'Failed to update inventory config' }, { status: 500 });
  }
}
