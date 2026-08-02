// pos_modules/floor-plan/TableSessionPanel.tsx
// Slide-over panel showing table session details and actions

'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Users,
  Receipt,
  UserCheck,
  AlertCircle,
  Printer,
  CreditCard,
  MessageSquare,
  ChevronRight,
  PlusCircle,
  History,
  CalendarClock,
} from 'lucide-react';
import {
  ITable,
  ITableSession,
  ReservationPolicy,
  DEFAULT_RESERVATION_POLICY,
  TABLE_STATUS_LABELS,
  TABLE_STATUS_COLORS,
  SESSION_STATUS_LABELS,
  SESSION_STATUS_COLORS,
  getElapsedTime,
  formatCurrency,
  getEffectiveTableStatus,
  canSeatWithOverride,
} from '@/types/table.types';
import { useNow } from '@/lib/hooks/useNow';
import ReservationControls, {
  ReservationHandlers,
  WalkInSeatingBlock,
} from './ReservationControls';

interface TableSessionPanelProps extends Partial<ReservationHandlers> {
  table: ITable | null;
  onClose: () => void;
  /**
   * Start a session. `opts.reservationId` seats a booked party;
   * `opts.overrideReservationHold` seats a walk-in over an active hold.
   */
  onInitiateSession: (
    tableId: string,
    covers: number,
    opts?: { reservationId?: string; overrideReservationHold?: boolean },
  ) => Promise<void>;
  onRequestBill: (sessionId: string) => Promise<void>;
  onCloseSession: (sessionId: string) => Promise<void>;
  onViewOrder: (orderId: string) => void;
  /** All tables — powers the "move this booking elsewhere" picker. */
  allTables?: ITable[];
  /** Tenant reservation timing policy (hold / stay / grace / auto-release). */
  reservationPolicy?: ReservationPolicy;
  isLoading?: boolean;
  /** When false, the covers prompt is hidden and the session starts with `defaultCovers`. */
  requireCovers?: boolean;
  /** Default covers count pre-filled in the prompt (or used when `requireCovers` is false). */
  defaultCovers?: number;
  /** When false, every reservation control is hidden. */
  allowReservations?: boolean;
}

