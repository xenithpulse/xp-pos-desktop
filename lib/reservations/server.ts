// lib/reservations/server.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Server-side reservation operations
//
// Everything here works on the COMPRESSED table document (`rs` array, `st`
// codes) but reasons through the shared engine in ./schedule by decoding on the
// way in. That keeps a single definition of "is this table held right now" for
// both the API and the floor screens.
// ═══════════════════════════════════════════════════════════════════════════════

import { Connection, Types } from 'mongoose';
import type { IReservation, ITable } from '@/models/schemas/table.schema';
import { TableModel } from '@/models/factories/Table';
import { getSettings } from '@/models/factories/Settings';
import {
  DEFAULT_RESERVATION_POLICY,
  RESERVATION_STATUS_CODES,
  RESERVATION_STATUS_VALUES,
  ReservationPolicy,
  ScheduledReservation,
  findConflicts,
  getActiveReservation,
  getPhase,
  getTiming,
  getWalkInWindow,
  isBlocking,
  isReleasable,
  projectTableStatus,
  resolvePolicy,
} from './schedule';

// ─────────────────────────────────────────────────────────────────────────────
// Status codes (mirrors the table schema)
// ─────────────────────────────────────────────────────────────────────────────

export const TABLE_STATUS_CODES = {
  available: 0, reserved: 1, occupied: 2, cleaning: 3, blocked: 4,
} as const;

export const TABLE_STATUS_NAMES = [
  'available', 'reserved', 'occupied', 'cleaning', 'blocked',
] as const;

export type TableStatusName = (typeof TABLE_STATUS_NAMES)[number];

// ─────────────────────────────────────────────────────────────────────────────
// Policy loading
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Read the tenant's reservation policy out of settings.hub.
 * Falls back to engine defaults so a tenant that never touched Settings still
 * behaves sensibly.
 */
