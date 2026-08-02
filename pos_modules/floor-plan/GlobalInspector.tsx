// pos_modules/floor-plan/GlobalInspector.tsx
// Bulk Inspector UI — when multiple tables are selected, allows batch
// editing of capacity, shape, orientation, and section assignment.
// Also supports 'Select All of Type' and 'Export Layout as JSON'.

'use client';

import { useState, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings2,
  Shapes,
  Users,
  RotateCw,
  Square,
  Circle,
  RectangleHorizontal,
  Minimize2,
  Maximize2,
  Download,
  Upload,
  Copy,
  Layers,
  ChevronDown,
  ChevronUp,
  Trash2,
  MousePointerSquareDashed,
  X,
} from 'lucide-react';
import {
  ITable,
  ITableSection,
  DraftTable,
  TableShape,
  TABLE_SHAPE_LABELS,
  TablePositionUpdate,
} from '@/types/table.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface GlobalInspectorProps {
  /** All tables visible on canvas */
  allTables: (ITable | DraftTable)[];
  /** Currently selected IDs */
  selectedIds: Set<string>;
  /** Callback to update the selection set */
  onSelectionChange: (ids: Set<string>) => void;
  /** Sections for assignment */
  sections: ITableSection[];
  /** Callback to batch-update properties of selected tables */
  onBatchUpdate: (updates: {
    capacity?: number;
    shape?: TableShape;
    orientation?: number;
    width?: number;
    height?: number;
    sectionId?: string;
    sectionName?: string;
  }) => void;
  /** Delete selected items */
  onDeleteSelected: () => void;
  /** Export current layout as JSON */
  onExportLayout: () => void;
  /** Import layout from JSON */
  onImportLayout: (json: string) => void;
  /** Clone entire zone */
  onCloneZone?: (sourceSectionId: string) => void;
  /** Pending position updates */
  pendingUpdates: Map<string, TablePositionUpdate>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shape options
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

