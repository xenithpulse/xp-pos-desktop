// lib/reservations/schedule.ts
// ═══════════════════════════════════════════════════════════════════════════════
// Reservation Scheduling Engine
//
// Isomorphic (server + client) pure functions that answer the only question a
// floor manager actually cares about: *can I use this table right now, and for
// how long?*
//
// Design principle — TIME IS THE SOURCE OF TRUTH.
// `table.status` is a cached projection; the reservation list plus the clock is
// authoritative. That means a table booked for 21:00 does NOT sit dead from the
// moment it's confirmed at 18:00. It stays sellable until its *hold window*
// opens, and every consumer derives the same answer without needing a cron job.
//
// Timeline of a single reservation (rt = reservationTime):
//
//   … walk-ins welcome …│   held   │ due  │  late   │ released
//   ────────────────────┼──────────┼──────┼─────────┼──────────▶
//                 rt-hold         rt   rt+grace  rt+grace+release
//
//   scheduled : now < rt-hold          → table stays AVAILABLE (sell it!)
//   holding   : rt-hold ≤ now < rt     → table shows RESERVED, walk-in needs override
//   due       : rt ≤ now ≤ rt+grace    → guest expected now
//   late      : past grace             → prompt staff: seat anyway or no-show
//   released  : past auto-release      → auto no-show, table freed
// ═══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Reservation lifecycle status
// ─────────────────────────────────────────────────────────────────────────────

export type ReservationStatus =
  | 'booked'      // confirmed, guest has not arrived yet
  | 'seated'      // guest arrived, a table session was started from it
  | 'cancelled'   // called off by guest or staff
  | 'no_show'     // guest never turned up (manual or auto-released)
  | 'completed';  // the session it produced has been closed

/** Numeric codes for compressed storage (field `st`). */
export const RESERVATION_STATUS_CODES: Record<ReservationStatus, number> = {
  booked: 0,
  seated: 1,
  cancelled: 2,
  no_show: 3,
  completed: 4,
};

export const RESERVATION_STATUS_VALUES: ReservationStatus[] = [
  'booked',
  'seated',
  'cancelled',
  'no_show',
  'completed',
];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  booked: 'Booked',
  seated: 'Seated',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  completed: 'Completed',
};

/** A reservation in one of these states no longer competes for the table. */
export const TERMINAL_RESERVATION_STATUSES: ReservationStatus[] = [
  'seated',
  'cancelled',
  'no_show',
  'completed',
];

// ─────────────────────────────────────────────────────────────────────────────
// Timing policy
// ─────────────────────────────────────────────────────────────────────────────

export interface ReservationPolicy {
  /** Minutes before `reservationTime` the table stops accepting walk-ins. */
  holdMinutes: number;
  /** Expected dining length — used to detect walk-in overruns and clashes. */
  durationMinutes: number;
  /** Minutes past `reservationTime` before the guest counts as late. */
  graceMinutes: number;
  /**
   * Minutes past the grace period before the reservation auto-releases as a
   * no-show and hands the table back. `0` disables auto-release (staff must
   * decide manually).
   */
  autoReleaseMinutes: number;
  /**
   * Whether staff may seat a walk-in on a table that is inside its hold window.
   * When false the override button is hidden entirely.
   */
  allowWalkInDuringHold: boolean;
}

export const DEFAULT_RESERVATION_POLICY: ReservationPolicy = {
  holdMinutes: 30,
  durationMinutes: 90,
  graceMinutes: 15,
  autoReleaseMinutes: 30,
  allowWalkInDuringHold: true,
};

