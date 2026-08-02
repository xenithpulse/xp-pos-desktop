// components/admin/inventory/StockTab.tsx
// Full stock table with inline super-control actions:
// Restock (w/ price), Adjust, Waste, Stock-take (physical count), and Add item/supply.

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  RefreshCw,
  Plus,
  PackagePlus,
  Trash2,
  SlidersHorizontal,
  X,
  Package,
} from 'lucide-react';
import {
  IIngredient,
  StockBar,
  stockStatus,
  STATUS_META,
  money,
  money2,
  itemValue,
  unitValue,
  valueTier,
  TIER_META,
  KIND_META,
  DEFAULT_LOW_STOCK_THRESHOLD,
} from './shared';

// Action → { reason, mode, sign } mapping for the transaction modal
type ActionType = 'restock' | 'adjust' | 'waste' | 'return' | 'transfer' | 'stock_take';

const ACTIONS: { id: ActionType; label: string; hint: string }[] = [
  { id: 'restock', label: 'Restock / Purchase', hint: 'Add stock (records unit price → avg cost)' },
  { id: 'waste', label: 'Waste / Spoilage', hint: 'Remove spoiled or lost stock' },
  { id: 'stock_take', label: 'Stock-take (count)', hint: 'Enter counted quantity → auto variance' },
  { id: 'adjust', label: 'Manual Adjustment', hint: 'Correct stock up or down' },
  { id: 'return', label: 'Return', hint: 'Return to supplier / from customer' },
  { id: 'transfer', label: 'Transfer', hint: 'Move stock in/out (e.g. between branches)' },
];