export default function TableSessionPanel({
  table,
  onClose,
  onInitiateSession,
  onRequestBill,
  onCloseSession,
  onViewOrder,
  allTables = [],
  reservationPolicy = DEFAULT_RESERVATION_POLICY,
  isLoading = false,
  requireCovers = true,
  defaultCovers: defaultCoversProp = 2,
  allowReservations = true,
  onAddReservation,
  onUpdateReservation,
  onCancelReservation,
  onMarkNoShow,
  onMarkArrived,
  onMoveReservation,
  onSeatReservation,
}: TableSessionPanelProps) {
  const [covers, setCovers] = useState(defaultCoversProp);
  const [isInitiating, setIsInitiating] = useState(false);
  const [isActioning, setIsActioning] = useState(false);

  // Reservation phases are a function of the clock, so the panel keeps its own
  // ticking `now` — a hold window that opens while the panel is open flips the
  // controls without needing a refetch.
  const now = useNow(15_000);

  if (!table) return null;

  const session = typeof table.activeSessionId === 'object'
    ? (table.activeSessionId as ITableSession)
    : null;

  const order = session?.orderId && typeof session.orderId === 'object'
    ? session.orderId
    : null;

  // Derived, not stored: a table booked for later still reads "available".
  const effectiveStatus = getEffectiveTableStatus(table, now, reservationPolicy);
  const statusColors = TABLE_STATUS_COLORS[effectiveStatus];
  const canSeat = !session && canSeatWithOverride(table, now, reservationPolicy);

  // Every handler must be present — a half-wired panel would render controls
  // that throw on click.
  const reservationsEnabled =
    allowReservations &&
    !!onAddReservation &&
    !!onUpdateReservation &&
    !!onCancelReservation &&
    !!onMarkNoShow &&
    !!onMarkArrived &&
    !!onMoveReservation &&
    !!onSeatReservation;

  // Handle session initiation (walk-in path)
  const handleStartSession = async (guestCount: number, override: boolean) => {
    setIsInitiating(true);
    try {
      await onInitiateSession(table._id, guestCount, { overrideReservationHold: override });
    } finally {
      setIsInitiating(false);
    }
  };

  // Handle bill request
  const handleRequestBill = async () => {
    if (!session) return;
    setIsActioning(true);
    try {
      await onRequestBill(session._id);
    } finally {
      setIsActioning(false);
    }
  };

  // Handle session close
  const handleCloseSession = async () => {
    if (!session) return;
    setIsActioning(true);
    try {
      await onCloseSession(session._id);
    } finally {
      setIsActioning(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        key="session-panel-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />
      <motion.div
        key="session-panel-drawer"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-2xl z-50 flex flex-col"
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b ${statusColors.bg}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold text-gray-800">
                Table {table.tableNumber}
              </div>
              <span className={`px-2 py-0.5 text-xs rounded-full ${statusColors.bg} ${statusColors.text} ${statusColors.border} border`}>
                {TABLE_STATUS_LABELS[effectiveStatus]}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/50 rounded-lg transition-colors"
            >
              <X size={20} className="text-gray-600" />
            </button>
          </div>

          {/* Table info */}
          <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <Users size={14} />
              <span>Capacity: {table.capacity}</span>
            </div>
            {table.sectionName && (
              <div className="flex items-center gap-1">
                <span>{table.sectionName}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {/* ── Reservation controls ──────────────────────────────────
              Shown for any table that isn't mid-session, so staff can book
              ahead, seat an arriving guest, or relocate a booking whose table
              is running over. ─────────────────────────────────────────────── */}
          {!session && reservationsEnabled && (
            <div className="mb-5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                <CalendarClock size={13} />
                Reservations
              </div>
              <ReservationControls
                table={table}
                allTables={allTables}
                policy={reservationPolicy}
                now={now}
                onAddReservation={onAddReservation!}
                onUpdateReservation={onUpdateReservation!}
                onCancelReservation={onCancelReservation!}
                onMarkNoShow={onMarkNoShow!}
                onMarkArrived={onMarkArrived!}
                onMoveReservation={onMoveReservation!}
                onSeatReservation={onSeatReservation!}
              />
            </div>
          )}

          {/* ── Walk-in seating ───────────────────────────────────────────
              Sells the gap before the next hold window instead of leaving the
              table idle from the moment a booking is confirmed. ──────────── */}
          {canSeat && (
            <div className={reservationsEnabled ? 'pt-5 border-t border-gray-200' : ''}>
              <WalkInSeatingBlock
                table={table}
                policy={reservationPolicy}
                now={now}
                covers={covers}
                onCoversChange={setCovers}
                showCovers={requireCovers}
                busy={isInitiating}
                onSeat={handleStartSession}
              />
            </div>
          )}


          {/* Active session info */}
          {session && (
            <div className="space-y-4">
              {/* Session stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Guests</div>
                  <div className="text-xl font-bold text-gray-800">{session.covers}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Duration</div>
                  <div className="text-xl font-bold text-gray-800">
                    {getElapsedTime(session.seatedAt)}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Session</div>
                  <div className="text-xl font-bold text-gray-800">#{session.sessionNumber}</div>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-xs text-gray-500">Status</div>
                  <div className={`text-sm font-medium px-2 py-0.5 rounded inline-block ${SESSION_STATUS_COLORS[session.status].bg} ${SESSION_STATUS_COLORS[session.status].text}`}>
                    {SESSION_STATUS_LABELS[session.status]}
                  </div>
                </div>
              </div>

              {/* Order summary */}
              {order && (
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-orange-700 font-medium">
                      <Receipt size={16} />
                      <span>Order #{order.orderNumber}</span>
                    </div>
                    <button
                      onClick={() => onViewOrder(order._id)}
                      className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1"
                    >
                      <span>View</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Items</span>
                      <span className="font-medium">{order.items?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Subtotal</span>
                      <span className="font-medium">{formatCurrency(order.subtotal || 0)}</span>
                    </div>
                    {order.taxAmount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tax</span>
                        <span className="font-medium">{formatCurrency(order.taxAmount)}</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-orange-200 flex justify-between">
                      <span className="font-medium text-gray-800">Total</span>
                      <span className="font-bold text-lg text-gray-800">
                        {formatCurrency(order.grandTotal || 0)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Waiter info */}
              {session.waiterId && typeof session.waiterId === 'object' && (
                <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <UserCheck size={20} className="text-blue-600" />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Server</div>
                    <div className="font-medium text-gray-800">
                      {session.waiterId.username || 'Assigned'}
                    </div>
                  </div>
                </div>
              )}

              {/* Session timeline */}
              {session.events && session.events.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 text-gray-700 font-medium mb-2">
                    <History size={16} />
                    <span>Timeline</span>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {session.events.slice(-5).reverse().map((event, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm">
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-1.5 flex-shrink-0" />
                        <div className="flex-1">
                          <span className="text-gray-700">{event.details || event.event}</span>
                          <span className="text-xs text-gray-400 ml-2">
                            {new Date(event.timestamp).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Session notes */}
              {session.notes && (
                <div className="bg-yellow-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-yellow-700 text-sm font-medium mb-1">
                    <MessageSquare size={14} />
                    <span>Notes</span>
                  </div>
                  <p className="text-sm text-gray-700">{session.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Cleaning/Blocked status */}
          {(effectiveStatus === 'cleaning' || effectiveStatus === 'blocked') && (
            <div className="text-center py-8">
              <AlertCircle size={48} className="mx-auto text-gray-400 mb-3" />
              <h3 className="text-lg font-medium text-gray-700">
                Table {effectiveStatus === 'cleaning' ? 'Being Cleaned' : 'Blocked'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {effectiveStatus === 'cleaning'
                  ? 'This table will be available shortly'
                  : 'This table is currently unavailable'}
              </p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {session && session.status === 'active' && (
          <div className="border-t border-gray-200 p-4 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => order && onViewOrder(order._id)}
                disabled={!order}
                className="py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <PlusCircle size={16} />
                <span>Add Items</span>
              </button>
              <button
                onClick={handleRequestBill}
                disabled={isActioning}
                className="py-2.5 border border-amber-500 text-amber-600 rounded-lg font-medium hover:bg-amber-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Printer size={16} />
                <span>Print Bill</span>
              </button>
            </div>
            <button
              onClick={handleCloseSession}
              disabled={isActioning}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CreditCard size={16} />
              <span>Complete Payment</span>
            </button>
          </div>
        )}

        {/* Close session button for billing status */}
        {session && session.status === 'billing' && (
          <div className="border-t border-gray-200 p-4">
            <button
              onClick={handleCloseSession}
              disabled={isActioning}
              className="w-full py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CreditCard size={16} />
              <span>Mark as Paid & Close</span>
            </button>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
