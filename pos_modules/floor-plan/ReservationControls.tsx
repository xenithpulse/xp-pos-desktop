// pos_modules/floor-plan/ReservationControls.tsx
// ═══════════════════════════════════════════════════════════════════════════════
// Reservation controls for the table session panel.
//
// Built around one rule: a booking should cost the restaurant as little table
// time as possible. A 21:00 reservation confirmed at 18:00 leaves the table
// sellable until its hold window opens at 20:30, and the panel says exactly how
// long that is. When the booked guest turns up — early, on time or late — one
// CTA seats them and closes the booking out.
// ═══════════════════════════════════════════════════════════════════════════════

'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRightLeft,
  BellRing,
  CalendarPlus,
  Check,
  ChevronDown,
  Clock,
  DoorOpen,
  Pencil,
  Phone,
  Play,
  Users,
  UserX,
  X,
} from 'lucide-react';
import {
  ITable,
  ReservationPhase,
  ReservationPolicy,
  ScheduledReservation,
  DEFAULT_RESERVATION_POLICY,
  PHASE_LABELS,
  findConflicts,
  formatClock,
  formatDuration,
  formatRelative,
  getPhase,
  getTiming,
  getTableReservations,
  getTableUpcoming,
  getTableWalkInWindow,
  projectWalkInOverrun,
} from '@/types/table.types';

// ─────────────────────────────────────────────────────────────────────────────
// Handlers — implemented by the hub, which owns the fetch calls
// ─────────────────────────────────────────────────────────────────────────────

export interface ReservationInputPayload {
  customerName: string;
  customerPhone?: string;
  partySize: number;
  reservationTime: string;
  durationMinutes?: number;
  holdMinutes?: number;
  notes?: string;
}

export interface ReservationHandlers {
  onAddReservation: (
    tableId: string,
    input: ReservationInputPayload,
    opts?: { force?: boolean },
  ) => Promise<void>;
  onUpdateReservation: (
    tableId: string,
    reservationId: string,
    input: Partial<ReservationInputPayload>,
    opts?: { force?: boolean },
  ) => Promise<void>;
  onCancelReservation: (tableId: string, reservationId: string, reason?: string) => Promise<void>;
  onMarkNoShow: (tableId: string, reservationId: string, reason?: string) => Promise<void>;
  onMarkArrived: (tableId: string, reservationId: string) => Promise<void>;
  onMoveReservation: (
    tableId: string,
    reservationId: string,
    targetTableId: string,
    opts?: { force?: boolean },
  ) => Promise<void>;
  /** Seat the booked party — the "Guest Arrived" CTA. */
  onSeatReservation: (tableId: string, reservationId: string, covers: number) => Promise<void>;
}

