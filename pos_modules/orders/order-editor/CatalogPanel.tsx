// pos_modules/orders/order-editor/CatalogPanel.tsx
// Right-hand panel: horizontal category pills + menu item grid
// Lightweight: framer-motion only for search result transitions, not every item

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChefHat, Star, Search, LayoutGrid, ChevronLeft, ChevronRight, X, Lock } from 'lucide-react';
import { ICategory, IMenuItem } from '@/types/menu.types';
import CatalogItemCard from './CatalogItemCard';

/**
 * Why the menu is not usable yet, and the one control that fixes it.
 * Phase 16 §2.1 — an order needs somewhere to go before it can have items.
 */
export interface CatalogLock {
  /** What to do, in a few words. Not what is wrong. */
  title: string;
  /** The sentence under it, ending in what happens once it is done. */
  body: string;
  actionLabel: string;
  onAction: () => void;
}

interface CatalogPanelProps {
  categories: ICategory[];
  menuItems: IMenuItem[];
  selectedCategoryId: string | null;
  setSelectedCategoryId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isLoadingCategories: boolean;
  isLoadingItems: boolean;
  onQuickAdd: (item: IMenuItem) => void;
  /** Set to grey out the catalogue and explain what is missing. Null = open. */
  lock?: CatalogLock | null;
}

const GRID_STORAGE_KEY = 'xp_pos:user_settings:catalog_grid_cols';
const SCROLL_AMOUNT = 200;

