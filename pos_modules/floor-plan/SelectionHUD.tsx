// pos_modules/floor-plan/SelectionHUD.tsx
// Floating Selection HUD — appears when multiple tables are selected.
// Provides quick-access shape, capacity, distribute, tidy-up, and group controls
// that apply to the entire selection instantly.

'use client';

import { memo, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Square,
  Circle,
  RectangleHorizontal,
  Users,
  RotateCw,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  Grid3X3,
  Group,
  Ungroup,
  Minus,
  Plus,
  X,
  Maximize2,
  GripHorizontal,
  GripVertical,
  Wand2,
  Copy,
  Trash2,
} from 'lucide-react';
import { ITable, DraftTable, TableShape, TablePositionUpdate } from '@/types/table.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SelectionHUDProps {
  /** All tables visible on canvas */
  allTables: (ITable | DraftTable)[];
  /** Currently selected IDs */
  selectedIds: Set<string>;
  /** Pending position overrides */
  pendingUpdates: Map<string, TablePositionUpdate>;
  /** Batch update callback */
  onBatchUpdate: (updates: {
    capacity?: number;
    shape?: TableShape;
    orientation?: number;
    width?: number;
    height?: number;
  }) => void;
  /** Distribute horizontally */
  onDistributeH: () => void;
  /** Distribute vertically */
  onDistributeV: () => void;
  /** Tidy up into grid */
  onTidyUp: () => void;
  /** Arrange in single row */
  onArrangeRow?: () => void;
  /** Arrange in single column */
  onArrangeColumn?: () => void;
  /** Smart organize by size groups */
  onSmartOrganize?: () => void;
  /** Delete selected tables */
  onDeleteSelected?: () => void;
  /** Duplicate selected tables */
  onDuplicateSelected?: () => void;
  /** Group selected tables */
  onGroup: () => void;
  /** Ungroup selected tables */
  onUngroup: () => void;
  /** Close HUD / deselect */
  onClose: () => void;
  /** Scale for position calc */
  scale: number;
  /** Canvas position offset */
  canvasPosition: { x: number; y: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape Options
// ─────────────────────────────────────────────────────────────────────────────

const SHAPES: { value: TableShape; label: string; icon: typeof Square }[] = [
  { value: 'square', label: 'Square', icon: Square },
  { value: 'rectangle', label: 'Rect', icon: RectangleHorizontal },
  { value: 'round', label: 'Round', icon: Circle },
  { value: 'oval', label: 'Oval', icon: Circle },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function SelectionHUD({
  allTables,
  selectedIds,
  pendingUpdates,
  onBatchUpdate,
  onDistributeH,
  onDistributeV,
  onTidyUp,
  onArrangeRow,
  onArrangeColumn,
  onSmartOrganize,
  onDeleteSelected,
  onDuplicateSelected,
  onGroup,
  onUngroup,
  onClose,
  scale,
  canvasPosition,
}: SelectionHUDProps) {
  const [showShapes, setShowShapes] = useState(false);

  // Get selected tables info
  const selectedTables = useMemo(() => {
    return allTables.filter((t) => {
      const id = (t as any)._draftId ?? (t as ITable)._id;
      return selectedIds.has(id);
    });
  }, [allTables, selectedIds]);

  // Compute average capacity of selection
  const avgCapacity = useMemo(() => {
    if (selectedTables.length === 0) return 4;
    return Math.round(selectedTables.reduce((s, t) => s + t.capacity, 0) / selectedTables.length);
  }, [selectedTables]);

  // Check if any selected tables are grouped
  const hasGrouped = useMemo(() => {
    return selectedTables.some((t) => (t as ITable).groupId);
  }, [selectedTables]);

  // Check dominant shape
  const dominantShape = useMemo(() => {
    if (selectedTables.length === 0) return 'square';
    const shapes = selectedTables.map((t) => t.shape);
    const counts: Record<string, number> = {};
    shapes.forEach((s) => { counts[s] = (counts[s] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as TableShape || 'square';
  }, [selectedTables]);

  // Compute position for floating HUD — centered above the selection bounding box
  const hudPosition = useMemo(() => {
    if (selectedTables.length === 0) return { x: 200, y: 50 };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of selectedTables) {
      const id = (t as any)._draftId ?? (t as ITable)._id;
      const pending = pendingUpdates.get(id);
      const x = pending?.x_position ?? t.x_position;
      const y = pending?.y_position ?? t.y_position;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + t.width);
      maxY = Math.max(maxY, y + t.height);
    }

    // Transform to screen coords
    const centerX = ((minX + maxX) / 2) * scale + canvasPosition.x;
    const topY = minY * scale + canvasPosition.y - 60;

    return { x: centerX, y: Math.max(8, topY) };
  }, [selectedTables, pendingUpdates, scale, canvasPosition]);

  const handleCapacityChange = useCallback((delta: number) => {
    const newCap = Math.max(1, Math.min(20, avgCapacity + delta));
    onBatchUpdate({ capacity: newCap });
  }, [avgCapacity, onBatchUpdate]);

  const handleShapeChange = useCallback((shape: TableShape) => {
    onBatchUpdate({ shape });
    setShowShapes(false);
  }, [onBatchUpdate]);

  const handleRotate = useCallback(() => {
    onBatchUpdate({ orientation: 45 });
  }, [onBatchUpdate]);

  if (selectedIds.size < 2) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="fixed z-50 pointer-events-auto"
      style={{
        left: hudPosition.x,
        top: hudPosition.y,
        transform: 'translateX(-50%)',
      }}
    >
      <div className="flex items-center gap-1 bg-gray-900/95 backdrop-blur-lg rounded-xl shadow-2xl border border-gray-700/50 px-2 py-1.5">
        {/* Selection count */}
        <div className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 rounded-lg">
          <span className="text-amber-400 text-xs font-bold">{selectedIds.size}</span>
          <span className="text-amber-400/70 text-[10px]">sel</span>
        </div>

        <div className="w-px h-6 bg-gray-700" />

        {/* Shape picker */}
        <div className="relative">
          <button
            onClick={() => setShowShapes(!showShapes)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-gray-700/50 transition-colors"
            title="Change Shape"
          >
            {dominantShape === 'round' || dominantShape === 'oval' ? (
              <Circle size={14} className="text-gray-300" />
            ) : (
              <Square size={14} className="text-gray-300" />
            )}
            <span className="text-[10px] text-gray-400 capitalize">{dominantShape}</span>
          </button>

          <AnimatePresence>
            {showShapes && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-xl p-1 flex gap-0.5 z-60"
              >
                {SHAPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => handleShapeChange(value)}
                    className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-md transition-colors ${
                      dominantShape === value
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                    }`}
                    title={label}
                  >
                    <Icon size={14} />
                    <span className="text-[9px]">{label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="w-px h-6 bg-gray-700" />

        {/* Capacity control */}
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => handleCapacityChange(-1)}
            className="p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
            title="Decrease capacity"
          >
            <Minus size={12} />
          </button>
          <div className="flex items-center gap-0.5 px-1">
            <Users size={12} className="text-gray-400" />
            <span className="text-xs font-medium text-gray-200 min-w-[16px] text-center">
              {avgCapacity}
            </span>
          </div>
          <button
            onClick={() => handleCapacityChange(1)}
            className="p-1 rounded hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
            title="Increase capacity"
          >
            <Plus size={12} />
          </button>
        </div>

        <div className="w-px h-6 bg-gray-700" />

        {/* Rotate */}
        <button
          onClick={handleRotate}
          className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
          title="Rotate 45°"
        >
          <RotateCw size={14} />
        </button>

        <div className="w-px h-6 bg-gray-700" />

        {/* Distribution tools (3+ selected) */}
        {selectedIds.size >= 3 && (
          <>
            <button
              onClick={onDistributeH}
              className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-blue-400 transition-colors"
              title="Distribute Horizontally"
            >
              <AlignHorizontalSpaceAround size={14} />
            </button>
            <button
              onClick={onDistributeV}
              className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-blue-400 transition-colors"
              title="Distribute Vertically"
            >
              <AlignVerticalSpaceAround size={14} />
            </button>
            <button
              onClick={onTidyUp}
              className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-emerald-400 transition-colors"
              title="Tidy Up (Auto-grid)"
            >
              <Grid3X3 size={14} />
            </button>
            {onArrangeRow && (
              <button
                onClick={onArrangeRow}
                className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-cyan-400 transition-colors"
                title="Arrange in Row"
              >
                <GripHorizontal size={14} />
              </button>
            )}
            {onArrangeColumn && (
              <button
                onClick={onArrangeColumn}
                className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-cyan-400 transition-colors"
                title="Arrange in Column"
              >
                <GripVertical size={14} />
              </button>
            )}
            {onSmartOrganize && (
              <button
                onClick={onSmartOrganize}
                className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-amber-400 transition-colors"
                title="Smart Organize (by size)"
              >
                <Wand2 size={14} />
              </button>
            )}
            <div className="w-px h-6 bg-gray-700" />
          </>
        )}

        {/* Group / Ungroup */}
        {hasGrouped ? (
          <button
            onClick={onUngroup}
            className="p-1.5 rounded-lg hover:bg-gray-700/50 text-amber-400 hover:text-amber-300 transition-colors"
            title="Ungroup (Ctrl+Shift+G)"
          >
            <Ungroup size={14} />
          </button>
        ) : (
          <button
            onClick={onGroup}
            className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-violet-400 transition-colors"
            title="Group (Ctrl+G)"
          >
            <Group size={14} />
          </button>
        )}

        <div className="w-px h-6 bg-gray-700" />

        {/* Duplicate */}
        {onDuplicateSelected && (
          <button
            onClick={onDuplicateSelected}
            className="p-1.5 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-blue-400 transition-colors"
            title="Duplicate (Ctrl+D)"
          >
            <Copy size={14} />
          </button>
        )}

        {/* Delete */}
        {onDeleteSelected && (
          <button
            onClick={onDeleteSelected}
            className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-400 hover:text-red-400 transition-colors"
            title="Delete (Del)"
          >
            <Trash2 size={14} />
          </button>
        )}

        <div className="w-px h-6 bg-gray-700" />

        {/* Close */}
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
          title="Deselect All (Esc)"
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}

export default memo(SelectionHUD);
