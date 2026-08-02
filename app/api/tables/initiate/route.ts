// app/api/tables/initiate/route.ts
// Create a new table session and dine-in order in a single transaction

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest, getSession } from '@/lib/auth';
import { initiateTableSession } from '@/models/factories/TableSession';
import { broadcastEvent } from '@/lib/realtime/eventBus';
import { prepareTableForResponse } from '@/lib/compression/api-helpers';

const log = console.log;

// ─────────────────────────────────────────────────────────────────────────────
// POST - Initiate a new table session
// ─────────────────────────────────────────────────────────────────────────────

interface InitiateTableRequest {
  tableId: string;
  covers?: number;
  waiterId?: string;
  notes?: string;
  /** Seating a booked party — sent by the "Guest Arrived" CTA. */
  reservationId?: string;
  /** Deliberate staff override to seat a walk-in during a reservation hold. */
  overrideReservationHold?: boolean;
}

export async function POST(request: NextRequest) {
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const session = await getSession();
  const staffId = session?.user?.id;

  if (!staffId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const data: InitiateTableRequest = await request.json();
    
    if (!data.tableId) {
      return NextResponse.json(
        { error: 'tableId is required' },
        { status: 400 }
      );
    }

    const conn = await mongooseConnect();
    
    const result = await initiateTableSession(conn, {
      tableId: data.tableId,
      covers: data.covers || 1,
      hostId: staffId,
      waiterId: data.waiterId || staffId, // Default to current staff if no waiter specified
      notes: data.notes,
      reservationId: data.reservationId,
      overrideReservationHold: !!data.overrideReservationHold,
    });

    // Fetch updated table with session data
    const { TableModel } = await import('@/models/factories/Table');
    const Table = TableModel(conn);
    const updatedTable = await Table.findById(data.tableId)
      .populate('as')  // as = activeSessionId (compressed field name)
      .lean();

    broadcastEvent({
      type: 'table:session_started',
      entityId: data.tableId,
      payload: {
        sessionId: result.session._id?.toString(),
        orderId: result.order._id?.toString(),
        orderNumber: result.order.on,         // compressed: on = orderNumber
        tableNumber: (updatedTable as any)?.tn, // compressed: tn = tableNumber
        status: 'occupied',
        covers: data.covers || 1,
        fromReservation: !!data.reservationId,
      },
      timestamp: Date.now(),
    });

    return NextResponse.json({
      success: true,
      session: result.session,
      order: result.order,
      table: prepareTableForResponse(updatedTable as any),
    });
  } catch (e: any) {
    log('[Tables API][POST /initiate]', e);

    // Table is inside a reservation hold. 423 (Locked) rather than 409 so the
    // client can tell "someone else took it" apart from "a booking owns it" —
    // the latter is recoverable by retrying with overrideReservationHold.
    if (e.code === 'RESERVATION_HOLD') {
      return NextResponse.json(
        {
          error: e.message,
          code: 'RESERVATION_HOLD',
          overridable: e.overridable !== false,
          reservation: e.reservation ?? null,
        },
        { status: 423 },
      );
    }
    if (e.code === 'RESERVATION_NOT_FOUND' || e.code === 'RESERVATION_RESOLVED') {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 409 });
    }

    // Handle specific errors with clear user-facing messages
    if (e.message === 'Table not found') {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }
    if (e.message === 'Table is not available') {
      return NextResponse.json(
        { error: 'Table is not available for seating' },
        { status: 400 }
      );
    }
    if (e.message?.includes('Table is currently')) {
      // e.g. "Table is currently occupied", "Table is currently cleaning"
      return NextResponse.json(
        { error: e.message, code: 'TABLE_UNAVAILABLE' },
        { status: 409 }  // Conflict status
      );
    }
    if (e.message === 'Table already has an active session') {
      return NextResponse.json(
        { error: 'Table already has an active session. Please refresh to see the latest status.', code: 'SESSION_EXISTS' },
        { status: 409 }
      );
    }
    
    return NextResponse.json(
      { message: 'Failed to initiate table session', error: e.message },
      { status: 500 }
    );
  }
}