function GlobalInspector({
  allTables,
  selectedIds,
  onSelectionChange,
  sections,
  onBatchUpdate,
  onDeleteSelected,
  onExportLayout,
  onImportLayout,
  onCloneZone,
  pendingUpdates,
}: GlobalInspectorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [showCloneDropdown, setShowCloneDropdown] = useState(false);

  // ── Derived: selected tables ──
  const selectedTables = useMemo(() => {
    return allTables.filter((t) => {
      const id = (t as any)._draftId ?? (t as ITable)._id;
      return selectedIds.has(id);
    });
  }, [allTables, selectedIds]);

  const count = selectedIds.size;

  // ── Derived: common properties across selection ──
  const commonProps = useMemo(() => {
    if (selectedTables.length === 0) return null;
    const shapes = new Set(selectedTables.map((t) => t.shape));
    const capacities = new Set(selectedTables.map((t) => t.capacity));
    return {
      shape: shapes.size === 1 ? [...shapes][0] : undefined,
      capacity: capacities.size === 1 ? [...capacities][0] : undefined,
      mixedShapes: shapes.size > 1,
      mixedCapacities: capacities.size > 1,
    };
  }, [selectedTables]);

  // ── Select All of Type ──
  const selectAllOfType = useCallback(
    (shape: TableShape) => {
      const ids = new Set<string>();
      allTables.forEach((t) => {
        if (t.shape === shape) {
          ids.add((t as any)._draftId ?? (t as ITable)._id);
        }
      });
      onSelectionChange(ids);
    },
    [allTables, onSelectionChange],
  );

  // ── Handle import ──
  const handleImport = useCallback(() => {
    if (importJson.trim()) {
      onImportLayout(importJson.trim());
      setImportJson('');
      setShowImportDialog(false);
    }
  }, [importJson, onImportLayout]);

  // Handle file upload for import
  const handleFileImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        if (text) onImportLayout(text);
      };
      reader.readAsText(file);
    };
    input.click();
  }, [onImportLayout]);

  if (count === 0 && !isCollapsed) return null;

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          key="global-inspector"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="absolute right-4 top-20 z-30 w-72 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        >
          {/* ── Header ─────────────────────────── */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-amber-50 to-white border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Settings2 size={16} className="text-amber-600" />
              <span className="font-bold text-slate-800 text-sm">Inspector</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700 rounded-full">
                {count} selected
              </span>
            </div>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
            >
              {isCollapsed ? (
                <Maximize2 size={14} className="text-slate-500" />
              ) : (
                <Minimize2 size={14} className="text-slate-500" />
              )}
            </button>
          </div>

          {!isCollapsed && (
            <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
              {/* ── Select All of Type ─────────── */}
              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  Select All of Type
                </h4>
                <div className="grid grid-cols-4 gap-1.5">
                  {SHAPES.map(({ value, label, icon: Icon }) => {
                    const typeCount = allTables.filter(
                      (t) => t.shape === value,
                    ).length;
                    return (
                      <button
                        key={value}
                        onClick={() => selectAllOfType(value)}
                        className="flex flex-col items-center gap-0.5 p-2 rounded-lg border border-slate-200 hover:border-amber-400 hover:bg-amber-50 transition-all text-[10px]"
                      >
                        <Icon size={14} className="text-slate-500" />
                        <span className="text-slate-600">{label}</span>
                        <span className="text-[9px] text-slate-400">{typeCount}</span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ── Batch Shape ─────────────────── */}
              {commonProps && (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    <Shapes size={11} className="inline mr-1" />
                    Shape
                    {commonProps.mixedShapes && (
                      <span className="text-amber-500 ml-1">(mixed)</span>
                    )}
                  </h4>
                  <div className="grid grid-cols-4 gap-1.5">
                    {SHAPES.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => onBatchUpdate({ shape: value })}
                        className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border text-[10px] transition-all ${
                          commonProps.shape === value
                            ? 'border-amber-500 bg-amber-100 text-amber-700'
                            : 'border-slate-200 hover:border-amber-300 text-slate-500'
                        }`}
                      >
                        <Icon size={14} />
                        {label}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* ── Batch Capacity ──────────────── */}
              {commonProps && (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    <Users size={11} className="inline mr-1" />
                    Capacity
                    {commonProps.mixedCapacities && (
                      <span className="text-amber-500 ml-1">(mixed)</span>
                    )}
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        onBatchUpdate({
                          capacity: Math.max(1, (commonProps.capacity ?? 4) - 1),
                        })
                      }
                      className="w-8 h-8 rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center justify-center text-sm font-bold"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      value={commonProps.capacity ?? ''}
                      placeholder="—"
                      min={1}
                      max={30}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v) && v >= 1) onBatchUpdate({ capacity: v });
                      }}
                      className="flex-1 h-8 text-center border border-slate-300 rounded-lg text-sm font-medium"
                    />
                    <button
                      onClick={() =>
                        onBatchUpdate({
                          capacity: Math.min(30, (commonProps.capacity ?? 4) + 1),
                        })
                      }
                      className="w-8 h-8 rounded-lg border border-slate-300 hover:bg-slate-50 flex items-center justify-center text-sm font-bold"
                    >
                      +
                    </button>
                  </div>
                </section>
              )}

              {/* ── Batch Rotation ──────────────── */}
              <section>
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                  <RotateCw size={11} className="inline mr-1" />
                  Rotation
                </h4>
                <div className="flex gap-1.5">
                  {[0, 45, 90, 135, 180].map((deg) => (
                    <button
                      key={deg}
                      onClick={() => onBatchUpdate({ orientation: deg })}
                      className="flex-1 py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 hover:border-amber-400 hover:bg-amber-50 transition-all text-slate-600"
                    >
                      {deg}°
                    </button>
                  ))}
                </div>
              </section>

              {/* ── Section Assignment ──────────── */}
              {sections.length > 0 && (
                <section>
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    <Layers size={11} className="inline mr-1" />
                    Assign Zone
                  </h4>
                  <select
                    onChange={(e) => {
                      const sec = sections.find((s) => s._id === e.target.value);
                      onBatchUpdate({
                        sectionId: e.target.value || undefined,
                        sectionName: sec?.name,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    defaultValue=""
                  >
                    <option value="">No zone</option>
                    {sections.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </section>
              )}

              {/* ── Actions ────────────────────── */}
              <section className="space-y-2 pt-2 border-t border-slate-200">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={onExportLayout}
                    className="flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 text-slate-600 transition-all"
                  >
                    <Download size={13} />
                    Export JSON
                  </button>
                  <button
                    onClick={handleFileImport}
                    className="flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium rounded-lg border border-slate-200 hover:bg-green-50 hover:border-green-300 text-slate-600 transition-all"
                  >
                    <Upload size={13} />
                    Import JSON
                  </button>
                </div>

                {/* Clone Zone */}
                {onCloneZone && sections.length > 0 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowCloneDropdown(!showCloneDropdown)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium rounded-lg border border-slate-200 hover:bg-violet-50 hover:border-violet-300 text-slate-600 transition-all"
                    >
                      <Copy size={13} />
                      Clone Zone
                      {showCloneDropdown ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    <AnimatePresence>
                      {showCloneDropdown && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-40"
                        >
                          {sections.map((s) => (
                            <button
                              key={s._id}
                              onClick={() => {
                                onCloneZone(s._id);
                                setShowCloneDropdown(false);
                              }}
                              className="w-full px-3 py-1.5 text-left text-xs hover:bg-violet-50 text-slate-700 flex items-center gap-2"
                            >
                              <div
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: s.color || '#6366F1' }}
                              />
                              {s.name}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Delete */}
                <button
                  onClick={onDeleteSelected}
                  className="w-full flex items-center justify-center gap-1.5 py-2 text-[11px] font-medium rounded-lg border border-red-200 hover:bg-red-50 text-red-600 transition-all"
                >
                  <Trash2 size={13} />
                  Delete {count} Selected
                </button>
              </section>
            </div>
          )}

          {/* ── Import dialog ──────────────── */}
          <AnimatePresence>
            {showImportDialog && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-white/98 backdrop-blur p-4 flex flex-col gap-3 z-50"
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-sm text-slate-800">Import Layout JSON</h4>
                  <button onClick={() => setShowImportDialog(false)} className="p-1 hover:bg-slate-100 rounded">
                    <X size={14} />
                  </button>
                </div>
                <textarea
                  value={importJson}
                  onChange={(e) => setImportJson(e.target.value)}
                  placeholder='Paste JSON here...'
                  className="flex-1 p-3 text-xs font-mono border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  onClick={handleImport}
                  disabled={!importJson.trim()}
                  className="py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 transition-colors"
                >
                  Import
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default memo(GlobalInspector);
