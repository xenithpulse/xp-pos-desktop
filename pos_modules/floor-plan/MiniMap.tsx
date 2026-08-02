// pos_modules/floor-plan/MiniMap.tsx
// Persistent mini-map for quick navigation across the full canvas area

'use client';

import { memo, useMemo, useCallback, useRef } from 'react';
import { ITable, DraftTable, TablePositionUpdate } from '@/types/table.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MiniMapProps {
  /** Canvas dimensions */
  canvasWidth: number;
  canvasHeight: number;
  /** Current viewport transform */
  viewportX: number;
  viewportY: number;
  scale: number;
  /** Container (viewport) pixel size */
  containerWidth: number;
  containerHeight: number;
  /** Tables to render as dots */
  tables: ITable[];
  draftTables: DraftTable[];
  /** Pending position overrides */
  pendingUpdates: Map<string, TablePositionUpdate>;
  /** Click to pan to a position */
  onPanTo: (x: number, y: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const MAP_W = 180;
const MAP_H = 120;

// Status → dot color
const STATUS_DOT: Record<string, string> = {
  available: '#8B5CF6',
  reserved: '#0D9488',
  occupied: '#EA580C',
  cleaning: '#CA8A04',
  blocked: '#6B7280',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function MiniMap({
  canvasWidth,
  canvasHeight,
  viewportX,
  viewportY,
  scale,
  containerWidth,
  containerHeight,
  tables,
  draftTables,
  pendingUpdates,
  onPanTo,
}: MiniMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  // Scale factor from canvas coords → mini-map coords
  const sx = MAP_W / canvasWidth;
  const sy = MAP_H / canvasHeight;

  // Viewport rectangle in mini-map space
  const vpRect = useMemo(() => {
    const vw = containerWidth / scale;
    const vh = containerHeight / scale;
    const vx = -viewportX / scale;
    const vy = -viewportY / scale;
    return {
      x: Math.max(0, vx * sx),
      y: Math.max(0, vy * sy),
      w: Math.min(MAP_W, vw * sx),
      h: Math.min(MAP_H, vh * sy),
    };
  }, [viewportX, viewportY, scale, containerWidth, containerHeight, sx, sy]);

  // Table dots
  const dots = useMemo(() => {
    const items: { x: number; y: number; color: string }[] = [];

    for (const t of tables) {
      const pending = pendingUpdates.get(t._id);
      const tx = pending?.x_position ?? t.x_position;
      const ty = pending?.y_position ?? t.y_position;
      items.push({
        x: tx * sx + (t.width * sx) / 2,
        y: ty * sy + (t.height * sy) / 2,
        color: STATUS_DOT[t.status] || '#6366F1',
      });
    }

    for (const d of draftTables) {
      items.push({
        x: d.x_position * sx + (d.width * sx) / 2,
        y: d.y_position * sy + (d.height * sy) / 2,
        color: '#F59E0B',
      });
    }

    return items;
  }, [tables, draftTables, pendingUpdates, sx, sy]);

  // Click on mini-map → pan canvas
  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      // Convert mini-map coords → canvas coords
      const canvasX = mx / sx;
      const canvasY = my / sy;

      // Center the viewport on this point
      const newVpX = -(canvasX * scale - containerWidth / 2);
      const newVpY = -(canvasY * scale - containerHeight / 2);
      onPanTo(newVpX, newVpY);
    },
    [sx, sy, scale, containerWidth, containerHeight, onPanTo],
  );

  return (
    <div className="bg-white/90 backdrop-blur rounded-xl shadow-lg border border-slate-200 p-1.5 select-none">
      <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider px-1 mb-1">
        Mini-Map
      </div>
      <svg
        ref={svgRef}
        width={MAP_W}
        height={MAP_H}
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="rounded-lg bg-slate-100 cursor-crosshair"
        onClick={handleClick}
      >
        {/* Grid lines */}
        <defs>
          <pattern id="mm-grid" width={MAP_W / 6} height={MAP_H / 4} patternUnits="userSpaceOnUse">
            <path d={`M ${MAP_W / 6} 0 L 0 0 0 ${MAP_H / 4}`} fill="none" stroke="#E2E8F0" strokeWidth={0.5} />
          </pattern>
        </defs>
        <rect width={MAP_W} height={MAP_H} fill="url(#mm-grid)" />

        {/* Table dots */}
        {dots.map((dot, i) => (
          <circle
            key={i}
            cx={dot.x}
            cy={dot.y}
            r={2.5}
            fill={dot.color}
            opacity={0.85}
          />
        ))}

        {/* Viewport rectangle */}
        <rect
          x={vpRect.x}
          y={vpRect.y}
          width={vpRect.w}
          height={vpRect.h}
          fill="rgba(59,130,246,0.1)"
          stroke="#3B82F6"
          strokeWidth={1.5}
          rx={2}
        />
      </svg>
    </div>
  );
}

export default memo(MiniMap);
