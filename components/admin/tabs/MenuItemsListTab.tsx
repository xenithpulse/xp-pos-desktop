// components/admin/tabs/MenuItemsListTab.tsx
// Menu items list view with search, filter, detail drawer, and actions

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  UtensilsCrossed,
  RefreshCw,
  Check,
  X,
  Star,
  Flame,
  Eye,
  FlaskConical,
  Clock,
  Tag,
  ChevronRight,
} from 'lucide-react';
import { IMenuItem, ICategory, IRecipeIngredient, ITEM_TYPE_LABELS, ItemType } from '@/types/menu.types';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface MenuItemsListTabProps {
  onEdit: (id: string, data: Record<string, unknown>) => void;
  onCreate: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Item Type Colors
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<ItemType, string> = {
  food: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  beverage: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  combo: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  addon: 'bg-green-500/20 text-green-400 border-green-500/30',
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Resolve the category name whether the field is a populated object or a plain string ID */
function resolveCategoryName(categoryId: string | ICategory | undefined, fallbackCategories: { _id: string; name: string }[]): string {
  if (!categoryId) return 'Uncategorized';
  if (typeof categoryId === 'object' && categoryId !== null && 'name' in categoryId) {
    return (categoryId as ICategory).name;
  }
  const cat = fallbackCategories.find((c) => c._id === categoryId);
  return cat?.name || 'Uncategorized';
}

function resolveCategoryColor(categoryId: string | ICategory | undefined): string | undefined {
  if (typeof categoryId === 'object' && categoryId !== null && 'color' in categoryId) {
    return (categoryId as ICategory).color ?? undefined;
  }
  return undefined;
}

function formatPrice(price: number) {
  return price.toLocaleString('en-IN');
}

function timeAgo(dateStr?: string) {
  if (!dateStr) return '';
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

function DetailDrawer({
  item,
  categoryName,
  onClose,
  onEdit,
}: {
  item: IMenuItem;
  categoryName: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const recipe: IRecipeIngredient[] = (item as any).recipe || [];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      {/* Drawer */}
      <motion.aside
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="relative w-full max-w-md bg-[#0a0a0a] border-l border-white/[0.08] h-full overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0a0a0a]/90 backdrop-blur-md border-b border-white/[0.06] px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-semibold text-white truncate">{item.name}</h3>
          <div className="flex items-center gap-2">
            <button onClick={onEdit} className="px-3 py-1.5 text-xs font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors">
              Edit
            </button>
            <button onClick={onClose} className="p-1.5 text-[#666] hover:text-white transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {/* Image */}
          {item.image && (
            <img src={item.image} alt={item.name} className="w-full h-48 object-cover rounded-xl border border-white/[0.06]" />
          )}

          {/* Quick Badges */}
          <div className="flex flex-wrap gap-2">
            <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${TYPE_COLORS[item.itemType]}`}>
              {ITEM_TYPE_LABELS[item.itemType]}
            </span>
            {item.isAvailable ? (
              <span className="px-2.5 py-1 text-xs font-medium rounded-full border bg-green-500/15 text-green-400 border-green-500/30">Available</span>
            ) : (
              <span className="px-2.5 py-1 text-xs font-medium rounded-full border bg-red-500/15 text-red-400 border-red-500/30">Unavailable</span>
            )}
            {recipe.length > 0 ? (
              <span className="px-2.5 py-1 text-xs font-medium rounded-full border bg-cyan-500/15 text-cyan-400 border-cyan-500/30 flex items-center gap-1"><FlaskConical size={10} /> Recipe linked</span>
            ) : (
              <span className="px-2.5 py-1 text-xs font-medium rounded-full border bg-white/[0.06] text-[#666] border-white/[0.1]">No recipe</span>
            )}
            {item.isFeatured && <span className="px-2.5 py-1 text-xs font-medium rounded-full border bg-yellow-500/15 text-yellow-400 border-yellow-500/30 flex items-center gap-1"><Star size={10} /> Featured</span>}
            {item.isPopular && <span className="px-2.5 py-1 text-xs font-medium rounded-full border bg-orange-500/15 text-orange-400 border-orange-500/30 flex items-center gap-1"><Flame size={10} /> Popular</span>}
          </div>

          {/* Info Grid */}
          <div className="grid grid-cols-2 gap-3">
            <InfoTile label="Category" value={categoryName} />
            <InfoTile label="SKU" value={item.sku} mono />
            <InfoTile label="Base Price" value={formatPrice(item.basePrice)} />
            <InfoTile label="Tax" value={item.taxRate > 0 ? `${item.taxRate}% ${item.taxInclusive ? '(incl.)' : ''}` : 'None'} />
            <InfoTile label="Prep Time" value={`${item.preparationTime} min`} />
            <InfoTile label="Kitchen Station" value={item.kitchenStation || '—'} />
            {item.quickCode && <InfoTile label="Quick Code" value={item.quickCode} mono />}
            {item.spiceLevel && <InfoTile label="Spice" value={item.spiceLevel} />}
          </div>

          {/* Description */}
          {item.description && (
            <div>
              <h4 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-1.5">Description</h4>
              <p className="text-sm text-[#aaa] leading-relaxed">{item.description}</p>
            </div>
          )}

          {/* Recipe */}
          <div>
            <h4 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <FlaskConical size={12} /> Recipe Ingredients
            </h4>
            {recipe.length > 0 ? (
              <div className="space-y-1.5">
                {recipe.map((r, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-white/[0.03] rounded-lg">
                    <span className="text-sm text-white">{r.name}</span>
                    <span className="text-xs text-[#888] font-mono">{r.quantity} {r.unit}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#555] italic">No ingredients linked. Inventory won&apos;t auto-deduct for this item.</p>
            )}
          </div>

          {/* Availability */}
          <div>
            <h4 className="text-xs font-medium text-[#666] uppercase tracking-wider mb-2">Availability</h4>
            <div className="flex flex-wrap gap-2 text-xs">
              <AvailPill label="Dine-in" on={item.isAvailableForDineIn} />
              <AvailPill label="Takeaway" on={item.isAvailableForTakeaway} />
              <AvailPill label="Delivery" on={item.isAvailableForDelivery} />
            </div>
          </div>

          {/* Timestamps */}
          <div className="text-xs text-[#555] flex items-center gap-4 pt-2 border-t border-white/[0.06]">
            <span>Created {timeAgo(item.createdAt)}</span>
            <span>Updated {timeAgo(item.updatedAt)}</span>
          </div>
        </div>
      </motion.aside>
    </motion.div>
  );
}

function InfoTile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white/[0.03] rounded-lg px-3 py-2">
      <div className="text-[10px] text-[#666] uppercase tracking-wider mb-0.5">{label}</div>
      <div className={`text-sm text-white truncate ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function AvailPill({ label, on }: { label: string; on: boolean }) {
  return (
    <span className={`px-2 py-0.5 rounded-full border ${on ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-white/[0.04] text-[#555] border-white/[0.08]'}`}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MenuItemsListTab({ onEdit, onCreate }: MenuItemsListTabProps) {
  const [items, setItems] = useState<IMenuItem[]>([]);
  const [categories, setCategories] = useState<{ _id: string; name: string; slug: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<ItemType | 'all'>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<IMenuItem | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch Data
  // ─────────────────────────────────────────────────────────────────────────

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (categoryFilter !== 'all') {
        params.set('categoryId', categoryFilter);
      }
      if (searchQuery) {
        params.set('search', searchQuery);
      }

      const res = await fetch(`/api/menu/items?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data.items || []);
      }
    } catch (error) {
      console.error('Failed to fetch menu items:', error);
    } finally {
      setIsLoading(false);
    }
  }, [categoryFilter, searchQuery]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/menu/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // ─────────────────────────────────────────────────────────────────────────
  // Delete Handler
  // ─────────────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/menu/items/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i._id !== id));
        setDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Failed to delete menu item:', error);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered Items
  // ─────────────────────────────────────────────────────────────────────────

  const filteredItems = items.filter((item) => {
    const matchesType = typeFilter === 'all' || item.itemType === typeFilter;
    return matchesType;
  });

  const recipeCount = items.filter((i) => ((i as any).recipe?.length ?? 0) > 0).length;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Menu Items</h2>
          <p className="text-[#888] text-sm">Manage food, beverages, combos, and add-ons</p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add Item
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu items..."
            className="w-full pl-9 pr-4 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-white/20"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat._id} value={cat._id}>{cat.name}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as ItemType | 'all')}
          className="px-3 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm focus:outline-none focus:border-white/20"
        >
          <option value="all">All Types</option>
          {Object.entries(ITEM_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button
          onClick={fetchItems}
          className="p-2 bg-[#111] border border-white/[0.08] rounded-lg text-[#888] hover:text-white hover:border-white/20 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Items List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-[#555]">
          <UtensilsCrossed className="mx-auto mb-3" size={48} />
          <p>No menu items found</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
          <table className="w-full text-left">
            <thead className="bg-[#111] text-[#666] text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Recipe</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {filteredItems.map((item, index) => {
                const catName = resolveCategoryName(item.categoryId, categories);
                const catColor = resolveCategoryColor(item.categoryId);
                const recipe: IRecipeIngredient[] = (item as any).recipe || [];
                const hasRecipe = recipe.length > 0;

                return (
                  <motion.tr
                    key={item._id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.03 }}
                    className="hover:bg-white/[0.03] group"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {item.thumbnailImage || item.image ? (
                          <img
                            src={item.thumbnailImage || item.image}
                            alt={item.name}
                            className="w-10 h-10 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 bg-white/[0.06] rounded-lg flex items-center justify-center">
                            <UtensilsCrossed size={16} className="text-[#555]" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium flex items-center gap-1.5 truncate">
                            {item.name}
                            {item.isFeatured && <Star size={11} className="text-yellow-400 fill-yellow-400 shrink-0" />}
                            {item.isPopular && <Flame size={11} className="text-orange-400 shrink-0" />}
                          </div>
                          <div className="text-xs text-[#555] font-mono">{item.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-sm text-[#ccc]"
                      >
                        {catColor && (
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                        )}
                        {catName}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${TYPE_COLORS[item.itemType]}`}>
                        {ITEM_TYPE_LABELS[item.itemType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium tabular-nums">
                      {formatPrice(item.basePrice)}
                      {item.taxRate > 0 && (
                        <span className="text-xs text-[#555] ml-1">+{item.taxRate}%</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {item.isAvailable ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-green-500/15 text-green-400 border-green-500/30">
                          <Check size={10} /> Available
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-red-500/15 text-red-400 border-red-500/30">
                          <X size={10} /> Unavailable
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {hasRecipe ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-cyan-500/15 text-cyan-400 border-cyan-500/30">
                          <FlaskConical size={10} /> {recipe.length} item{recipe.length > 1 ? 's' : ''}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border bg-white/[0.04] text-[#555] border-white/[0.08]">
                          None
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setDetailItem(item)}
                          className="p-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-[#888] hover:text-white transition-colors"
                          title="View details"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => onEdit(item._id, item as unknown as Record<string, unknown>)}
                          className="p-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-[#888] hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        {deleteConfirm === item._id ? (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleDelete(item._id)}
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
                            onClick={() => setDeleteConfirm(item._id)}
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

      {/* Stats */}
      <div className="flex flex-wrap gap-4 text-xs text-[#555] border-t border-white/[0.06] pt-4">
        <span>Total: {items.length} items</span>
        <span>Available: {items.filter((i) => i.isAvailable).length}</span>
        <span>Featured: {items.filter((i) => i.isFeatured).length}</span>
        <span>With Recipe: {recipeCount}</span>
      </div>

      {/* Detail Drawer */}
      <AnimatePresence>
        {detailItem && (
          <DetailDrawer
            item={detailItem}
            categoryName={resolveCategoryName(detailItem.categoryId, categories)}
            onClose={() => setDetailItem(null)}
            onEdit={() => {
              onEdit(detailItem._id, detailItem as unknown as Record<string, unknown>);
              setDetailItem(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
