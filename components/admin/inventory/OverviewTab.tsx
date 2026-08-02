// components/admin/inventory/OverviewTab.tsx
// Capital position + at-a-glance inventory health.

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Wallet,
  Boxes,
  Landmark,
  AlertTriangle,
  PackageX,
  TrendingDown,
  Pencil,
  Check,
  X,
  RefreshCw,
} from 'lucide-react';
import { money, TIER_META, type ValueTier } from './shared';

interface SummaryItem {
  _id: string;
  name: string;
  unit: string;
  stock: number;
  lowStockThreshold: number;
  kind: 'ingredient' | 'supply';
  value: number;
}

interface Summary {
  counts: { total: number; ingredients: number; supplies: number; lowStock: number; outOfStock: number };
  capital: { stockValue: number; cashInHand: number; totalCapital: number; tierHigh: number; tierLow: number; cashNote: string; cashUpdatedAt: string | null };
  tiers: Record<ValueTier, { count: number; value: number }>;
  byCategory: { category: string; count: number; value: number }[];
  lowStockItems: SummaryItem[];
  outOfStockItems: SummaryItem[];
  topConsumers: { _id: string; name: string; unit: string; totalConsumed: number }[];
}

export default function OverviewTab({ onGoToStock }: { onGoToStock: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCash, setEditingCash] = useState(false);
  const [cashDraft, setCashDraft] = useState('');
  const [cashNote, setCashNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSummary = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/inventory/summary');
      if (res.ok) setSummary(await res.json());
    } catch (e) {
      console.error('Failed to load inventory summary:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const startEditCash = () => {
    setCashDraft(String(summary?.capital.cashInHand ?? 0));
    setCashNote(summary?.capital.cashNote ?? '');
    setEditingCash(true);
  };

  const saveCash = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/inventory/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cashInHand: parseFloat(cashDraft) || 0, cashNote }),
      });
      if (res.ok) {
        setEditingCash(false);
        await fetchSummary();
      }
    } catch (e) {
      console.error('Failed to save cash in hand:', e);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading || !summary) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const { capital, counts, tiers } = summary;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Inventory Overview</h2>
          <p className="text-[#888] text-sm">Capital position and stock health</p>
        </div>
        <button
          onClick={fetchSummary}
          className="p-2 bg-[#111] border border-white/[0.08] rounded-lg text-[#888] hover:text-white hover:border-white/20 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Capital position */}
      <div className="grid gap-4 md:grid-cols-3">
        <CapitalCard
          icon={<Boxes size={16} />}
          label="Stock Value"
          value={capital.stockValue}
          sub={`${counts.total} items · ${counts.ingredients} ingredients · ${counts.supplies} supplies`}
          accent="text-sky-400"
        />

        {/* Cash In Hand — editable */}
        <div className="bg-[#111] border border-white/[0.06] rounded-xl px-5 py-4 relative">
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-[#777] uppercase tracking-wider flex items-center gap-1.5">
              <Wallet size={13} className="text-emerald-400" /> Cash In Hand
            </div>
            {!editingCash && (
              <button onClick={startEditCash} className="text-[#666] hover:text-white transition-colors" title="Edit">
                <Pencil size={13} />
              </button>
            )}
          </div>
          {editingCash ? (
            <div className="mt-2 space-y-2">
              <input
                type="number"
                value={cashDraft}
                onChange={(e) => setCashDraft(e.target.value)}
                autoFocus
                className="w-full bg-white/[0.05] border border-white/[0.12] rounded-lg px-3 py-1.5 text-white text-lg font-mono focus:outline-none focus:border-white/30"
              />
              <input
                type="text"
                value={cashNote}
                onChange={(e) => setCashNote(e.target.value)}
                placeholder="Note (optional)"
                className="w-full bg-white/[0.05] border border-white/[0.12] rounded-lg px-3 py-1.5 text-white text-xs placeholder:text-[#555] focus:outline-none focus:border-white/30"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveCash}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-white text-black rounded-lg text-xs font-medium hover:bg-white/90 disabled:opacity-50"
                >
                  <Check size={13} /> Save
                </button>
                <button
                  onClick={() => setEditingCash(false)}
                  className="px-3 py-1.5 bg-white/[0.06] rounded-lg text-xs text-[#888] hover:text-white"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-semibold text-white mt-1.5 font-mono">₨ {money(capital.cashInHand)}</div>
              <div className="text-[11px] text-[#666] mt-1 truncate">
                {capital.cashNote || 'Manually maintained cash balance'}
              </div>
            </>
          )}
        </div>

        <CapitalCard
          icon={<Landmark size={16} />}
          label="Total Capital"
          value={capital.totalCapital}
          sub="Stock value + cash in hand"
          accent="text-white"
          highlight
        />
      </div>

      {/* Health stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Total Items" value={counts.total} />
        <StatTile label="Low Stock" value={counts.lowStock} warn={counts.lowStock > 0} tone="yellow" />
        <StatTile label="Out of Stock" value={counts.outOfStock} warn={counts.outOfStock > 0} tone="red" />
        <StatTile label="Supplies" value={counts.supplies} />
      </div>

      {/* Value tiers */}
      <div className="bg-[#111] border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Value Tiers</h3>
          <span className="text-[11px] text-[#666]">
            High ≥ {money(capital.tierHigh)} · Low &lt; {money(capital.tierLow)}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {(['high', 'medium', 'low'] as ValueTier[]).map((t) => (
            <div key={t} className="bg-white/[0.03] rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 text-[11px] text-[#888] uppercase tracking-wider">
                <span className={`w-2 h-2 rounded-full ${TIER_META[t].dot}`} /> {TIER_META[t].label}
              </div>
              <div className="text-lg font-semibold text-white mt-1 font-mono">₨ {money(tiers[t].value)}</div>
              <div className="text-[11px] text-[#666]">{tiers[t].count} items</div>
            </div>
          ))}
        </div>
      </div>

      {/* Alerts + top consumers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <AlertList
          title="Low Stock"
          icon={<AlertTriangle size={15} className="text-yellow-400" />}
          items={summary.lowStockItems}
          empty="All good — nothing below threshold"
          onGoToStock={onGoToStock}
          tone="yellow"
        />
        <AlertList
          title="Out of Stock"
          icon={<PackageX size={15} className="text-red-400" />}
          items={summary.outOfStockItems}
          empty="Nothing is fully depleted"
          onGoToStock={onGoToStock}
          tone="red"
        />
      </div>

      {/* Top consumers */}
      {summary.topConsumers.length > 0 && (
        <div className="bg-[#111] border border-white/[0.06] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 mb-3">
            <TrendingDown size={15} className="text-orange-400" /> Top Consumed
          </h3>
          <div className="space-y-2">
            {summary.topConsumers.map((c) => (
              <div key={c._id} className="flex items-center justify-between text-sm">
                <span className="text-[#ccc] truncate">{c.name}</span>
                <span className="font-mono text-orange-400/90">
                  {c.totalConsumed.toFixed(1)} <span className="text-[#666] text-xs">{c.unit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CapitalCard({
  icon,
  label,
  value,
  sub,
  accent,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub: string;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-xl px-5 py-4 border ${highlight ? 'bg-white/[0.06] border-white/[0.15]' : 'bg-[#111] border-white/[0.06]'}`}>
      <div className={`text-[11px] uppercase tracking-wider flex items-center gap-1.5 ${accent}`}>
        {icon} {label}
      </div>
      <div className="text-2xl font-semibold text-white mt-1.5 font-mono">₨ {money(value)}</div>
      <div className="text-[11px] text-[#666] mt-1">{sub}</div>
    </div>
  );
}

function StatTile({ label, value, warn, tone }: { label: string; value: number; warn?: boolean; tone?: 'yellow' | 'red' }) {
  const color = warn ? (tone === 'red' ? 'text-red-400' : 'text-yellow-400') : 'text-white';
  const border = warn ? (tone === 'red' ? 'border-red-500/30' : 'border-yellow-500/30') : 'border-white/[0.06]';
  return (
    <div className={`bg-[#111] border ${border} rounded-xl px-4 py-3`}>
      <div className="text-[10px] text-[#666] uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-semibold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

function AlertList({
  title,
  icon,
  items,
  empty,
  onGoToStock,
  tone,
}: {
  title: string;
  icon: React.ReactNode;
  items: SummaryItem[];
  empty: string;
  onGoToStock: () => void;
  tone: 'yellow' | 'red';
}) {
  return (
    <div className="bg-[#111] border border-white/[0.06] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          {icon} {title} <span className="text-[#666] font-normal">({items.length})</span>
        </h3>
        {items.length > 0 && (
          <button onClick={onGoToStock} className="text-xs text-[#888] hover:text-white underline">
            Manage
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[#555] py-2">{empty}</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {items.map((i) => (
            <div key={i._id} className="flex items-center justify-between text-sm">
              <span className="text-[#ccc] truncate">{i.name}</span>
              <span className={`font-mono text-xs ${tone === 'red' ? 'text-red-400' : 'text-yellow-400'}`}>
                {i.stock} {i.unit}
                <span className="text-[#555]"> / {i.lowStockThreshold}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
