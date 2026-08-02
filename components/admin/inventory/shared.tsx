// components/admin/inventory/shared.tsx
// Shared types, formatters, and small UI primitives for the inventory module.
// Extracted so the Ingredients tab and the Inventory Control Center stay in sync.

'use client';

import type { DeltaReason } from '@/models/schemas/ingredient.schema';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type IngredientKind = 'ingredient' | 'supply';

export interface IIngredient {
  _id: string;
  name: string;
  stock: number;
  unit: string;
  costPerUnit?: number;
  avgCost?: number;
  lastCost?: number;
  lowStockThreshold: number;
  kind?: IngredientKind;
  category?: string;
  supplier?: string;
  totalConsumed?: number;
  totalRestocked?: number;
  createdAt?: string;
  updatedAt?: string;
}

export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────────────────────

export function money(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-IN');
}

export function money2(n: number | undefined | null): string {
  if (n == null || Number.isNaN(n)) return '0';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function timeAgo(dateStr?: string | Date): string {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Valuation & status helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Effective unit cost used for valuation (weighted avg preferred, manual fallback). */
export const unitValue = (i: Pick<IIngredient, 'avgCost' | 'costPerUnit'>) =>
  i.avgCost ?? i.costPerUnit ?? 0;

export const itemValue = (i: Pick<IIngredient, 'stock' | 'avgCost' | 'costPerUnit'>) =>
  (i.stock || 0) * unitValue(i);

export type StockStatus = 'out' | 'low' | 'ok';

export function stockStatus(i: Pick<IIngredient, 'stock' | 'lowStockThreshold'>): StockStatus {
  const threshold = i.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  if ((i.stock || 0) <= 0) return 'out';
  if ((i.stock || 0) <= threshold) return 'low';
  return 'ok';
}

export const STATUS_META: Record<StockStatus, { label: string; chip: string }> = {
  out: { label: 'Out of Stock', chip: 'bg-red-500/20 text-red-400 border-red-500/30' },
  low: { label: 'Low Stock', chip: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  ok: { label: 'In Stock', chip: 'bg-green-500/20 text-green-400 border-green-500/30' },
};

export type ValueTier = 'high' | 'medium' | 'low';

export function valueTier(value: number, tierHigh = 50000, tierLow = 10000): ValueTier {
  if (value >= tierHigh) return 'high';
  if (value < tierLow) return 'low';
  return 'medium';
}

export const TIER_META: Record<ValueTier, { label: string; chip: string; dot: string }> = {
  high: { label: 'High', chip: 'bg-violet-500/15 text-violet-300 border-violet-500/30', dot: 'bg-violet-400' },
  medium: { label: 'Medium', chip: 'bg-sky-500/15 text-sky-300 border-sky-500/30', dot: 'bg-sky-400' },
  low: { label: 'Low', chip: 'bg-white/[0.06] text-[#999] border-white/[0.12]', dot: 'bg-[#666]' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────────────────────

export const REASON_LABELS: Record<DeltaReason, string> = {
  restock: 'Restock / Purchase',
  order_deduction: 'Order Deduction',
  manual_adjustment: 'Manual Adjustment',
  waste: 'Waste / Spoilage',
  return: 'Return',
  stock_take: 'Stock-take',
  transfer: 'Transfer',
};

export const REASON_CHIP: Record<DeltaReason, string> = {
  restock: 'bg-green-500/15 text-green-400',
  order_deduction: 'bg-orange-500/15 text-orange-400',
  manual_adjustment: 'bg-sky-500/15 text-sky-400',
  waste: 'bg-red-500/15 text-red-400',
  return: 'bg-teal-500/15 text-teal-400',
  stock_take: 'bg-violet-500/15 text-violet-400',
  transfer: 'bg-amber-500/15 text-amber-400',
};

export const KIND_META: Record<IngredientKind, { label: string; chip: string }> = {
  ingredient: { label: 'Ingredient', chip: 'bg-white/[0.06] text-[#999] border-white/[0.12]' },
  supply: { label: 'Supply', chip: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
};

// ─────────────────────────────────────────────────────────────────────────────
// StockBar — inline mini stock-level bar with a threshold marker
// ─────────────────────────────────────────────────────────────────────────────

export function StockBar({
  stock,
  threshold,
  restocked = 0,
  className = 'w-20',
}: {
  stock: number;
  threshold: number;
  restocked?: number;
  className?: string;
}) {
  const max = Math.max(restocked, threshold * 3, stock, 1);
  const pct = Math.min(100, (stock / max) * 100);
  const thresholdPct = Math.min(100, (threshold / max) * 100);
  const status = stockStatus({ stock, lowStockThreshold: threshold });

  return (
    <div
      className={`${className} h-1.5 bg-white/[0.06] rounded-full overflow-hidden relative`}
      title={`${stock} / threshold ${threshold}`}
    >
      <div className="absolute top-0 bottom-0 w-px bg-yellow-500/40" style={{ left: `${thresholdPct}%` }} />
      <div
        className={`h-full rounded-full transition-all ${
          status === 'out' ? 'bg-red-500' : status === 'low' ? 'bg-yellow-500' : 'bg-green-500'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
