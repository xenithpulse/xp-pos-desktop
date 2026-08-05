// pos_modules/orders/order-editor/AdjustmentManager.tsx
// Inline panel for managing bill adjustments (discounts, GST, surcharges, fees)
// within the Order Editor. Loads presets from API, allows ad-hoc entries.

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Trash2,
  Percent,
  DollarSign,
  Tag,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import {
  Order,
  AppliedAdjustment,
  BillAdjustmentPreset,
  AdjustmentKind,
  AdjustmentCalcMode,
  ADJUSTMENT_KIND_LABELS,
} from '@/types/order.types';
import { formatPrice } from '@/types/menu.types';

// ─────────────────────────────────────────────────────────────────────────────
// Kind colors
// ─────────────────────────────────────────────────────────────────────────────

const KIND_COLORS: Record<AdjustmentKind, { bg: string; text: string; border: string }> = {
  discount:   { bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/20' },
  surcharge:  { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  tax:        { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/20' },
  fee:        { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface AdjustmentManagerProps {
  activeOrder: Order;
  onAddAdjustment: (adj: {
    adjustmentId?: string;
    name: string;
    kind: AdjustmentKind;
    calcMode: AdjustmentCalcMode;
    value: number;
    reason?: string;
  }) => Promise<void>;
  onRemoveAdjustment: (adjustmentId: string) => Promise<void>;
  isUpdating: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AdjustmentManager({
  activeOrder,
  onAddAdjustment,
  onRemoveAdjustment,
  isUpdating,
}: AdjustmentManagerProps) {
  // Open by default. A discount or a service charge is something a person is
  // looking for when they open this panel; hiding it behind a disclosure meant
  // they had to already know it was there.
  const [expanded, setExpanded] = useState(true);
  const [presets, setPresets] = useState<BillAdjustmentPreset[]>([]);
  const presetsLoaded = useRef(false);

  // Simple quick-add form: kind + %/amount + value. Name is auto-generated.
  const [adHocKind, setAdHocKind] = useState<AdjustmentKind>('discount');
  const [adHocCalcMode, setAdHocCalcMode] = useState<AdjustmentCalcMode>('percentage');
  const [adHocValue, setAdHocValue] = useState('');

  const adjustments = activeOrder.adjustments || [];

  // Load presets on first expand
  useEffect(() => {
    if (!expanded || presetsLoaded.current) return;
    fetch('/api/bill-adjustments?activeOnly=true')
      .then((r) => (r.ok ? r.json() : { adjustments: [] }))
      .then((d) => {
        setPresets(d.adjustments || []);
        presetsLoaded.current = true;
      })
      .catch(() => {});
  }, [expanded]);

  const handlePresetClick = useCallback(
    async (preset: BillAdjustmentPreset) => {
      await onAddAdjustment({
        adjustmentId: preset._id,
        name: preset.name,
        kind: preset.kind,
        calcMode: preset.calcMode,
        value: preset.value,
      });
    },
    [onAddAdjustment],
  );

  const handleAdHocSubmit = useCallback(async () => {
    const val = parseFloat(adHocValue);
    if (isNaN(val) || val <= 0) return;
    // Auto-name from the kind (+ % for percentage) — no separate name field.
    const label = ADJUSTMENT_KIND_LABELS[adHocKind];
    const name = adHocCalcMode === 'percentage' ? `${label} ${val}%` : label;
    await onAddAdjustment({ name, kind: adHocKind, calcMode: adHocCalcMode, value: val });
    setAdHocValue('');
  }, [adHocKind, adHocCalcMode, adHocValue, onAddAdjustment]);

  return (
    <div className="border-t border-gray-800">
      {/* ── Toggle Header ──────────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs font-semibold text-gray-400 hover:text-gray-200 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Tag size={12} />
          Adjustments
          {adjustments.length > 0 && (
            <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded-full text-[10px] font-bold">
              {adjustments.length}
            </span>
          )}
        </span>
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {expanded && (
        <div className="px-2.5 md:px-3 pb-3 space-y-2">
          {/* ── Applied Adjustments ─────────────────────────────────── */}
          {adjustments.length > 0 && (
            <div className="space-y-1.5">
              {adjustments.map((adj) => {
                const colors = KIND_COLORS[adj.kind] || KIND_COLORS.fee;
                const sign = adj.kind === 'discount' ? '-' : '+';
                return (
                  <div
                    key={adj._id}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg ${colors.bg} border ${colors.border}`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-[10px] font-bold uppercase ${colors.text}`}>
                        {adj.kind === 'tax' ? 'GST' : adj.kind.slice(0, 3).toUpperCase()}
                      </span>
                      <span className="text-xs text-gray-200 truncate">{adj.name}</span>
                      <span className="text-[10px] text-gray-500 flex-shrink-0">
                        {adj.calcMode === 'percentage' ? `${adj.value}%` : formatPrice(adj.value)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-semibold ${colors.text}`}>
                        {sign}{formatPrice(adj.computedAmount)}
                      </span>
                      <button
                        onClick={() => onRemoveAdjustment(adj._id)}
                        disabled={isUpdating}
                        className="p-0.5 rounded text-gray-500 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Quick-Apply Presets ─────────────────────────────────── */}
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presets.map((preset) => {
                const colors = KIND_COLORS[preset.kind] || KIND_COLORS.fee;
                const alreadyApplied = adjustments.some(
                  (a) => a.adjustmentId === preset._id,
                );
                return (
                  <button
                    key={preset._id}
                    onClick={() => handlePresetClick(preset)}
                    disabled={isUpdating || alreadyApplied}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all
                      ${alreadyApplied
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : `${colors.bg} ${colors.text} border ${colors.border} hover:brightness-125`
                      }`}
                    title={preset.description || preset.name}
                  >
                    <Sparkles size={10} />
                    {preset.name}
                    <span className="opacity-60">
                      {preset.calcMode === 'percentage' ? `${preset.value}%` : formatPrice(preset.value)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Simple quick-add row: kind + %/amount + value + apply ── */}
          <div className="flex items-center gap-1.5">
            <select
              value={adHocKind}
              onChange={(e) => setAdHocKind(e.target.value as AdjustmentKind)}
              className="px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-purple-500 flex-shrink-0"
            >
              {(Object.keys(ADJUSTMENT_KIND_LABELS) as AdjustmentKind[]).map((k) => (
                <option key={k} value={k}>{ADJUSTMENT_KIND_LABELS[k]}</option>
              ))}
            </select>

            <div className="flex items-center bg-gray-900 border border-gray-700 rounded overflow-hidden flex-shrink-0">
              <button
                onClick={() => setAdHocCalcMode('percentage')}
                className={`px-2 py-1.5 transition-colors ${adHocCalcMode === 'percentage' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                title="Percentage"
              >
                <Percent size={12} />
              </button>
              <button
                onClick={() => setAdHocCalcMode('fixed')}
                className={`px-2 py-1.5 transition-colors ${adHocCalcMode === 'fixed' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                title="Fixed amount"
              >
                <DollarSign size={12} />
              </button>
            </div>

            <input
              type="number"
              value={adHocValue}
              onChange={(e) => setAdHocValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdHocSubmit()}
              placeholder={adHocCalcMode === 'percentage' ? '10' : '50'}
              className="flex-1 min-w-0 px-2 py-1.5 bg-gray-900 border border-gray-700 rounded text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              min={0}
            />

            <button
              onClick={handleAdHocSubmit}
              disabled={isUpdating || !adHocValue}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <Plus size={12} /> Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
