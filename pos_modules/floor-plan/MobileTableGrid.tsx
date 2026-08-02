// pos_modules/floor-plan/MobileTableGrid.tsx
// Phone Fallback — high-density Grid/List view of tables optimized for
// quick 'tap-to-open' order actions. Sorted by canvas position (top-left
// to bottom-right) so Desktop layout edits sync to mobile sort order.

'use client';

import { memo, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Clock,
  DollarSign,
  Search,
  Filter,
  LayoutGrid,
  List,
  ChevronRight,
} from 'lucide-react';
import {
  ITable,
  ITableSession,
  TableStatus,
  ReservationPolicy,
  DEFAULT_RESERVATION_POLICY,
  TABLE_STATUS_LABELS,
  getElapsedTime,
  formatCurrency,
  formatClock,
  formatDuration,
  getEffectiveTableStatus,
  getPhase,
  getTableActiveReservation,
  getTableWalkInWindow,
} from '@/types/table.types';
import { useNow } from '@/lib/hooks/useNow';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface MobileTableGridProps {
  tables: ITable[];
  onTableClick: (table: ITable) => void;
  statusFilter?: TableStatus | 'all';
  onStatusFilterChange?: (status: TableStatus | 'all') => void;
  /** Tenant reservation timing policy — drives the hold / free-until chips. */
  reservationPolicy?: ReservationPolicy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status pill colors (Tailwind-compatible)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_MOBILE_COLORS: Record<TableStatus, { bg: string; text: string; dot: string }> = {
  available: { bg: 'bg-purple-500/15', text: 'text-purple-400', dot: 'bg-purple-400' },
  reserved: { bg: 'bg-teal-500/15', text: 'text-teal-400', dot: 'bg-teal-400' },
  occupied: { bg: 'bg-orange-500/15', text: 'text-orange-400', dot: 'bg-orange-400' },
  cleaning: { bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400' },
  blocked: { bg: 'bg-gray-500/15', text: 'text-gray-400', dot: 'bg-gray-400' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Sort tables by canvas position (left-to-right, top-to-bottom) for
// consistent mobile ordering that syncs with desktop layout changes
// ─────────────────────────────────────────────────────────────────────────────

function sortByCanvasPosition(tables: ITable[]): ITable[] {
  return [...tables].sort((a, b) => {
    // First try explicit sortOrder if set
    const so = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    if (so !== 0) return so;
    // Fallback to row-major canvas position
    const rowA = Math.round(a.y_position / 120);
    const rowB = Math.round(b.y_position / 120);
    if (rowA !== rowB) return rowA - rowB;
    return a.x_position - b.x_position;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Table Card — compact mobile tile
// ─────────────────────────────────────────────────────────────────────────────

const MobileTableCard = memo(function MobileTableCard({
  table,
  onTableClick,
  viewMode,
  now,
  policy,
}: {
  table: ITable;
  onTableClick: (table: ITable) => void;
  viewMode: 'grid' | 'list';
  now: Date;
  policy: ReservationPolicy;
}) {
  const session =
    typeof table.activeSessionId === 'object'
      ? (table.activeSessionId as ITableSession)
      : null;
  const order =
    session?.orderId && typeof session.orderId === 'object' ? session.orderId : null;

  const status = getEffectiveTableStatus(table, now, policy);
  const colors = STATUS_MOBILE_COLORS[status];
  const isOccupied = status === 'occupied' && session;

  // Reservation chip: "held for X" when locked, "free 2h 45m" when the table is
  // booked later but still sellable right now.
  const reservation = session ? null : getTableActiveReservation(table, now, policy);
  const phase = reservation ? getPhase(reservation, now, policy) : null;
  const walkIn = session ? null : getTableWalkInWindow(table, now, policy);
  const reservationChip = reservation
    ? status === 'reserved'
      ? {
          text: `${reservation.customerName} ${formatClock(reservation.reservationTime)}`,
          cls:
            phase === 'late'
              ? 'text-red-400'
              : phase === 'waiting'
                ? 'text-indigo-400'
                : phase === 'due'
                  ? 'text-amber-400'
                  : 'text-teal-400',
        }
      : walkIn?.minutesFree != null
        ? { text: `free ${formatDuration(walkIn.minutesFree)}`, cls: 'text-teal-500' }
        : null
    : null;

  if (viewMode === 'list') {
    return (
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => onTableClick(table)}
        className="w-full flex items-center gap-3 bg-gray-900/60 backdrop-blur border border-gray-800/50 rounded-xl px-4 py-3 active:bg-gray-800/60 transition-colors"
      >
        {/* Status dot + Number */}
        <div className="flex items-center gap-2.5 min-w-[72px]">
          <div className={`w-2.5 h-2.5 rounded-full ${colors.dot} ${isOccupied ? 'animate-pulse' : ''}`} />
          <span className="text-base font-bold text-white">{table.tableNumber}</span>
        </div>

        {/* Status pill */}
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${colors.bg} ${colors.text}`}>
          {TABLE_STATUS_LABELS[status]}
        </div>

        {/* Reservation chip */}
        {reservationChip && (
          <span className={`text-[10px] font-medium truncate max-w-[110px] ${reservationChip.cls}`}>
            {reservationChip.text}
          </span>
        )}

        {/* Capacity */}
        <div className="flex items-center gap-1 text-gray-500 text-xs ml-auto">
          <Users size={12} />
          <span>{session?.covers ?? table.capacity}</span>
        </div>

        {/* Session info */}
        {isOccupied && (
          <div className="flex items-center gap-2 text-xs">
            {session.seatedAt && (
              <span className="flex items-center gap-0.5 text-orange-400">
                <Clock size={11} />
                {getElapsedTime(session.seatedAt)}
              </span>
            )}
            {order?.grandTotal !== undefined && (
              <span className="flex items-center gap-0.5 text-emerald-400 font-semibold">
                <DollarSign size={11} />
                {formatCurrency(order.grandTotal).replace('₹', '')}
              </span>
            )}
          </div>
        )}

        <ChevronRight size={16} className="text-gray-600 ml-1 flex-shrink-0" />
      </motion.button>
    );
  }

  // Grid view
  return (
    <motion.button
      whileTap={{ scale: 0.95 }}
      onClick={() => onTableClick(table)}
      className={`relative flex flex-col items-center justify-center bg-gray-900/60 backdrop-blur border border-gray-800/50 rounded-2xl p-3 min-h-[100px] active:bg-gray-800/60 transition-colors ${
        isOccupied ? 'ring-1 ring-orange-500/30' : ''
      }`}
    >
      {/* Status indicator */}
      <div className={`absolute top-2 right-2 w-2 h-2 rounded-full ${colors.dot} ${isOccupied ? 'animate-pulse' : ''}`} />

      {/* Table number */}
      <span className="text-lg font-bold text-white">{table.tableNumber}</span>

      {/* Status pill */}
      <div className={`mt-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${colors.bg} ${colors.text}`}>
        {TABLE_STATUS_LABELS[status]}
      </div>

      {/* Capacity or session info */}
      {isOccupied ? (
        <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
          {session.seatedAt && (
            <span className="text-orange-400 flex items-center gap-0.5">
              <Clock size={9} />
              {getElapsedTime(session.seatedAt)}
            </span>
          )}
          {order?.grandTotal !== undefined && (
            <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
              {formatCurrency(order.grandTotal)}
            </span>
          )}
        </div>
      ) : reservationChip ? (
        <div className={`mt-1.5 text-[9px] font-medium truncate max-w-full px-1 ${reservationChip.cls}`}>
          {reservationChip.text}
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-0.5 text-[10px] text-gray-500">
          <Users size={9} />
          <span>{table.capacity} seats</span>
        </div>
      )}
    </motion.button>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

function MobileTableGrid({
  tables,
  onTableClick,
  statusFilter = 'all',
  onStatusFilterChange,
  reservationPolicy = DEFAULT_RESERVATION_POLICY,
}: MobileTableGridProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [search, setSearch] = useState('');

  // Reservation phases move with the clock, so the grid keeps its own tick.
  const now = useNow(30_000);

  // Effective status per table, computed once and reused by the filter, the
  // counters and each card.
  const statuses = useMemo(() => {
    const map = new Map<string, TableStatus>();
    for (const t of tables) map.set(t._id, getEffectiveTableStatus(t, now, reservationPolicy));
    return map;
  }, [tables, now, reservationPolicy]);

  // Filter + sort
  const processedTables = useMemo(() => {
    let filtered = tables;
    if (statusFilter !== 'all') {
      filtered = filtered.filter((t) => statuses.get(t._id) === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.tableNumber.toLowerCase().includes(q) ||
          t.name?.toLowerCase().includes(q) ||
          t.sectionName?.toLowerCase().includes(q),
      );
    }
    return sortByCanvasPosition(filtered);
  }, [tables, statusFilter, search, statuses]);

  // Stats
  const stats = useMemo(() => {
    const values = [...statuses.values()];
    return {
      available: values.filter((s) => s === 'available').length,
      occupied: values.filter((s) => s === 'occupied').length,
      reserved: values.filter((s) => s === 'reserved').length,
      total: tables.length,
    };
  }, [statuses, tables.length]);

  const handleFilterChange = useCallback((status: TableStatus | 'all') => {
    onStatusFilterChange?.(status);
  }, [onStatusFilterChange]);

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-3 pb-2">
        {/* Quick stats */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/10 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span className="text-[11px] font-semibold text-purple-400">{stats.available} free</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-500/10 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span className="text-[11px] font-semibold text-orange-400">{stats.occupied} busy</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-teal-500/10 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            <span className="text-[11px] font-semibold text-teal-400">{stats.reserved} rsv</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-gray-800 text-white' : 'text-gray-500'}`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-gray-800 text-white' : 'text-gray-500'}`}
            >
              <List size={16} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-2">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search tables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-xl text-sm text-white placeholder:text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {(['all', 'available', 'occupied', 'reserved', 'cleaning', 'blocked'] as const).map((s) => {
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                onClick={() => handleFilterChange(s)}
                className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold capitalize transition-colors ${
                  isActive
                    ? 'bg-white/10 text-white border border-white/20'
                    : 'bg-gray-900 text-gray-500 border border-gray-800'
                }`}
              >
                {s === 'all' ? `All (${stats.total})` : s}
              </button>
            );
          })}
        </div>
      </div>

      {/* Table list/grid */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {processedTables.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-600">
            <Filter size={32} className="mb-2 opacity-50" />
            <p className="text-sm font-medium">No tables found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-3 gap-2">
            {processedTables.map((table) => (
              <MobileTableCard
                key={table._id}
                table={table}
                onTableClick={onTableClick}
                viewMode="grid"
                now={now}
                policy={reservationPolicy}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {processedTables.map((table) => (
              <MobileTableCard
                key={table._id}
                table={table}
                onTableClick={onTableClick}
                viewMode="list"
                now={now}
                policy={reservationPolicy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(MobileTableGrid);
