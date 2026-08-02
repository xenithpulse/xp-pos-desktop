// components/admin/tabs/CategoriesListTab.tsx
// Categories list view with search and actions

'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  FolderTree,
  RefreshCw,
  Check,
  X,
  Clock,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ICategory {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  isAvailableForDineIn: boolean;
  isAvailableForTakeaway: boolean;
  isAvailableForDelivery: boolean;
  displayStartTime?: string;
  displayEndTime?: string;
  itemCount?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface CategoriesListTabProps {
  onEdit: (id: string, data: Record<string, unknown>) => void;
  onCreate: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CategoriesListTab({ onEdit, onCreate }: CategoriesListTabProps) {
  const [categories, setCategories] = useState<ICategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch Categories
  // ─────────────────────────────────────────────────────────────────────────

  const fetchCategories = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ withCounts: 'true' });
      if (!showInactive) {
        params.set('activeOnly', 'true');
      }

      const res = await fetch(`/api/menu/categories?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setIsLoading(false);
    }
  }, [showInactive]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // ─────────────────────────────────────────────────────────────────────────
  // Delete Handler
  // ─────────────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/menu/categories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCategories((prev) => prev.filter((c) => c._id !== id));
        setDeleteConfirm(null);
      }
    } catch (error) {
      console.error('Failed to delete category:', error);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered Categories
  // ─────────────────────────────────────────────────────────────────────────

  const filteredCategories = categories.filter((category) => {
    const matchesSearch =
      !searchQuery ||
      category.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      category.slug.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            Categories
          </h2>
          <p className="text-[#888] text-sm">
            Organize menu items into categories
          </p>
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black hover:bg-white/90 rounded-lg text-sm font-medium transition-colors"
        >
          <Plus size={16} />
          Add Category
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
            placeholder="Search categories..."
            className="w-full pl-9 pr-4 py-2 bg-[#111] border border-white/[0.08] rounded-lg text-white text-sm placeholder:text-[#555] focus:outline-none focus:border-white/20"
          />
        </div>
        <label className="flex items-center gap-2 px-4 py-2 bg-[#111] border border-white/[0.08] rounded-lg cursor-pointer hover:border-white/[0.15]">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="w-4 h-4 rounded border-white/20 bg-[#111] text-white focus:ring-white/20"
          />
          <span className="text-sm text-[#888]">Show inactive</span>
        </label>
        <button
          onClick={fetchCategories}
          className="p-2 bg-[#111] border border-white/[0.08] rounded-lg text-[#888] hover:text-white hover:border-white/20 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Categories Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="text-center py-12 text-[#555]">
          <FolderTree className="mx-auto mb-3" size={48} />
          <p>No categories found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCategories.map((category, index) => (
            <motion.div
              key={category._id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`
                bg-[#111] border rounded-xl p-4 transition-colors
                ${category.isActive 
                  ? 'border-white/[0.08] hover:border-white/[0.15]' 
                  : 'border-red-900/30 opacity-60'
                }
              `}
            >
              {/* Category Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: category.color || '#6366f1' }}
                  >
                    {category.icon || category.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-semibold">{category.name}</h3>
                    <p className="text-[#555] text-xs">/{category.slug}</p>
                  </div>
                </div>
                {category.isActive ? (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                    Active
                  </span>
                ) : (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                    Inactive
                  </span>
                )}
              </div>

              {/* Description */}
              {category.description && (
                <p className="text-[#888] text-sm mb-3 line-clamp-2">
                  {category.description}
                </p>
              )}

              {/* Details */}
              <div className="space-y-2 text-sm text-[#888] mb-4">
                <div className="flex items-center justify-between">
                  <span>Menu Items:</span>
                  <span className="font-medium text-white">{category.itemCount ?? 0}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {category.isAvailableForDineIn && (
                    <span className="px-2 py-0.5 bg-white/[0.06] rounded text-xs">Dine-in</span>
                  )}
                  {category.isAvailableForTakeaway && (
                    <span className="px-2 py-0.5 bg-white/[0.06] rounded text-xs">Takeaway</span>
                  )}
                  {category.isAvailableForDelivery && (
                    <span className="px-2 py-0.5 bg-white/[0.06] rounded text-xs">Delivery</span>
                  )}
                </div>
                {(category.displayStartTime || category.displayEndTime) && (
                  <div className="flex items-center gap-1 text-xs">
                    <Clock size={12} />
                    <span>
                      {category.displayStartTime || '00:00'} - {category.displayEndTime || '24:00'}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => onEdit(category._id, category as unknown as Record<string, unknown>)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg text-sm transition-colors"
                >
                  <Edit2 size={14} />
                  Edit
                </button>
                {deleteConfirm === category._id ? (
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleDelete(category._id)}
                      className="px-3 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm transition-colors"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-3 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(category._id)}
                    className="px-3 py-2 bg-white/[0.06] hover:bg-red-600/80 border border-white/[0.08] rounded-lg text-sm transition-colors"
                    disabled={(category.itemCount ?? 0) > 0}
                    title={(category.itemCount ?? 0) > 0 ? 'Cannot delete category with items' : 'Delete'}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-4 text-xs text-[#555] border-t border-white/[0.06] pt-4">
        <span>Total: {categories.length} categories</span>
        <span>Active: {categories.filter((c) => c.isActive).length}</span>
      </div>
    </div>
  );
}