/** Fill any missing policy field from the defaults. */
export function resolvePolicy(partial?: Partial<ReservationPolicy> | null): ReservationPolicy {
  if (!partial) return { ...DEFAULT_RESERVATION_POLICY };
  return {
    holdMinutes: num(partial.holdMinutes, DEFAULT_RESERVATION_POLICY.holdMinutes),
    durationMinutes: num(partial.durationMinutes, DEFAULT_RESERVATION_POLICY.durationMinutes),
    graceMinutes: num(partial.graceMinutes, DEFAULT_RESERVATION_POLICY.graceMinutes),
    autoReleaseMinutes: num(partial.autoReleaseMinutes, DEFAULT_RESERVATION_POLICY.autoReleaseMinutes),
    allowWalkInDuringHold:
      typeof partial.allowWalkInDuringHold === 'boolean'
        ? partial.allowWalkInDuringHold
        : DEFAULT_RESERVATION_POLICY.allowWalkInDuringHold,
  };
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Reservation shape (decoded / human-readable — what the UI and API speak)
// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduledReservation {
  /** Stable id — every mutation targets a reservation by id, never by index. */
  _id?: string;
  customerName: string;
  customerPhone?: string;
  partySize: number;
  /** ISO timestamp the guest is expected. */
  reservationTime: string;
  /** Per-reservation overrides of the tenant policy (optional). */
  durationMinutes?: number;
  holdMinutes?: number;
  graceMinutes?: number;
  status: ReservationStatus;
  notes?: string;
  /** Session created when the guest was seated from this reservation. */
  sessionId?: string;
  /** When the guest actually showed up. */
  arrivedAt?: string;
  /** Why it was cancelled / marked no-show. */
  resolutionNote?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Effective timing for one reservation, policy overrides applied. */
export interface ReservationTiming {
  /** Expected arrival. */
  start: Date;
  /** Moment the table locks against walk-ins. */
  holdFrom: Date;
  /** End of the on-time window. */
  graceUntil: Date;
  /** Moment the reservation auto-releases (equals graceUntil when disabled). */
  releaseAt: Date;
  /** Projected end of the meal — used for clash detection. */
  expectedEnd: Date;
  holdMinutes: number;
  durationMinutes: number;
  graceMinutes: number;
  autoReleaseMinutes: number;
}

export function getTiming(
  res: ScheduledReservation,
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): ReservationTiming {
  const holdMinutes = num(res.holdMinutes, policy.holdMinutes);
  const durationMinutes = num(res.durationMinutes, policy.durationMinutes);
  const graceMinutes = num(res.graceMinutes, policy.graceMinutes);
  const autoReleaseMinutes = num(policy.autoReleaseMinutes, DEFAULT_RESERVATION_POLICY.autoReleaseMinutes);

  const start = new Date(res.reservationTime);
  const ms = 60_000;

  return {
    start,
    holdFrom: new Date(start.getTime() - holdMinutes * ms),
    graceUntil: new Date(start.getTime() + graceMinutes * ms),
    releaseAt: new Date(start.getTime() + (graceMinutes + autoReleaseMinutes) * ms),
    expectedEnd: new Date(start.getTime() + durationMinutes * ms),
    holdMinutes,
    durationMinutes,
    graceMinutes,
    autoReleaseMinutes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase — where a reservation sits on its timeline right now
// ─────────────────────────────────────────────────────────────────────────────

export type ReservationPhase =
  | 'scheduled'   // future booking, table still sellable
  | 'holding'     // inside the hold window, table locked
  | 'due'         // guest expected now (within grace)
  | 'late'        // past grace, not yet auto-released
  | 'waiting'     // guest has checked in but isn't seated yet (table still busy)
  | 'released'    // past auto-release cutoff, table can be handed back
  | 'seated'
  | 'cancelled'
  | 'no_show'
  | 'completed';

export const PHASE_LABELS: Record<ReservationPhase, string> = {
  scheduled: 'Scheduled',
  holding: 'Holding table',
  due: 'Guest due now',
  late: 'Running late',
  waiting: 'Guest waiting',
  released: 'Released',
  seated: 'Seated',
  cancelled: 'Cancelled',
  no_show: 'No-show',
  completed: 'Completed',
};

export function getPhase(
  res: ScheduledReservation,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): ReservationPhase {
  if (res.status === 'seated') return 'seated';
  if (res.status === 'cancelled') return 'cancelled';
  if (res.status === 'no_show') return 'no_show';
  if (res.status === 'completed') return 'completed';

  // Checked in at the door but not seated — usually because their table is
  // still finishing. They are physically present, so no clock can no-show them.
  if (res.arrivedAt) return 'waiting';

  const t = getTiming(res, policy);
  const ms = now.getTime();

  if (ms < t.holdFrom.getTime()) return 'scheduled';
  if (ms < t.start.getTime()) return 'holding';
  if (ms <= t.graceUntil.getTime()) return 'due';
  if (t.autoReleaseMinutes > 0 && ms > t.releaseAt.getTime()) return 'released';
  return 'late';
}

/** Phases in which the reservation currently denies the table to walk-ins. */
const BLOCKING_PHASES: ReservationPhase[] = ['holding', 'due', 'late', 'waiting'];

export function isBlocking(
  res: ScheduledReservation,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): boolean {
  return BLOCKING_PHASES.includes(getPhase(res, now, policy));
}

/** Still live — neither resolved nor auto-released. */
export function isPending(
  res: ScheduledReservation,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): boolean {
  const phase = getPhase(res, now, policy);
  return (
    phase === 'scheduled' ||
    phase === 'holding' ||
    phase === 'due' ||
    phase === 'late' ||
    phase === 'waiting'
  );
}

/** Past its auto-release cutoff and ready to be flipped to no-show. */
export function isReleasable(
  res: ScheduledReservation,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): boolean {
  return getPhase(res, now, policy) === 'released';
}

// ─────────────────────────────────────────────────────────────────────────────
// List-level queries
// ─────────────────────────────────────────────────────────────────────────────

export function sortByTime(list: ScheduledReservation[]): ScheduledReservation[] {
  return [...list].sort(
    (a, b) => new Date(a.reservationTime).getTime() - new Date(b.reservationTime).getTime(),
  );
}

/** Every reservation that has not been resolved, soonest first. */
export function getUpcoming(
  list: ScheduledReservation[] | undefined | null,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): ScheduledReservation[] {
  if (!list?.length) return [];
  return sortByTime(list.filter((r) => isPending(r, now, policy)));
}

/**
 * The reservation staff should be looking at: the one currently blocking the
 * table if there is one, otherwise the soonest upcoming booking.
 */
export function getActiveReservation(
  list: ScheduledReservation[] | undefined | null,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): ScheduledReservation | null {
  const upcoming = getUpcoming(list, now, policy);
  if (!upcoming.length) return null;
  return upcoming.find((r) => isBlocking(r, now, policy)) ?? upcoming[0];
}

/** The reservation that produced a given session, if any. */
export function findBySession(
  list: ScheduledReservation[] | undefined | null,
  sessionId: string,
): ScheduledReservation | null {
  return list?.find((r) => r.sessionId && String(r.sessionId) === String(sessionId)) ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Walk-in window — the feature that stops reserved tables going to waste
// ─────────────────────────────────────────────────────────────────────────────

export interface WalkInWindow {
  /** Can a walk-in be seated right now without an override? */
  canSeat: boolean;
  /** Minutes of usable time before the next hold window opens (null = open-ended). */
  minutesFree: number | null;
  /** Instant the table must be handed back (null = no upcoming reservation). */
  freeUntil: Date | null;
  /** The reservation that closes the window — upcoming or currently blocking. */
  nextReservation: ScheduledReservation | null;
  /** Set when a reservation is holding the table *right now*. */
  blockedBy: ScheduledReservation | null;
  /** True when seating is possible only via an explicit staff override. */
  requiresOverride: boolean;
  /** Human-readable explanation for the UI. */
  reason: string;
}

/**
 * Work out whether a walk-in can take a table that has bookings later on.
 *
 * The 18:00-confirmed / 21:00-booked case resolves to:
 *   canSeat: true, minutesFree: 150, freeUntil: 20:30, nextReservation: the 21:00
 * so the floor can sell two and a half hours that used to be dead.
 */
export function getWalkInWindow(
  list: ScheduledReservation[] | undefined | null,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): WalkInWindow {
  const upcoming = getUpcoming(list, now, policy);

  if (!upcoming.length) {
    return {
      canSeat: true,
      minutesFree: null,
      freeUntil: null,
      nextReservation: null,
      blockedBy: null,
      requiresOverride: false,
      reason: 'No reservations on this table',
    };
  }

  const blocking = upcoming.find((r) => isBlocking(r, now, policy)) ?? null;

  if (blocking) {
    const t = getTiming(blocking, policy);
    return {
      canSeat: policy.allowWalkInDuringHold,
      minutesFree: 0,
      freeUntil: t.holdFrom,
      nextReservation: blocking,
      blockedBy: blocking,
      requiresOverride: true,
      reason: `Held for ${blocking.customerName} at ${formatClock(t.start)}`,
    };
  }

  const next = upcoming[0];
  const t = getTiming(next, policy);
  const minutesFree = Math.max(0, Math.floor((t.holdFrom.getTime() - now.getTime()) / 60_000));

  return {
    canSeat: true,
    minutesFree,
    freeUntil: t.holdFrom,
    nextReservation: next,
    blockedBy: null,
    requiresOverride: false,
    reason: `Free for ${formatDuration(minutesFree)} — ${next.customerName} at ${formatClock(t.start)}`,
  };
}

/**
 * Would seating a walk-in now run past the next reservation's hold window?
 * Returns the overrun in minutes (0 when it fits), so the panel can warn
 * "this party will need to leave by 20:30".
 */
export function projectWalkInOverrun(
  list: ScheduledReservation[] | undefined | null,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
  expectedStayMinutes: number = policy.durationMinutes,
): number {
  const win = getWalkInWindow(list, now, policy);
  if (!win.freeUntil) return 0;
  const endsAt = now.getTime() + expectedStayMinutes * 60_000;
  return Math.max(0, Math.round((endsAt - win.freeUntil.getTime()) / 60_000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Clash detection — stops the same table being double-booked
// ─────────────────────────────────────────────────────────────────────────────

/** Do two reservations contend for the same table? Compares hold→end spans. */
export function overlaps(
  a: ScheduledReservation,
  b: ScheduledReservation,
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): boolean {
  const ta = getTiming(a, policy);
  const tb = getTiming(b, policy);
  return ta.holdFrom < tb.expectedEnd && tb.holdFrom < ta.expectedEnd;
}

/** Existing pending reservations that clash with `candidate`. */
export function findConflicts(
  list: ScheduledReservation[] | undefined | null,
  candidate: ScheduledReservation,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): ScheduledReservation[] {
  if (!list?.length) return [];
  return list.filter(
    (r) =>
      isPending(r, now, policy) &&
      (!candidate._id || String(r._id) !== String(candidate._id)) &&
      overlaps(r, candidate, policy),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Status projection
// ─────────────────────────────────────────────────────────────────────────────

export type ProjectedTableStatus = 'available' | 'reserved' | 'occupied' | 'cleaning' | 'blocked';

/**
 * The status a table *should* be showing, given its session and reservations.
 *
 * `cleaning` and `blocked` are staff-set and never overridden — a blocked table
 * stays blocked even with a booking on it. An occupied table stays occupied.
 * Only the available ⇄ reserved pair is derived from the clock, which is what
 * lets a 21:00 booking leave the table sellable until 20:30.
 */
export function projectTableStatus(
  storedStatus: ProjectedTableStatus,
  reservations: ScheduledReservation[] | undefined | null,
  hasActiveSession: boolean,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): ProjectedTableStatus {
  if (hasActiveSession) return 'occupied';
  if (storedStatus === 'cleaning' || storedStatus === 'blocked') return storedStatus;

  const blocking = (reservations ?? []).some((r) => isBlocking(r, now, policy));
  return blocking ? 'reserved' : 'available';
}

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers (shared so server messages and UI copy match)
// ─────────────────────────────────────────────────────────────────────────────

export function formatClock(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** `150` → `"2h 30m"`, `45` → `"45m"`, `0` → `"0m"`. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

/**
 * Signed countdown to an instant: `"in 2h 30m"` / `"12m ago"`.
 */
export function formatRelative(target: Date | string, now: Date = new Date()): string {
  const date = typeof target === 'string' ? new Date(target) : target;
  if (Number.isNaN(date.getTime())) return '—';
  const diffMin = Math.round((date.getTime() - now.getTime()) / 60_000);
  if (diffMin === 0) return 'now';
  return diffMin > 0 ? `in ${formatDuration(diffMin)}` : `${formatDuration(-diffMin)} ago`;
}

/** One-line status summary used by the panel header and table tooltips. */
export function describeReservation(
  res: ScheduledReservation,
  now: Date = new Date(),
  policy: ReservationPolicy = DEFAULT_RESERVATION_POLICY,
): string {
  const t = getTiming(res, policy);
  const phase = getPhase(res, now, policy);

  switch (phase) {
    case 'scheduled':
      return `${res.customerName} · party of ${res.partySize} at ${formatClock(t.start)} (${formatRelative(t.start, now)})`;
    case 'holding':
      return `Holding for ${res.customerName} — due ${formatClock(t.start)} (${formatRelative(t.start, now)})`;
    case 'due':
      return `${res.customerName} due now — party of ${res.partySize}`;
    case 'late':
      return `${res.customerName} is ${formatRelative(t.start, now)} — no-show at ${formatClock(t.releaseAt)}`;
    case 'waiting':
      return `${res.customerName} has arrived — waiting to be seated`;
    case 'released':
      return `${res.customerName} never arrived — table can be released`;
    default:
      return `${res.customerName} · ${RESERVATION_STATUS_LABELS[res.status]}`;
  }
}
