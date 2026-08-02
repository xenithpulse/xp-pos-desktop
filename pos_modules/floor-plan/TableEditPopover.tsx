// pos_modules/floor-plan/TableEditPopover.tsx
// Inline popover for editing individual table properties in edit mode.
// Appears when a single table is selected, anchored near the table.

'use client';

import { useState, useCallback, useEffect, useRef, memo } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Hash,
  Type,
  Users,
  Square,
  Circle,
  RectangleHorizontal,
  RotateCw,
  Palette,
  Move,
  Maximize2,
  Tag,
  Check,
} from 'lucide-react';
import {
  ITable,
  ITableSection,
  DraftTable,
  TableShape,
  TABLE_SHAPE_LABELS,
} from '@/types/table.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TableEditPopoverProps {
  table: ITable | DraftTable;
  position: { x: number; y: number };
  scale: number;
  canvasPosition: { x: number; y: number };
  sections: ITableSection[];
  onUpdate: (updates: {
    tableNumber?: string;
    name?: string;
    capacity?: number;
    shape?: TableShape;
    orientation?: number;
    width?: number;
    height?: number;
    sectionId?: string;
    sectionName?: string;
    color?: string;
  }) => void;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape options
// ─────────────────────────────────────────────────────────────────────────────

const SHAPES: { value: TableShape; label: string; icon: typeof Square }[] = [
  { value: 'square', label: 'Sq', icon: Square },
  { value: 'rectangle', label: 'Rect', icon: RectangleHorizontal },
  { value: 'round', label: 'Round', icon: Circle },
  { value: 'oval', label: 'Oval', icon: Circle },
];

const TABLE_COLORS = [
  '', '#E9D5FF', '#FECACA', '#FED7AA', '#FEF08A',
  '#BBF7D0', '#A5F3FC', '#BFDBFE', '#DDD6FE', '#FBCFE8',
];

