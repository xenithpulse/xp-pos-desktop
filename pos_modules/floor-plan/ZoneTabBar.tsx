// pos_modules/floor-plan/ZoneTabBar.tsx
// High-fidelity tab bar for zone navigation — replaces the dropdown selector.
// Supports background texture per zone, keyboard navigation, and animations.

'use client';

import { useState, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Layers,
  X,
  TreePalm,
  Home,
  Wine,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ITableSection, ZoneMetadata } from '@/types/table.types';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ZoneTabBarProps {
  sections: ITableSection[];
  selectedSectionId?: string;
  onSectionChange: (sectionId?: string) => void;
  /** Per-zone metadata keyed by section._id */
  zoneMetadata?: Record<string, ZoneMetadata>;
  onZoneMetadataChange?: (sectionId: string, meta: ZoneMetadata) => void;
  className?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zone icon heuristic
// ─────────────────────────────────────────────────────────────────────────────

function zoneIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('patio') || lower.includes('outdoor') || lower.includes('terrace'))
    return TreePalm;
  if (lower.includes('bar') || lower.includes('lounge'))
    return Wine;
  return Home;
}

// ─────────────────────────────────────────────────────────────────────────────
// Texture thumbnails
// ─────────────────────────────────────────────────────────────────────────────

const TEXTURE_OPTIONS: { value: ZoneMetadata['backgroundTexture']; label: string; color: string }[] = [
  { value: 'none', label: 'None', color: '#F1F5F9' },
  { value: 'wood', label: 'Wood', color: '#D2A679' },
  { value: 'stone', label: 'Stone', color: '#9CA3AF' },
  { value: 'tile', label: 'Tile', color: '#A5B4FC' },
  { value: 'carpet', label: 'Carpet', color: '#86EFAC' },
  { value: 'concrete', label: 'Concrete', color: '#CBD5E1' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function ZoneTabBar({
  sections,
  selectedSectionId,
  onSectionChange,
  zoneMetadata = {},
  onZoneMetadataChange,
  className = '',
}: ZoneTabBarProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollArrows, setShowScrollArrows] = useState({ left: false, right: false });
  const [editingZone, setEditingZone] = useState<string | null>(null);

  // Check overflow for scroll arrows
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setShowScrollArrows({
        left: el.scrollLeft > 4,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
      });
    };
    check();
    el.addEventListener('scroll', check);
    window.addEventListener('resize', check);
    return () => {
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [sections.length]);

  const scroll = (dir: number) => {
    scrollRef.current?.scrollBy({ left: dir * 160, behavior: 'smooth' });
  };

  const isActive = (id?: string) =>
    id === undefined ? !selectedSectionId : selectedSectionId === id;

  return (
    <div className={`relative flex items-center gap-1 ${className}`}>
      {/* Left arrow */}
      <AnimatePresence>
        {showScrollArrows.left && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scroll(-1)}
            className="shrink-0 p-1.5 rounded-lg bg-white/80 hover:bg-white shadow-sm border border-slate-200 z-10"
          >
            <ChevronLeft size={14} className="text-slate-500" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Tabs container */}
      <div
        ref={scrollRef}
        className="flex items-center gap-1 overflow-x-auto scrollbar-none scroll-smooth"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* All Zones tab */}
        <TabItem
          label="All Zones"
          icon={<Layers size={14} />}
          isActive={isActive(undefined)}
          color="#6366F1"
          onClick={() => onSectionChange(undefined)}
        />

        {/* Section tabs */}
        {sections.map((s) => {
          const Icon = zoneIcon(s.name);
          return (
            <div key={s._id} className="relative">
              <TabItem
                label={s.name}
                icon={<Icon size={14} />}
                isActive={isActive(s._id)}
                color={s.color || '#6366F1'}
                floorNumber={s.floorNumber}
                onClick={() => onSectionChange(s._id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setEditingZone(editingZone === s._id ? null : s._id);
                }}
                texture={zoneMetadata[s._id]?.backgroundTexture}
              />

              {/* Texture picker popover */}
              <AnimatePresence>
                {editingZone === s._id && onZoneMetadataChange && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setEditingZone(null)} />
                    <motion.div
                      initial={{ opacity: 0, y: -8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -8, scale: 0.95 }}
                      className="absolute top-full left-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-200 p-3 z-50 min-w-[200px]"
                    >
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                        Floor Texture
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {TEXTURE_OPTIONS.map((t) => {
                          const current = zoneMetadata[s._id]?.backgroundTexture || 'none';
                          return (
                            <button
                              key={t.value}
                              onClick={() => {
                                onZoneMetadataChange(s._id, {
                                  ...zoneMetadata[s._id],
                                  backgroundTexture: t.value,
                                });
                                setEditingZone(null);
                              }}
                              className={`flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all text-[10px] ${
                                current === t.value
                                  ? 'border-violet-500 bg-violet-50'
                                  : 'border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div
                                className="w-6 h-6 rounded-md"
                                style={{ backgroundColor: t.color }}
                              />
                              <span className="text-slate-600">{t.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Right arrow */}
      <AnimatePresence>
        {showScrollArrows.right && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => scroll(1)}
            className="shrink-0 p-1.5 rounded-lg bg-white/80 hover:bg-white shadow-sm border border-slate-200 z-10"
          >
            <ChevronRight size={14} className="text-slate-500" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Individual Tab
// ─────────────────────────────────────────────────────────────────────────────

interface TabItemProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  color: string;
  floorNumber?: number;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  texture?: string;
}

const TabItem = memo(function TabItem({
  label,
  icon,
  isActive,
  color,
  floorNumber,
  onClick,
  onContextMenu,
  texture,
}: TabItemProps) {
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`relative shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
        isActive
          ? 'shadow-md'
          : 'hover:bg-slate-100 text-slate-600'
      }`}
      style={
        isActive
          ? {
              backgroundColor: `${color}15`,
              color,
              border: `2px solid ${color}40`,
              boxShadow: `0 2px 8px ${color}25`,
            }
          : { border: '2px solid transparent' }
      }
    >
      <span style={isActive ? { color } : undefined}>{icon}</span>
      <span>{label}</span>
      {floorNumber !== undefined && (
        <span className="text-[10px] opacity-50">F{floorNumber}</span>
      )}
      {texture && texture !== 'none' && (
        <span className="w-2 h-2 rounded-full opacity-60" style={{
          backgroundColor: TEXTURE_OPTIONS.find((t) => t.value === texture)?.color || '#CBD5E1',
        }} />
      )}

      {/* Active indicator bar */}
      {isActive && (
        <motion.div
          layoutId="zone-tab-indicator"
          className="absolute -bottom-0.5 left-2 right-2 h-0.5 rounded-full"
          style={{ backgroundColor: color }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
    </button>
  );
});

export default memo(ZoneTabBar);
