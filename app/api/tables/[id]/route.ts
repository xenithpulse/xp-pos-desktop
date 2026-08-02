// app/api/tables/[id]/route.ts
// Uses compressed field names for storage efficiency

import { NextRequest, NextResponse } from 'next/server';
import { mongooseConnect } from '@/lib/mongoose';
import { isAdminRequest } from '@/lib/auth';
import { TableModel } from '@/models/factories/Table';
import { extractId } from '@/utils/extractID';
import { TableStatus, TableShape } from '@/models/schemas/table.schema';
import { isVersionConflict, versionConflictBody, withRetry } from '@/lib/concurrency';
import { broadcastEvent } from '@/lib/realtime/eventBus';
import { prepareTableForResponse } from '@/lib/compression/api-helpers';
import {
  RESERVATION_STATUS_CODES,
  ReservationInput,
  applyProjectedStatus,
  findReservation,
  loadReservationPolicy,
  migrateLegacyReservation,
  moveReservation,
  toCompressed,
  toScheduledList,
  validateReservation,
} from '@/lib/reservations/server';

const log = console.log;

// Status mappings: numeric code <-> string name
const STATUS_CODES: Record<TableStatus, number> = {
  available: 0, reserved: 1, occupied: 2, cleaning: 3, blocked: 4,
};
const STATUS_NAMES: TableStatus[] = ['available', 'reserved', 'occupied', 'cleaning', 'blocked'];

// Shape mappings
const SHAPE_CODES: Record<TableShape, number> = {
  square: 0, rectangle: 1, round: 2, oval: 3,
};

