// pos_modules/orders/order-editor/TableSwitcher.tsx
// Live Smart Table Switcher — compact, uniform 3-row paginated table pills.
// Shows occupied/active tables with zone filtering and clean prev/next navigation.

'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ArrowRightLeft,
  Users,
  Utensils,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Check,
} from 'lucide-react';
import { usePOSStore } from '@/stores/posStore';
import type { FocusedContext } from '@/stores/posStore';
import { ITable, ITableSection, ITableSession } from '@/types/table.types';
import { flushOrderEditorCache } from './useOrderEditorState';

// ─── Constants ───────────────────────────────────────────────────────────────
/** Fixed number of chips per page — 2 rows of 5 to save vertical space at 768px height */
const CHIPS_PER_PAGE = 10;

// ─── Props ───────────────────────────────────────────────────────────────────

interface TableSwitcherProps {
  tables: ITable[];
  focusedContext: FocusedContext;
  sections: ITableSection[];
  selectedZoneId: string | null;
  onZoneChange: (zoneId: string | null) => void;
}

export default function TableSwitcher({
  tables,
  focusedContext,
  sections,
  selectedZoneId,
  onZoneChange,
}: TableSwitcherProps) {
  const switchOrderContext = usePOSStore((state) => state.switchOrderContext);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showZoneMenu, setShowZoneMenu] = useState(false);
  const [chipPage, setChipPage] = useState(0);
  const zoneMenuRef = useRef<HTMLDivElement>(null);

  // ── Filter tables by zone + active status ─────────────────────────────────
  const activeTables = useMemo(() => {
    return tables.filter((t) => {
      if (t.status !== 'occupied') return false;
      const session = typeof t.activeSessionId === 'object' ? t.activeSessionId : null;
      if (!session) return false;
      if (selectedZoneId && t.sectionId !== selectedZoneId) return false;
      return true;
    });
  }, [tables, selectedZoneId]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(activeTables.length / CHIPS_PER_PAGE));
  const visibleTables = activeTables.slice(
    chipPage * CHIPS_PER_PAGE,
    (chipPage + 1) * CHIPS_PER_PAGE,
  );

  // Reset page when zone changes
  useEffect(() => {
    setChipPage(0);
  }, [selectedZoneId]);

  // Clamp page if tables shrink
  useEffect(() => {
    if (chipPage >= totalPages) setChipPage(Math.max(0, totalPages - 1));
  }, [chipPage, totalPages]);

  // Close zone menu on outside click
  useEffect(() => {
    if (!showZoneMenu) return;
    const handler = (e: MouseEvent) => {
      if (zoneMenuRef.current && !zoneMenuRef.current.contains(e.target as Node)) {
        setShowZoneMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showZoneMenu]);

  const handleSwitchToTable = useCallback(
    (table: ITable) => {
      const session =
        typeof table.activeSessionId === 'object'
          ? (table.activeSessionId as ITableSession)
          : null;
      if (!session) return;

      const order =
        session.orderId && typeof session.orderId === 'object'
          ? session.orderId
          : undefined;

      flushOrderEditorCache();
      switchOrderContext({
        tableId: table._id,
        table,
        sessionId: session._id,
        session,
        orderId: typeof order === 'object' ? order._id : session.orderId,
        order: typeof order === 'object' ? order : undefined,
      });
    },
    [switchOrderContext],
  );

  const currentTableId = focusedContext.tableId;
  const currentZoneName = selectedZoneId
    ? sections.find((s) => s._id === selectedZoneId)?.name ?? 'Zone'
    : 'All Zones';

  return (
    <div className="border-b border-gray-800">
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="px-3 py-1.5 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded((p) => !p)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-300 hover:text-white transition-colors"
        >
          <ArrowRightLeft size={14} className="text-purple-400" />
          <span>Tables</span>
          <span className="text-xs text-gray-500 font-normal">
            {activeTables.length} active
          </span>
          {isExpanded ? (
            <ChevronUp size={14} className="text-gray-500" />
          ) : (
            <ChevronDown size={14} className="text-gray-500" />
          )}
        </button>

        {/* Change Zone Button */}
        <div className="relative" ref={zoneMenuRef}>
          <button
            onClick={() => setShowZoneMenu((p) => !p)}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-cyan-300 hover:text-white bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-md transition-colors"
          >
            <MapPin size={12} />
            <span className="max-w-[90px] truncate">{currentZoneName}</span>
            <ChevronDown size={10} className={`transition-transform ${showZoneMenu ? 'rotate-180' : ''}`} />
          </button>

          {showZoneMenu && (
            <div
              className="absolute right-0 top-full mt-1 z-50 min-w-[160px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl overflow-hidden"
            >
              {/* All Zones */}
              <button
                onClick={() => { onZoneChange(null); setShowZoneMenu(false); }}
                className={`w-full flex items-center gap-1 px-2 py-1 md:px-3 md:py-2 text-xs transition-colors ${
                  !selectedZoneId
                    ? 'bg-cyan-600/20 text-cyan-300'
                    : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
              >
                <MapPin size={12} />
                <span className="flex-1 text-left">All Zones</span>
                {!selectedZoneId && <Check size={12} className="text-cyan-400" />}
              </button>

              {sections.map((section) => (
                <button
                  key={section._id}
                  onClick={() => { onZoneChange(section._id); setShowZoneMenu(false); }}
                  className={`w-full flex items-center gap-1 px-2 py-1 md:px-3 md:py-2 text-xs transition-colors ${
                    selectedZoneId === section._id
                      ? 'bg-cyan-600/20 text-cyan-300'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: section.color || '#06B6D4' }}
                  />
                  <span className="flex-1 text-left truncate">{section.name}</span>
                  {section.floorNumber > 0 && (
                    <span className="text-[10px] text-gray-600">F{section.floorNumber}</span>
                  )}
                  {selectedZoneId === section._id && <Check size={12} className="text-cyan-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Table chips — horizontal scrollable row ──────────────────── */}
      {isExpanded && (
        <div className="px-3 pb-1.5">
          {visibleTables.length === 0 ? (
            <p className="text-[11px] text-gray-500 py-1">
              {selectedZoneId ? 'No active tables in this zone' : 'No active tables'}
            </p>
          ) : (
            <div className="flex items-center gap-1">
              {/* Prev */}
              {totalPages > 1 && (
                <button
                  onClick={() => setChipPage((p) => Math.max(0, p - 1))}
                  disabled={chipPage === 0}
                  className="flex-shrink-0 p-0.5 rounded text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                </button>
              )}

              {/* Scrollable chip row */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-1 min-w-0">
                {visibleTables.map((table) => {
                  const isActive = table._id === currentTableId;
                  return (
                    <button
                      key={table._id}
                      onClick={() => handleSwitchToTable(table)}
                      className={`flex-shrink-0 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                        isActive
                          ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/25 ring-1 ring-purple-400/50'
                          : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {table.tableNumber}
                    </button>
                  );
                })}
              </div>

              {/* Next + page indicator */}
              {totalPages > 1 && (
                <>
                  <span className="text-[9px] text-gray-600 flex-shrink-0">{chipPage + 1}/{totalPages}</span>
                  <button
                    onClick={() => setChipPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={chipPage >= totalPages - 1}
                    className="flex-shrink-0 p-0.5 rounded text-gray-500 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                  >
                    <ChevronRight size={14} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
