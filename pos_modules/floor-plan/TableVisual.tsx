// pos_modules/floor-plan/TableVisual.tsx
// Professional SVG-based table component with dynamic chair rendering,
// realistic shadows, orbiting seats, and live HUD badges.

'use client';

import { memo, useMemo, useCallback, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, DollarSign, User, Info, Edit3 } from 'lucide-react';
import {
  ITable,
  ITableSession,
  TableStatus,
  ReservationPolicy,
  DEFAULT_RESERVATION_POLICY,
  getElapsedTime,
  formatCurrency,
  formatClock,
  formatDuration,
  formatRelative,
  getEffectiveTableStatus,
  getPhase,
  getTableActiveReservation,
  getTableWalkInWindow,
} from '@/types/table.types';
import { useNow } from '@/lib/hooks/useNow';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface TableVisualProps {
  table: ITable;
  onTableClick: (table: ITable) => void;
  /** Fires when the info-icon on an occupied table is clicked (details panel). */
  onTableIconClick?: (table: ITable) => void;
  isSelected?: boolean;
  isMultiSelected?: boolean;
  isEditMode?: boolean;
  isDraft?: boolean;
  isDragging?: boolean;
  onDragStart?: (tableId: string, e: React.PointerEvent) => void;
  scale?: number;
  snapToGrid?: number;
  /** Tenant reservation timing policy — drives the hold-window badges. */
  reservationPolicy?: ReservationPolicy;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-Contrast Status Palette
//   Available → soft lavender
//   Reserved  → deep teal
//   Occupied  → warm peach  (with Live HUD)
// ─────────────────────────────────────────────────────────────────────────────

const STATUS_PALETTE: Record<TableStatus, {
  fill: string;
  gradStart: string;
  gradEnd: string;
  stroke: string;
  chairFill: string;
  chairStroke: string;
  text: string;
  badgeBg: string;
  badgeText: string;
  shadow: string;
  glow: string;
}> = {
  available: {
    fill: '#E9D5FF',
    gradStart: '#F3E8FF',
    gradEnd: '#C4B5FD',
    stroke: '#8B5CF6',
    chairFill: '#DDD6FE',
    chairStroke: '#8B5CF6',
    text: '#5B21B6',
    badgeBg: 'rgba(139,92,246,0.12)',
    badgeText: '#7C3AED',
    shadow: 'rgba(139,92,246,0.30)',
    glow: 'rgba(139,92,246,0.15)',
  },
  reserved: {
    fill: '#99F6E4',
    gradStart: '#CCFBF1',
    gradEnd: '#2DD4BF',
    stroke: '#0D9488',
    chairFill: '#5EEAD4',
    chairStroke: '#0D9488',
    text: '#134E4A',
    badgeBg: 'rgba(13,148,136,0.12)',
    badgeText: '#0F766E',
    shadow: 'rgba(13,148,136,0.30)',
    glow: 'rgba(13,148,136,0.15)',
  },
  occupied: {
    fill: '#FED7AA',
    gradStart: '#FFF7ED',
    gradEnd: '#FDBA74',
    stroke: '#EA580C',
    chairFill: '#FDBA74',
    chairStroke: '#EA580C',
    text: '#9A3412',
    badgeBg: 'rgba(234,88,12,0.15)',
    badgeText: '#C2410C',
    shadow: 'rgba(234,88,12,0.35)',
    glow: 'rgba(234,88,12,0.15)',
  },
  cleaning: {
    fill: '#FEF9C3',
    gradStart: '#FEFCE8',
    gradEnd: '#FDE047',
    stroke: '#CA8A04',
    chairFill: '#FDE047',
    chairStroke: '#CA8A04',
    text: '#854D0E',
    badgeBg: 'rgba(202,138,4,0.12)',
    badgeText: '#A16207',
    shadow: 'rgba(202,138,4,0.25)',
    glow: 'rgba(202,138,4,0.10)',
  },
  blocked: {
    fill: '#E5E7EB',
    gradStart: '#F9FAFB',
    gradEnd: '#D1D5DB',
    stroke: '#6B7280',
    chairFill: '#D1D5DB',
    chairStroke: '#6B7280',
    text: '#374151',
    badgeBg: 'rgba(107,114,128,0.12)',
    badgeText: '#4B5563',
    shadow: 'rgba(107,114,128,0.25)',
    glow: 'rgba(107,114,128,0.08)',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Chair Component — elegant seat icon orbiting the table
// ─────────────────────────────────────────────────────────────────────────────

interface ChairProps {
  x: number;
  y: number;
  rotation: number;
  fill: string;
  stroke: string;
  size?: number;
}

const Chair = memo(function Chair({ x, y, rotation, fill, stroke, size = 20 }: ChairProps) {
  const s = size * 0.62;
  const back = size * 0.28;
  return (
    <g transform={`translate(${x},${y}) rotate(${rotation})`}>
      {/* Shadow */}
      <rect x={-s / 2 + 1.5} y={-s / 2 + back / 2 + 2} width={s} height={s} rx={4} fill="rgba(0,0,0,0.08)" />
      {/* Seat */}
      <rect x={-s / 2} y={-s / 2 + back / 2} width={s} height={s} rx={4} fill={fill} stroke={stroke} strokeWidth={1.5} />
      {/* Back rest */}
      <rect x={-s / 2} y={-s / 2 - back / 2} width={s} height={back} rx={3} fill={stroke} opacity={0.85} />
      {/* Cushion shine */}
      <rect x={-s / 2 + 2.5} y={-s / 2 + back / 2 + 2.5} width={s - 5} height={s - 5} rx={3} fill="white" opacity={0.25} />
    </g>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Table Shape SVGs — professional surfaces with grain + highlights
// ─────────────────────────────────────────────────────────────────────────────

interface ShapeProps {
  w: number;
  h: number;
  stroke: string;
  gradId: string;
  isSelected: boolean;
  shadow: string;
  filterId: string;
}

const RectShape = memo(function RectShape({ w, h, stroke, gradId, isSelected, shadow, filterId }: ShapeProps) {
  const r = Math.min(14, Math.min(w, h) * 0.14);
  return (
    <>
      {/* Soft drop shadow */}
      <rect x={4} y={4} width={w} height={h} rx={r} fill={shadow} filter={`url(#${filterId})`} />
      {/* Surface */}
      <rect x={0} y={0} width={w} height={h} rx={r} fill={`url(#${gradId})`} stroke={stroke} strokeWidth={isSelected ? 3 : 2} />
      {/* Wood-grain texture lines */}
      <g opacity={0.06}>
        {[0.28, 0.5, 0.72].map((ratio, i) => (
          <line key={i} x1={r} y1={h * ratio} x2={w - r} y2={h * ratio} stroke="#000" strokeWidth={0.6} />
        ))}
      </g>
      {/* Inner highlight */}
      <rect x={6} y={6} width={w - 12} height={h - 12} rx={Math.max(0, r - 2)} fill="white" opacity={0.18} />
    </>
  );
});

const RoundShape = memo(function RoundShape({ w, h, stroke, gradId, isSelected, shadow, filterId }: ShapeProps) {
  const cx = w / 2;
  const cy = h / 2;
  return (
    <>
      <ellipse cx={cx + 4} cy={cy + 4} rx={w / 2} ry={h / 2} fill={shadow} filter={`url(#${filterId})`} />
      <ellipse cx={cx} cy={cy} rx={w / 2} ry={h / 2} fill={`url(#${gradId})`} stroke={stroke} strokeWidth={isSelected ? 3 : 2} />
      {/* Glossy highlight */}
      <ellipse cx={cx - w * 0.15} cy={cy - h * 0.15} rx={w * 0.25} ry={h * 0.2} fill="white" opacity={0.22} />
      {/* Inner ring */}
      <ellipse cx={cx} cy={cy} rx={w / 2 - 6} ry={h / 2 - 6} fill="none" stroke="white" strokeWidth={1} opacity={0.2} />
    </>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Orbit Chair Positions — seats dynamically distributed around perimeter
// ─────────────────────────────────────────────────────────────────────────────

function computeChairs(
  capacity: number,
  w: number,
  h: number,
  shape: string,
  chairGap: number,
  chairSize: number,
) {
  const positions: { x: number; y: number; rotation: number }[] = [];

  if (shape === 'round' || shape === 'oval') {
    const cx = w / 2;
    const cy = h / 2;
    const rx = w / 2 + chairGap + chairSize / 2;
    const ry = h / 2 + chairGap + chairSize / 2;
    for (let i = 0; i < capacity; i++) {
      const angle = (2 * Math.PI * i) / capacity - Math.PI / 2;
      positions.push({
        x: cx + rx * Math.cos(angle),
        y: cy + ry * Math.sin(angle),
        rotation: (angle * 180) / Math.PI - 270,
      });
    }
    return positions;
  }

  // Rectangle / Square — perimeter-proportional
  const minSpace = chairSize + 4;
  const maxTop = Math.max(1, Math.floor(w / minSpace));
  const maxSide = Math.max(1, Math.floor(h / minSpace));
  let top = 0, bottom = 0, left = 0, right = 0;

  if (capacity <= 2) {
    if (w >= h) { left = 1; right = Math.min(1, capacity - 1); }
    else { top = 1; bottom = Math.min(1, capacity - 1); }
  } else if (capacity <= 4) {
    top = 1; bottom = 1;
    left = Math.min(1, Math.floor((capacity - 2) / 2));
    right = capacity - 2 - left;
  } else {
    const perim = 2 * (w + h);
    const perUnit = capacity / perim;
    top = Math.min(maxTop, Math.max(1, Math.round(w * perUnit)));
    bottom = Math.min(maxTop, Math.max(1, Math.round(w * perUnit)));
    const rem = capacity - top - bottom;
    left = Math.min(maxSide, Math.max(0, Math.floor(rem / 2)));
    right = Math.max(0, rem - left);
  }

  const place = (
    count: number,
    along: number,
    fixedAxis: number,
    side: 'top' | 'bottom' | 'left' | 'right',
  ) => {
    if (count === 0) return;
    const spacing = along / (count + 1);
    for (let i = 0; i < count; i++) {
      const pos = spacing * (i + 1);
      switch (side) {
        case 'top':    positions.push({ x: pos, y: fixedAxis, rotation: 0 }); break;
        case 'bottom': positions.push({ x: pos, y: fixedAxis, rotation: 180 }); break;
        case 'left':   positions.push({ x: fixedAxis, y: pos, rotation: -90 }); break;
        case 'right':  positions.push({ x: fixedAxis, y: pos, rotation: 90 }); break;
      }
    }
  };

  place(top, w, -(chairGap + chairSize / 2), 'top');
  place(bottom, w, h + chairGap + chairSize / 2, 'bottom');
  place(left, h, -(chairGap + chairSize / 2), 'left');
  place(right, h, w + chairGap + chairSize / 2, 'right');

  return positions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

function TableVisual({
  table,
  onTableClick,
  onTableIconClick,
  isSelected = false,
  isMultiSelected = false,
  isEditMode = false,
  isDraft = false,
  isDragging = false,
  onDragStart,
  scale = 1,
  snapToGrid = 0,
  reservationPolicy = DEFAULT_RESERVATION_POLICY,
}: TableVisualProps) {
  // Session / order data
  const session =
    typeof table.activeSessionId === 'object'
      ? (table.activeSessionId as ITableSession)
      : null;
  const order =
    session?.orderId && typeof session.orderId === 'object' ? session.orderId : null;

  // Reservation state is time-derived, so the tile re-evaluates on its own
  // clock — a hold window opening at 20:30 turns the table teal at 20:30
  // without waiting for a refetch. Edit mode freezes it (layout work only).
  const now = useNow(isEditMode ? 0 : 30_000);

  const status = isEditMode
    ? table.status
    : getEffectiveTableStatus(table, now, reservationPolicy);

  const reservation = isEditMode ? null : getTableActiveReservation(table, now, reservationPolicy);
  const reservationPhase = reservation ? getPhase(reservation, now, reservationPolicy) : null;
  const walkInWindow =
    isEditMode || session ? null : getTableWalkInWindow(table, now, reservationPolicy);

  const pal = STATUS_PALETTE[status];
  const CHAIR_SIZE = 20;
  const CHAIR_GAP = 12;
  const padding = CHAIR_SIZE / 2 + CHAIR_GAP;
  const totalW = table.width + padding * 2;
  const totalH = table.height + padding * 2;

  const isRound = table.shape === 'round' || table.shape === 'oval';

  // Use _draftId for drafts, _id for persisted — guarantees unique keys
  const uid = (table as any)._draftId ?? table._id;
  const gradId = `tg-${uid}`;
  const shadowFilterId = `tsf-${uid}`;
  const highlighted = isSelected || isMultiSelected;

  // Compute chair positions
  const chairs = useMemo(
    () =>
      computeChairs(
        table.capacity,
        table.width,
        table.height,
        table.shape,
        CHAIR_GAP,
        CHAIR_SIZE,
      ),
    [table.capacity, table.width, table.height, table.shape],
  );

  // Pointer-based drag initiation (Figma-like precision — replaces framer-motion drag)
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isEditMode || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault(); // Prevents mousedown compatibility event on canvas
      onDragStart?.(uid, e);
    },
    [isEditMode, uid, onDragStart],
  );

  // ── Live ticking timer for occupied tables ──
  const [liveElapsed, setLiveElapsed] = useState(() =>
    session?.seatedAt ? getElapsedTime(session.seatedAt) : '',
  );

  useEffect(() => {
    if (!session?.seatedAt) return;
    setLiveElapsed(getElapsedTime(session.seatedAt));
    const interval = setInterval(() => {
      setLiveElapsed(getElapsedTime(session.seatedAt));
    }, 10000); // Tick every 10s for performance
    return () => clearInterval(interval);
  }, [session?.seatedAt]);

  // ── Waiter info extraction ──
  const waiterName = useMemo(() => {
    if (!session?.waiterId) return null;
    if (typeof session.waiterId === 'object' && session.waiterId !== null) {
      return (session.waiterId as any).username || (session.waiterId as any).name || 'Staff';
    }
    return null;
  }, [session?.waiterId]);

  // ── Host info extraction ──
  const hostName = useMemo(() => {
    if (!session?.hostId) return null;
    if (typeof session.hostId === 'object' && session.hostId !== null) {
      return (session.hostId as any).username || (session.hostId as any).name || 'Host';
    }
    return null;
  }, [session?.hostId]);

  // ── Hover state for info popover ──
  const [isHovered, setIsHovered] = useState(false);

  const Shape = isRound ? RoundShape : RectShape;

  return (
    <motion.div
      data-table-visual
      className={`absolute ${isEditMode ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-pointer'}`}
      style={{
        left: table.x_position - padding,
        top: table.y_position - padding,
        width: totalW,
        height: totalH,
        touchAction: 'none',
        zIndex: isDragging ? 100 : isHovered ? 30 : highlighted ? 20 : 1,
        ...(isDragging && { filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.25))' }),
      }}
      onPointerDown={isEditMode ? handlePointerDown : undefined}
      onClick={() => {
        if (isEditMode) return;
        // All statuses: delegate to hub's handleTableClick
        // — occupied → Order Editor
        // — available / reserved → session panel
        // — cleaning → set_available
        onTableClick(table);
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={!isEditMode ? { scale: 1.05, transition: { duration: 0.15 } } : undefined}
      whileTap={!isEditMode ? { scale: 0.97 } : undefined}
      initial={false}
      animate={{ rotate: table.orientation }}
      transition={{ type: 'tween', duration: 0.15 }}
    >
      <svg
        width={totalW}
        height={totalH}
        viewBox={`${-padding} ${-padding} ${totalW} ${totalH}`}
        className="overflow-visible"
      >
        {/* ── Defs ───────────────────────────────────── */}
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={pal.gradStart} />
            <stop offset="100%" stopColor={pal.gradEnd} />
          </linearGradient>
          <filter
            id={shadowFilterId}
            x="-20%"
            y="-20%"
            width="150%"
            height="150%"
          >
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
          </filter>
        </defs>

        {/* ── Selection / Multi-select ring ──────────── */}
        {highlighted &&
          (isRound ? (
            <ellipse
              cx={table.width / 2}
              cy={table.height / 2}
              rx={table.width / 2 + 8}
              ry={table.height / 2 + 8}
              fill="none"
              stroke={isMultiSelected ? '#F59E0B' : '#3B82F6'}
              strokeWidth={3}
              strokeDasharray="8 4"
              className="animate-pulse"
            />
          ) : (
            <rect
              x={-8}
              y={-8}
              width={table.width + 16}
              height={table.height + 16}
              rx={16}
              fill="none"
              stroke={isMultiSelected ? '#F59E0B' : '#3B82F6'}
              strokeWidth={3}
              strokeDasharray="8 4"
              className="animate-pulse"
            />
          ))}

        {/* ── Chairs ────────────────────────────────── */}
        {chairs.map((ch, i) => {
          // Highlight occupied seats: first N chairs colored (N = covers), rest neutral
          const covers = session?.covers ?? 0;
          const isOccupiedSeat = status === 'occupied' && session && i < covers;
          return (
            <Chair
              key={`ch-${uid}-${i}`}
              x={ch.x}
              y={ch.y}
              rotation={ch.rotation}
              fill={isOccupiedSeat ? '#FDBA74' : (status === 'occupied' && session ? '#E2E8F0' : pal.chairFill)}
              stroke={isOccupiedSeat ? '#EA580C' : (status === 'occupied' && session ? '#94A3B8' : pal.chairStroke)}
              size={CHAIR_SIZE}
            />
          );
        })}

        {/* ── Table surface ─────────────────────────── */}
        <Shape
          w={table.width}
          h={table.height}
          stroke={pal.stroke}
          gradId={gradId}
          isSelected={highlighted}
          shadow={pal.shadow}
          filterId={shadowFilterId}
        />

        {/* ── Table number ──────────────────────────── */}
        <text
          x={table.width / 2}
          y={
            table.height / 2 +
            (status === 'occupied' && session ? -6 : 0)
          }
          textAnchor="middle"
          dominantBaseline="middle"
          fill={pal.text}
          fontSize={Math.min(20, table.width / 3.5)}
          fontWeight="700"
          fontFamily="system-ui, -apple-system, sans-serif"
          letterSpacing={0.5}
        >
          {table.tableNumber}
        </text>

        {/* ── Capacity badge (when not occupied w/session) */}
        {!(status === 'occupied' && session) && (
          <text
            x={table.width / 2}
            y={table.height / 2 + 14}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={pal.text}
            fontSize={10}
            opacity={0.55}
            fontFamily="system-ui, -apple-system, sans-serif"
          >
            {table.capacity} seats
          </text>
        )}
      </svg>

      {/* ── Live HUD Badge (occupied tables) ───────────── */}
      {status === 'occupied' && session && (
        <div
          className="absolute left-1/2 z-10"
          style={{
            bottom: -2,
            transform: `translateX(-50%) translateY(100%) rotate(-${table.orientation}deg)`,
          }}
        >
          {/* Main badge — always visible */}
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold shadow-lg whitespace-nowrap backdrop-blur-sm"
            style={{
              background: 'rgba(255,255,255,0.92)',
              border: `2px solid ${pal.stroke}`,
              color: pal.badgeText,
              pointerEvents: 'auto',
            }}
          >
            {/* ── Detail button — opens session panel ── */}
            {!isEditMode && onTableIconClick && (
              <button
                className="flex items-center justify-center w-5 h-5 rounded-full bg-blue-500 hover:bg-blue-400 text-white transition-colors -ml-1 mr-0.5 cursor-pointer"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onTableIconClick(table);
                }}
                onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
                title="View session details"
              >
                <Info size={10} strokeWidth={2.5} />
              </button>
            )}
            {/* ── Edit button — opens order editor ── */}
            {!isEditMode && (
              <button
                className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-500 hover:bg-purple-400 text-white transition-colors cursor-pointer"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onTableClick(table);
                }}
                onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
                title="Open order editor"
              >
                <Edit3 size={10} strokeWidth={2.5} />
              </button>
            )}
            {/* Live ticking timer */}
            {session.seatedAt && (
              <span className="flex items-center gap-1">
                <Clock size={11} strokeWidth={2.5} className="text-orange-500" />
                {liveElapsed}
              </span>
            )}
            {/* Waiter name chip */}
            {waiterName && (
              <>
                <span className="w-px h-3 bg-gray-300" />
                <span className="flex items-center gap-0.5 text-blue-600">
                  <User size={10} strokeWidth={2.5} />
                  {waiterName}
                </span>
              </>
            )}
            {order?.grandTotal !== undefined && (
              <>
                <span className="w-px h-3 bg-gray-300" />
                <span className="flex items-center gap-0.5 font-bold text-emerald-600">
                  <DollarSign size={10} strokeWidth={2.5} />
                  {formatCurrency(order.grandTotal).replace('₹', '')}
                </span>
              </>
            )}
          </div>

          {/* ── Hover popover — detailed info ──────────── */}
          <AnimatePresence>
            {isHovered && !isEditMode && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-1/2 mt-1.5 pointer-events-none"
                style={{ transform: 'translateX(-50%)' }}
              >
                <div
                  className="rounded-lg shadow-xl text-[10px] min-w-[140px] overflow-hidden"
                  style={{
                    background: 'rgba(255,255,255,0.96)',
                    border: `1.5px solid ${pal.stroke}`,
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  {/* Popover header */}
                  <div
                    className="px-2.5 py-1.5 font-bold"
                    style={{ background: pal.badgeBg, color: pal.badgeText }}
                  >
                    Table {table.tableNumber}
                    {session.covers > 0 && (
                      <span className="ml-1 font-normal opacity-75">
                        · {session.covers} guests
                      </span>
                    )}
                  </div>
                  {/* Popover body */}
                  <div className="px-2.5 py-1.5 space-y-1 text-slate-600">
                    {waiterName && (
                      <div className="flex items-center gap-1.5">
                        <User size={10} className="text-blue-500 flex-shrink-0" />
                        <span>Server: <b className="text-slate-800">{waiterName}</b></span>
                      </div>
                    )}
                    {hostName && (
                      <div className="flex items-center gap-1.5">
                        <User size={10} className="text-purple-500 flex-shrink-0" />
                        <span>Host: <b className="text-slate-800">{hostName}</b></span>
                      </div>
                    )}
                    {session.seatedAt && (
                      <div className="flex items-center gap-1.5">
                        <Clock size={10} className="text-orange-500 flex-shrink-0" />
                        <span>
                          Seated {liveElapsed} ago
                          <span className="opacity-60 ml-1">
                            ({new Date(session.seatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                          </span>
                        </span>
                      </div>
                    )}
                    {order?.grandTotal !== undefined && (
                      <div className="flex items-center gap-1.5">
                        <DollarSign size={10} className="text-emerald-500 flex-shrink-0" />
                        <span>Total: <b className="text-emerald-700">{formatCurrency(order.grandTotal)}</b></span>
                      </div>
                    )}
                    {order?.items?.length > 0 && (
                      <div className="text-[9px] text-slate-400 pt-0.5 border-t border-slate-100">
                        {order.items.length} item{order.items.length !== 1 ? 's' : ''} ordered
                      </div>
                    )}
                    {session.status && session.status !== 'active' && (
                      <div className="text-[9px] font-semibold uppercase text-amber-600">
                        {session.status}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Reservation badge ─────────────────────────────────────────────
          Two distinct looks, because they mean opposite things to the floor:
            • held  → this table is locked for an arriving guest
            • free-until → this table is still sellable, and for how long   */}
      {!session && reservation && (
        <div
          className="absolute left-1/2 z-10 pointer-events-none"
          style={{
            bottom: -2,
            transform: `translateX(-50%) translateY(100%) rotate(-${table.orientation}deg)`,
          }}
        >
          {status === 'reserved' ? (
            <div
              className={`px-3 py-1 rounded-full text-[11px] font-semibold shadow-lg truncate max-w-[150px] backdrop-blur-sm flex items-center gap-1 ${
                reservationPhase === 'due' || reservationPhase === 'waiting' ? 'animate-pulse' : ''
              }`}
              style={{
                background: 'rgba(255,255,255,0.92)',
                border: `2px solid ${
                  reservationPhase === 'late' ? '#DC2626'
                    : reservationPhase === 'waiting' ? '#4F46E5'
                    : reservationPhase === 'due' ? '#D97706'
                    : pal.stroke
                }`,
                color:
                  reservationPhase === 'late' ? '#B91C1C'
                    : reservationPhase === 'waiting' ? '#4338CA'
                    : reservationPhase === 'due' ? '#B45309'
                    : pal.badgeText,
              }}
            >
              <span>
                {reservationPhase === 'late' ? '⏰'
                  : reservationPhase === 'waiting' ? '🔔'
                  : reservationPhase === 'due' ? '👋' : '📋'}
              </span>
              <span className="truncate">{reservation.customerName}</span>
              <span className="opacity-70 tabular-nums">
                {formatClock(reservation.reservationTime)}
              </span>
            </div>
          ) : (
            // Booked for later — the table is still open for business, and the
            // badge says exactly how much of the evening is left to sell.
            walkInWindow?.minutesFree != null && (
              <div
                className="px-2.5 py-0.5 rounded-full text-[10px] font-medium shadow-md whitespace-nowrap backdrop-blur-sm border border-dashed"
                style={{
                  background: 'rgba(255,255,255,0.88)',
                  borderColor: '#14B8A6',
                  color: '#0F766E',
                }}
              >
                free {formatDuration(walkInWindow.minutesFree)} · {formatClock(reservation.reservationTime)}
              </div>
            )
          )}
        </div>
      )}

      {/* ── Hover info popover for non-occupied tables ──────── */}
      {status !== 'occupied' && (
        <AnimatePresence>
          {isHovered && !isEditMode && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.12 }}
              className="absolute left-1/2 z-30 pointer-events-none"
              style={{
                bottom: -2,
                transform: 'translateX(-50%) translateY(100%)',
              }}
            >
              <div
                className="rounded-lg shadow-xl text-[10px] min-w-[130px] overflow-hidden mt-1"
                style={{
                  background: 'rgba(255,255,255,0.96)',
                  border: `1.5px solid ${pal.stroke}`,
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div
                  className="px-2.5 py-1.5 font-bold"
                  style={{ background: pal.badgeBg, color: pal.badgeText }}
                >
                  Table {table.tableNumber}
                  <span className="ml-1 font-normal opacity-75">
                    · {table.capacity} seats
                  </span>
                </div>
                <div className="px-2.5 py-1.5 space-y-1 text-slate-600">
                  <div className="text-[9px] font-semibold uppercase" style={{ color: pal.badgeText }}>
                    {status}
                  </div>
                  {reservation && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <User size={10} className="text-teal-500 flex-shrink-0" />
                        <span>{reservation.customerName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock size={10} className="text-teal-500 flex-shrink-0" />
                        <span>
                          Party of {reservation.partySize} at{' '}
                          {formatClock(reservation.reservationTime)}
                          <span className="opacity-60 ml-1">
                            ({formatRelative(reservation.reservationTime, now)})
                          </span>
                        </span>
                      </div>
                    </>
                  )}
                  {status === 'available' && (
                    <div className="text-[9px] text-slate-400">
                      {walkInWindow?.freeUntil
                        ? `Seat a walk-in until ${formatClock(walkInWindow.freeUntil)}`
                        : 'Click to seat guests'}
                    </div>
                  )}
                  {status === 'reserved' && (
                    <div className="text-[9px] text-teal-600 font-medium">
                      Click to seat the booked party
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Blocked / Cleaning overlay ─────────────────── */}
      {(status === 'blocked' || status === 'cleaning') && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ padding }}
        >
          <div
            className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider shadow-lg backdrop-blur-sm"
            style={{
              background: 'rgba(255,255,255,0.92)',
              color: pal.text,
              border: `2px solid ${pal.stroke}`,
            }}
          >
            {status === 'cleaning' ? '🧹' : '🚫'} {status}
          </div>
        </div>
      )}

      {/* ── Draft indicator ───────────────────────────── */}
      {isDraft && (
        <div
          className="absolute -top-1 -left-1 px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-400 text-amber-900 shadow"
          style={{ letterSpacing: '0.05em' }}
        >
          Draft
        </div>
      )}

      {/* ── Edit mode grip ────────────────────────────── */}
      {isEditMode && (
        <div
          className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{
            background: '#F59E0B',
            border: '2px solid white',
            boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="white">
            <circle cx="2.5" cy="2.5" r="1.2" />
            <circle cx="7.5" cy="2.5" r="1.2" />
            <circle cx="2.5" cy="7.5" r="1.2" />
            <circle cx="7.5" cy="7.5" r="1.2" />
          </svg>
        </div>
      )}
    </motion.div>
  );
}

export default memo(TableVisual);