export async function loadReservationPolicy(conn: Connection): Promise<ReservationPolicy> {
  try {
    const settings = await getSettings(conn);
    const hub = (settings as any)?.hub ?? {};
    return resolvePolicy({
      holdMinutes: hub.reservationHoldMinutes,
      durationMinutes: hub.reservationDurationMinutes,
      graceMinutes: hub.reservationGraceMinutes,
      autoReleaseMinutes: hub.reservationAutoReleaseMinutes,
      allowWalkInDuringHold: hub.allowWalkInDuringHold,
    });
  } catch {
    return { ...DEFAULT_RESERVATION_POLICY };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Compressed ⇄ engine conversion
// ─────────────────────────────────────────────────────────────────────────────

/** Compressed sub-document → the shape the scheduling engine understands. */
export function toScheduled(r: IReservation | any): ScheduledReservation {
  return {
    _id: r._id ? String(r._id) : undefined,
    customerName: r.cn,
    customerPhone: r.cp,
    partySize: r.ps,
    reservationTime: r.rt instanceof Date ? r.rt.toISOString() : new Date(r.rt).toISOString(),
    durationMinutes: r.du,
    holdMinutes: r.hm,
    graceMinutes: r.gm,
    status: RESERVATION_STATUS_VALUES[r.st ?? 0] ?? 'booked',
    notes: r.nt,
    sessionId: r.sid ? String(r.sid) : undefined,
    arrivedAt: r.aAt ? new Date(r.aAt).toISOString() : undefined,
    resolutionNote: r.rn,
    createdAt: r.cAt ? new Date(r.cAt).toISOString() : undefined,
    updatedAt: r.uAt ? new Date(r.uAt).toISOString() : undefined,
  };
}

export function toScheduledList(list: (IReservation | any)[] | undefined | null): ScheduledReservation[] {
  return (list ?? []).map(toScheduled);
}

/** Human-readable API payload → compressed sub-document fields. */
export interface ReservationInput {
  customerName: string;
  customerPhone?: string;
  partySize: number;
  reservationTime: string;
  durationMinutes?: number;
  holdMinutes?: number;
  graceMinutes?: number;
  notes?: string;
}

export function toCompressed(input: ReservationInput): Omit<IReservation, '_id'> {
  return {
    cn: String(input.customerName || '').trim(),
    cp: input.customerPhone?.trim() || undefined,
    ps: Math.max(1, Math.floor(Number(input.partySize) || 1)),
    rt: new Date(input.reservationTime),
    du: optionalMinutes(input.durationMinutes),
    hm: optionalMinutes(input.holdMinutes),
    gm: optionalMinutes(input.graceMinutes),
    st: RESERVATION_STATUS_CODES.booked,
    nt: input.notes?.trim() || undefined,
    cAt: new Date(),
    uAt: new Date(),
  };
}

function optionalMinutes(v: unknown): number | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────────────

export interface ValidationProblem {
  code: 'INVALID_NAME' | 'INVALID_TIME' | 'INVALID_PARTY' | 'OVER_CAPACITY' | 'CONFLICT' | 'IN_PAST';
  message: string;
  /** Advisory problems can be waived by passing `force: true`. */
  overridable: boolean;
  details?: unknown;
}

/**
 * Check a proposed reservation against the table. Hard failures always reject;
 * overridable ones (past time, over capacity, clash with another booking) come
 * back so the UI can ask staff to confirm rather than silently blocking them.
 */
export function validateReservation(
  table: ITable,
  input: ReservationInput,
  existing: ScheduledReservation[],
  policy: ReservationPolicy,
  now: Date = new Date(),
  excludeId?: string,
): ValidationProblem[] {
  const problems: ValidationProblem[] = [];

  if (!input.customerName || !String(input.customerName).trim()) {
    problems.push({ code: 'INVALID_NAME', message: 'Customer name is required', overridable: false });
  }

  const when = new Date(input.reservationTime);
  if (!input.reservationTime || Number.isNaN(when.getTime())) {
    problems.push({ code: 'INVALID_TIME', message: 'A valid reservation time is required', overridable: false });
    return problems; // everything below needs a usable time
  }

  const party = Number(input.partySize);
  if (!Number.isFinite(party) || party < 1) {
    problems.push({ code: 'INVALID_PARTY', message: 'Party size must be at least 1', overridable: false });
  } else if (party > table.c) {
    problems.push({
      code: 'OVER_CAPACITY',
      message: `Party of ${party} exceeds table capacity of ${table.c}`,
      overridable: true,
    });
  }

  if (when.getTime() < now.getTime()) {
    problems.push({
      code: 'IN_PAST',
      message: 'Reservation time is in the past',
      overridable: true,
    });
  }

  const candidate: ScheduledReservation = {
    _id: excludeId,
    customerName: input.customerName,
    partySize: party,
    reservationTime: when.toISOString(),
    durationMinutes: input.durationMinutes,
    holdMinutes: input.holdMinutes,
    graceMinutes: input.graceMinutes,
    status: 'booked',
  };

  const clashes = findConflicts(existing, candidate, now, policy);
  if (clashes.length) {
    problems.push({
      code: 'CONFLICT',
      message: `Overlaps ${clashes.length} existing booking${clashes.length > 1 ? 's' : ''} on this table`,
      overridable: true,
      details: clashes.map((c) => ({
        _id: c._id,
        customerName: c.customerName,
        reservationTime: c.reservationTime,
      })),
    });
  }

  return problems;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seating guard
// ─────────────────────────────────────────────────────────────────────────────

export interface SeatingGuardResult {
  allowed: boolean;
  /** The reservation currently holding the table, when one exists. */
  blockedBy: ScheduledReservation | null;
  /** Minutes the walk-in has before the next hold window opens. */
  minutesFree: number | null;
  freeUntil: string | null;
  message: string;
}

/**
 * Decide whether a walk-in may take this table right now.
 *
 * This is the rule that recovers the wasted hours: a 21:00 booking confirmed at
 * 18:00 leaves `allowed: true` with `minutesFree: 150` until the hold window
 * opens at 20:30. Only inside the hold window does seating need an override.
 */
export function checkSeatingGuard(
  reservations: ScheduledReservation[],
  policy: ReservationPolicy,
  now: Date = new Date(),
): SeatingGuardResult {
  const win = getWalkInWindow(reservations, now, policy);

  if (!win.blockedBy) {
    return {
      allowed: true,
      blockedBy: null,
      minutesFree: win.minutesFree,
      freeUntil: win.freeUntil ? win.freeUntil.toISOString() : null,
      message: win.reason,
    };
  }

  const t = getTiming(win.blockedBy, policy);
  return {
    allowed: false,
    blockedBy: win.blockedBy,
    minutesFree: 0,
    freeUntil: null,
    message:
      `Table is held for ${win.blockedBy.customerName} ` +
      `(party of ${win.blockedBy.partySize}) at ${t.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation — the "no cron job" engine
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconcileChange {
  tableId: string;
  tableNumber: string;
  from: TableStatusName;
  to: TableStatusName;
  /** Reservations auto-released as no-shows during this pass. */
  released: { _id?: string; customerName: string }[];
  migrated: boolean;
}

/**
 * Bring stored table state in line with the clock.
 *
 * Runs on every floor-plan fetch instead of a background scheduler, so a
 * single-site LAN deployment needs no extra process. Each pass:
 *   1. lifts any legacy single `r` reservation into the `rs` queue,
 *   2. auto-releases bookings past their no-show cutoff,
 *   3. flips available ⇄ reserved to match the hold windows.
 *
 * Writes are guarded on the value being replaced, so when several floor screens
 * poll at once only one write lands and only one broadcast fires.
 */
export async function reconcileTableReservations(
  conn: Connection,
  policy?: ReservationPolicy,
  now: Date = new Date(),
): Promise<ReconcileChange[]> {
  const Table = TableModel(conn);
  const pol = policy ?? (await loadReservationPolicy(conn));

  // Only tables that could possibly need work: legacy field present, or a
  // queue entry, or a status the clock might have invalidated.
  const candidates = await Table.find({
    ia: 1,
    $or: [
      { 'rs.0': { $exists: true } },
      { r: { $exists: true, $ne: null } },
      { s: TABLE_STATUS_CODES.reserved },
    ],
  })
    .select('tn s as rs r __v')
    .lean();

  const changes: ReconcileChange[] = [];

  for (const raw of candidates as any[]) {
    const tableId = String(raw._id);
    let queue: any[] = raw.rs ?? [];
    let migrated = false;

    // ── 1. Lift the legacy single reservation into the queue ──
    if (raw.r) {
      const lifted = queue.length
        ? queue
        : [{ ...raw.r, _id: new Types.ObjectId(), st: raw.r.st ?? RESERVATION_STATUS_CODES.booked }];

      const res = await Table.updateOne(
        { _id: raw._id, r: { $exists: true, $ne: null } },
        { $set: { rs: lifted }, $unset: { r: '' } },
      );

      // Another request migrated it first — our in-memory ids are stale, so
      // skip this table and let the next pass work off the persisted queue.
      if (res.modifiedCount === 0) continue;

      queue = lifted;
      migrated = true;
    }

    const scheduled = toScheduledList(queue);

    // ── 2. Auto-release bookings past their no-show cutoff ──
    const releasedIds: Types.ObjectId[] = [];
    const released: { _id?: string; customerName: string }[] = [];
    if (pol.autoReleaseMinutes > 0) {
      for (const r of scheduled) {
        if (r._id && isReleasable(r, now, pol)) {
          releasedIds.push(new Types.ObjectId(r._id));
          released.push({ _id: r._id, customerName: r.customerName });
        }
      }
    }

    let didRelease = false;
    if (releasedIds.length) {
      // arrayFilters keeps this idempotent: a concurrent pass that already
      // flipped these entries matches nothing and reports modifiedCount 0.
      const res = await Table.updateOne(
        { _id: raw._id },
        {
          $set: {
            'rs.$[el].st': RESERVATION_STATUS_CODES.no_show,
            'rs.$[el].rn': 'Auto-released (no-show)',
          },
        },
        { arrayFilters: [{ 'el._id': { $in: releasedIds }, 'el.st': RESERVATION_STATUS_CODES.booked }] },
      );
      didRelease = res.modifiedCount > 0;
    }

    const releasedSet = new Set(releasedIds.map(String));
    const survivors = scheduled.map((r) =>
      r._id && releasedSet.has(r._id) ? { ...r, status: 'no_show' as const } : r,
    );

    // ── 3. Flip available ⇄ reserved to match the hold windows ──
    const storedStatus = (TABLE_STATUS_NAMES[raw.s] ?? 'available') as TableStatusName;
    const nextStatus = projectTableStatus(storedStatus, survivors, !!raw.as, now, pol) as TableStatusName;

    let didStatus = false;
    if (nextStatus !== storedStatus) {
      // Guarding on the old status means only one of several polling floor
      // screens actually writes — and so only one broadcast goes out.
      const res = await Table.updateOne(
        { _id: raw._id, s: raw.s },
        { $set: { s: TABLE_STATUS_CODES[nextStatus], lsc: now } },
      );
      didStatus = res.modifiedCount > 0;
    }

    if (migrated || didRelease || didStatus) {
      changes.push({
        tableId,
        tableNumber: raw.tn,
        from: storedStatus,
        to: didStatus ? nextStatus : storedStatus,
        released: didRelease ? released : [],
        migrated,
      });
    }
  }

  return changes;
}

/**
 * Recompute and persist one table's status from its own queue.
 * Called after every reservation mutation so the write and its projection land
 * together rather than waiting for the next fetch.
 */
export function applyProjectedStatus(
  table: ITable,
  policy: ReservationPolicy,
  now: Date = new Date(),
): TableStatusName {
  const storedStatus = (TABLE_STATUS_NAMES[table.s] ?? 'available') as TableStatusName;
  const next = projectTableStatus(
    storedStatus,
    toScheduledList(table.rs),
    !!table.as,
    now,
    policy,
  ) as TableStatusName;

  if (next !== storedStatus) {
    table.s = TABLE_STATUS_CODES[next];
    table.lsc = now;
  }
  return next;
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue helpers used by the API routes
// ─────────────────────────────────────────────────────────────────────────────

/** Lift a legacy single `r` into the queue. Safe to call repeatedly. */
export function migrateLegacyReservation(table: ITable): boolean {
  if (!table.r) return false;
  if (!table.rs) table.rs = [];
  if (table.rs.length === 0) {
    table.rs.push({ ...(table.r as any), st: (table.r as any).st ?? RESERVATION_STATUS_CODES.booked });
  }
  table.r = undefined;
  return true;
}

export function findReservation(table: ITable, reservationId: string): IReservation | null {
  return (table.rs ?? []).find((r) => String(r._id) === String(reservationId)) ?? null;
}

/** The reservation staff should act on, decoded for messaging. */
export function activeReservationOf(
  table: ITable,
  policy: ReservationPolicy,
  now: Date = new Date(),
): ScheduledReservation | null {
  return getActiveReservation(toScheduledList(table.rs), now, policy);
}

/** Is any reservation on this table holding it right now? */
export function tableIsHeld(
  table: ITable,
  policy: ReservationPolicy,
  now: Date = new Date(),
): ScheduledReservation | null {
  return toScheduledList(table.rs).find((r) => isBlocking(r, now, policy)) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Moving a reservation between tables
// ─────────────────────────────────────────────────────────────────────────────

export interface MoveResult {
  from: ITable;
  to: ITable;
  reservation: IReservation;
  conflicts: ScheduledReservation[];
}

/**
 * Relocate a booking to another table — the answer to "the guest is here but
 * their table is still finishing dessert".
 *
 * Both tables are re-projected so the source frees up and the destination locks
 * if the new booking is already inside its hold window.
 */
export async function moveReservation(
  conn: Connection,
  fromTableId: string,
  reservationId: string,
  toTableId: string,
  policy: ReservationPolicy,
  opts: { force?: boolean; now?: Date } = {},
): Promise<MoveResult> {
  const Table = TableModel(conn);
  const now = opts.now ?? new Date();

  if (String(fromTableId) === String(toTableId)) {
    throw Object.assign(new Error('Source and destination tables are the same'), { code: 'SAME_TABLE' });
  }

  const from = await Table.findById(fromTableId);
  if (!from) throw Object.assign(new Error('Source table not found'), { code: 'NOT_FOUND' });

  const to = await Table.findById(toTableId);
  if (!to) throw Object.assign(new Error('Destination table not found'), { code: 'NOT_FOUND' });

  migrateLegacyReservation(from);
  migrateLegacyReservation(to);

  const reservation = findReservation(from, reservationId);
  if (!reservation) throw Object.assign(new Error('Reservation not found'), { code: 'NOT_FOUND' });
  if (reservation.st !== RESERVATION_STATUS_CODES.booked) {
    throw Object.assign(new Error('Only open bookings can be moved'), { code: 'NOT_MOVABLE' });
  }

  // Clash check on the destination — overridable, since a manager may knowingly
  // stack two parties on a big table.
  const conflicts = findConflicts(toScheduledList(to.rs), toScheduled(reservation), now, policy);
  if (conflicts.length && !opts.force) {
    throw Object.assign(new Error('Destination table already has an overlapping booking'), {
      code: 'CONFLICT',
      details: conflicts,
    });
  }

  const moved = {
    ...(reservation as any).toObject?.() ?? reservation,
    _id: new Types.ObjectId(),
    uAt: now,
  };

  from.rs = (from.rs ?? []).filter((r) => String(r._id) !== String(reservationId));
  if (!to.rs) to.rs = [];
  to.rs.push(moved as IReservation);

  applyProjectedStatus(from, policy, now);
  applyProjectedStatus(to, policy, now);

  await from.save();
  await to.save();

  return { from, to, reservation: moved as IReservation, conflicts };
}

export { getPhase, getTiming, getWalkInWindow, RESERVATION_STATUS_CODES };
