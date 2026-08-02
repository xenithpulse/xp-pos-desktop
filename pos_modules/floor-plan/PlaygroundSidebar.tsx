// pos_modules/floor-plan/PlaygroundSidebar.tsx
// Sidebar for the Layout Playground — zone creation, template generation,
// and drag-on-canvas table blueprints.

'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Grid3X3,
  LayoutGrid,
  Circle,
  Square,
  RectangleHorizontal,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Palette,
  X,
} from 'lucide-react';
import {
  ITableSection,
  TableShape,
  LayoutPattern,
  LayoutTemplateParams,
  DraftTable,
} from '@/types/table.types';
import {
  generateFromTemplate,
  createSingleDraft,
  DEFAULT_TEMPLATE,
} from '@/lib/layout';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PlaygroundSidebarProps {
  open: boolean;
  onClose: () => void;
  sections: ITableSection[];
  existingTableCount: number;
  onCreateZone: (name: string, color: string, floor: number) => Promise<void>;
  onGenerateTables: (drafts: DraftTable[]) => void;
  onAddSingleDraft: (draft: DraftTable) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Presets
// ─────────────────────────────────────────────────────────────────────────────

const PATTERN_OPTIONS: { value: LayoutPattern; label: string; icon: any; description?: string }[] = [
  { value: 'grid', label: 'Grid', icon: Grid3X3, description: 'Standard rows & columns' },
  { value: 'diagonal', label: 'Staggered', icon: LayoutGrid, description: 'Offset alternating rows' },
  { value: 'circle', label: 'Ring', icon: Circle, description: 'Circular arrangement' },
  { value: 'banquet', label: 'Banquet', icon: RectangleHorizontal, description: 'Long communal tables' },
  { value: 'u-shape', label: 'U-Shape', icon: Square, description: 'Open-ended rectangle' },
  { value: 'boardroom', label: 'Boardroom', icon: RectangleHorizontal, description: 'Full perimeter seating' },
  { value: 'booth-row', label: 'Booth Row', icon: RectangleHorizontal, description: 'Facing booth pairs' },
  { value: 'serpentine', label: 'Serpentine', icon: Circle, description: 'Curved organic flow' },
  { value: 'checkerboard', label: 'Checker', icon: Grid3X3, description: 'Spaced checkerboard' },
];

const SHAPE_OPTIONS: { value: TableShape; label: string; icon: any }[] = [
  { value: 'square', label: 'Square', icon: Square },
  { value: 'rectangle', label: 'Rect', icon: RectangleHorizontal },
  { value: 'round', label: 'Round', icon: Circle },
  { value: 'oval', label: 'Oval', icon: Circle },
];

const ZONE_COLORS = [
  '#6366f1', '#8B5CF6', '#EC4899', '#EF4444',
  '#F97316', '#EAB308', '#22C55E', '#14B8A6',
  '#3B82F6', '#6B7280',
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function PlaygroundSidebar({
  open,
  onClose,
  sections,
  existingTableCount,
  onCreateZone,
  onGenerateTables,
  onAddSingleDraft,
}: PlaygroundSidebarProps) {
  // ── Zone creation state ──
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zoneColor, setZoneColor] = useState(ZONE_COLORS[0]);
  const [zoneFloor, setZoneFloor] = useState(1);
  const [isCreatingZone, setIsCreatingZone] = useState(false);

  // ── Template state ──
  const [tpl, setTpl] = useState<LayoutTemplateParams>({ ...DEFAULT_TEMPLATE });
  const [showTemplate, setShowTemplate] = useState(true);

  // ── Handlers ──

  const handleCreateZone = useCallback(async () => {
    if (!zoneName.trim()) return;
    setIsCreatingZone(true);
    try {
      await onCreateZone(zoneName.trim(), zoneColor, zoneFloor);
      setZoneName('');
      setShowZoneForm(false);
    } finally {
      setIsCreatingZone(false);
    }
  }, [zoneName, zoneColor, zoneFloor, onCreateZone]);

  const handleGenerate = useCallback(() => {
    const drafts = generateFromTemplate(tpl, existingTableCount);
    onGenerateTables(drafts);
  }, [tpl, existingTableCount, onGenerateTables]);

  const handleDropBlueprint = useCallback(
    (shape: TableShape) => {
      const draft = createSingleDraft({
        x: 200,
        y: 200,
        shape,
        index: existingTableCount + 1,
      });
      onAddSingleDraft(draft);
    },
    [existingTableCount, onAddSingleDraft],
  );

  const updateTpl = (patch: Partial<LayoutTemplateParams>) =>
    setTpl((prev) => ({ ...prev, ...patch }));

  if (!open) return null;

  return (
    <motion.aside
      initial={{ x: -320, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: -320, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="absolute left-0 top-0 bottom-0 z-30 w-80 bg-white/95 backdrop-blur-lg shadow-2xl border-r border-slate-200 flex flex-col overflow-hidden"
    >
      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-white">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-violet-600" />
          <span className="font-bold text-slate-800 text-sm">Layout Playground</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <X size={16} className="text-slate-500" />
        </button>
      </div>

      {/* ── Scrollable body ────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">

        {/* ─────────── ZONE SECTION ─────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Zones
            </h3>
            <button
              onClick={() => setShowZoneForm(!showZoneForm)}
              className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1"
            >
              <Plus size={12} /> New
            </button>
          </div>

          {/* Existing zones */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {sections.map((s) => (
              <span
                key={s._id}
                className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border"
                style={{
                  borderColor: s.color || '#6366f1',
                  color: s.color || '#6366f1',
                  backgroundColor: `${s.color || '#6366f1'}10`,
                }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </span>
            ))}
            {sections.length === 0 && (
              <span className="text-[11px] text-slate-400 italic">
                No zones yet
              </span>
            )}
          </div>

          {/* Zone creation form */}
          <AnimatePresence>
            {showZoneForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-slate-50 rounded-lg p-3 space-y-3 border border-slate-200">
                  <input
                    type="text"
                    placeholder="Zone name (e.g. Rooftop)"
                    value={zoneName}
                    onChange={(e) => setZoneName(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Color
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {ZONE_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setZoneColor(c)}
                          className={`w-6 h-6 rounded-full border-2 transition-all ${
                            zoneColor === c
                              ? 'border-slate-800 scale-110'
                              : 'border-transparent hover:scale-105'
                          }`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-500">Floor</label>
                    <input
                      type="number"
                      value={zoneFloor}
                      onChange={(e) => setZoneFloor(parseInt(e.target.value) || 1)}
                      className="w-16 px-2 py-1 text-sm rounded border border-slate-300 text-center"
                      min={1}
                    />
                  </div>
                  <button
                    onClick={handleCreateZone}
                    disabled={!zoneName.trim() || isCreatingZone}
                    className="w-full py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-50"
                  >
                    {isCreatingZone ? 'Creating...' : 'Create Zone'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* ─────────── TABLE BLUEPRINTS ─────────── */}
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Table Blueprints
          </h3>
          <p className="text-[11px] text-slate-400 mb-3">
            Click a shape to drop a new table onto the canvas.
          </p>
          <div className="grid grid-cols-4 gap-2">
            {SHAPE_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => handleDropBlueprint(value)}
                className="flex flex-col items-center gap-1 p-3 rounded-xl border border-dashed border-slate-300 hover:border-violet-400 hover:bg-violet-50 transition-all group"
              >
                <Icon
                  size={22}
                  className="text-slate-400 group-hover:text-violet-500 transition-colors"
                />
                <span className="text-[10px] text-slate-500 group-hover:text-violet-600">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* ─────────── TEMPLATE ENGINE ─────────── */}
        <section>
          <button
            onClick={() => setShowTemplate(!showTemplate)}
            className="flex items-center justify-between w-full mb-2"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Template Generator
            </h3>
            {showTemplate ? (
              <ChevronDown size={14} className="text-slate-400" />
            ) : (
              <ChevronRight size={14} className="text-slate-400" />
            )}
          </button>

          <AnimatePresence>
            {showTemplate && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 bg-slate-50 rounded-lg p-3 border border-slate-200">
                  {/* Pattern */}
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Pattern
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {PATTERN_OPTIONS.map(({ value, label, icon: Icon, description }) => (
                        <button
                          key={value}
                          onClick={() => updateTpl({ pattern: value })}
                          className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-[10px] border transition-all ${
                            tpl.pattern === value
                              ? 'border-violet-500 bg-violet-100 text-violet-700'
                              : 'border-slate-200 hover:border-violet-300 text-slate-500'
                          }`}
                          title={description}
                        >
                          <Icon size={16} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Shape */}
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Table Shape
                    </label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {SHAPE_OPTIONS.map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          onClick={() => updateTpl({ shape: value })}
                          className={`flex flex-col items-center gap-0.5 p-2 rounded-lg text-[10px] border transition-all ${
                            tpl.shape === value
                              ? 'border-violet-500 bg-violet-100 text-violet-700'
                              : 'border-slate-200 hover:border-violet-300 text-slate-500'
                          }`}
                        >
                          <Icon size={14} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Grid params */}
                  <div className="grid grid-cols-2 gap-2">
                    <NumInput label="Rows" value={tpl.rows} min={1} max={20} onChange={(v) => updateTpl({ rows: v })} />
                    <NumInput label="Cols" value={tpl.cols} min={1} max={20} onChange={(v) => updateTpl({ cols: v })} />
                    <NumInput label="Spacing" value={tpl.spacing} min={10} max={200} step={5} onChange={(v) => updateTpl({ spacing: v })} />
                    <NumInput label="Capacity" value={tpl.capacity} min={1} max={20} onChange={(v) => updateTpl({ capacity: v })} />
                    <NumInput label="Width" value={tpl.tableWidth} min={50} max={300} step={10} onChange={(v) => updateTpl({ tableWidth: v })} />
                    <NumInput label="Height" value={tpl.tableHeight} min={50} max={300} step={10} onChange={(v) => updateTpl({ tableHeight: v })} />
                  </div>

                  {/* Prefix */}
                  <div>
                    <label className="text-[11px] text-slate-500 mb-1 block">
                      Prefix
                    </label>
                    <input
                      type="text"
                      value={tpl.prefix}
                      onChange={(e) => updateTpl({ prefix: e.target.value })}
                      className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      placeholder="T"
                    />
                  </div>

                  {/* Section assignment */}
                  {sections.length > 0 && (
                    <div>
                      <label className="text-[11px] text-slate-500 mb-1 block">
                        Assign to Zone
                      </label>
                      <select
                        value={tpl.sectionId || ''}
                        onChange={(e) => {
                          const sec = sections.find((s) => s._id === e.target.value);
                          updateTpl({
                            sectionId: e.target.value || undefined,
                            sectionName: sec?.name,
                          });
                        }}
                        className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-400"
                      >
                        <option value="">None</option>
                        {sections.map((s) => (
                          <option key={s._id} value={s._id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Preview count */}
                  <div className="text-center text-[11px] text-slate-500">
                    Will create{' '}
                    <span className="font-bold text-violet-600">
                      {tpl.pattern === 'banquet'
                        ? tpl.rows
                        : tpl.pattern === 'booth-row'
                        ? tpl.rows * tpl.cols * 2
                        : tpl.pattern === 'checkerboard'
                        ? Math.ceil((tpl.rows * tpl.cols) / 2)
                        : tpl.pattern === 'u-shape'
                        ? tpl.cols + (tpl.rows - 1) * 2
                        : tpl.pattern === 'boardroom'
                        ? tpl.cols * 2 + (tpl.rows - 2) * 2
                        : tpl.rows * tpl.cols}
                    </span>{' '}
                    tables
                  </div>

                  {/* Generate button */}
                  <button
                    onClick={handleGenerate}
                    className="w-full py-2.5 text-sm font-semibold rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Sparkles size={15} />
                    Generate Layout
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </motion.aside>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small numeric input helper
// ─────────────────────────────────────────────────────────────────────────────

function NumInput({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="text-[11px] text-slate-500 mb-0.5 block">{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseInt(e.target.value);
          if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="w-full px-2 py-1.5 text-sm rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-violet-400 text-center"
      />
    </div>
  );
}