// ─────────────────────────────────────────────────────────────────────────────
// GET - Retrieve single table by ID
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const id = extractId(request, 3);
  
  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Table = TableModel(conn);

  try {
    const table = await Table.findById(id)
      .populate({
        path: 'as',              // activeSessionId
        populate: [
          { path: 'orderId' },
          { path: 'waiterId', select: 'username' },
        ],
      })
      .lean();
      
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Decoded: callers read `status` / `tableNumber` / `reservations`, not the
    // compressed field names.
    return NextResponse.json(prepareTableForResponse(table as any));
  } catch (e) {
    log('[Tables API][GET/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT - Update table details
// ─────────────────────────────────────────────────────────────────────────────

interface TableUpdatePayload {
  tableNumber?: string;
  name?: string;
  sectionId?: string;
  sectionName?: string;
  x_position?: number;
  y_position?: number;
  width?: number;
  height?: number;
  orientation?: number;
  shape?: TableShape;
  capacity?: number;
  minCovers?: number;
  status?: TableStatus;
  color?: string;
  isActive?: boolean;
}

export async function PUT(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Table = TableModel(conn);

  try {
    const data: TableUpdatePayload = await request.json();
    
    const table = await Table.findById(id);
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Apply updates using compressed field names
    if (data.tableNumber !== undefined) table.tn = data.tableNumber;
    if (data.name !== undefined) table.n = data.name;
    if (data.sectionId !== undefined) table.si = data.sectionId as any;
    if (data.sectionName !== undefined) table.sn = data.sectionName;
    if (data.x_position !== undefined) table.x = data.x_position;
    if (data.y_position !== undefined) table.y = data.y_position;
    if (data.width !== undefined) table.w = data.width;
    if (data.height !== undefined) table.h = data.height;
    if (data.orientation !== undefined) table.o = data.orientation;
    if (data.shape !== undefined) table.sh = SHAPE_CODES[data.shape];
    if (data.capacity !== undefined) table.c = data.capacity;
    if (data.minCovers !== undefined) table.mc = data.minCovers;
    if (data.status !== undefined) table.s = STATUS_CODES[data.status];
    if (data.color !== undefined) table.cl = data.color;
    if (data.isActive !== undefined) table.ia = data.isActive ? 1 : 0;

    await table.save();

    broadcastEvent({
      type: 'table:updated',
      entityId: id,
      __v: (table as any).__v,
      payload: {
        action: 'details_updated',
        status: STATUS_NAMES[table.s] || 'unknown',
        tableNumber: table.tn,
      },
      timestamp: Date.now(),
    });
    
    // Return as plain object to avoid ObjectId serialization issues
    return NextResponse.json(prepareTableForResponse(table.toObject() as any));
  } catch (e) {
    log('[Tables API][PUT/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE - Remove a table
// ─────────────────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Table = TableModel(conn);

  try {
    const table = await Table.findById(id);
    if (!table) {
      return NextResponse.json({ error: 'Table not found' }, { status: 404 });
    }

    // Check if table has active session (as = activeSessionId)
    if (table.as) {
      return NextResponse.json(
        { error: 'Cannot delete table with active session' },
        { status: 400 }
      );
    }

    await Table.findByIdAndDelete(id);

    broadcastEvent({
      type: 'table:updated',
      entityId: id,
      payload: { action: 'deleted', tableNumber: table.tn },
      timestamp: Date.now(),
    });

    return NextResponse.json({ success: true, message: 'Table deleted' });
  } catch (e) {
    log('[Tables API][DELETE/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH - Quick status update (with optimistic concurrency)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reservation-aware actions.
 *
 * `set_reserved` / `clear_reservation` are kept for older clients and now map
 * onto the reservation queue rather than the retired single `r` slot.
 *
 * Status is never set directly for reservation actions — it is projected from
 * the queue by applyProjectedStatus(), which is what keeps a table with a 21:00
 * booking sellable until its hold window opens.
 */
export async function PATCH(request: NextRequest) {
  const id = extractId(request, 3);

  const denied = await isAdminRequest({ requiredPerm: 'manage_orders' });
  if (denied) return denied;

  const conn = await mongooseConnect();
  const Table = TableModel(conn);

  try {
    const { action, ...data } = await request.json();
    const policy = await loadReservationPolicy(conn);
    const now = new Date();

    // ── Cross-table action: handled outside withRetry (touches two docs) ──
    if (action === 'move_reservation') {
      try {
        const moved = await moveReservation(
          conn,
          id,
          data.reservationId,
          data.targetTableId,
          policy,
          { force: !!data.force, now },
        );

        for (const t of [moved.from, moved.to]) {
          broadcastEvent({
            type: 'table:updated',
            entityId: String(t._id),
            __v: (t as any).__v,
            payload: {
              action: 'reservation_moved',
              status: STATUS_NAMES[t.s] || 'unknown',
              tableNumber: t.tn,
            },
            timestamp: Date.now(),
          });
        }

        return NextResponse.json({
          success: true,
          table: prepareTableForResponse(moved.from.toObject() as any),
          targetTable: prepareTableForResponse(moved.to.toObject() as any),
        });
      } catch (e: any) {
        const status = e?.code === 'NOT_FOUND' ? 404 : e?.code === 'CONFLICT' ? 409 : 400;
        return NextResponse.json(
          { error: e?.message || 'Failed to move reservation', code: e?.code, details: e?.details },
          { status },
        );
      }
    }

    // Use withRetry for automatic retry on version conflicts
    const result = await withRetry(async () => {
      const table = await Table.findById(id);
      if (!table) {
        return NextResponse.json({ error: 'Table not found' }, { status: 404 });
      }

      // Every path below reads the queue, so retire the legacy slot first.
      migrateLegacyReservation(table);
      if (!table.rs) table.rs = [];

      switch (action) {
        case 'set_available':
          if (table.as) {  // activeSessionId
            return NextResponse.json(
              { error: 'Cannot set available while session is active' },
              { status: 400 }
            );
          }
          table.s = STATUS_CODES.available;  // status
          // A reservation still holding the table pulls it straight back to
          // 'reserved' — clearing status must not silently drop a booking.
          applyProjectedStatus(table, policy, now);
          break;

        // ── Create a booking ────────────────────────────────────────────────
        case 'set_reserved':          // legacy alias
        case 'add_reservation': {
          const input = data.reservation as ReservationInput;
          if (!input) {
            return NextResponse.json({ error: 'reservation payload is required' }, { status: 400 });
          }

          const problems = validateReservation(
            table,
            input,
            toScheduledList(table.rs),
            policy,
            now,
          );
          const blocking = problems.filter((p) => !p.overridable || !data.force);
          if (blocking.length) {
            return NextResponse.json(
              {
                error: blocking[0].message,
                code: 'RESERVATION_INVALID',
                problems: blocking,
                // Everything left is waivable — the client can re-send force:true
                overridable: blocking.every((p) => p.overridable),
              },
              { status: 400 },
            );
          }

          table.rs.push(toCompressed(input) as any);
          applyProjectedStatus(table, policy, now);
          break;
        }

        // ── Amend a booking (time change, bigger party, new phone) ──────────
        case 'update_reservation': {
          const target = findReservation(table, data.reservationId);
          if (!target) {
            return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
          }
          if (target.st !== RESERVATION_STATUS_CODES.booked) {
            return NextResponse.json(
              { error: 'Only open bookings can be edited' },
              { status: 400 },
            );
          }

          const input = { ...toPlainInput(target), ...(data.reservation as Partial<ReservationInput>) };
          const problems = validateReservation(
            table,
            input as ReservationInput,
            toScheduledList(table.rs),
            policy,
            now,
            String(target._id),
          );
          const blocking = problems.filter((p) => !p.overridable || !data.force);
          if (blocking.length) {
            return NextResponse.json(
              {
                error: blocking[0].message,
                code: 'RESERVATION_INVALID',
                problems: blocking,
                overridable: blocking.every((p) => p.overridable),
              },
              { status: 400 },
            );
          }

          const encoded = toCompressed(input as ReservationInput);
          target.cn = encoded.cn;
          target.cp = encoded.cp;
          target.ps = encoded.ps;
          target.rt = encoded.rt;
          target.du = encoded.du;
          target.hm = encoded.hm;
          target.gm = encoded.gm;
          target.nt = encoded.nt;
          target.uAt = now;
          applyProjectedStatus(table, policy, now);
          break;
        }

        // ── Guest is at the door but their table isn't free yet ─────────────
        case 'mark_arrived': {
          const target = findReservation(table, data.reservationId);
          if (!target) {
            return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
          }
          if (target.st !== RESERVATION_STATUS_CODES.booked) {
            return NextResponse.json(
              { error: 'Only open bookings can be checked in' },
              { status: 400 },
            );
          }
          // Checking in freezes the no-show clock: a guest standing in the
          // restaurant must never be auto-released.
          target.aAt = now;
          target.uAt = now;
          applyProjectedStatus(table, policy, now);
          break;
        }

        case 'cancel_reservation':
        case 'mark_no_show': {
          const target = findReservation(table, data.reservationId);
          if (!target) {
            return NextResponse.json({ error: 'Reservation not found' }, { status: 404 });
          }
          if (target.st !== RESERVATION_STATUS_CODES.booked) {
            return NextResponse.json(
              { error: 'This booking has already been resolved' },
              { status: 400 },
            );
          }
          target.st =
            action === 'mark_no_show'
              ? RESERVATION_STATUS_CODES.no_show
              : RESERVATION_STATUS_CODES.cancelled;
          target.rn = data.reason?.trim() || undefined;
          target.aAt = undefined;
          target.uAt = now;
          applyProjectedStatus(table, policy, now);
          break;
        }

        case 'set_cleaning':
          table.s = STATUS_CODES.cleaning;  // status
          table.as = undefined;             // activeSessionId
          break;

        case 'set_blocked':
          if (table.as) {  // activeSessionId
            return NextResponse.json(
              { error: 'Cannot block an occupied table' },
              { status: 400 }
            );
          }
          table.s = STATUS_CODES.blocked;  // status
          break;

        // ── Legacy: drop every open booking on the table ────────────────────
        case 'clear_reservation': {
          for (const r of table.rs) {
            if (r.st === RESERVATION_STATUS_CODES.booked) {
              r.st = RESERVATION_STATUS_CODES.cancelled;
              r.rn = data.reason?.trim() || 'Cleared from floor plan';
              r.uAt = now;
            }
          }
          applyProjectedStatus(table, policy, now);
          break;
        }

        default:
          return NextResponse.json(
            { error: `Unknown action: ${action}` },
            { status: 400 }
          );
      }

      // save() now checks __v automatically (optimisticConcurrency: true)
      await table.save();
      return table;
    });

    // Transactional / early-return cases (validation errors) already
    // returned a NextResponse — pass them through.
    if (result instanceof NextResponse) {
      return result;
    }

    // Broadcast OUTSIDE withRetry to prevent duplicate events on retry
    broadcastEvent({
      type: 'table:updated',
      entityId: id,
      __v: (result as any).__v,
      payload: {
        status: STATUS_NAMES[(result as any).s] || 'unknown',
        tableNumber: (result as any).tn,
        action,
      },
      timestamp: Date.now(),
    });

    // Decoded response — the floor plan patches its local table from this.
    return NextResponse.json(prepareTableForResponse((result as any).toObject()) as any);
  } catch (e) {
    if (isVersionConflict(e)) {
      return NextResponse.json(versionConflictBody('Table'), { status: 409 });
    }
    log('[Tables API][PATCH/:id]', e);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

/** Compressed reservation → the human-readable input shape, for merge-on-edit. */
function toPlainInput(r: any): ReservationInput {
  return {
    customerName: r.cn,
    customerPhone: r.cp,
    partySize: r.ps,
    reservationTime: (r.rt instanceof Date ? r.rt : new Date(r.rt)).toISOString(),
    durationMinutes: r.du,
    holdMinutes: r.hm,
    graceMinutes: r.gm,
    notes: r.nt,
  };
}