interface ReservationControlsProps extends ReservationHandlers {
  table: ITable;
  /** All tables — used by the "move to another table" picker. */
  allTables?: ITable[];
  policy?: ReservationPolicy;
  /** Ticking clock so countdowns and phases stay live between fetches. */
  now: Date;
  /** Hidden entirely when the tenant has reservations turned off. */
  enabled?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase styling
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_STYLES: Record<ReservationPhase, { chip: string; bar: string; card: string }> = {
  scheduled: { chip: 'bg-slate-100 text-slate-700 border-slate-300',    bar: 'bg-slate-400',  card: 'border-slate-300' },
  holding:   { chip: 'bg-teal-100 text-teal-800 border-teal-300',       bar: 'bg-teal-500',   card: 'border-teal-300' },
  due:       { chip: 'bg-amber-100 text-amber-800 border-amber-300',    bar: 'bg-amber-500',  card: 'border-amber-400' },
  late:      { chip: 'bg-red-100 text-red-800 border-red-300',          bar: 'bg-red-500',    card: 'border-red-400' },
  waiting:   { chip: 'bg-indigo-100 text-indigo-800 border-indigo-300', bar: 'bg-indigo-500', card: 'border-indigo-400' },
  released:  { chip: 'bg-red-100 text-red-800 border-red-300',          bar: 'bg-red-500',    card: 'border-red-400' },
  seated:    { chip: 'bg-green-100 text-green-800 border-green-300',    bar: 'bg-green-500',  card: 'border-green-300' },
  cancelled: { chip: 'bg-gray-100 text-gray-600 border-gray-300',       bar: 'bg-gray-400',   card: 'border-gray-300' },
  no_show:   { chip: 'bg-gray-100 text-gray-600 border-gray-300',       bar: 'bg-gray-400',   card: 'border-gray-300' },
  completed: { chip: 'bg-gray-100 text-gray-600 border-gray-300',       bar: 'bg-gray-400',   card: 'border-gray-300' },
};

/** `datetime-local` wants local wall-clock time, not a UTC ISO string. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════

export default function ReservationControls({
  table,
  allTables = [],
  policy = DEFAULT_RESERVATION_POLICY,
  now,
  enabled = true,
  onAddReservation,
  onUpdateReservation,
  onCancelReservation,
  onMarkNoShow,
  onMarkArrived,
  onMoveReservation,
  onSeatReservation,
}: ReservationControlsProps) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScheduledReservation | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const upcoming = useMemo(
    () => getTableUpcoming(table, now, policy),
    [table, now, policy],
  );
  const active = upcoming[0] ?? null;
  const rest = upcoming.slice(1);

  const hasSession = !!table.activeSessionId && typeof table.activeSessionId === 'object';

  if (!enabled) return null;

  const runAction = async (id: string, fn: () => Promise<void>) => {
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* ── The booking staff needs to act on ─────────────────────────────── */}
      {active && (
        <ActiveReservationCard
          table={table}
          reservation={active}
          policy={policy}
          now={now}
          hasSession={hasSession}
          busy={busyId === String(active._id)}
          onSeat={(covers) =>
            runAction(String(active._id), () =>
              onSeatReservation(table._id, String(active._id), covers),
            )
          }
          onArrived={() =>
            runAction(String(active._id), () => onMarkArrived(table._id, String(active._id)))
          }
          onCancel={(reason) =>
            runAction(String(active._id), () =>
              onCancelReservation(table._id, String(active._id), reason),
            )
          }
          onNoShow={(reason) =>
            runAction(String(active._id), () =>
              onMarkNoShow(table._id, String(active._id), reason),
            )
          }
          onEdit={() => {
            setEditing(active);
            setShowForm(true);
          }}
          onMove={() => setMovingId(String(active._id))}
        />
      )}

      {/* ── Later sittings on the same table ─────────────────────────────── */}
      {rest.length > 0 && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-600 flex items-center gap-1.5">
            <Clock size={12} />
            Later today ({rest.length})
          </div>
          <div className="divide-y divide-gray-100">
            {rest.map((r) => (
              <UpcomingRow
                key={String(r._id)}
                reservation={r}
                policy={policy}
                now={now}
                busy={busyId === String(r._id)}
                onEdit={() => {
                  setEditing(r);
                  setShowForm(true);
                }}
                onMove={() => setMovingId(String(r._id))}
                onCancel={() =>
                  runAction(String(r._id), () => onCancelReservation(table._id, String(r._id)))
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Move picker ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {movingId && (
          <MoveReservationPicker
            reservation={upcoming.find((r) => String(r._id) === movingId) ?? null}
            fromTable={table}
            tables={allTables}
            policy={policy}
            now={now}
            onClose={() => setMovingId(null)}
            onConfirm={async (targetTableId, force) => {
              await onMoveReservation(table._id, movingId, targetTableId, { force });
              setMovingId(null);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Book / amend ─────────────────────────────────────────────────── */}
      <button
        onClick={() => {
          setEditing(null);
          setShowForm((s) => !s || !!editing);
        }}
        className="w-full py-2.5 border border-teal-400 text-teal-700 rounded-lg font-medium hover:bg-teal-50 transition-colors flex items-center justify-center gap-2 text-sm"
      >
        {showForm && !editing ? <X size={15} /> : <CalendarPlus size={15} />}
        <span>{showForm && !editing ? 'Cancel' : 'Add Reservation'}</span>
      </button>

      <AnimatePresence initial={false}>
        {showForm && (
          <ReservationForm
            key={editing ? `edit-${editing._id}` : 'new'}
            table={table}
            existing={editing}
            policy={policy}
            now={now}
            onCancel={() => {
              setShowForm(false);
              setEditing(null);
            }}
            onSubmit={async (input, force) => {
              if (editing) {
                await onUpdateReservation(table._id, String(editing._id), input, { force });
              } else {
                await onAddReservation(table._id, input, { force });
              }
              setShowForm(false);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Active reservation card — the arrival CTA lives here
// ═════════════════════════════════════════════════════════════════════════════

function ActiveReservationCard({
  table,
  reservation,
  policy,
  now,
  hasSession,
  busy,
  onSeat,
  onArrived,
  onCancel,
  onNoShow,
  onEdit,
  onMove,
}: {
  table: ITable;
  reservation: ScheduledReservation;
  policy: ReservationPolicy;
  now: Date;
  hasSession: boolean;
  busy: boolean;
  onSeat: (covers: number) => Promise<void>;
  onArrived: () => Promise<void>;
  onCancel: (reason?: string) => Promise<void>;
  onNoShow: (reason?: string) => Promise<void>;
  onEdit: () => void;
  onMove: () => void;
}) {
  const phase = getPhase(reservation, now, policy);
  const timing = getTiming(reservation, policy);
  const style = PHASE_STYLES[phase];
  const [covers, setCovers] = useState(reservation.partySize);
  const [confirmNoShow, setConfirmNoShow] = useState(false);

  // The table is free, so the guest can be seated straight away — early, on
  // time, or late. This is the one-tap flow staff use at the door.
  const canSeatNow = !hasSession;

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${style.card}`}>
      {/* Phase strip */}
      <div className={`h-1 w-full ${style.bar} ${phase === 'due' ? 'animate-pulse' : ''}`} />

      <div className="p-4 space-y-3 bg-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-semibold text-gray-900 truncate">{reservation.customerName}</div>
            <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <Users size={12} /> Party of {reservation.partySize}
              </span>
              <span className="flex items-center gap-1">
                <Clock size={12} /> {formatClock(timing.start)}
              </span>
            </div>
          </div>
          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded-full border whitespace-nowrap ${style.chip}`}>
            {PHASE_LABELS[phase]}
          </span>
        </div>

        {/* Countdown / timing detail */}
        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 space-y-0.5">
          {phase === 'scheduled' && (
            <>
              <div>Due {formatRelative(timing.start, now)}.</div>
              <div className="text-gray-500">
                Table stays open for walk-ins until{' '}
                <b className="text-gray-700">{formatClock(timing.holdFrom)}</b>.
              </div>
            </>
          )}
          {phase === 'holding' && (
            <div>
              Holding the table — guest due {formatRelative(timing.start, now)}.
            </div>
          )}
          {phase === 'due' && (
            <div className="text-amber-700 font-medium">
              Guest is due now. Grace period ends {formatClock(timing.graceUntil)}.
            </div>
          )}
          {phase === 'late' && (
            <div className="text-red-700 font-medium">
              {formatRelative(timing.start, now)} — auto no-show at {formatClock(timing.releaseAt)}.
            </div>
          )}
          {phase === 'waiting' && (
            <div className="text-indigo-700 font-medium">
              Checked in at {reservation.arrivedAt ? formatClock(reservation.arrivedAt) : '—'} — waiting for a table.
            </div>
          )}
          {reservation.notes && <div className="italic text-gray-500">“{reservation.notes}”</div>}
        </div>

        {/* Phone — tap to call from a floor tablet */}
        {reservation.customerPhone && (
          <a
            href={`tel:${reservation.customerPhone}`}
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <Phone size={14} />
            {reservation.customerPhone}
          </a>
        )}

        {/* ── Primary action ───────────────────────────────────────────── */}
        {canSeatNow ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-600 whitespace-nowrap">Seating</span>
              <button
                onClick={() => setCovers((c) => Math.max(1, c - 1))}
                className="w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-50 text-lg leading-none"
              >
                −
              </button>
              <input
                type="number"
                value={covers}
                min={1}
                onChange={(e) => setCovers(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 h-8 text-center border border-gray-300 rounded-lg text-sm font-medium"
              />
              <button
                onClick={() => setCovers((c) => c + 1)}
                className="w-8 h-8 rounded-lg border border-gray-300 hover:bg-gray-50 text-lg leading-none"
              >
                +
              </button>
              <span className="text-xs text-gray-400">guests</span>
            </div>

            {covers > table.capacity && (
              <p className="text-[11px] text-amber-600 flex items-center gap-1">
                <AlertTriangle size={11} /> Over this table&apos;s {table.capacity}-seat capacity
              </p>
            )}

            <button
              onClick={() => onSeat(covers)}
              disabled={busy}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm"
            >
              {busy ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <DoorOpen size={18} />
              )}
              <span>
                Guest Arrived — Start Session
                {phase === 'scheduled' && ' (early)'}
                {phase === 'late' && ' (late)'}
              </span>
            </button>
          </div>
        ) : (
          // Guest is here but the table is still busy — check them in so the
          // no-show clock stops, then relocate them if the wait is too long.
          <div className="space-y-2">
            <p className="text-xs text-orange-700 bg-orange-50 rounded-lg px-3 py-2 flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              This table is still occupied. Check the guest in, or move their booking to a free table.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={onArrived}
                disabled={busy || phase === 'waiting'}
                className="py-2.5 border border-indigo-400 text-indigo-700 rounded-lg font-medium hover:bg-indigo-50 transition-colors flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
              >
                <BellRing size={14} />
                <span>{phase === 'waiting' ? 'Checked in' : 'Guest waiting'}</span>
              </button>
              <button
                onClick={onMove}
                disabled={busy}
                className="py-2.5 border border-blue-400 text-blue-700 rounded-lg font-medium hover:bg-blue-50 transition-colors flex items-center justify-center gap-1.5 text-sm disabled:opacity-50"
              >
                <ArrowRightLeft size={14} />
                <span>Move table</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Secondary actions ────────────────────────────────────────── */}
        <div className="flex items-center gap-2 pt-1 border-t border-gray-100">
          <button
            onClick={onEdit}
            disabled={busy}
            className="flex-1 py-2 text-xs text-gray-600 hover:bg-gray-50 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Pencil size={12} /> Edit
          </button>
          {canSeatNow && (
            <button
              onClick={onMove}
              disabled={busy}
              className="flex-1 py-2 text-xs text-gray-600 hover:bg-gray-50 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <ArrowRightLeft size={12} /> Move
            </button>
          )}
          <button
            onClick={() => onCancel()}
            disabled={busy}
            className="flex-1 py-2 text-xs text-gray-600 hover:bg-gray-50 rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <X size={12} /> Cancel
          </button>
          <button
            onClick={() => (confirmNoShow ? onNoShow() : setConfirmNoShow(true))}
            onBlur={() => setConfirmNoShow(false)}
            disabled={busy}
            className={`flex-1 py-2 text-xs rounded-lg flex items-center justify-center gap-1.5 disabled:opacity-50 ${
              confirmNoShow
                ? 'bg-red-600 text-white font-semibold'
                : 'text-red-600 hover:bg-red-50'
            }`}
          >
            <UserX size={12} /> {confirmNoShow ? 'Confirm?' : 'No-show'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Compact row for later sittings
// ═════════════════════════════════════════════════════════════════════════════

function UpcomingRow({
  reservation,
  policy,
  now,
  busy,
  onEdit,
  onMove,
  onCancel,
}: {
  reservation: ScheduledReservation;
  policy: ReservationPolicy;
  now: Date;
  busy: boolean;
  onEdit: () => void;
  onMove: () => void;
  onCancel: () => void;
}) {
  const [open, setOpen] = useState(false);
  const phase = getPhase(reservation, now, policy);
  const timing = getTiming(reservation, policy);
  const style = PHASE_STYLES[phase];

  return (
    <div className="px-3 py-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 text-left"
      >
        <span className="text-sm font-semibold text-gray-800 tabular-nums w-14 flex-shrink-0">
          {formatClock(timing.start)}
        </span>
        <span className="text-sm text-gray-700 truncate flex-1">{reservation.customerName}</span>
        <span className="text-xs text-gray-500 flex items-center gap-0.5 flex-shrink-0">
          <Users size={11} /> {reservation.partySize}
        </span>
        <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${style.chip} flex-shrink-0`}>
          {PHASE_LABELS[phase]}
        </span>
        <ChevronDown
          size={14}
          className={`text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-2 flex items-center gap-1.5">
          <button
            onClick={onEdit}
            disabled={busy}
            className="flex-1 py-1.5 text-[11px] text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Pencil size={11} /> Edit
          </button>
          <button
            onClick={onMove}
            disabled={busy}
            className="flex-1 py-1.5 text-[11px] text-blue-600 border border-blue-200 rounded-md hover:bg-blue-50 flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <ArrowRightLeft size={11} /> Move
          </button>
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 py-1.5 text-[11px] text-red-600 border border-red-200 rounded-md hover:bg-red-50 flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <X size={11} /> Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Move picker — relocate a booking when its table won't free up in time
// ═════════════════════════════════════════════════════════════════════════════

function MoveReservationPicker({
  reservation,
  fromTable,
  tables,
  policy,
  now,
  onClose,
  onConfirm,
}: {
  reservation: ScheduledReservation | null;
  fromTable: ITable;
  tables: ITable[];
  policy: ReservationPolicy;
  now: Date;
  onClose: () => void;
  onConfirm: (targetTableId: string, force?: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  // Rank candidates: right size first, then no clash, then free right now.
  const candidates = useMemo(() => {
    if (!reservation) return [];
    return tables
      .filter((t) => t._id !== fromTable._id && t.isActive !== false && t.status !== 'blocked')
      .map((t) => {
        const clashes = findConflicts(getTableReservations(t), reservation, now, policy);
        return {
          table: t,
          clashes,
          fits: t.capacity >= reservation.partySize,
          freeNow: t.status === 'available' || t.status === 'reserved',
        };
      })
      .sort((a, b) => {
        if (a.fits !== b.fits) return a.fits ? -1 : 1;
        if ((a.clashes.length === 0) !== (b.clashes.length === 0)) return a.clashes.length ? 1 : -1;
        if (a.freeNow !== b.freeNow) return a.freeNow ? -1 : 1;
        return a.table.capacity - b.table.capacity;
      })
      .slice(0, 12);
  }, [tables, fromTable._id, reservation, now, policy]);

  if (!reservation) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
            <ArrowRightLeft size={12} />
            Move {reservation.customerName} ({reservation.partySize}) to…
          </div>
          <button onClick={onClose} className="p-1 hover:bg-blue-100 rounded">
            <X size={13} className="text-blue-700" />
          </button>
        </div>

        {candidates.length === 0 ? (
          <p className="text-xs text-gray-600 py-2">No other tables available.</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5 max-h-52 overflow-y-auto">
            {candidates.map(({ table: t, clashes, fits, freeNow }) => (
              <button
                key={t._id}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await onConfirm(t._id, clashes.length > 0);
                  } finally {
                    setBusy(false);
                  }
                }}
                className={`p-2 rounded-lg border text-left transition-colors disabled:opacity-50 ${
                  clashes.length
                    ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="font-bold text-sm text-gray-800">{t.tableNumber}</div>
                <div className="text-[10px] text-gray-500 flex items-center gap-0.5">
                  <Users size={9} /> {t.capacity}
                  {!fits && <span className="text-amber-600 ml-0.5">tight</span>}
                </div>
                <div className="text-[9px] mt-0.5">
                  {clashes.length ? (
                    <span className="text-amber-700">clash ×{clashes.length}</span>
                  ) : freeNow ? (
                    <span className="text-green-600">free</span>
                  ) : (
                    <span className="text-gray-400">{t.status}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="text-[10px] text-gray-500">
          Amber tables already have an overlapping booking — picking one books both.
        </p>
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Booking form — create and amend
// ═════════════════════════════════════════════════════════════════════════════

function ReservationForm({
  table,
  existing,
  policy,
  now,
  onCancel,
  onSubmit,
}: {
  table: ITable;
  existing: ScheduledReservation | null;
  policy: ReservationPolicy;
  now: Date;
  onCancel: () => void;
  onSubmit: (input: ReservationInputPayload, force?: boolean) => Promise<void>;
}) {
  const [name, setName] = useState(existing?.customerName ?? '');
  const [phone, setPhone] = useState(existing?.customerPhone ?? '');
  const [partySize, setPartySize] = useState(existing?.partySize ?? 2);
  const [when, setWhen] = useState(
    existing
      ? toLocalInputValue(new Date(existing.reservationTime))
      : toLocalInputValue(new Date(now.getTime() + 60 * 60_000)),
  );
  const [duration, setDuration] = useState<number | ''>(existing?.durationMinutes ?? '');
  const [hold, setHold] = useState<number | ''>(existing?.holdMinutes ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [showAdvanced, setShowAdvanced] = useState(
    existing?.durationMinutes !== undefined || existing?.holdMinutes !== undefined,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoised so the clash/warning computations below don't rerun on every
  // keystroke in an unrelated field.
  const parsedTime = useMemo(() => {
    if (!when) return null;
    const d = new Date(when);
    return Number.isNaN(d.getTime()) ? null : d;
  }, [when]);

  const valid = name.trim().length > 0 && !!parsedTime;

  // Warn about problems before the request goes out — the server re-checks and
  // will still ask for a force flag, but staff shouldn't have to discover a
  // clash by submitting.
  const warnings = useMemo(() => {
    if (!valid || !parsedTime) return [];
    const out: string[] = [];

    const candidate: ScheduledReservation = {
      _id: existing?._id,
      customerName: name,
      partySize,
      reservationTime: parsedTime.toISOString(),
      durationMinutes: duration === '' ? undefined : Number(duration),
      holdMinutes: hold === '' ? undefined : Number(hold),
      status: 'booked',
    };

    if (parsedTime.getTime() < now.getTime()) out.push('That time has already passed.');
    if (partySize > table.capacity) {
      out.push(`Party of ${partySize} is over this table's ${table.capacity} seats.`);
    }

    const clashes = findConflicts(getTableReservations(table), candidate, now, policy);
    for (const c of clashes) {
      out.push(`Overlaps ${c.customerName} at ${formatClock(c.reservationTime)}.`);
    }
    return out;
  }, [valid, parsedTime, name, partySize, duration, hold, existing?._id, table, now, policy]);

  // Show how much sellable time this booking actually costs the floor.
  const holdPreview = useMemo(() => {
    if (!valid || !parsedTime) return null;
    const holdMin = hold === '' ? policy.holdMinutes : Number(hold);
    return new Date(parsedTime.getTime() - holdMin * 60_000);
  }, [valid, parsedTime, hold, policy.holdMinutes]);

  const submit = async () => {
    if (!valid || !parsedTime) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(
        {
          customerName: name.trim(),
          customerPhone: phone.trim() || undefined,
          partySize,
          reservationTime: parsedTime.toISOString(),
          durationMinutes: duration === '' ? undefined : Number(duration),
          holdMinutes: hold === '' ? undefined : Number(hold),
          notes: notes.trim() || undefined,
        },
        warnings.length > 0, // knowingly overriding what we already flagged
      );
    } catch (e) {
      setError((e as Error).message || 'Could not save the reservation');
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    'w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-teal-500';

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="space-y-3 bg-teal-50 rounded-lg p-4 border border-teal-200">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-teal-800">
            {existing ? 'Edit reservation' : `New reservation · Table ${table.tableNumber}`}
          </h4>
          <button onClick={onCancel} className="p-1 hover:bg-teal-100 rounded">
            <X size={14} className="text-teal-700" />
          </button>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">Customer Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Guest name"
            className={inputCls}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600">Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Contact number"
              className={inputCls}
            />
          </div>
          <div className="w-24">
            <label className="text-xs font-medium text-gray-600">Party</label>
            <input
              type="number"
              value={partySize}
              min={1}
              onChange={(e) => setPartySize(Math.max(1, parseInt(e.target.value) || 1))}
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600">Date &amp; Time *</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className={inputCls}
          />
          {holdPreview && (
            <p className="mt-1 text-[11px] text-teal-700">
              Table stays sellable until <b>{formatClock(holdPreview)}</b>
              {' · '}
              {formatDuration(Math.max(0, (holdPreview.getTime() - now.getTime()) / 60_000))} from now
            </p>
          )}
        </div>

        {/* Advanced timing — per-booking overrides of the tenant policy */}
        <button
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-[11px] text-teal-700 flex items-center gap-1 hover:underline"
        >
          <ChevronDown size={11} className={showAdvanced ? 'rotate-180' : ''} />
          Timing overrides
        </button>

        {showAdvanced && (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600">
                Hold (min)
                <span className="text-gray-400 font-normal"> · def {policy.holdMinutes}</span>
              </label>
              <input
                type="number"
                min={0}
                value={hold}
                onChange={(e) => setHold(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                placeholder={String(policy.holdMinutes)}
                className={inputCls}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-medium text-gray-600">
                Stay (min)
                <span className="text-gray-400 font-normal"> · def {policy.durationMinutes}</span>
              </label>
              <input
                type="number"
                min={0}
                value={duration}
                onChange={(e) =>
                  setDuration(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))
                }
                placeholder={String(policy.durationMinutes)}
                className={inputCls}
              />
            </div>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-600">Notes</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Birthday, window seat, allergies…"
            className={inputCls}
          />
        </div>

        {warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 space-y-1">
            {warnings.map((w, i) => (
              <p key={i} className="text-[11px] text-amber-800 flex items-start gap-1.5">
                <AlertTriangle size={11} className="mt-0.5 flex-shrink-0" />
                {w}
              </p>
            ))}
          </div>
        )}

        {error && <p className="text-[11px] text-red-600">{error}</p>}

        <button
          onClick={submit}
          disabled={busy || !valid}
          className={`w-full py-2.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 text-white ${
            warnings.length ? 'bg-amber-600 hover:bg-amber-700' : 'bg-teal-600 hover:bg-teal-700'
          }`}
        >
          {busy ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Check size={16} />
          )}
          <span>
            {warnings.length
              ? existing ? 'Save anyway' : 'Book anyway'
              : existing ? 'Save changes' : 'Confirm reservation'}
          </span>
        </button>
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Walk-in seating block — sells the gap before the next hold window
// ═════════════════════════════════════════════════════════════════════════════

export function WalkInSeatingBlock({
  table,
  policy = DEFAULT_RESERVATION_POLICY,
  now,
  covers,
  onCoversChange,
  showCovers,
  busy,
  onSeat,
}: {
  table: ITable;
  policy?: ReservationPolicy;
  now: Date;
  covers: number;
  onCoversChange: (n: number) => void;
  showCovers: boolean;
  busy: boolean;
  /** `override` is true when seating over an active hold. */
  onSeat: (covers: number, override: boolean) => void;
}) {
  const [confirmOverride, setConfirmOverride] = useState(false);
  const walkIn = useMemo(() => getTableWalkInWindow(table, now, policy), [table, now, policy]);
  const overrun = useMemo(
    () => projectWalkInOverrun(getTableReservations(table), now, policy),
    [table, now, policy],
  );

  const held = walkIn.blockedBy;
  const heldTiming = held ? getTiming(held, policy) : null;

  return (
    <div className="space-y-4">
      <div className="text-center py-4">
        <div className="w-14 h-14 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-2">
          <Users size={28} className="text-purple-600" />
        </div>
        <h3 className="text-lg font-medium text-gray-800">Seat Guests</h3>
        <p className="text-sm text-gray-500 mt-0.5">Start a new dining session at this table</p>
      </div>

      {/* ── The gap this table can still be sold for ─────────────────────── */}
      {!held && walkIn.nextReservation && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-teal-800 text-sm font-semibold">
            <Clock size={14} />
            Free for {walkIn.minutesFree !== null ? formatDuration(walkIn.minutesFree) : '—'}
          </div>
          <p className="text-xs text-teal-700 mt-0.5">
            Hand the table back by <b>{walkIn.freeUntil ? formatClock(walkIn.freeUntil) : '—'}</b> for{' '}
            {walkIn.nextReservation.customerName} at{' '}
            {formatClock(walkIn.nextReservation.reservationTime)}.
          </p>
          {overrun > 0 && (
            <p className="text-xs text-amber-800 mt-1.5 flex items-start gap-1.5">
              <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" />
              A typical {formatDuration(policy.durationMinutes)} sitting would overrun by{' '}
              {formatDuration(overrun)} — let the party know they have a hard finish time.
            </p>
          )}
        </div>
      )}

      {/* ── Hold in force — seating needs a deliberate override ──────────── */}
      {held && (
        <div className="rounded-lg border-2 border-teal-300 bg-teal-50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-teal-900 text-sm font-semibold">
            <Clock size={14} />
            Held for {held.customerName}
          </div>
          <p className="text-xs text-teal-800 mt-0.5">
            Party of {held.partySize} at {heldTiming ? formatClock(heldTiming.start) : '—'}
            {heldTiming && ` (${formatRelative(heldTiming.start, now)})`}. Use the arrival button above
            when they walk in.
          </p>
        </div>
      )}

      {/* Cover count */}
      {showCovers && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Number of Guests</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCoversChange(Math.max(1, covers - 1))}
              className="w-10 h-10 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center justify-center text-lg font-medium"
            >
              −
            </button>
            <input
              type="number"
              value={covers}
              onChange={(e) =>
                onCoversChange(Math.max(1, Math.min(table.capacity, parseInt(e.target.value) || 1)))
              }
              className="flex-1 h-10 text-center border border-gray-300 rounded-lg text-lg font-medium"
              min={1}
              max={table.capacity}
            />
            <button
              onClick={() => onCoversChange(Math.min(table.capacity, covers + 1))}
              className="w-10 h-10 rounded-lg border border-gray-300 hover:bg-gray-50 flex items-center justify-center text-lg font-medium"
            >
              +
            </button>
          </div>
          <p className="text-xs text-gray-400">Max capacity: {table.capacity}</p>
        </div>
      )}

      {/* Seat action */}
      {!held ? (
        <button
          onClick={() => onSeat(covers, false)}
          disabled={busy}
          className="w-full py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Play size={18} />
          )}
          <span>Start Session</span>
        </button>
      ) : policy.allowWalkInDuringHold ? (
        <button
          onClick={() => {
            if (confirmOverride) {
              onSeat(covers, true);
              setConfirmOverride(false);
            } else {
              setConfirmOverride(true);
            }
          }}
          onBlur={() => setConfirmOverride(false)}
          disabled={busy}
          className={`w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
            confirmOverride
              ? 'bg-red-600 text-white hover:bg-red-700'
              : 'border-2 border-amber-500 text-amber-700 hover:bg-amber-50'
          }`}
        >
          <AlertTriangle size={16} />
          <span>
            {confirmOverride
              ? `Confirm — ${held.customerName} loses this table`
              : 'Seat walk-in anyway'}
          </span>
        </button>
      ) : (
        <p className="text-center text-xs text-gray-500 py-2">
          Walk-ins are not permitted during reservation holds.
        </p>
      )}
    </div>
  );
}
