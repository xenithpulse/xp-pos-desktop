// models/factories/TableSession.ts

import { Connection, Model, Types } from 'mongoose';
import { 
  TableSessionSchema, 
  ITableSession,
} from '../schemas/tableSession.schema';
import { TableModel } from './Table';
import { OrderModel, generateOrderNumber } from './Order';
import { IOrder } from '../schemas/order.schema';
import {
  RESERVATION_STATUS_CODES,
  findReservation,
  loadReservationPolicy,
  migrateLegacyReservation,
  tableIsHeld,
} from '@/lib/reservations/server';

// ─────────────────────────────────────────────────────────────────────────────
// Pre-save hook: Generate session number if not exists
// ─────────────────────────────────────────────────────────────────────────────

TableSessionSchema.pre<ITableSession>('save', function () {
  if (!this.sessionNumber && this.isNew) {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.sessionNumber = `SES-${datePart}-${randomPart}`;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Model Factory - Connection-based instantiation
// ─────────────────────────────────────────────────────────────────────────────

export function TableSessionModel(conn: Connection): Model<ITableSession> {
  return (
    conn.models.TableSession ||
    conn.model<ITableSession>('TableSession', TableSessionSchema)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Generate unique session number (atomic — no duplicates under concurrency)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateSessionNumber(conn: Connection): Promise<string> {
  const { nextSequence, invalidateCounterCache } = await import('./Counter');
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const counterName = `session_${datePart}`;
  const prefix = `SES-${datePart}-`;
  const Session = TableSessionModel(conn);

  // Seed: scan existing sessions for today's max sequence
  const seedFn = async (): Promise<number> => {
    const latest = await Session.findOne(
      { sessionNumber: { $regex: `^${prefix}` } },
    )
      .sort({ sessionNumber: -1 })
      .select('sessionNumber')
      .lean();
    if (!latest) return 0;
    const tail = (latest as any).sessionNumber.replace(prefix, '');
    const num = parseInt(tail, 10);
    return isNaN(num) ? 0 : num;
  };

  // Keep incrementing until we find a number not already in the DB.
  // Guards against burned counter values from aborted transactions.
  for (let attempt = 0; attempt < 10; attempt++) {
    // On collision, force counter re-sync so $max catches the real max.
    if (attempt > 0) invalidateCounterCache(counterName);

    const seq = await nextSequence(conn, counterName, seedFn);
    const sessionNumber = `${prefix}${String(seq).padStart(4, '0')}`;

    const exists = await Session.exists({ sessionNumber }).lean();
    if (!exists) return sessionNumber;

    console.warn(`[generateSessionNumber] ${sessionNumber} already exists, advancing counter…`);
  }

  // Ultimate fallback — random suffix
  const fallbackSeq = await nextSequence(conn, counterName);
  const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${prefix}${String(fallbackSeq).padStart(4, '0')}-${rand}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactional: Initiate Table Session (Start Dine-In)
// Creates both a Session and an Order atomically
// ─────────────────────────────────────────────────────────────────────────────

export interface InitiateSessionParams {
  tableId: string;
  waiterId: string;
  covers: number;
  guestName?: string;
  guestPhone?: string;
  isVIP?: boolean;
  notes?: string;
  hostId?: string;
  /**
   * Seat a booked party. The reservation is marked seated and linked to the
   * new session, which is what the "Guest Arrived" CTA sends.
   */
  reservationId?: string;
  /**
   * Seat a walk-in on a table that is inside a reservation's hold window.
   * Requires a deliberate staff override — see checkSeatingGuard().
   */
  overrideReservationHold?: boolean;
}

export interface InitiateSessionResult {
  session: ITableSession;
  order: IOrder;
}

export async function initiateTableSession(
  conn: Connection,
  params: InitiateSessionParams
): Promise<InitiateSessionResult> {
  const Table = TableModel(conn);
  const Session = TableSessionModel(conn);
  const Order = OrderModel(conn);

  // Reservation policy is read once — it can't change mid-retry.
  const policy = await loadReservationPolicy(conn);

  // Retry with fresh numbers if a duplicate-key error occurs.
  // On standalone MongoDB (no replica set) transactions are no-ops,
  // so failed creates leave orphans.  We clean them up on retry.
  const MAX_RETRIES = 4;
  const orphanOrderIds: string[] = [];

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Generate unique numbers OUTSIDE the transaction so the counter
    // state is independent of the transaction outcome.
    const sessionNumber = await generateSessionNumber(conn);
    const orderNumber = await generateOrderNumber(conn);

    // Start a transaction (no-op on standalone, but harmless)
    const mongoSession = await conn.startSession();
    mongoSession.startTransaction();

    const seatedAt = new Date();

    try {
      // 1. Get and validate the table
      // s=status, as=activeSessionId
      // Status codes: 0=available, 1=reserved, 2=occupied, 3=cleaning, 4=blocked
      const table = await Table.findById(params.tableId).session(mongoSession);
      if (!table) {
        throw new Error('Table not found');
      }
      if (table.s !== 0 && table.s !== 1) {  // not available and not reserved
        const statusNames = ['available', 'reserved', 'occupied', 'cleaning', 'blocked'];
        throw new Error(`Table is currently ${statusNames[table.s] || 'unknown'}`);
      }
      if (table.as) {  // activeSessionId
        throw new Error('Table already has an active session');
      }

      // ── Reservation gate ──────────────────────────────────────────────────
      migrateLegacyReservation(table);

      // Resolve the booking being seated first: if staff sent one, this is the
      // guest arriving and no hold can stand in their way — including a hold
      // belonging to a *different* booking on the same table.
      const reservation = params.reservationId
        ? findReservation(table, params.reservationId)
        : null;

      if (params.reservationId && !reservation) {
        throw Object.assign(new Error('Reservation not found on this table'), {
          code: 'RESERVATION_NOT_FOUND',
        });
      }
      if (reservation && reservation.st !== RESERVATION_STATUS_CODES.booked) {
        // Another terminal already seated, cancelled or no-showed this booking.
        throw Object.assign(new Error('This booking has already been resolved'), {
          code: 'RESERVATION_RESOLVED',
        });
      }

      // A booking only denies the table once its hold window opens, so a 21:00
      // reservation confirmed at 18:00 leaves the table sellable until 20:30.
      // Inside the window a walk-in needs a deliberate staff override.
      const held = tableIsHeld(table, policy, seatedAt);

      if (held && !reservation && !params.overrideReservationHold) {
        if (!policy.allowWalkInDuringHold) {
          throw Object.assign(
            new Error(`Table is reserved for ${held.customerName} and walk-ins are not permitted during holds`),
            { code: 'RESERVATION_HOLD', reservation: held, overridable: false },
          );
        }
        throw Object.assign(
          new Error(`Table is held for ${held.customerName} (party of ${held.partySize})`),
          { code: 'RESERVATION_HOLD', reservation: held, overridable: true },
        );
      }

      // 2. Create the Order (using compressed field names)
      // See order.schema.ts for field mappings
      const [order] = await Order.create([{
        on: orderNumber,                    // orderNumber
        m: 0,                               // mode: dine_in = 0
        s: 0,                               // status: draft = 0
        ps: 0,                              // paymentStatus: pending = 0
        i: [],                              // items
        st: 0,                              // subtotal
        tr: 0,                              // taxRate
        ta: 0,                              // taxAmount
        da: 0,                              // discountAmount
        gt: 0,                              // grandTotal
        aj: [],                             // adjustments
        at: 0,                              // adjustmentsTotal
        tx: [],                             // transactions
        ap: 0,                              // amountPaid
        ad: 0,                              // amountDue
        tb: {                               // table
          ti: table._id,                    // tableId
          tn: table.tn,                     // tableNumber (compressed in Table schema)
          sn: table.sn,                     // sectionName (compressed in Table schema)
          gc: params.covers,                // guestCount
        },
        cu: params.guestName ? {            // customer
          n: params.guestName,              // name
          p: params.guestPhone,             // phone
        } : undefined,
        cv: params.covers,                  // covers
        wi: params.waiterId,                // waiterId
        cb: params.waiterId,                // createdBy
        ip: params.isVIP ? 1 : 0,           // isPriority (1=true, 0=false)
        iv: 0,                              // isVoid (0=false)
      }], { session: mongoSession });

      // Timeline note for the reservation being seated — "20m early" is the
      // detail a manager actually wants when reviewing the service later.
      const seatingEvents = [{
        event: 'seated',
        timestamp: seatedAt,
        staffId: new Types.ObjectId(params.waiterId),
        details: `Party of ${params.covers} seated`,
      }];

      if (reservation) {
        const dueAt = reservation.rt instanceof Date ? reservation.rt : new Date(reservation.rt);
        const deltaMin = Math.round((seatedAt.getTime() - dueAt.getTime()) / 60_000);
        const punctuality =
          Math.abs(deltaMin) < 5
            ? 'on time'
            : deltaMin < 0
              ? `${Math.abs(deltaMin)}m early`
              : `${deltaMin}m late`;

        seatingEvents.push({
          event: 'reservation_seated',
          timestamp: seatedAt,
          staffId: new Types.ObjectId(params.waiterId),
          details: `Reservation for ${reservation.cn} seated ${punctuality}`,
        });
      } else if (held && params.overrideReservationHold) {
        seatingEvents.push({
          event: 'reservation_override',
          timestamp: seatedAt,
          staffId: new Types.ObjectId(params.waiterId),
          details: `Walk-in seated over hold for ${held.customerName} at ${new Date(held.reservationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        });
      }

      // 3. Create the Session
      const [session] = await Session.create([{
        tableId: table._id,
        orderId: order._id,
        sessionNumber,
        status: 'active',
        covers: params.covers,
        guestName: params.guestName ?? reservation?.cn,
        guestPhone: params.guestPhone ?? reservation?.cp,
        waiterId: params.waiterId,
        hostId: params.hostId || params.waiterId,
        seatedAt,
        isVIP: params.isVIP || false,
        notes: params.notes ?? reservation?.nt,
        events: seatingEvents,
      }], { session: mongoSession });

      // 4. Update the Table (using compressed field names)
      // s=status, as=activeSessionId, lsc=lastStatusChangeAt
      table.s = 2;  // occupied = 2
      table.as = session._id as Types.ObjectId;
      table.lsc = seatedAt;

      // Close out the booking so it stops holding the table and can't be
      // seated twice from another device.
      if (reservation) {
        reservation.st = RESERVATION_STATUS_CODES.seated;
        reservation.sid = session._id as Types.ObjectId;
        reservation.aAt = reservation.aAt ?? seatedAt;
        reservation.uAt = seatedAt;
      }

      await table.save({ session: mongoSession });

      // 5. Link session to order (sid=sessionId)
      order.sid = session._id as Types.ObjectId;
      await order.save({ session: mongoSession });

      // Commit the transaction
      await mongoSession.commitTransaction();

      // Clean up any orphans from previous failed attempts (fire-and-forget)
      if (orphanOrderIds.length > 0) {
        Order.deleteMany({ _id: { $in: orphanOrderIds } }).catch((e: unknown) =>
          console.warn('[initiateTableSession] orphan cleanup error:', e),
        );
      }

      return { session, order };
    } catch (error: any) {
      // Rollback on error (no-op on standalone)
      await mongoSession.abortTransaction();

      if (error?.code === 11000 && attempt < MAX_RETRIES - 1) {
        console.warn(
          `[initiateTableSession] E11000 on attempt ${attempt + 1}, retrying…`,
        );

        // On standalone MongoDB, the order may have been committed even
        // though the transaction "aborted".  Track it so we can clean up later.
        try {
          const leaked = await Order.findOne({ on: orderNumber }).select('_id').lean();  // on=orderNumber
          if (leaked) orphanOrderIds.push(leaked._id.toString());
        } catch { /* best-effort */ }

        continue;
      }

      throw error;
    } finally {
      mongoSession.endSession();
    }
  } // end retry loop

  // Should never reach here, but satisfy TS
  throw new Error('Failed to initiate session after retries');
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Close a session when order is paid
// ─────────────────────────────────────────────────────────────────────────────

export async function closeTableSession(
  conn: Connection,
  sessionId: string,
  staffId?: string
): Promise<void> {
  const Table = TableModel(conn);
  const Session = TableSessionModel(conn);
  
  const mongoSession = await conn.startSession();
  mongoSession.startTransaction();
  
  try {
    // 1. Get and update the session
    const session = await Session.findById(sessionId).session(mongoSession);
    if (!session) {
      throw new Error('Session not found');
    }
    
    session.status = 'closed';
    session.closedAt = new Date();
    session.events.push({
      event: 'closed',
      timestamp: new Date(),
      staffId: staffId ? new Types.ObjectId(staffId) : undefined,
      details: 'Session closed',
    });
    await session.save({ session: mongoSession });
    
    // 2. Free up the table (using compressed field names)
    // s=status, as=activeSessionId, lsc=lastStatusChangeAt
    // Status codes: 3=cleaning
    const table = await Table.findById(session.tableId).session(mongoSession);
    if (table) {
      table.s = 3;  // cleaning
      table.as = undefined;
      table.lsc = new Date();

      // Retire the booking this session came from so it stops appearing in the
      // table's upcoming list once the party has left.
      migrateLegacyReservation(table);
      const linked = (table.rs ?? []).find(
        (r) => r.sid && String(r.sid) === String(sessionId),
      );
      if (linked && linked.st === RESERVATION_STATUS_CODES.seated) {
        linked.st = RESERVATION_STATUS_CODES.completed;
        linked.uAt = new Date();
      }

      await table.save({ session: mongoSession });
    }

    await mongoSession.commitTransaction();
  } catch (error) {
    await mongoSession.abortTransaction();
    throw error;
  } finally {
    mongoSession.endSession();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: Get active session for a table
// ─────────────────────────────────────────────────────────────────────────────

export async function getActiveSessionForTable(
  conn: Connection,
  tableId: string
): Promise<ITableSession | null> {
  const Session = TableSessionModel(conn);
  
  return Session.findOne({
    tableId,
    status: { $in: ['active', 'billing'] },
  })
    .populate('orderId')
    .populate('waiterId', 'username')
    .lean();
}
