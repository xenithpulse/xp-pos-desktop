// components/admin/tabs/IngredientsListTab.tsx
// Ingredients / Inventory list view with stock bars, usage stats, and actions

'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Package,
  RefreshCw,
  AlertTriangle,
  TrendingDown,
  ArrowDownRight,
  Clock,
  Eye,
  X,
  Warehouse,
  ArrowRight,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface IIngredient {
  _id: string;
  name: string;
  stock: number;
  unit: string;
  costPerUnit?: number;
  avgCost?: number;
  lastCost?: number;
  lowStockThreshold: number;
  kind?: 'ingredient' | 'supply';
  category?: string;
  supplier?: string;
  totalConsumed?: number;
  totalRestocked?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface IngredientsListTabProps {
  onEdit: (id: string, data: Record<string, unknown>) => void;
  onCreate: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LOW_STOCK_THRESHOLD = 10;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function timeAgo(dateStr?: string) {
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
// Detail Drawer
// ─────────────────────────────────────────────────────────────────────────────

function IngredientDetailDrawer({
  ingredient,
  onClose,
  onEdit,
}: {
  ingredient: IIngredient;
  onClose: () => void;
  onEdit: () => void;
}) {
  const threshold = ingredient.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
  const consumed = ingredient.totalConsumed ?? 0;
  const restocked = ingredient.totalRestocked ?? 0;
  const stockPct = restocked > 0 ? Math.min(100, (ingredient.stock / restocked) * 100) : (ingredient.stock > 0 ? 100 : 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end"
    >
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-sm bg-[#0a0a0a] border-l border-white/[0.08] h-full overflow-y-auto"
      >
        <div className="sticky top-0 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/[0.06] px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-semibold text-white truncate">{ingredient.name}</h3>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="px-3 py-1.5 text-xs font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors">Edit</button>
            <button onClick={onClose} className="p-1.5 text-[#666] hover:text-white transition-colors"><X size={18} /></button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Stock overview */}
          <div>
            <h4 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Stock Overview</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-[#666] uppercase tracking-wider">Current Stock</div>
                <div className="text-lg font-semibold text-white font-mono">{ingredient.stock} <span className="text-xs text-[#666] font-normal">{ingredient.unit}</span></div>
              </div>
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-[#666] uppercase tracking-wider">Low Threshold</div>
                <div className="text-lg font-semibold text-white font-mono">{threshold} <span className="text-xs text-[#666] font-normal">{ingredient.unit}</span></div>
              </div>
            </div>
            {/* Stock bar */}
            <div className="mt-3">
              <div className="flex justify-between text-[10px] text-[#666] mb-1">
                <span>Stock level</span>
                <span>{stockPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    ingredient.stock === 0 ? 'bg-red-500' :
                    ingredient.stock <= threshold ? 'bg-yellow-500' : 'bg-green-500'
                  }`}
                  style={{ width: `${stockPct}%` }}
                />
              </div>
            </div>
          </div>

          {/* Usage stats */}
          <div>
            <h4 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-3">Usage Stats</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-[#666] uppercase tracking-wider">Total Consumed</div>
                <div className="text-sm font-semibold text-orange-400 font-mono flex items-center gap-1">
                  <ArrowDownRight size={12} /> {consumed.toFixed(1)} {ingredient.unit}
                </div>
              </div>
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
                <div className="text-[10px] text-[#666] uppercase tracking-wider">Total Restocked</div>
                <div className="text-sm font-semibold text-green-400 font-mono">{restocked.toFixed(1)} {ingredient.unit}</div>
              </div>
            </div>
          </div>

          {/* Cost info */}
          {ingredient.costPerUnit != null && ingredient.costPerUnit > 0 && (
            <div>
              <h4 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-2">Cost</h4>
              <div className="bg-white/[0.03] rounded-lg px-3 py-2.5">
                <div className="text-sm text-white">{ingredient.costPerUnit.toLocaleString('en-IN')} per {ingredient.unit}</div>
                <div className="text-xs text-[#666] mt-0.5">
                  Current value: {(ingredient.stock * ingredient.costPerUnit).toLocaleString('en-IN')}
                </div>
              </div>
            </div>
          )}

          {/* Timestamps */}
          <div className="text-xs text-[#555] flex flex-col gap-1 pt-2 border-t border-white/[0.06]">
            <span>Created {timeAgo(ingredient.createdAt)}</span>
            <span>Last updated {timeAgo(ingredient.updatedAt)}</span>
          </div>
        </div>
      </motion.aside>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock Bar Mini (inline in table)
// ─────────────────────────────────────────────────────────────────────────────

function StockBar({ stock, threshold, restocked }: { stock: number; threshold: number; restocked: number }) {
  const max = Math.max(restocked, threshold * 3, stock, 1);
  const pct = Math.min(100, (stock / max) * 100);
  const thresholdPct = Math.min(100, (threshold / max) * 100);

  return (
    <div className="w-20 h-1.5 bg-white/[0.06] rounded-full overflow-hidden relative" title={`${stock} / threshold ${threshold}`}>
      {/* Threshold marker */}
      <div
        className="absolute top-0 bottom-0 w-px bg-yellow-500/40"
        style={{ left: `${thresholdPct}%` }}
      />
      <div
        className={`h-full rounded-full transition-all ${
          stock === 0 ? 'bg-red-500' : stock <= threshold ? 'bg-yellow-500' : 'bg-green-500'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function IngredientsListTab({ onEdit, onCreate }: IngredientsListTabProps) {
  const [ingredients, setIngredients] = useState<IIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showLowStock, setShowLowStock] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [detailIngredient, setDetailIngredient] = useState<IIngredient | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch Ingredients
  // ─────────────────────────────────────────────────────────────────────────

  const fetchIngredients = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery) {
        params.set('search', searchQuery);
      }
      if (showLowStock) {
        params.set('lowStock', 'true');
      }

      const res = await fetch(`/api/ingredients?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setIngredients(data.ingredients || []);
      }
    } catch (error) {
      console.error('Failed to fetch ingredients:', error);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery, showLowStock]);

  useEffect(() => {
    fetchIngredients();
  }, [fetchIngredients]);

  // ─────────────────────────────────────────────────────────────────────────
  // Delete Handler
  // ─────────────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/ingredients/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setIngredients((prev) => prev.filter((i) => i._id !== id));
        setDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Failed to delete ingredient:', error);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Stock Status
  // ─────────────────────────────────────────────────────────────────────────

  const getStockStatus = (ingredient: IIngredient) => {
    const threshold = ingredient.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
    if (ingredient.stock === 0) {
      return { label: 'Out of Stock', color: 'bg-red-500/20 text-red-400 border-red-500/30' };
    }
    if (ingredient.stock <= threshold) {
      return { label: 'Low Stock', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' };
    }
    return { label: 'In Stock', color: 'bg-green-500/20 text-green-400 border-green-500/30' };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const lowStockCount = ingredients.filter((i) => i.stock <= (i.lowStockThreshold ?? LOW_STOCK_THRESHOLD)).length;
  const outOfStockCount = ingredients.filter((i) => i.stock === 0).length;
  const totalValue = ingredients.reduce((sum, i) => sum + (i.stock * (i.avgCost ?? i.costPerUnit ?? 0)), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Ingredients</h2>
          <p className="text-[#888] text-sm">Quick list — open the Control Center for stock, purchases, reports & analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/inventory"
            className="flex items-center gap-2 px-4 py-2 bg-white/[0.06] border border-white/[0.12] hover:bg-white/[0.12] rounded-lg text-sm font-medium text-white transition-colors"
          >
            <Warehouse size={16} />
            Inventory Control Center
            <ArrowRight size={14} className="opacity-60" />
          </Link>
          <button
            onClick={onCreate}
            className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} />
            Add Ingredient
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-[#111] border border-white/[0.06] rounded-xl px-4 py-3">
          <div className="text-[10px] text-[#666] uppercase tracking-wider">Total Items</div>
          <div className="text-xl font-semibold text-white mt-0.5">{ingredients.length}</div>
        </div>
        <div className={`bg-[#111] border rounded-xl px-4 py-3 ${lowStockCount > 0 ? 'border-yellow-500/30' : 'border-white/[0.06]'}`}>
          <div className="text-[10px] text-[#666] uppercase tracking-wider flex items-center gap-1">
            {lowStockCount > 0 && <AlertTriangle size={10} className="text-yellow-400" />} Low Stock
          </div>
          <div className={`text-xl font-semibold mt-0.5 ${lowStockCount > 0 ? 'text-yellow-400' : 'text-white'}`}>{lowStockCount}</div>
        </div>
        <div className={`bg-[#111] border rounded-xl px-4 py-3 ${outOfStockCount > 0 ? 'border-red-500/30' : 'border-white/[0.06]'}`}>
          <div className="text-[10px] text-[#666] uppercase tracking-wider">Out of Stock</div>
          <div className={`text-xl font-semibold mt-0.5 ${outOfStockCount > 0 ? 'text-red-400' : 'text-white'}`}>{outOfStockCount}</div>
        </div>
        {totalValue > 0 && (
          <div className="bg-[#111] border border-white/[0.06] rounded-xl px-4 py-3">
            <div className="text-[10px] text-[#666] uppercase tracking-wider">Inventory Value</div>
            <div className="text-xl font-semibold text-white mt-0.5">{totalValue.toLocaleString('en-IN')}</div>
          </div>
        )}
      </div>

      {/* Low Stock Alert */}
      {lowStockCount > 0 && !showLowStock && (
        <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <AlertTriangle className="text-yellow-400 shrink-0" size={20} />
          <p className="text-yellow-200 text-sm">
            <span className="font-medium">{lowStockCount} ingredient(s)</span> have low or zero stock
          </p>
          <button
            onClick={() => setShowLowStock(true)}
            className="ml-auto text-yellow-400 hover:text-yellow-300 text-sm underline whitespace-nowrap"
          >
            Filter
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search ingredients..."
            className="w-full pl-9 pr-4 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-white/20"
          />
        </div>
        <label className="flex items-center gap-2 px-4 py-2 bg-[#111] border border-white/[0.08] rounded-lg cursor-pointer hover:border-white/[0.15]">
          <input
            type="checkbox"
            checked={showLowStock}
            onChange={(e) => setShowLowStock(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-[#111] text-white focus:ring-white/20"
          />
          <span className="text-sm text-[#888]">Low stock only</span>
        </label>
        <button
          onClick={fetchIngredients}
          className="p-2 bg-[#111] border border-white/[0.08] rounded-lg text-[#888] hover:text-white hover:border-white/20 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Ingredients Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : ingredients.length === 0 ? (
        <div className="text-center py-12 text-[#555]">
          <Package className="mx-auto mb-3" size={48} />
          <p>No ingredients found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-left">
            <thead className="bg-[#111] text-[#666] text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Usage</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Updated</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {ingredients.map((ingredient, index) => {
                const stockStatus = getStockStatus(ingredient);
                const threshold = ingredient.lowStockThreshold ?? LOW_STOCK_THRESHOLD;
                const consumed = ingredient.totalConsumed ?? 0;
                const restocked = ingredient.totalRestocked ?? 0;

                return (
                  <motion.tr
                    key={ingredient._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-white/[0.03] group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                          ingredient.stock === 0 ? 'bg-red-500/10' :
                          ingredient.stock <= threshold ? 'bg-yellow-500/10' : 'bg-white/[0.06]'
                        }`}>
                          <Package size={16} className={`${
                            ingredient.stock === 0 ? 'text-red-400' :
                            ingredient.stock <= threshold ? 'text-yellow-400' : 'text-[#555]'
                          }`} />
                        </div>
                        <div className="min-w-0">
                          <span className="font-medium text-white flex items-center gap-1.5 truncate">
                            {ingredient.name}
                            {ingredient.kind === 'supply' && (
                              <span className="px-1.5 py-0.5 text-[9px] rounded border bg-indigo-500/15 text-indigo-300 border-indigo-500/30 shrink-0">Supply</span>
                            )}
                          </span>
                          <span className="text-[10px] text-[#555]">
                            {ingredient.unit}
                            {(ingredient.avgCost ?? ingredient.costPerUnit) ? ` · ${(ingredient.avgCost ?? ingredient.costPerUnit)!.toLocaleString('en-IN')}/unit` : ''}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className={`font-mono text-sm ${
                          ingredient.stock === 0 ? 'text-red-400' :
                          ingredient.stock <= threshold ? 'text-yellow-400' : 'text-white'
                        }`}>
                          {ingredient.stock} <span className="text-[10px] text-[#666]">{ingredient.unit}</span>
                        </span>
                        <StockBar stock={ingredient.stock} threshold={threshold} restocked={restocked} />
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-xs text-orange-400/80">
                          <TrendingDown size={10} />
                          <span className="font-mono">{consumed > 0 ? consumed.toFixed(1) : '0'}</span>
                          <span className="text-[#555]">used</span>
                        </div>
                        {restocked > 0 && (
                          <div className="text-[10px] text-[#555] font-mono">
                            {restocked.toFixed(1)} restocked
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${stockStatus.color}`}>
                        {stockStatus.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-[#666] flex items-center gap-1">
                        <Clock size={10} />
                        {timeAgo(ingredient.updatedAt)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setDetailIngredient(ingredient)}
                          className="p-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-[#888] hover:text-white transition-colors"
                          title="View details"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => onEdit(ingredient._id, ingredient as unknown as Record<string, unknown>)}
                          className="p-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-[#888] hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        {deleteConfirm === ingredient._id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(ingredient._id)}
                              className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs transition-colors"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="px-2 py-1 bg-white/[0.06] hover:bg-white/[0.1] rounded text-xs transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(ingredient._id)}
                            className="p-2 bg-white/[0.06] hover:bg-red-600/80 rounded-lg text-[#888] hover:text-white transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Stats Footer */}
      <div className="flex flex-wrap gap-4 text-xs text-[#555] border-t border-white/[0.06] pt-4">
        <span>Total: {ingredients.length} ingredients</span>
        <span>Low Stock: {lowStockCount}</span>
        <span>Out of Stock: {outOfStockCount}</span>
        {totalValue > 0 && <span>Value: {totalValue.toLocaleString('en-IN')}</span>}
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {detailIngredient && (
          <IngredientDetailDrawer
            ingredient={detailIngredient}
            onClose={() => setDetailIngredient(null)}
            onEdit={() => {
              onEdit(detailIngredient._id, detailIngredient as unknown as Record<string, unknown>);
              setDetailIngredient(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