/** Shape-aware size presets — round/square enforce equal w×h */
function getSizePresets(shape: TableShape): { label: string; w: number; h: number }[] {
  if (shape === 'round' || shape === 'square') {
    return [
      { label: 'S', w: 70, h: 70 },
      { label: 'M', w: 100, h: 100 },
      { label: 'L', w: 130, h: 130 },
      { label: 'XL', w: 160, h: 160 },
    ];
  }
  // rectangle / oval
  return [
    { label: 'S', w: 90, h: 60 },
    { label: 'M', w: 120, h: 80 },
    { label: 'L', w: 160, h: 100 },
    { label: 'XL', w: 200, h: 120 },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function TableEditPopover({
  table,
  position,
  scale,
  canvasPosition,
  sections,
  onUpdate,
  onClose,
}: TableEditPopoverProps) {
  const isDraft = '_draftId' in table;
  const tableId = isDraft ? (table as DraftTable)._draftId : (table as ITable)._id;

  // Local state for form fields
  const [tableNumber, setTableNumber] = useState(table.tableNumber);
  const [tableName, setTableName] = useState(table.name || '');
  const [capacity, setCapacity] = useState(table.capacity);
  const [shape, setShape] = useState<TableShape>(table.shape);
  const [width, setWidth] = useState(table.width);
  const [height, setHeight] = useState(table.height);
  const [orientation, setOrientation] = useState(table.orientation);
  const [sectionId, setSectionId] = useState(table.sectionId || '');
  const [color, setColor] = useState(table.color || '');

  const popoverRef = useRef<HTMLDivElement>(null);

  // Calculate screen position from canvas coordinates
  const screenX = position.x * scale + canvasPosition.x;
  const screenY = position.y * scale + canvasPosition.y;

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // Delayed to avoid the click that opened it
    const t = setTimeout(() => window.addEventListener('mousedown', handler), 100);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  // Apply changes immediately on field change (live preview)
  const applyField = useCallback(
    (updates: Parameters<typeof onUpdate>[0]) => {
      onUpdate(updates);
    },
    [onUpdate],
  );

  const handleShapeChange = (s: TableShape) => {
    setShape(s);
    let newW = width;
    let newH = height;
    if (s === 'square' || s === 'round') {
      // Enforce equal dimensions — use the larger of the two
      const size = Math.max(newW, newH);
      newW = size;
      newH = size;
    } else if ((shape === 'square' || shape === 'round') && width === height) {
      // Switching FROM square/round to rect/oval — give a wider aspect ratio
      newW = Math.round(width * 1.4);
      newH = height;
    }
    setWidth(newW);
    setHeight(newH);
    applyField({ shape: s, width: newW, height: newH });
  };

  const handleCapacityChange = (delta: number) => {
    const next = Math.max(1, Math.min(20, capacity + delta));
    setCapacity(next);
    applyField({ capacity: next });
  };

  const handleRotate = (deg: number) => {
    const next = (orientation + deg) % 360;
    setOrientation(next);
    applyField({ orientation: next });
  };

  const handleSizePreset = (w: number, h: number) => {
    // Enforce equal dimensions for round / square shapes
    let finalW = w;
    let finalH = h;
    if (shape === 'round' || shape === 'square') {
      const size = Math.max(w, h);
      finalW = size;
      finalH = size;
    }
    setWidth(finalW);
    setHeight(finalH);
    applyField({ width: finalW, height: finalH });
  };

  const handleSectionChange = (secId: string) => {
    setSectionId(secId);
    const sec = sections.find((s) => s._id === secId);
    applyField({ sectionId: secId || undefined, sectionName: sec?.name || undefined });
  };

  const handleColorChange = (c: string) => {
    setColor(c);
    applyField({ color: c || undefined });
  };

  const handleTableNumberBlur = () => {
    if (tableNumber.trim() && tableNumber !== table.tableNumber) {
      applyField({ tableNumber: tableNumber.trim() });
    }
  };

  const handleNameBlur = () => {
    if (tableName !== (table.name || '')) {
      applyField({ name: tableName.trim() || undefined });
    }
  };

  return (
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      transition={{ duration: 0.15 }}
      className="fixed z-50 bg-white rounded-xl shadow-2xl border border-slate-200 w-[280px]"
      style={{
        left: Math.min(screenX + 20, window.innerWidth - 300),
        top: Math.max(10, Math.min(screenY - 50, window.innerHeight - 520)),
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center">
            <Square size={12} className="text-violet-600" />
          </div>
          <span className="font-semibold text-sm text-slate-800">Edit Table</span>
          {isDraft && (
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-100 text-amber-700">
              Draft
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-100 rounded-md transition-colors"
        >
          <X size={14} className="text-slate-400" />
        </button>
      </div>

      {/* Body */}
      <div className="p-3 space-y-3 max-h-[420px] overflow-y-auto">
        {/* Table Number & Name */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Number
            </label>
            <div className="mt-0.5 relative">
              <Hash size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                onBlur={handleTableNumberBlur}
                className="w-full pl-6 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none"
                placeholder="T1"
              />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Name
            </label>
            <div className="mt-0.5 relative">
              <Type size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                onBlur={handleNameBlur}
                className="w-full pl-6 pr-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none"
                placeholder="VIP Corner"
              />
            </div>
          </div>
        </div>

        {/* Shape */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Shape
          </label>
          <div className="mt-1 flex gap-1">
            {SHAPES.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.value}
                  onClick={() => handleShapeChange(s.value)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${
                    shape === s.value
                      ? 'bg-violet-100 text-violet-700 border-2 border-violet-300'
                      : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Icon size={12} />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Capacity */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Capacity
          </label>
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={() => handleCapacityChange(-1)}
              className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-sm font-bold text-slate-600 transition-colors"
            >
              −
            </button>
            <div className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
              <Users size={13} className="text-slate-500" />
              <span className="text-sm font-bold text-slate-700">{capacity}</span>
            </div>
            <button
              onClick={() => handleCapacityChange(1)}
              className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center text-sm font-bold text-slate-600 transition-colors"
            >
              +
            </button>
          </div>
        </div>

        {/* Size Presets */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Size
          </label>
          <div className="mt-1 flex gap-1">
            {getSizePresets(shape).map((preset) => (
              <button
                key={preset.label}
                onClick={() => handleSizePreset(preset.w, preset.h)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  width === preset.w && height === preset.h
                    ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                    : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="mt-1 flex gap-2 text-[10px] text-slate-400">
            <span>{width}×{height}px</span>
          </div>
        </div>

        {/* Rotation */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Rotation
          </label>
          <div className="mt-1 flex items-center gap-1.5">
            {[0, 45, 90, 135, 180].map((deg) => (
              <button
                key={deg}
                onClick={() => {
                  setOrientation(deg);
                  applyField({ orientation: deg });
                }}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                  orientation === deg
                    ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-300'
                    : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {deg}°
              </button>
            ))}
            <button
              onClick={() => handleRotate(45)}
              className="w-8 h-8 rounded-lg border border-slate-200 hover:bg-slate-50 flex items-center justify-center transition-colors"
              title="Rotate +45°"
            >
              <RotateCw size={13} className="text-slate-500" />
            </button>
          </div>
        </div>

        {/* Section Assignment */}
        {sections.length > 0 && (
          <div>
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Zone
            </label>
            <select
              value={sectionId}
              onChange={(e) => handleSectionChange(e.target.value)}
              className="mt-1 w-full py-1.5 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-violet-300 focus:border-violet-400 outline-none"
            >
              <option value="">No zone</option>
              {sections.map((sec) => (
                <option key={sec._id} value={sec._id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Color */}
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            Accent Color
          </label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {TABLE_COLORS.map((c, i) => (
              <button
                key={i}
                onClick={() => handleColorChange(c)}
                className={`w-6 h-6 rounded-full border-2 transition-all flex items-center justify-center ${
                  color === c
                    ? 'border-violet-500 scale-110'
                    : 'border-slate-200 hover:border-slate-400'
                }`}
                style={{
                  background: c || 'linear-gradient(135deg, #f1f5f9, #e2e8f0)',
                }}
              >
                {color === c && <Check size={10} className={c ? 'text-white' : 'text-slate-600'} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default memo(TableEditPopover);