export default function CatalogPanel({
  categories,
  menuItems,
  selectedCategoryId,
  setSelectedCategoryId,
  searchQuery,
  setSearchQuery,
  isLoadingCategories,
  isLoadingItems,
  onQuickAdd,
  lock = null,
}: CatalogPanelProps) {

  const GRID_OPTIONS = [2, 3, 4, 5, 6] as const;

  // Persist and restore grid columns from localStorage
  const [gridCols, setGridCols] = useState<number>(() => {
    if (typeof window === 'undefined') return 3;
    const saved = localStorage.getItem(GRID_STORAGE_KEY);
    if (saved) {
      const parsed = Number(saved);
      if ((GRID_OPTIONS as readonly number[]).includes(parsed)) return parsed;
    }
    return 3;
  });
  const [isFocused, setIsFocused] = useState(false);

  // ── Category pill scroll state ────────────────────────────────────────
  const pillsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = pillsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = pillsRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, categories]);

  const scrollPills = useCallback((dir: 'left' | 'right') => {
    const el = pillsRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -SCROLL_AMOUNT : SCROLL_AMOUNT, behavior: 'smooth' });
  }, []);

  // ── Grid columns persistence ──────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(GRID_STORAGE_KEY, String(gridCols));
  }, [gridCols]);

  const cycleGridCols = () => {
    const idx = GRID_OPTIONS.indexOf(gridCols as typeof GRID_OPTIONS[number]);
    const next = GRID_OPTIONS[(idx + 1) % GRID_OPTIONS.length];
    setGridCols(next);
  };

  const gridColsClass: Record<number, string> = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 md:grid-cols-3',
    4: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-4',
    5: 'grid-cols-3 md:grid-cols-5 lg:grid-cols-5',
    6: 'grid-cols-3 md:grid-cols-6 lg:grid-cols-6',
  };

  // Whether we're in "search mode" — only animate results in this mode
  const isSearching = !!searchQuery;

  return (
    <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
      {/* ── Locked banner ───────────────────────────────────────────────
          Disabled, not hidden. A greyed catalogue with a line across it
          teaches the sequence; a missing catalogue just looks broken.
          The control that fixes it lives inside the message. */}
      {lock && (
        <div className="shrink-0 px-3 py-3 md:px-4 border-b border-amber-500/30 bg-amber-500/10">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-2.5 flex-1 min-w-0">
              <Lock size={18} className="text-amber-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-200">{lock.title}</p>
                <p className="text-xs text-amber-200/70 mt-0.5">{lock.body}</p>
              </div>
            </div>
            <button
              onClick={lock.onAction}
              className="shrink-0 px-4 py-2.5 rounded-lg bg-amber-500 text-gray-950 text-sm font-semibold hover:bg-amber-400 transition-colors"
            >
              {lock.actionLabel}
            </button>
          </div>
        </div>
      )}

      <div
        className={`flex-1 flex flex-col min-w-0 overflow-hidden ${
          lock ? 'opacity-40 pointer-events-none select-none' : ''
        }`}
        aria-hidden={lock ? true : undefined}
        inert={!!lock}
      >
      {/* ── Search Bar + Grid Toggle ───────────────────────────────────── */}
      <div className="px-3 py-2 md:px-4 md:py-3 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <div className={`relative flex-1 transition-all duration-150 ${isFocused ? 'ring-1 ring-purple-500/50 rounded-lg' : ''}`}>
            <div
              className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-150 ${
                isFocused ? 'text-purple-400' : 'text-gray-500'
              }`}
            >
              <Search size={16} />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Search menu items or code..."
              className="w-full pl-9 pr-9 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={cycleGridCols}
            className="p-2 rounded-lg border border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:border-purple-500 transition-colors"
            title={`Grid: ${gridCols} columns`}
          >
            <LayoutGrid size={16} />
          </button>
        </div>

        {/* Result count badge — lightweight transition */}
        {searchQuery && (
          <p className="text-[11px] text-gray-500 mt-1.5 ml-1 transition-opacity duration-150">
            {menuItems.length} result{menuItems.length !== 1 ? 's' : ''}
            {searchQuery.match(/^\d+$/) && (
              <span className="text-purple-400/70 ml-1">· QuickCode exact match</span>
            )}
          </p>
        )}
      </div>

      {/* ── Category Pills with Arrow Navigation ──────────────────────── */}
      <div className="px-3 py-1.5 md:px-4 md:py-2 border-b border-gray-800">
        {isLoadingCategories ? (
          <div className="flex items-center justify-center h-8">
            <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="relative flex items-center gap-1">
            {/* Left arrow */}
            {canScrollLeft && (
              <button
                onClick={() => scrollPills('left')}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-800/90 border border-gray-700 text-gray-400 hover:text-white hover:border-purple-500 transition-colors z-10 shadow-lg"
              >
                <ChevronLeft size={14} />
              </button>
            )}

            {/* Scrollable pill row */}
            <div
              ref={pillsRef}
              className="flex items-center gap-2 overflow-x-auto scrollbar-hide scroll-smooth flex-1 min-w-0 pb-0.5"
            >
              <button
                onClick={() => setSelectedCategoryId(null)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  !selectedCategoryId
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                <Star size={12} />
                Featured
              </button>
              {categories.map((category) => (
                <button
                  key={category._id}
                  onClick={() => setSelectedCategoryId(category._id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    selectedCategoryId === category._id
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/25'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: category.color || '#6366F1' }}
                  />
                  <span className="truncate max-w-[120px]">{category.name}</span>
                  {category.itemCount !== undefined && (
                    <span className="opacity-60">{category.itemCount}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Right arrow */}
            {canScrollRight && (
              <button
                onClick={() => scrollPills('right')}
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full bg-gray-800/90 border border-gray-700 text-gray-400 hover:text-white hover:border-purple-500 transition-colors z-10 shadow-lg"
              >
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Item Grid ──────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-2 md:p-3">
        {isLoadingItems ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : menuItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <ChefHat size={48} className="mb-4 opacity-50" />
            <p>{searchQuery ? 'No matching items' : 'No items found'}</p>
          </div>
        ) : isSearching ? (
          /* Search results — lightweight animated list */
          <div
            className={`grid ${gridColsClass[gridCols] || 'grid-cols-2 md:grid-cols-6'} gap-2 md:gap-3`}
          >
            <AnimatePresence mode="popLayout">
              {menuItems.map((item) => (
                <motion.div
                  key={item._id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.12 }}
                >
                  <CatalogItemCard
                    item={item}
                    onAdd={() => onQuickAdd(item)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          /* Category browsing — no animation overhead, plain CSS transitions */
          <div
            className={`grid ${gridColsClass[gridCols] || 'grid-cols-2 md:grid-cols-6'} gap-2 md:gap-3`}
          >
            {menuItems.map((item) => (
              <CatalogItemCard
                key={item._id}
                item={item}
                onAdd={() => onQuickAdd(item)}
              />
            ))}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