export default function StockTab() {
  const [items, setItems] = useState<IIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'ingredient' | 'supply'>('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [tierFilter, setTierFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [tierHigh, setTierHigh] = useState(50000);
  const [tierLow, setTierLow] = useState(10000);

  const [actionTarget, setActionTarget] = useState<IIngredient | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (search) params.set('search', search);
      if (kindFilter !== 'all') params.set('kind', kindFilter);
      if (lowOnly) params.set('lowStock', 'true');
      const [ingRes, cfgRes] = await Promise.all([
        fetch(`/api/ingredients?${params.toString()}`),
        fetch('/api/inventory/config'),
      ]);
      if (ingRes.ok) {
        const data = await ingRes.json();
        setItems(data.ingredients || []);
      }
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        setTierHigh(cfg.tierHigh ?? 50000);
        setTierLow(cfg.tierLow ?? 10000);
      }
    } catch (e) {
      console.error('Failed to load stock:', e);
    } finally {
      setIsLoading(false);
    }
  }, [search, kindFilter, lowOnly]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const visible = useMemo(() => {
    if (tierFilter === 'all') return items;
    return items.filter((i) => valueTier(itemValue(i), tierHigh, tierLow) === tierFilter);
  }, [items, tierFilter, tierHigh, tierLow]);

  const totalValue = useMemo(() => items.reduce((s, i) => s + itemValue(i), 0), [items]);

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/ingredients/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i._id !== id));
        setDeleteConfirm(null);
      }
    } catch (e) {
      console.error('Failed to delete:', e);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Stock</h2>
          <p className="text-[#888] text-sm">{items.length} items · total value ₨ {money(totalValue)}</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} /> Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" size={16} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items..."
            className="w-full pl-9 pr-4 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-white/20"
          />
        </div>
        <Segmented
          value={kindFilter}
          onChange={(v) => setKindFilter(v as typeof kindFilter)}
          options={[{ v: 'all', l: 'All' }, { v: 'ingredient', l: 'Ingredients' }, { v: 'supply', l: 'Supplies' }]}
        />
        <Segmented
          value={tierFilter}
          onChange={(v) => setTierFilter(v as typeof tierFilter)}
          options={[{ v: 'all', l: 'Any tier' }, { v: 'high', l: 'High' }, { v: 'medium', l: 'Med' }, { v: 'low', l: 'Low' }]}
        />
        <label className="flex items-center gap-2 px-3 py-2 bg-[#111] border border-white/[0.08] rounded-lg cursor-pointer hover:border-white/[0.15]">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm text-[#888] whitespace-nowrap">Low only</span>
        </label>
        <button
          onClick={fetchItems}
          className="p-2 bg-[#111] border border-white/[0.08] rounded-lg text-[#888] hover:text-white hover:border-white/20 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-[#555]">
          <Package className="mx-auto mb-3" size={44} />
          <p>No items found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-left">
            <thead className="bg-[#111] text-[#666] text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Avg Cost</th>
                <th className="px-4 py-3 font-medium">Value</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {visible.map((i) => {
                const status = stockStatus(i);
                const threshold = i.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
                const value = itemValue(i);
                const tier = valueTier(value, tierHigh, tierLow);
                return (
                  <tr key={i._id} className="hover:bg-white/[0.03] group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">{i.name}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] rounded border ${KIND_META[i.kind ?? 'ingredient'].chip}`}>
                          {KIND_META[i.kind ?? 'ingredient'].label}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#555] mt-0.5">
                        {i.unit}
                        {i.category ? ` · ${i.category}` : ''}
                        {i.supplier ? ` · ${i.supplier}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className={`font-mono text-sm ${status === 'out' ? 'text-red-400' : status === 'low' ? 'text-yellow-400' : 'text-white'}`}>
                          {i.stock} <span className="text-[10px] text-[#666]">{i.unit}</span>
                        </span>
                        <StockBar stock={i.stock} threshold={threshold} restocked={i.totalRestocked ?? 0} />
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-[#bbb]">
                      {unitValue(i) > 0 ? `₨ ${money2(unitValue(i))}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-white">₨ {money(value)}</span>
                        <span className={`px-1.5 py-0.5 text-[10px] rounded border ${TIER_META[tier].chip}`}>{TIER_META[tier].label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${STATUS_META[status].chip}`}>
                        {STATUS_META[status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5 justify-end">
                        <button
                          onClick={() => setActionTarget(i)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-white/[0.06] hover:bg-white/[0.12] rounded-lg text-xs text-[#ccc] hover:text-white transition-colors"
                          title="Stock action"
                        >
                          <SlidersHorizontal size={13} /> Action
                        </button>
                        {deleteConfirm === i._id ? (
                          <div className="flex gap-1">
                            <button onClick={() => handleDelete(i._id)} className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs">Yes</button>
                            <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 bg-white/[0.06] rounded text-xs">No</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(i._id)}
                            className="p-2 bg-white/[0.06] hover:bg-red-600/80 rounded-lg text-[#888] hover:text-white transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AnimatePresence>
        {actionTarget && (
          <ActionModal
            item={actionTarget}
            onClose={() => setActionTarget(null)}
            onDone={() => {
              setActionTarget(null);
              fetchItems();
            }}
          />
        )}
        {showNew && (
          <NewItemModal
            onClose={() => setShowNew(false)}
            onDone={() => {
              setShowNew(false);
              fetchItems();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Segmented control
// ─────────────────────────────────────────────────────────────────────────────

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <div className="flex bg-[#111] border border-white/[0.08] rounded-lg p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
            value === o.v ? 'bg-white/[0.1] text-white' : 'text-[#888] hover:text-white'
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Modal — one modal for all transaction types
// ─────────────────────────────────────────────────────────────────────────────

function ActionModal({ item, onClose, onDone }: { item: IIngredient; onClose: () => void; onDone: () => void }) {
  const [action, setAction] = useState<ActionType>('restock');
  const [amount, setAmount] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const amt = parseFloat(amount) || 0;

  // Preview the resulting stock
  const preview = useMemo(() => {
    if (action === 'stock_take') return amt; // absolute count
    if (action === 'restock' || action === 'return' || action === 'transfer') {
      // return/transfer can be +/- but default add for restock; use signed amount for return/transfer
      if (action === 'restock') return item.stock + Math.abs(amt);
      return item.stock + amt;
    }
    if (action === 'waste') return item.stock - Math.abs(amt);
    return item.stock + amt; // adjust (signed)
  }, [action, amt, item.stock]);

  const variance = action === 'stock_take' ? amt - item.stock : null;

  const submit = async () => {
    setError('');
    if (action !== 'stock_take' && amt === 0) {
      setError('Enter a non-zero amount');
      return;
    }
    // Build payload
    let qty = amt;
    let mode: 'delta' | 'absolute' = 'delta';
    let reason: ActionType = action;
    if (action === 'restock') qty = Math.abs(amt);
    else if (action === 'waste') qty = -Math.abs(amt);
    else if (action === 'stock_take') {
      mode = 'absolute';
      qty = amt; // counted total
      reason = 'stock_take';
    }
    // adjust / return / transfer keep the signed amount

    setSaving(true);
    try {
      const res = await fetch(`/api/ingredients/${item._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockAdjustment: {
            qty,
            mode,
            reason,
            unitCost: action === 'restock' && unitCost ? parseFloat(unitCost) : undefined,
            note: note || undefined,
          },
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={`Stock Action — ${item.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm bg-white/[0.04] rounded-lg px-3 py-2">
          <span className="text-[#888]">Current stock</span>
          <span className="font-mono text-white">{item.stock} {item.unit}</span>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#888] mb-1.5">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as ActionType)}
            className="w-full bg-[#0d0d0d] border border-white/[0.12] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
          >
            {ACTIONS.map((a) => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
          <p className="text-[11px] text-[#666] mt-1">{ACTIONS.find((a) => a.id === action)?.hint}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">
              {action === 'stock_take' ? 'Counted quantity' : action === 'adjust' || action === 'return' || action === 'transfer' ? 'Amount (+/-)' : 'Quantity'}
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
              step="0.01"
              placeholder="0"
              className="w-full bg-[#0d0d0d] border border-white/[0.12] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-white/30"
            />
          </div>
          {action === 'restock' && (
            <div>
              <label className="block text-xs font-medium text-[#888] mb-1.5">Unit price (₨)</label>
              <input
                type="number"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                step="0.01"
                placeholder="per unit"
                className="w-full bg-[#0d0d0d] border border-white/[0.12] rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-white/30"
              />
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-[#888] mb-1.5">Note</label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — supplier, reason, ref #"
            className="w-full bg-[#0d0d0d] border border-white/[0.12] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30"
          />
        </div>

        {/* Preview */}
        <div className={`text-xs px-3 py-2 rounded-lg border ${preview < 0 ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-white/[0.04] text-[#bbb] border-white/[0.08]'}`}>
          {action === 'stock_take' && variance !== null ? (
            <>Variance: <span className={variance < 0 ? 'text-red-400' : variance > 0 ? 'text-green-400' : ''}>{variance > 0 ? '+' : ''}{variance} {item.unit}</span> · New stock: <span className="font-mono">{preview} {item.unit}</span></>
          ) : (
            <>New stock will be: <span className="font-mono text-white">{preview} {item.unit}</span></>
          )}
          {action === 'restock' && unitCost && amt > 0 && (
            <span className="block mt-0.5 text-[#777]">Purchase total: ₨ {money2(Math.abs(amt) * (parseFloat(unitCost) || 0))}</span>
          )}
        </div>

        {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 bg-white/[0.06] rounded-lg text-sm text-[#888] hover:text-white">Cancel</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-5 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Apply'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// New Item Modal
// ─────────────────────────────────────────────────────────────────────────────

function NewItemModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    name: '',
    unit: '',
    kind: 'ingredient' as 'ingredient' | 'supply',
    category: '',
    supplier: '',
    stock: '',
    unitCost: '',
    lowStockThreshold: '10',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!form.name.trim() || !form.unit.trim()) {
      setError('Name and unit are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          unit: form.unit.trim(),
          kind: form.kind,
          category: form.category.trim() || undefined,
          supplier: form.supplier.trim() || undefined,
          stock: parseFloat(form.stock) || 0,
          unitCost: form.unitCost ? parseFloat(form.unitCost) : undefined,
          costPerUnit: form.unitCost ? parseFloat(form.unitCost) : undefined,
          lowStockThreshold: parseInt(form.lowStockThreshold) || 10,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed');
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = 'w-full bg-[#0d0d0d] border border-white/[0.12] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30';

  return (
    <ModalShell title="Add Inventory Item" onClose={onClose} icon={<PackagePlus size={16} />}>
      <div className="space-y-4">
        <div className="flex bg-[#0d0d0d] border border-white/[0.12] rounded-lg p-0.5">
          {(['ingredient', 'supply'] as const).map((k) => (
            <button
              key={k}
              onClick={() => set('kind', k)}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-colors ${
                form.kind === k ? 'bg-white/[0.1] text-white' : 'text-[#888] hover:text-white'
              }`}
            >
              {k === 'supply' ? 'Supply (non-recipe)' : 'Ingredient (recipe)'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-[#888] mb-1.5">Name *</label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={field} placeholder="e.g. Tomatoes, Foil boxes" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">Unit *</label>
            <input value={form.unit} onChange={(e) => set('unit', e.target.value)} className={field} placeholder="kg, pcs, L" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">Category</label>
            <input value={form.category} onChange={(e) => set('category', e.target.value)} className={field} placeholder="Produce, Packaging..." />
          </div>
          <div className="col-span-2">
            <label className="block text-xs font-medium text-[#888] mb-1.5">Supplier</label>
            <input value={form.supplier} onChange={(e) => set('supplier', e.target.value)} className={field} placeholder="Optional" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">Initial Stock</label>
            <input type="number" value={form.stock} onChange={(e) => set('stock', e.target.value)} className={field} placeholder="0" step="0.01" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">Unit Cost (₨)</label>
            <input type="number" value={form.unitCost} onChange={(e) => set('unitCost', e.target.value)} className={field} placeholder="per unit" step="0.01" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#888] mb-1.5">Low Stock Alert</label>
            <input type="number" value={form.lowStockThreshold} onChange={(e) => set('lowStockThreshold', e.target.value)} className={field} placeholder="10" />
          </div>
        </div>

        {error && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}

        <div className="flex gap-2 justify-end pt-1">
          <button onClick={onClose} className="px-4 py-2 bg-white/[0.06] rounded-lg text-sm text-[#888] hover:text-white">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 disabled:opacity-50">
            {saving ? 'Saving...' : 'Create'}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal shell
// ─────────────────────────────────────────────────────────────────────────────

function ModalShell({ title, icon, onClose, children }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
        className="relative w-full max-w-md bg-[#0a0a0a] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">{icon} {title}</h3>
          <button onClick={onClose} className="p-1 text-[#666] hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </motion.div>
    </motion.div>
  );
}
