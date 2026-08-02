// pos_modules/floor-plan/FloorPlanCanvas.tsx
// Pro Canvas — zoomable floor plan with multi-select, snap-to-grid,
// playground sidebar, draft tables, bulk-save layout persistence,
// hotkeys, undo/redo, mini-map, alignment guides, global inspector,
// zone tab bar, export/import, and ghosting drag effects.

'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Edit3,
  Save,
  X,
  Grid3X3,
  AlignStartVertical,
  AlignStartHorizontal,
  AlignCenterVertical,
  AlignCenterHorizontal,
  Layers,
  Sparkles,
  MousePointerSquareDashed,
  Trash2,
  Copy,
  Undo2,
  Redo2,
  Hand,
  Keyboard,
  AlignHorizontalSpaceAround,
  AlignVerticalSpaceAround,
  PlusCircle,
} from 'lucide-react';
import TableVisual from './TableVisual';
import PlaygroundSidebar from './PlaygroundSidebar';
import ZoneTabBar from './ZoneTabBar';
import GlobalInspector from './GlobalInspector';
import MiniMap from './MiniMap';
import SelectionHUD from './SelectionHUD';
import TableEditPopover from './TableEditPopover';
import {
  ITable,
  ITableSection,
  TablePositionUpdate,
  TableStatus,
  DraftTable,
  BulkUpsertTableItem,
  ZoneMetadata,
  CanvasSnapshot,
  TableShape,
  TablePropertyEdits,
  DistanceMarker,
  ReservationPolicy,
  DEFAULT_RESERVATION_POLICY,
  getEffectiveTableStatus,
} from '@/types/table.types';
import { useHotkeys } from '@/lib/floor-plan/useHotkeys';
import { useUndoRedo } from '@/lib/floor-plan/useUndoRedo';
import {
  computeAlignmentGuides,
  AlignmentGuide,
  distributeHorizontally,
  distributeVertically,
  tidyUp,
  arrangeInRow,
  arrangeInColumn,
  smartOrganize,
  TableRect,
} from '@/lib/floor-plan/alignmentGuides';
import { createSingleDraft } from '@/lib/layout';

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

interface FloorPlanCanvasProps {
  tables: ITable[];
  sections?: ITableSection[];
  onTableClick: (table: ITable) => void;
  /** Fires when the info-icon on an occupied table is clicked (opens details panel). */
  onTableIconClick?: (table: ITable) => void;
  onTablesUpdate?: (updates: TablePositionUpdate[]) => Promise<void>;
  onBulkUpsert?: (items: BulkUpsertTableItem[]) => Promise<void>;
  onTableDelete?: (tableId: string) => Promise<void>;
  onCreateZone?: (name: string, color: string, floor: number) => Promise<void>;
  selectedTableId?: string;
  canvasWidth?: number;
  canvasHeight?: number;
  selectedSectionId?: string;
  onSectionChange?: (sectionId?: string) => void;
  statusFilter?: TableStatus | 'all';
  onSectionsRefresh?: () => void;
  /** Tenant reservation timing policy — passed through to each table tile. */
  reservationPolicy?: ReservationPolicy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
const SCALE_STEP = 0.1;
const GRID_SIZES = [0, 10, 20, 50];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function FloorPlanCanvas({
  tables,
  sections = [],
  onTableClick,
  onTableIconClick,
  onTablesUpdate,
  onBulkUpsert,
  onTableDelete,
  onCreateZone,
  selectedTableId,
  canvasWidth = 2400,
  canvasHeight = 1600,
  selectedSectionId,
  onSectionChange,
  statusFilter = 'all',
  onSectionsRefresh,
  reservationPolicy = DEFAULT_RESERVATION_POLICY,
}: FloorPlanCanvasProps) {
  // ── View state ──
  const [scale, setScale] = useState(0.85);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // ── Mode state ──
  const [isEditMode, setIsEditMode] = useState(false);
  const [isPlayground, setIsPlayground] = useState(false);

  // ── Pending position edits (existing tables moved) ──
  const [pendingUpdates, setPendingUpdates] = useState<Map<string, TablePositionUpdate>>(new Map());
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // ── Draft tables (created via playground, not yet persisted) ──
  const [draftTables, setDraftTables] = useState<DraftTable[]>([]);

  // ── Staged deletions (existing tables to delete on save) ──
  const [stagedDeletions, setStagedDeletions] = useState<Set<string>>(new Set());

  // ── Pending property edits for existing tables (capacity, shape, name, etc.) ──
  const [pendingEdits, setPendingEdits] = useState<Map<string, TablePropertyEdits>>(new Map());

  // ── Multi-select ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const selectionStart = useRef<{ x: number; y: number } | null>(null);

  // ── Grid ──
  const [snapToGrid, setSnapToGrid] = useState(20);
  const [showAlignTools, setShowAlignTools] = useState(false);

  // ── Grab (pan) mode toggle ──
  const [isGrabMode, setIsGrabMode] = useState(false);

  // ── Alignment guides ──
  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);

  // ── Distance markers (pixel-gap labels) ──
  const [activeDistanceMarkers, setActiveDistanceMarkers] = useState<DistanceMarker[]>([]);

  // ── Zone metadata (background textures) ──
  const [zoneMetadata, setZoneMetadata] = useState<Record<string, ZoneMetadata>>({});

  // ── Container dimensions (for mini-map) ──
  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });

  // ── Refs ──
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // ── Precision drag state (Figma-like pointer-based drag) ──
  const [draggingTableId, setDraggingTableId] = useState<string | null>(null);
  const dragRef = useRef<{
    tableId: string;
    startTableX: number;
    startTableY: number;
    startClientX: number;
    startClientY: number;
    isDraft: boolean;
    isMultiDrag: boolean;
    hasMoved: boolean;
    otherStarts: Map<string, { x: number; y: number; isDraft: boolean }>;
  } | null>(null);

  // ── Undo/Redo ──
  const { pushSnapshot, undo: undoAction, redo: redoAction, clearHistory, canUndo, canRedo } = useUndoRedo();

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered tables
  // ─────────────────────────────────────────────────────────────────────────

  const filteredTables = useMemo(() => {
    const now = new Date();
    return tables.filter((t) => {
      if (stagedDeletions.has(t._id)) return false;
      if (selectedSectionId && t.sectionId?.toString() !== selectedSectionId) return false;
      // Filter on the derived status: a table booked for later is still
      // "available" until its hold window opens, and should list as such.
      if (
        statusFilter !== 'all' &&
        getEffectiveTableStatus(t, now, reservationPolicy) !== statusFilter
      ) {
        return false;
      }
      return true;
    });
  }, [tables, selectedSectionId, statusFilter, stagedDeletions, reservationPolicy]);

  // ── Auto-select the first zone on initial load ──
  useEffect(() => {
    if (sections.length > 0 && !selectedSectionId && onSectionChange) {
      onSectionChange(sections[0]._id);
    }
  }, [sections]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Ref mirrors for global drag listeners (always reflect latest state) ──
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const snapToGridRef = useRef(snapToGrid);
  snapToGridRef.current = snapToGrid;
  const filteredTablesRef = useRef(filteredTables);
  filteredTablesRef.current = filteredTables;
  const draftTablesRef = useRef(draftTables);
  draftTablesRef.current = draftTables;
  const pendingUpdatesRef = useRef(pendingUpdates);
  pendingUpdatesRef.current = pendingUpdates;
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const tablesRef = useRef(tables);
  tablesRef.current = tables;
  const stagedDeletionsRef = useRef(stagedDeletions);
  stagedDeletionsRef.current = stagedDeletions;

  // ─────────────────────────────────────────────────────────────────────────
  // Container size tracking (for mini-map viewport)
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Snapshot helpers (for undo/redo)
  // ─────────────────────────────────────────────────────────────────────────

  const getCurrentSnapshot = useCallback((): CanvasSnapshot => ({
    pendingUpdates: Object.fromEntries(pendingUpdates),
    pendingEdits: Object.fromEntries(
      Array.from(pendingEdits.entries()).map(([k, v]) => [k, { ...v }]),
    ),
    draftTables: draftTables.map((d) => ({ ...d })),
    stagedDeletions: Array.from(stagedDeletions),
  }), [pendingUpdates, pendingEdits, draftTables, stagedDeletions]);

  const restoreSnapshot = useCallback((snap: CanvasSnapshot) => {
    setPendingUpdates(new Map(Object.entries(snap.pendingUpdates)));
    setPendingEdits(
      new Map(Object.entries(snap.pendingEdits ?? {}).map(([k, v]) => [k, { ...v }])),
    );
    setDraftTables(snap.draftTables.map((d) => ({ ...d })));
    setStagedDeletions(new Set(snap.stagedDeletions ?? []));
  }, []);

  const pushUndoSnapshot = useCallback(() => {
    pushSnapshot(getCurrentSnapshot());
  }, [pushSnapshot, getCurrentSnapshot]);

  const pushUndoSnapshotRef = useRef(pushUndoSnapshot);
  pushUndoSnapshotRef.current = pushUndoSnapshot;

  // ─────────────────────────────────────────────────────────────────────────
  // Hotkey actions
  // ─────────────────────────────────────────────────────────────────────────

  const hotkeyRotateSelected = useCallback((degrees = 45) => {
    pushUndoSnapshot();
    setDraftTables((prev) =>
      prev.map((d) =>
        selectedIds.has(d._draftId)
          ? { ...d, orientation: (d.orientation + degrees) % 360 }
          : d,
      ),
    );
    // For existing tables, we store in pending updates (orientation field)
    setPendingUpdates((prev) => {
      const m = new Map(prev);
      for (const id of selectedIds) {
        const existing = tables.find((t) => t._id === id);
        if (existing) {
          const current = m.get(id);
          m.set(id, {
            tableId: id,
            x_position: current?.x_position ?? existing.x_position,
            y_position: current?.y_position ?? existing.y_position,
            orientation: ((current?.orientation ?? existing.orientation) + degrees) % 360,
          });
        }
      }
      return m;
    });
  }, [selectedIds, tables, pushUndoSnapshot]);

  const hotkeyNudge = useCallback((dx: number, dy: number) => {
    pushUndoSnapshot();
    // Nudge draft tables
    setDraftTables((prev) =>
      prev.map((d) =>
        selectedIds.has(d._draftId)
          ? { ...d, x_position: d.x_position + dx, y_position: d.y_position + dy }
          : d,
      ),
    );
    // Nudge existing tables
    setPendingUpdates((prev) => {
      const m = new Map(prev);
      for (const id of selectedIds) {
        const existing = tables.find((t) => t._id === id);
        if (existing) {
          const current = m.get(id);
          m.set(id, {
            tableId: id,
            x_position: (current?.x_position ?? existing.x_position) + dx,
            y_position: (current?.y_position ?? existing.y_position) + dy,
          });
        }
      }
      return m;
    });
  }, [selectedIds, tables, pushUndoSnapshot]);

  const hotkeySelectAll = useCallback(() => {
    const allIds = new Set<string>();
    filteredTables.forEach((t) => allIds.add(t._id));
    draftTables.forEach((d) => allIds.add(d._draftId));
    setSelectedIds(allIds);
  }, [filteredTables, draftTables]);

  // ─────────────────────────────────────────────────────────────────────────
  // Grouping — assign a shared groupId to all selected tables
  // ─────────────────────────────────────────────────────────────────────────

  const handleGroupSelected = useCallback(() => {
    if (selectedIds.size < 2) return;
    pushUndoSnapshot();
    const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setDraftTables((prev) =>
      prev.map((d) =>
        selectedIds.has(d._draftId) ? { ...d, groupId } : d,
      ),
    );
    // Mark existing tables for grouping via pending (will be persisted on save)
    setPendingUpdates((prev) => {
      const m = new Map(prev);
      for (const id of selectedIds) {
        const existing = tables.find((t) => t._id === id);
        if (existing) {
          const current = m.get(id);
          m.set(id, {
            ...current,
            tableId: id,
            x_position: current?.x_position ?? existing.x_position,
            y_position: current?.y_position ?? existing.y_position,
          });
        }
      }
      return m;
    });
  }, [selectedIds, tables, pushUndoSnapshot]);

  const handleUngroupSelected = useCallback(() => {
    pushUndoSnapshot();
    setDraftTables((prev) =>
      prev.map((d) =>
        selectedIds.has(d._draftId) ? { ...d, groupId: undefined } : d,
      ),
    );
  }, [selectedIds, pushUndoSnapshot]);

  // ─────────────────────────────────────────────────────────────────────────
  // Distribution & Tidy Up
  // ─────────────────────────────────────────────────────────────────────────

  const getSelectedRects = useCallback((): TableRect[] => {
    const allTables = [...filteredTables, ...(draftTables as any[])] as any[];
    return allTables
      .filter((t) => selectedIds.has(t._draftId ?? t._id))
      .map((t) => {
        const id = t._draftId ?? t._id;
        const pending = pendingUpdates.get(id);
        return {
          id,
          x: pending?.x_position ?? t.x_position,
          y: pending?.y_position ?? t.y_position,
          w: t.width,
          h: t.height,
        };
      });
  }, [filteredTables, draftTables, selectedIds, pendingUpdates]);

  const applyPositionUpdates = useCallback((updates: { id: string; x?: number; y?: number }[]) => {
    pushUndoSnapshot();
    for (const u of updates) {
      const isDraft = draftTables.some((d) => d._draftId === u.id);
      if (isDraft) {
        setDraftTables((prev) =>
          prev.map((d) =>
            d._draftId === u.id
              ? { ...d, ...(u.x !== undefined && { x_position: u.x }), ...(u.y !== undefined && { y_position: u.y }) }
              : d,
          ),
        );
      } else {
        setPendingUpdates((prev) => {
          const m = new Map(prev);
          const existing = tables.find((t) => t._id === u.id);
          if (existing) {
            const current = m.get(u.id);
            m.set(u.id, {
              tableId: u.id,
              x_position: u.x ?? current?.x_position ?? existing.x_position,
              y_position: u.y ?? current?.y_position ?? existing.y_position,
            });
          }
          return m;
        });
      }
    }
  }, [draftTables, tables, pushUndoSnapshot]);

  const handleDistributeH = useCallback(() => {
    const rects = getSelectedRects();
    const results = distributeHorizontally(rects);
    applyPositionUpdates(results);
  }, [getSelectedRects, applyPositionUpdates]);

  const handleDistributeV = useCallback(() => {
    const rects = getSelectedRects();
    const results = distributeVertically(rects);
    applyPositionUpdates(results);
  }, [getSelectedRects, applyPositionUpdates]);

  const handleTidyUp = useCallback(() => {
    const rects = getSelectedRects();
    const results = tidyUp(rects, snapToGrid || 20);
    applyPositionUpdates(results);
  }, [getSelectedRects, applyPositionUpdates, snapToGrid]);

  const handleArrangeRow = useCallback(() => {
    const rects = getSelectedRects();
    const results = arrangeInRow(rects, snapToGrid || 20);
    applyPositionUpdates(results);
  }, [getSelectedRects, applyPositionUpdates, snapToGrid]);

  const handleArrangeColumn = useCallback(() => {
    const rects = getSelectedRects();
    const results = arrangeInColumn(rects, snapToGrid || 20);
    applyPositionUpdates(results);
  }, [getSelectedRects, applyPositionUpdates, snapToGrid]);

  const handleSmartOrganize = useCallback(() => {
    const rects = getSelectedRects();
    const results = smartOrganize(rects, snapToGrid || 20);
    applyPositionUpdates(results);
  }, [getSelectedRects, applyPositionUpdates, snapToGrid]);

  const handleUndo = useCallback(() => {
    const snap = undoAction(getCurrentSnapshot());
    if (snap) restoreSnapshot(snap);
  }, [undoAction, getCurrentSnapshot, restoreSnapshot]);

  const handleRedo = useCallback(() => {
    const snap = redoAction(getCurrentSnapshot());
    if (snap) restoreSnapshot(snap);
  }, [redoAction, getCurrentSnapshot, restoreSnapshot]);

  // ── Forward refs for hotkey actions defined later ──
  const deleteSelectedRef = useRef<() => void>(() => {});
  const duplicateSelectedRef = useRef<() => void>(() => {});

  // Register hotkeys
  useHotkeys({
    enabled: isEditMode || isPlayground,
    actions: {
      toggleGrabMode: () => setIsGrabMode((prev) => !prev),
      rotateSelected: hotkeyRotateSelected,
      deleteSelected: () => deleteSelectedRef.current(),
      selectAll: hotkeySelectAll,
      undo: handleUndo,
      redo: handleRedo,
      nudgeSelected: hotkeyNudge,
      deselectAll: () => setSelectedIds(new Set()),
      groupSelected: handleGroupSelected,
      ungroupSelected: handleUngroupSelected,
      duplicateSelected: () => duplicateSelectedRef.current(),
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Zoom / Pan
  // ─────────────────────────────────────────────────────────────────────────

  const handleZoom = useCallback((delta: number) => {
    setScale((prev) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta)));
  }, []);

  const handleResetView = useCallback(() => {
    setScale(0.85);
    setPosition({ x: 0, y: 0 });
  }, []);

  // Native wheel handler (needs passive: false for ctrl+scroll)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        handleZoom(e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [handleZoom]);

  // Touch handling with passive: false
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !isEditMode) return;
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length === 1) e.preventDefault();
    };
    el.addEventListener('touchmove', onTouch, { passive: false });
    return () => el.removeEventListener('touchmove', onTouch);
  }, [isEditMode]);

  // Pan (middle-click or alt+click or grab mode)
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Skip if table drag is active (handled by global pointer listeners)
      if (dragRef.current) return;

      // Middle-click or Alt+click or Grab mode → pan
      if (e.button === 1 || (e.button === 0 && e.altKey) || (e.button === 0 && isGrabMode)) {
        e.preventDefault();
        setIsDragging(true);
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        return;
      }

      // Shift+click on canvas background → start selection rectangle
      if (isEditMode && e.button === 0 && e.shiftKey) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = (e.clientX - rect.left - position.x) / scale;
        const cy = (e.clientY - rect.top - position.y) / scale;
        selectionStart.current = { x: cx, y: cy };
        setIsSelecting(true);
        setSelectionRect({ x: cx, y: cy, w: 0, h: 0 });
        return;
      }

      // Plain left-click on canvas background → deselect all
      if (isEditMode && e.button === 0 && !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        setSelectedIds(new Set());
      }
    },
    [isEditMode, isGrabMode, position, scale],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragRef.current) return; // Table drag handled by global listeners

      if (isDragging) {
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        setPosition((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        return;
      }

      if (isSelecting && selectionStart.current) {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = (e.clientX - rect.left - position.x) / scale;
        const cy = (e.clientY - rect.top - position.y) / scale;
        const sx = selectionStart.current.x;
        const sy = selectionStart.current.y;
        setSelectionRect({
          x: Math.min(sx, cx),
          y: Math.min(sy, cy),
          w: Math.abs(cx - sx),
          h: Math.abs(cy - sy),
        });
      }
    },
    [isDragging, isSelecting, position, scale],
  );

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) return; // Table drag handled by global listeners

    setIsDragging(false);

    if (isSelecting && selectionRect) {
      // Determine which tables fall inside the selection rect
      const allTables = [...filteredTables, ...draftTables] as any[];
      const newSelection = new Set<string>();
      for (const t of allTables) {
        const id = t._draftId ?? t._id;
        const tx = (pendingUpdates.get(id)?.x_position ?? t.x_position);
        const ty = (pendingUpdates.get(id)?.y_position ?? t.y_position);
        if (
          tx + t.width > selectionRect.x &&
          tx < selectionRect.x + selectionRect.w &&
          ty + t.height > selectionRect.y &&
          ty < selectionRect.y + selectionRect.h
        ) {
          newSelection.add(id);
        }
      }
      setSelectedIds(newSelection);
      setIsSelecting(false);
      setSelectionRect(null);
      selectionStart.current = null;
    }
  }, [isSelecting, selectionRect, filteredTables, draftTables, pendingUpdates]);

  // ─────────────────────────────────────────────────────────────────────────
  // Quick-add table on double-click (edit/playground mode only)
  // ─────────────────────────────────────────────────────────────────────────

  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isEditMode && !isPlayground) return;
      if (e.button !== 0) return;
      // Only if clicking on canvas background, not on a table
      if ((e.target as HTMLElement).closest('[data-table-visual]')) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const canvasX = (e.clientX - rect.left - position.x) / scale;
      const canvasY = (e.clientY - rect.top - position.y) / scale;

      // Snap to grid if active
      const snapX = snapToGrid > 0 ? Math.round(canvasX / snapToGrid) * snapToGrid : canvasX;
      const snapY = snapToGrid > 0 ? Math.round(canvasY / snapToGrid) * snapToGrid : canvasY;

      // Determine index for next table number
      const nextIdx = tables.length + draftTables.length + 1;

      // Look up section info for current zone
      const sec = selectedSectionId
        ? sections.find((s) => s._id === selectedSectionId)
        : undefined;

      pushUndoSnapshot();
      const draft = createSingleDraft({
        x: snapX - 50, // Center on click
        y: snapY - 50,
        index: nextIdx,
        sectionId: selectedSectionId,
        sectionName: sec?.name,
      });
      setDraftTables((prev) => [...prev, draft]);
      setSelectedIds(new Set([draft._draftId]));
    },
    [isEditMode, isPlayground, position, scale, snapToGrid, tables.length, draftTables.length, selectedSectionId, sections, pushUndoSnapshot],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Table drag start — pointer-based precision drag (replaces framer-motion)
  // Converts screen-pixel deltas to canvas-space via proper scale division.
  // Global pointermove/pointerup listeners handle movement + drop.
  // ─────────────────────────────────────────────────────────────────────────

  const handleTableDragStart = useCallback(
    (tableId: string, e: React.PointerEvent) => {
      // Resolve current table position
      const isDraftTable = draftTables.some((d) => d._draftId === tableId);
      let startX: number, startY: number;

      if (isDraftTable) {
        const d = draftTables.find((d) => d._draftId === tableId)!;
        startX = d.x_position;
        startY = d.y_position;
      } else {
        const t = tables.find((t) => t._id === tableId);
        const pending = pendingUpdates.get(tableId);
        startX = pending?.x_position ?? t!.x_position;
        startY = pending?.y_position ?? t!.y_position;
      }

      // Multi-drag: if this table belongs to a selection, drag all together
      const isMultiDrag = selectedIds.has(tableId) && selectedIds.size > 1;
      const otherStarts = new Map<string, { x: number; y: number; isDraft: boolean }>();

      if (isMultiDrag) {
        for (const id of selectedIds) {
          if (id === tableId) continue;
          const isOtherDraft = draftTables.some((d) => d._draftId === id);
          if (isOtherDraft) {
            const d = draftTables.find((d) => d._draftId === id)!;
            otherStarts.set(id, { x: d.x_position, y: d.y_position, isDraft: true });
          } else {
            const t = tables.find((t) => t._id === id);
            const p = pendingUpdates.get(id);
            if (t) {
              otherStarts.set(id, {
                x: p?.x_position ?? t.x_position,
                y: p?.y_position ?? t.y_position,
                isDraft: false,
              });
            }
          }
        }
      }

      dragRef.current = {
        tableId,
        startTableX: startX,
        startTableY: startY,
        startClientX: e.clientX,
        startClientY: e.clientY,
        isDraft: isDraftTable,
        isMultiDrag,
        hasMoved: false,
        otherStarts,
      };

      setDraggingTableId(tableId);
    },
    [draftTables, tables, pendingUpdates, selectedIds],
  );

  // ── Global pointer listeners for precision drag ──
  useEffect(() => {
    if (!draggingTableId) return;

    const CLICK_THRESHOLD = 3;

    const handlePointerMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const dx = e.clientX - drag.startClientX;
      const dy = e.clientY - drag.startClientY;

      // Distinguish click from drag (< 3px → click, ≥ 3px → drag)
      if (!drag.hasMoved) {
        if (Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD) return;
        drag.hasMoved = true;
        // Push undo snapshot before first move (captures pre-drag state)
        pushUndoSnapshotRef.current();
      }

      // Screen → canvas coordinate conversion (divide by scale)
      const s = scaleRef.current;
      const canvasDx = dx / s;
      const canvasDy = dy / s;

      // Proposed primary table position
      let proposedX = drag.startTableX + canvasDx;
      let proposedY = drag.startTableY + canvasDy;

      // Grid snap (coarse)
      const grid = snapToGridRef.current;
      if (grid > 0) {
        proposedX = Math.round(proposedX / grid) * grid;
        proposedY = Math.round(proposedY / grid) * grid;
      }

      // Build "others" array for alignment guides (exclude dragged tables)
      const allCanvasTables = [...filteredTablesRef.current, ...(draftTablesRef.current as any[])];
      const selIds = selectedIdsRef.current;
      const others: TableRect[] = [];
      for (const t of allCanvasTables) {
        const id = (t as any)._draftId ?? t._id;
        if (selIds.has(id) || id === drag.tableId) continue;
        const pending = pendingUpdatesRef.current.get(id);
        others.push({
          id,
          x: pending?.x_position ?? t.x_position,
          y: pending?.y_position ?? t.y_position,
          w: t.width,
          h: t.height,
        });
      }

      // Primary table dimensions
      const primaryTable = allCanvasTables.find(
        (t) => ((t as any)._draftId ?? t._id) === drag.tableId,
      );
      const tableW = primaryTable?.width ?? 100;
      const tableH = primaryTable?.height ?? 100;

      // Smart alignment guide snap (overrides grid within threshold)
      const snapResult = computeAlignmentGuides(
        drag.tableId, proposedX, proposedY, tableW, tableH, others,
      );
      const finalX = snapResult.x;
      const finalY = snapResult.y;

      // Render guide lines + distance markers in real-time
      setActiveGuides(snapResult.guides);
      setActiveDistanceMarkers(snapResult.distanceMarkers);

      // Snapped delta from original start position
      const snapDeltaX = finalX - drag.startTableX;
      const snapDeltaY = finalY - drag.startTableY;

      // Update primary table position
      if (drag.isDraft) {
        setDraftTables((prev) =>
          prev.map((d) =>
            d._draftId === drag.tableId
              ? { ...d, x_position: finalX, y_position: finalY }
              : d,
          ),
        );
      } else {
        setPendingUpdates((prev) => {
          const m = new Map(prev);
          const cur = prev.get(drag.tableId);
          m.set(drag.tableId, { ...cur, tableId: drag.tableId, x_position: finalX, y_position: finalY });
          return m;
        });
      }

      // Move all other selected tables by the same snapped delta
      if (drag.isMultiDrag) {
        setDraftTables((prev) =>
          prev.map((d) => {
            const start = drag.otherStarts.get(d._draftId);
            if (!start || !start.isDraft) return d;
            return { ...d, x_position: start.x + snapDeltaX, y_position: start.y + snapDeltaY };
          }),
        );
        setPendingUpdates((prev) => {
          const m = new Map(prev);
          for (const [id, start] of drag.otherStarts) {
            if (start.isDraft) continue;
            const cur = prev.get(id);
            m.set(id, { ...cur, tableId: id, x_position: start.x + snapDeltaX, y_position: start.y + snapDeltaY });
          }
          return m;
        });
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) {
        setDraggingTableId(null);
        return;
      }

      if (!drag.hasMoved) {
        // Treat as click → toggle selection in edit mode
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(drag.tableId)) next.delete(drag.tableId);
            else next.add(drag.tableId);
            return next;
          });
        } else {
          setSelectedIds(new Set([drag.tableId]));
        }
      }

      // Clear visual guides
      setActiveGuides([]);
      setActiveDistanceMarkers([]);

      dragRef.current = null;
      setDraggingTableId(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draggingTableId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Save Layout (bulk upsert)
  // ─────────────────────────────────────────────────────────────────────────

  const handleSaveLayout = useCallback(async () => {
    setIsSaving(true);
    try {
      // 1. Delete staged tables
      if (stagedDeletions.size > 0 && onTableDelete) {
        for (const id of stagedDeletions) {
          await onTableDelete(id);
        }
      }

      // 2. Save position-only updates for existing tables (those NOT in pendingEdits)
      // Tables that have property edits go through bulk upsert instead to save everything at once
      if (pendingUpdates.size > 0 && onTablesUpdate) {
        const posOnly = Array.from(pendingUpdates.values()).filter(
          (pu) => !pendingEdits.has(pu.tableId),
        );
        if (posOnly.length > 0) {
          await onTablesUpdate(posOnly);
        }
      }

      // 2.5: Save property edits for existing tables via bulk upsert (includes position if moved)
      if (pendingEdits.size > 0 && onBulkUpsert) {
        const editItems: BulkUpsertTableItem[] = [];
        for (const [id, edits] of pendingEdits) {
          const existing = tables.find((t) => t._id === id);
          if (!existing) continue;
          const pos = pendingUpdates.get(id);
          editItems.push({
            _id: id,
            tableNumber: edits.tableNumber ?? existing.tableNumber,
            name: edits.name ?? existing.name,
            sectionId: edits.sectionId ?? existing.sectionId,
            sectionName: edits.sectionName ?? existing.sectionName,
            x_position: pos?.x_position ?? existing.x_position,
            y_position: pos?.y_position ?? existing.y_position,
            width: edits.width ?? pos?.width ?? existing.width,
            height: edits.height ?? pos?.height ?? existing.height,
            orientation: edits.orientation ?? pos?.orientation ?? existing.orientation,
            shape: edits.shape ?? existing.shape,
            capacity: edits.capacity ?? existing.capacity,
            minCovers: existing.minCovers,
            color: edits.color ?? existing.color,
            groupId: existing.groupId,
            isActive: existing.isActive,
          });
        }
        if (editItems.length > 0) {
          await onBulkUpsert(editItems);
        }
      }

      // 3. Persist draft tables via bulk upsert
      if (draftTables.length > 0 && onBulkUpsert) {
        const items: BulkUpsertTableItem[] = draftTables.map((d) => ({
          tableNumber: d.tableNumber,
          sectionId: d.sectionId,
          sectionName: d.sectionName,
          x_position: d.x_position,
          y_position: d.y_position,
          width: d.width,
          height: d.height,
          orientation: d.orientation,
          shape: d.shape,
          capacity: d.capacity,
          minCovers: d.minCovers,
          color: d.color,
          groupId: d.groupId,
          isActive: true,
        }));
        await onBulkUpsert(items);
      }

      // Clear state
      setPendingUpdates(new Map());
      setPendingEdits(new Map());
      setDraftTables([]);
      setStagedDeletions(new Set());
      setSelectedIds(new Set());
      setIsEditMode(false);
      setIsPlayground(false);
      clearHistory();

      // Show success toast
      const msgs: string[] = [];
      if (stagedDeletions.size > 0) msgs.push(`${stagedDeletions.size} deleted`);
      const movedOrEdited = new Set([...pendingUpdates.keys(), ...pendingEdits.keys()]).size;
      if (movedOrEdited > 0) msgs.push(`${movedOrEdited} updated`);
      if (draftTables.length > 0) msgs.push(`${draftTables.length} created`);
      setSaveToast(`Layout saved — ${msgs.join(', ') || 'no changes'}`);
      setTimeout(() => setSaveToast(null), 3000);
    } catch (err) {
      console.error('Save layout failed:', err);
      setSaveToast('Save failed — please try again');
      setTimeout(() => setSaveToast(null), 3000);
    } finally {
      setIsSaving(false);
    }
  }, [pendingUpdates, pendingEdits, draftTables, stagedDeletions, tables, onTablesUpdate, onBulkUpsert, onTableDelete]);

  // ─────────────────────────────────────────────────────────────────────────
  // Cancel
  // ─────────────────────────────────────────────────────────────────────────

  const handleCancel = useCallback(() => {
    setPendingUpdates(new Map());
    setPendingEdits(new Map());
    setDraftTables([]);
    setStagedDeletions(new Set());
    setSelectedIds(new Set());
    setIsEditMode(false);
    setIsPlayground(false);
    clearHistory();
  }, [clearHistory]);

  // ─────────────────────────────────────────────────────────────────────────
  // Alignment helpers
  // ─────────────────────────────────────────────────────────────────────────

  const alignTables = useCallback(
    (alignment: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v') => {
      if (selectedIds.size < 2) return;

      const allTables = [...filteredTables, ...(draftTables as any[])] as any[];
      const targets = allTables.filter((t) => selectedIds.has(t._draftId ?? t._id));
      if (targets.length < 2) return;

      const positions = targets.map((t) => {
        const id = t._draftId ?? t._id;
        const pending = pendingUpdates.get(id);
        return { id, x: pending?.x_position ?? t.x_position, y: pending?.y_position ?? t.y_position, w: t.width, h: t.height, isDraft: !!t._draftId };
      });

      const applyUpdate = (id: string, x: number, y: number, isDraft: boolean) => {
        if (isDraft) {
          setDraftTables((prev) => prev.map((d) => (d._draftId === id ? { ...d, x_position: x, y_position: y } : d)));
        } else {
          setPendingUpdates((prev) => {
            const m = new Map(prev);
            m.set(id, { tableId: id, x_position: x, y_position: y });
            return m;
          });
        }
      };

      switch (alignment) {
        case 'left': {
          const minX = Math.min(...positions.map((p) => p.x));
          positions.forEach((p) => applyUpdate(p.id, minX, p.y, p.isDraft));
          break;
        }
        case 'right': {
          const maxRight = Math.max(...positions.map((p) => p.x + p.w));
          positions.forEach((p) => applyUpdate(p.id, maxRight - p.w, p.y, p.isDraft));
          break;
        }
        case 'top': {
          const minY = Math.min(...positions.map((p) => p.y));
          positions.forEach((p) => applyUpdate(p.id, p.x, minY, p.isDraft));
          break;
        }
        case 'bottom': {
          const maxBottom = Math.max(...positions.map((p) => p.y + p.h));
          positions.forEach((p) => applyUpdate(p.id, p.x, maxBottom - p.h, p.isDraft));
          break;
        }
        case 'center-h': {
          const avg = positions.reduce((s, p) => s + p.x + p.w / 2, 0) / positions.length;
          positions.forEach((p) => applyUpdate(p.id, avg - p.w / 2, p.y, p.isDraft));
          break;
        }
        case 'center-v': {
          const avg = positions.reduce((s, p) => s + p.y + p.h / 2, 0) / positions.length;
          positions.forEach((p) => applyUpdate(p.id, p.x, avg - p.h / 2, p.isDraft));
          break;
        }
      }
    },
    [selectedIds, filteredTables, draftTables, pendingUpdates],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Delete selected (drafts + existing tables)
  // ─────────────────────────────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    pushUndoSnapshot();

    // Remove selected drafts
    setDraftTables((prev) => prev.filter((d) => !selectedIds.has(d._draftId)));

    // Stage selected existing tables for deletion on save
    const existingToDelete: string[] = [];
    for (const id of selectedIds) {
      if (tables.some((t) => t._id === id)) {
        existingToDelete.push(id);
      }
    }
    if (existingToDelete.length > 0) {
      setStagedDeletions((prev) => {
        const next = new Set(prev);
        existingToDelete.forEach((id) => next.add(id));
        return next;
      });
      // Remove any pending updates / edits for deleted tables
      setPendingUpdates((prev) => {
        const m = new Map(prev);
        existingToDelete.forEach((id) => m.delete(id));
        return m;
      });
      setPendingEdits((prev) => {
        const m = new Map(prev);
        existingToDelete.forEach((id) => m.delete(id));
        return m;
      });
    }

    setSelectedIds(new Set());
  }, [selectedIds, tables, pushUndoSnapshot]);

  // ─────────────────────────────────────────────────────────────────────────
  // Duplicate selected → creates draft copies offset +40, +40
  // ─────────────────────────────────────────────────────────────────────────

  const duplicateSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    pushUndoSnapshot();

    const allTables = [...filteredTables, ...(draftTables as any[])] as any[];
    const newDrafts: DraftTable[] = [];
    const newIds = new Set<string>();

    for (const t of allTables) {
      const id = t._draftId ?? t._id;
      if (!selectedIds.has(id)) continue;

      const pending = pendingUpdates.get(id);
      const draftId = `dup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      newDrafts.push({
        _draftId: draftId,
        _isNew: true,
        tableNumber: `${t.tableNumber}_copy`,
        sectionId: t.sectionId,
        sectionName: t.sectionName,
        x_position: (pending?.x_position ?? t.x_position) + 40,
        y_position: (pending?.y_position ?? t.y_position) + 40,
        width: t.width,
        height: t.height,
        orientation: pending?.orientation ?? t.orientation,
        shape: t.shape,
        capacity: t.capacity,
        minCovers: t.minCovers,
        status: 'available' as const,
        isActive: true,
        color: t.color,
      } as DraftTable);

      newIds.add(draftId);
    }

    setDraftTables((prev) => [...prev, ...newDrafts]);
    // Auto-select the duplicated tables
    setSelectedIds(newIds);
  }, [selectedIds, filteredTables, draftTables, pendingUpdates, pushUndoSnapshot]);

  // Keep hotkey forward-refs in sync
  deleteSelectedRef.current = deleteSelected;
  duplicateSelectedRef.current = duplicateSelected;

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /** Merge position updates + property edits onto an existing table for rendering */
  const getTableWithEdits = useCallback(
    (table: ITable): ITable => {
      const pos = pendingUpdates.get(table._id);
      const edits = pendingEdits.get(table._id);
      if (!pos && !edits) return table;
      return {
        ...table,
        ...(pos && {
          x_position: pos.x_position,
          y_position: pos.y_position,
          ...(pos.orientation !== undefined && { orientation: pos.orientation }),
          ...(pos.width !== undefined && { width: pos.width }),
          ...(pos.height !== undefined && { height: pos.height }),
        }),
        ...(edits && {
          ...(edits.tableNumber !== undefined && { tableNumber: edits.tableNumber }),
          ...(edits.name !== undefined && { name: edits.name }),
          ...(edits.capacity !== undefined && { capacity: edits.capacity }),
          ...(edits.shape !== undefined && { shape: edits.shape }),
          ...(edits.orientation !== undefined && { orientation: edits.orientation }),
          ...(edits.width !== undefined && { width: edits.width }),
          ...(edits.height !== undefined && { height: edits.height }),
          ...(edits.sectionId !== undefined && { sectionId: edits.sectionId }),
          ...(edits.sectionName !== undefined && { sectionName: edits.sectionName }),
          ...(edits.color !== undefined && { color: edits.color }),
        }),
      };
    },
    [pendingUpdates, pendingEdits],
  );

  const cycleGridSize = useCallback(() => {
    const idx = GRID_SIZES.indexOf(snapToGrid);
    setSnapToGrid(GRID_SIZES[(idx + 1) % GRID_SIZES.length]);
  }, [snapToGrid]);

  const totalChanges = new Set([...pendingUpdates.keys(), ...pendingEdits.keys()]).size + draftTables.length + stagedDeletions.size;

  // ─────────────────────────────────────────────────────────────────────────
  // Playground callbacks
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateZone = useCallback(
    async (name: string, color: string, floor: number) => {
      if (onCreateZone) {
        await onCreateZone(name, color, floor);
        onSectionsRefresh?.();
      }
    },
    [onCreateZone, onSectionsRefresh],
  );

  const handleGenerateTables = useCallback((drafts: DraftTable[]) => {
    setDraftTables((prev) => [...prev, ...drafts]);
  }, []);

  const handleAddSingleDraft = useCallback((draft: DraftTable) => {
    setDraftTables((prev) => [...prev, draft]);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Batch Update (Global Inspector)
  // ─────────────────────────────────────────────────────────────────────────

  const handleBatchUpdate = useCallback(
    (updates: {
      capacity?: number;
      shape?: TableShape;
      orientation?: number;
      width?: number;
      height?: number;
      sectionId?: string;
      sectionName?: string;
    }) => {
      pushUndoSnapshot();

      // Update draft tables
      setDraftTables((prev) =>
        prev.map((d) => {
          if (!selectedIds.has(d._draftId)) return d;
          return {
            ...d,
            ...(updates.capacity !== undefined && { capacity: updates.capacity }),
            ...(updates.shape !== undefined && { shape: updates.shape }),
            ...(updates.orientation !== undefined && { orientation: updates.orientation }),
            ...(updates.width !== undefined && { width: updates.width }),
            ...(updates.height !== undefined && { height: updates.height }),
            ...(updates.sectionId !== undefined && { sectionId: updates.sectionId }),
            ...(updates.sectionName !== undefined && { sectionName: updates.sectionName }),
          };
        }),
      );

      // For existing tables, store extended pending updates
      // (The save pipeline will need to handle these extra fields)
      setPendingUpdates((prev) => {
        const m = new Map(prev);
        for (const id of selectedIds) {
          const existing = tables.find((t) => t._id === id);
          if (existing) {
            const current = m.get(id);
            m.set(id, {
              tableId: id,
              x_position: current?.x_position ?? existing.x_position,
              y_position: current?.y_position ?? existing.y_position,
              ...(updates.orientation !== undefined && { orientation: updates.orientation }),
              ...(updates.width !== undefined && { width: updates.width }),
              ...(updates.height !== undefined && { height: updates.height }),
            });
          }
        }
        return m;
      });
    },
    [selectedIds, tables, pushUndoSnapshot],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Single-table edit (from popover)
  // ─────────────────────────────────────────────────────────────────────────

  const handleSingleTableUpdate = useCallback(
    (tableId: string, updates: {
      tableNumber?: string;
      name?: string;
      capacity?: number;
      shape?: TableShape;
      orientation?: number;
      width?: number;
      height?: number;
      sectionId?: string;
      sectionName?: string;
      color?: string;
    }) => {
      pushUndoSnapshot();

      const isDraftTable = draftTables.some((d) => d._draftId === tableId);

      if (isDraftTable) {
        setDraftTables((prev) =>
          prev.map((d) => {
            if (d._draftId !== tableId) return d;
            return {
              ...d,
              ...(updates.tableNumber !== undefined && { tableNumber: updates.tableNumber }),
              ...(updates.name !== undefined && { name: updates.name }),
              ...(updates.capacity !== undefined && { capacity: updates.capacity }),
              ...(updates.shape !== undefined && { shape: updates.shape }),
              ...(updates.orientation !== undefined && { orientation: updates.orientation }),
              ...(updates.width !== undefined && { width: updates.width }),
              ...(updates.height !== undefined && { height: updates.height }),
              ...(updates.sectionId !== undefined && { sectionId: updates.sectionId }),
              ...(updates.sectionName !== undefined && { sectionName: updates.sectionName }),
              ...(updates.color !== undefined && { color: updates.color }),
            };
          }),
        );
      } else {
        const existing = tables.find((t) => t._id === tableId);
        if (existing) {
          // Store position-related changes in pendingUpdates (for drag compat)
          if (updates.orientation !== undefined || updates.width !== undefined || updates.height !== undefined) {
            setPendingUpdates((prev) => {
              const m = new Map(prev);
              const current = m.get(tableId);
              m.set(tableId, {
                tableId,
                x_position: current?.x_position ?? existing.x_position,
                y_position: current?.y_position ?? existing.y_position,
                ...(updates.orientation !== undefined && { orientation: updates.orientation }),
                ...(updates.width !== undefined && { width: updates.width }),
                ...(updates.height !== undefined && { height: updates.height }),
              });
              return m;
            });
          }

          // Store ALL property changes in pendingEdits for save + rendering
          setPendingEdits((prev) => {
            const m = new Map(prev);
            const current = m.get(tableId) || {};
            m.set(tableId, {
              ...current,
              ...(updates.tableNumber !== undefined && { tableNumber: updates.tableNumber }),
              ...(updates.name !== undefined && { name: updates.name }),
              ...(updates.capacity !== undefined && { capacity: updates.capacity }),
              ...(updates.shape !== undefined && { shape: updates.shape }),
              ...(updates.orientation !== undefined && { orientation: updates.orientation }),
              ...(updates.width !== undefined && { width: updates.width }),
              ...(updates.height !== undefined && { height: updates.height }),
              ...(updates.sectionId !== undefined && { sectionId: updates.sectionId }),
              ...(updates.sectionName !== undefined && { sectionName: updates.sectionName }),
              ...(updates.color !== undefined && { color: updates.color }),
            });
            return m;
          });
        }
      }
    },
    [draftTables, tables, pushUndoSnapshot],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Export / Import JSON
  // ─────────────────────────────────────────────────────────────────────────

  const handleExportLayout = useCallback(() => {
    const allTables = [...filteredTables, ...draftTables];
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      canvasWidth,
      canvasHeight,
      tables: allTables.map((t) => {
        const id = (t as any)._draftId ?? (t as ITable)._id;
        const pending = pendingUpdates.get(id);
        const edits = pendingEdits.get(id);
        return {
          tableNumber: edits?.tableNumber ?? t.tableNumber,
          name: edits?.name ?? t.name,
          x_position: pending?.x_position ?? t.x_position,
          y_position: pending?.y_position ?? t.y_position,
          width: edits?.width ?? pending?.width ?? t.width,
          height: edits?.height ?? pending?.height ?? t.height,
          orientation: edits?.orientation ?? pending?.orientation ?? t.orientation,
          shape: edits?.shape ?? t.shape,
          capacity: edits?.capacity ?? t.capacity,
          minCovers: t.minCovers,
          sectionId: edits?.sectionId ?? t.sectionId,
          sectionName: edits?.sectionName ?? t.sectionName,
          color: edits?.color ?? t.color,
        };
      }),
      zoneMetadata,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `floor-layout-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredTables, draftTables, pendingUpdates, pendingEdits, canvasWidth, canvasHeight, zoneMetadata]);

  const handleImportLayout = useCallback(
    (json: string) => {
      try {
        const data = JSON.parse(json);
        if (!data.tables || !Array.isArray(data.tables)) return;

        pushUndoSnapshot();

        const newDrafts: DraftTable[] = data.tables.map((t: any, i: number) => ({
          _draftId: `import_${Date.now()}_${i}`,
          _isNew: true,
          tableNumber: t.tableNumber || `IMP${i + 1}`,
          sectionId: t.sectionId,
          sectionName: t.sectionName,
          x_position: t.x_position || 100 + i * 40,
          y_position: t.y_position || 100 + i * 40,
          width: t.width || 100,
          height: t.height || 100,
          orientation: t.orientation || 0,
          shape: t.shape || 'square',
          capacity: t.capacity || 4,
          minCovers: t.minCovers || 1,
          status: 'available' as const,
          isActive: true,
          color: t.color,
        }));

        setDraftTables((prev) => [...prev, ...newDrafts]);

        if (data.zoneMetadata) {
          setZoneMetadata((prev) => ({ ...prev, ...data.zoneMetadata }));
        }
      } catch (err) {
        console.error('Import failed:', err);
      }
    },
    [pushUndoSnapshot],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Clone Zone — duplicate all tables in a section as new drafts
  // ─────────────────────────────────────────────────────────────────────────

  const handleCloneZone = useCallback(
    (sourceSectionId: string) => {
      pushUndoSnapshot();
      const zoneTables = tables.filter((t) => t.sectionId?.toString() === sourceSectionId);
      const offsetX = 300;
      const offsetY = 200;

      const clones: DraftTable[] = zoneTables.map((t, i) => ({
        _draftId: `clone_${Date.now()}_${i}`,
        _isNew: true,
        tableNumber: `${t.tableNumber}_copy`,
        sectionId: undefined,
        sectionName: undefined,
        x_position: t.x_position + offsetX,
        y_position: t.y_position + offsetY,
        width: t.width,
        height: t.height,
        orientation: t.orientation,
        shape: t.shape,
        capacity: t.capacity,
        minCovers: t.minCovers,
        status: 'available' as const,
        isActive: true,
        color: t.color,
      }));

      setDraftTables((prev) => [...prev, ...clones]);
    },
    [tables, pushUndoSnapshot],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Zone Metadata Handler
  // ─────────────────────────────────────────────────────────────────────────

  const handleZoneMetadataChange = useCallback(
    (sectionId: string, meta: ZoneMetadata) => {
      setZoneMetadata((prev) => ({ ...prev, [sectionId]: meta }));
    },
    [],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Mini-Map Pan
  // ─────────────────────────────────────────────────────────────────────────

  const handleMiniMapPan = useCallback((x: number, y: number) => {
    setPosition({ x, y });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Zone background texture CSS
  // ─────────────────────────────────────────────────────────────────────────

  const canvasTextureBg = useMemo(() => {
    if (!selectedSectionId) return undefined;
    const meta = zoneMetadata[selectedSectionId];
    if (!meta?.backgroundTexture || meta.backgroundTexture === 'none') return undefined;

    const textures: Record<string, string> = {
      wood: 'repeating-linear-gradient(90deg, rgba(139,90,43,0.07) 0px, transparent 2px, transparent 18px, rgba(139,90,43,0.05) 20px)',
      stone: 'repeating-radial-gradient(circle at 50% 50%, rgba(120,120,120,0.06) 0px, transparent 3px, transparent 12px)',
      tile: 'repeating-conic-gradient(rgba(100,100,200,0.05) 0% 25%, transparent 0% 50%) 0 0 / 40px 40px',
      carpet: 'repeating-linear-gradient(45deg, rgba(80,160,80,0.04) 0px, transparent 1px, transparent 8px)',
      concrete: 'repeating-linear-gradient(180deg, rgba(150,150,150,0.05) 0px, transparent 1px, transparent 30px)',
    };

    return textures[meta.backgroundTexture];
  }, [selectedSectionId, zoneMetadata]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 overflow-hidden rounded-xl border border-slate-300 shadow-inner">

      {/* ── Playground Sidebar ────────────────────────── */}
      <AnimatePresence>
        {isPlayground && (
          <PlaygroundSidebar
            open={isPlayground}
            onClose={() => setIsPlayground(false)}
            sections={sections}
            existingTableCount={tables.length + draftTables.length}
            onCreateZone={handleCreateZone}
            onGenerateTables={handleGenerateTables}
            onAddSingleDraft={handleAddSingleDraft}
          />
        )}
      </AnimatePresence>

      {/* ── Top Toolbar ──────────────────────────────── */}
      <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
        {/* Left side */}
        <div className="flex flex-col gap-2 pointer-events-auto max-w-[50%]">
          {/* Zone Tab Bar (replaces dropdown) */}
          {sections.length > 0 && onSectionChange && (
            <ZoneTabBar
              sections={sections}
              selectedSectionId={selectedSectionId}
              onSectionChange={onSectionChange}
              zoneMetadata={zoneMetadata}
              onZoneMetadataChange={handleZoneMetadataChange}
              className="bg-white/90 backdrop-blur rounded-lg shadow-md p-1"
            />
          )}

          {/* Edit mode indicator */}
          <AnimatePresence>
            {(isEditMode || isPlayground) && (
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="flex items-center gap-2 bg-amber-100 text-amber-800 px-4 py-2 rounded-lg text-sm font-medium shadow-md border border-amber-200"
              >
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <span>
                  {isPlayground ? 'Playground Mode' : 'Edit Mode'} —{' '}
                  {selectedIds.size === 1
                    ? 'Editing table properties'
                    : selectedIds.size > 1
                    ? `${selectedIds.size} tables selected`
                    : 'Double-click to add table · Click to select · Drag to move'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right side controls */}
        <div className="flex gap-2 pointer-events-auto">
          {/* Zoom */}
          <div className="flex items-center gap-1 bg-white rounded-lg shadow-md p-1">
            <button onClick={() => handleZoom(-SCALE_STEP)} disabled={scale <= MIN_SCALE} className="p-2 hover:bg-slate-100 rounded transition-colors" title="Zoom Out">
              <ZoomOut size={18} className="text-slate-600" />
            </button>
            <span className="px-2 text-sm text-slate-600 min-w-[50px] text-center font-medium">
              {Math.round(scale * 100)}%
            </span>
            <button onClick={() => handleZoom(SCALE_STEP)} disabled={scale >= MAX_SCALE} className="p-2 hover:bg-slate-100 rounded transition-colors" title="Zoom In">
              <ZoomIn size={18} className="text-slate-600" />
            </button>
            <div className="w-px h-6 bg-slate-200" />
            <button onClick={handleResetView} className="p-2 hover:bg-slate-100 rounded transition-colors" title="Reset View">
              <Maximize2 size={18} className="text-slate-600" />
            </button>
          </div>

          {/* Edit / Playground controls */}
          {(onTablesUpdate || onBulkUpsert) && (
            <div className="flex items-center gap-1 bg-white rounded-lg shadow-md p-1">
              {isEditMode || isPlayground ? (
                <>
                  {/* Snap to grid */}
                  <button
                    onClick={cycleGridSize}
                    className={`p-2 rounded transition-colors flex items-center gap-1 ${
                      snapToGrid > 0 ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'
                    }`}
                    title={`Snap: ${snapToGrid > 0 ? `${snapToGrid}px` : 'Off'}`}
                  >
                    <Grid3X3 size={18} />
                    {snapToGrid > 0 && <span className="text-xs font-medium">{snapToGrid}</span>}
                  </button>

                  {/* Multi-select hint */}
                  {selectedIds.size > 0 && (
                    <div className="flex items-center gap-1 px-2 text-xs text-amber-700 font-medium">
                      <MousePointerSquareDashed size={14} />
                      {selectedIds.size} selected
                    </div>
                  )}

                  {/* Alignment tools */}
                  {selectedIds.size >= 2 && (
                    <div className="relative">
                      <button
                        onClick={() => setShowAlignTools(!showAlignTools)}
                        className={`p-2 rounded transition-colors ${showAlignTools ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`}
                        title="Align"
                      >
                        <AlignStartVertical size={18} />
                      </button>
                      {showAlignTools && (
                        <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-slate-200 p-2 flex gap-1 z-30">
                          {([
                            ['left', AlignStartHorizontal, 'rotate-180'],
                            ['center-h', AlignCenterHorizontal, ''],
                            ['right', AlignStartHorizontal, ''],
                          ] as const).map(([dir, Icon, cls]) => (
                            <button key={dir} onClick={() => alignTables(dir)} className="p-2 hover:bg-slate-100 rounded" title={`Align ${dir}`}>
                              <Icon size={16} className={`text-slate-600 ${cls}`} />
                            </button>
                          ))}
                          <div className="w-px bg-slate-200 mx-1" />
                          {([
                            ['top', AlignStartVertical, ''],
                            ['center-v', AlignCenterVertical, ''],
                            ['bottom', AlignStartVertical, 'rotate-180'],
                          ] as const).map(([dir, Icon, cls]) => (
                            <button key={dir} onClick={() => alignTables(dir)} className="p-2 hover:bg-slate-100 rounded" title={`Align ${dir}`}>
                              <Icon size={16} className={`text-slate-600 ${cls}`} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delete selected */}
                  {selectedIds.size > 0 && (
                    <button onClick={deleteSelected} className="p-2 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded transition-colors" title="Delete selected (Del)">
                      <Trash2 size={18} />
                    </button>
                  )}

                  {/* Duplicate selected */}
                  {selectedIds.size > 0 && (
                    <button onClick={duplicateSelected} className="p-2 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded transition-colors" title="Duplicate selected (Ctrl+D)">
                      <Copy size={18} />
                    </button>
                  )}

                  <div className="w-px h-6 bg-slate-200" />

                  {/* Grab mode toggle (G) */}
                  <button
                    onClick={() => setIsGrabMode(!isGrabMode)}
                    className={`p-2 rounded transition-colors ${isGrabMode ? 'bg-blue-100 text-blue-600' : 'hover:bg-slate-100 text-slate-600'}`}
                    title="Grab/Pan Mode (G)"
                  >
                    <Hand size={18} />
                  </button>

                  {/* Undo / Redo */}
                  <button
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className={`p-2 rounded transition-colors ${canUndo ? 'hover:bg-slate-100 text-slate-600' : 'text-slate-300 cursor-not-allowed'}`}
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo2 size={18} />
                  </button>
                  <button
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className={`p-2 rounded transition-colors ${canRedo ? 'hover:bg-slate-100 text-slate-600' : 'text-slate-300 cursor-not-allowed'}`}
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo2 size={18} />
                  </button>

                  <div className="w-px h-6 bg-slate-200" />

                  {/* Playground toggle */}
                  {onBulkUpsert && onCreateZone && (
                    <button
                      onClick={() => {
                        setIsPlayground(!isPlayground);
                        if (!isEditMode) setIsEditMode(true);
                      }}
                      className={`p-2 rounded transition-colors ${isPlayground ? 'bg-violet-100 text-violet-600' : 'hover:bg-slate-100 text-slate-600'}`}
                      title="Toggle Playground"
                    >
                      <Sparkles size={18} />
                    </button>
                  )}

                  {/* Quick-add table */}
                  <button
                    onClick={() => {
                      const nextIdx = tables.length + draftTables.length + 1;
                      const sec = selectedSectionId
                        ? sections.find((s) => s._id === selectedSectionId)
                        : undefined;
                      pushUndoSnapshot();
                      const draft = createSingleDraft({
                        x: canvasWidth / 2 - 50,
                        y: canvasHeight / 2 - 50,
                        index: nextIdx,
                        sectionId: selectedSectionId,
                        sectionName: sec?.name,
                      });
                      setDraftTables((prev) => [...prev, draft]);
                      setSelectedIds(new Set([draft._draftId]));
                    }}
                    className="p-2 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 rounded transition-colors"
                    title="Quick-add Table (or double-click canvas)"
                  >
                    <PlusCircle size={18} />
                  </button>

                  <div className="w-px h-6 bg-slate-200" />

                  {/* Cancel */}
                  <button onClick={handleCancel} disabled={isSaving} className="p-2 hover:bg-red-50 text-slate-600 hover:text-red-600 rounded transition-colors" title="Cancel">
                    <X size={18} />
                  </button>

                  {/* Save Layout */}
                  <button
                    onClick={handleSaveLayout}
                    disabled={isSaving || totalChanges === 0}
                    className={`p-2 rounded transition-colors flex items-center gap-1 ${
                      totalChanges > 0 ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }`}
                    title="Save Layout"
                  >
                    {isSaving ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Save size={18} />
                    )}
                    {totalChanges > 0 && <span className="text-sm font-medium">{totalChanges}</span>}
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setIsEditMode(true)}
                  className="px-3 py-2 hover:bg-slate-100 rounded transition-colors flex items-center gap-2"
                  title="Edit Layout"
                >
                  <Edit3 size={18} className="text-slate-600" />
                  <span className="text-sm text-slate-600 font-medium">Edit Layout</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Canvas container ─────────────────────────── */}
      <div
        ref={containerRef}
        className={`w-full h-full ${draggingTableId ? 'cursor-grabbing' : isDragging ? 'cursor-grabbing' : isGrabMode ? 'cursor-grab' : isEditMode ? 'cursor-default' : 'cursor-grab'}`}
        style={{ touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onDoubleClick={handleCanvasDoubleClick}
      >
        {/* Transformed canvas */}
        <div
          className="relative"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'top left',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          {/* Grid background */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `
                linear-gradient(to right, rgba(148,163,184,0.25) 1px, transparent 1px),
                linear-gradient(to bottom, rgba(148,163,184,0.25) 1px, transparent 1px)
              `,
              backgroundSize: `${snapToGrid > 0 ? snapToGrid : 50}px ${snapToGrid > 0 ? snapToGrid : 50}px`,
            }}
          />

          {/* Multi-select rectangle */}
          {selectionRect && (
            <div
              className="absolute border-2 border-blue-400 bg-blue-200/20 pointer-events-none rounded"
              style={{
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.w,
                height: selectionRect.h,
              }}
            />
          )}

          {/* Existing tables */}
          {filteredTables.map((table) => (
            <TableVisual
              key={table._id}
              table={getTableWithEdits(table)}
              onTableClick={onTableClick}
              onTableIconClick={onTableIconClick}
              isSelected={table._id === selectedTableId}
              isMultiSelected={selectedIds.has(table._id)}
              isEditMode={isEditMode || isPlayground}
              isDragging={draggingTableId === table._id}
              onDragStart={handleTableDragStart}
              scale={scale}
              snapToGrid={snapToGrid}
              reservationPolicy={reservationPolicy}
            />
          ))}

          {/* Draft tables */}
          {draftTables.map((draft) => (
            <TableVisual
              key={draft._draftId}
              table={draft as unknown as ITable}
              onTableClick={() => {}}
              isSelected={false}
              isMultiSelected={selectedIds.has(draft._draftId)}
              isEditMode={true}
              isDraft={true}
              isDragging={draggingTableId === draft._draftId}
              onDragStart={handleTableDragStart}
              scale={scale}
              snapToGrid={snapToGrid}
            />
          ))}

          {/* Alignment guides */}
          {activeGuides.map((guide, i) =>
            guide.axis === 'v' ? (
              <div
                key={`guide-${i}`}
                className="absolute pointer-events-none"
                style={{
                  left: guide.position,
                  top: guide.start,
                  width: 1,
                  height: guide.end - guide.start,
                  background: 'rgba(239,68,68,0.6)',
                  boxShadow: '0 0 4px rgba(239,68,68,0.4)',
                  zIndex: 50,
                }}
              />
            ) : (
              <div
                key={`guide-${i}`}
                className="absolute pointer-events-none"
                style={{
                  left: guide.start,
                  top: guide.position,
                  width: guide.end - guide.start,
                  height: 1,
                  background: 'rgba(239,68,68,0.6)',
                  boxShadow: '0 0 4px rgba(239,68,68,0.4)',
                  zIndex: 50,
                }}
              />
            ),
          )}

          {/* Distance markers — pixel-gap labels between dragged table & neighbors */}
          {activeDistanceMarkers.map((marker, i) => {
            const isHorizontal = marker.axis === 'h';
            const midX = (marker.x1 + marker.x2) / 2;
            const midY = (marker.y1 + marker.y2) / 2;
            return (
              <div key={`dm-${i}`} className="absolute pointer-events-none" style={{ zIndex: 55 }}>
                {/* Line */}
                {isHorizontal ? (
                  <div
                    className="absolute"
                    style={{
                      left: marker.x1,
                      top: marker.y1,
                      width: marker.x2 - marker.x1,
                      height: 1,
                      background: 'rgba(59,130,246,0.5)',
                    }}
                  />
                ) : (
                  <div
                    className="absolute"
                    style={{
                      left: marker.x1,
                      top: marker.y1,
                      width: 1,
                      height: marker.y2 - marker.y1,
                      background: 'rgba(59,130,246,0.5)',
                    }}
                  />
                )}
                {/* End caps */}
                {isHorizontal ? (
                  <>
                    <div className="absolute" style={{ left: marker.x1, top: marker.y1 - 4, width: 1, height: 9, background: 'rgba(59,130,246,0.7)' }} />
                    <div className="absolute" style={{ left: marker.x2, top: marker.y2 - 4, width: 1, height: 9, background: 'rgba(59,130,246,0.7)' }} />
                  </>
                ) : (
                  <>
                    <div className="absolute" style={{ left: marker.x1 - 4, top: marker.y1, width: 9, height: 1, background: 'rgba(59,130,246,0.7)' }} />
                    <div className="absolute" style={{ left: marker.x2 - 4, top: marker.y2, width: 9, height: 1, background: 'rgba(59,130,246,0.7)' }} />
                  </>
                )}
                {/* Label */}
                <div
                  className="absolute flex items-center justify-center pointer-events-none"
                  style={{
                    left: midX - 16,
                    top: midY - 9,
                    width: 32,
                    height: 18,
                  }}
                >
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold tabular-nums"
                    style={{
                      background: 'rgba(37,99,235,0.9)',
                      color: 'white',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                    }}
                  >
                    {marker.distance}px
                  </span>
                </div>
              </div>
            );
          })}

          {/* Zone texture overlay */}
          {canvasTextureBg && (
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ backgroundImage: canvasTextureBg }}
            />
          )}

          {/* Empty state */}
          {filteredTables.length === 0 && draftTables.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center text-slate-400 max-w-xs">
                <Layers size={48} className="mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium">No tables in this view</p>
                <p className="text-sm mt-1">
                  {isEditMode || isPlayground
                    ? 'Double-click anywhere to add a table, or use the Playground to generate layouts'
                    : selectedSectionId
                    ? 'Try selecting "All Zones" or switch to a different zone'
                    : 'Click "Edit Layout" to start building your floor plan'}
                </p>
                {!isEditMode && !isPlayground && (
                  <button
                    onClick={() => { setIsEditMode(true); setIsPlayground(true); }}
                    className="mt-4 px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 transition-colors inline-flex items-center gap-2"
                  >
                    <Sparkles size={14} />
                    Open Playground
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Single-Table Edit Popover ─────────────── */}
      <AnimatePresence>
        {(isEditMode || isPlayground) && selectedIds.size === 1 && (() => {
          const singleId = Array.from(selectedIds)[0];
          const allTbls = [...filteredTables, ...(draftTables as any[])];
          const target = allTbls.find((t: any) => (t._draftId ?? t._id) === singleId);
          if (!target) return null;
          const tId = (target as any)._draftId ?? (target as ITable)._id;
          const isDraftTarget = '_draftId' in target;
          // Merge pending position + property edits so the popover shows current values
          const mergedTarget = isDraftTarget ? target : getTableWithEdits(target as ITable);
          const posX = mergedTarget.x_position;
          const posY = mergedTarget.y_position;
          return (
            <TableEditPopover
              key={tId}
              table={mergedTarget as ITable}
              position={{ x: posX + mergedTarget.width + 40, y: posY }}
              scale={scale}
              canvasPosition={position}
              sections={sections}
              onUpdate={(updates) => handleSingleTableUpdate(tId, updates)}
              onClose={() => setSelectedIds(new Set())}
            />
          );
        })()}
      </AnimatePresence>

      {/* ── Selection HUD (floating multi-select toolbar) ── */}
      <AnimatePresence>
        {(isEditMode || isPlayground) && selectedIds.size >= 2 && (
          <SelectionHUD
            allTables={[...filteredTables, ...(draftTables as any[])]}
            selectedIds={selectedIds}
            pendingUpdates={pendingUpdates}
            onBatchUpdate={handleBatchUpdate}
            onDistributeH={handleDistributeH}
            onDistributeV={handleDistributeV}
            onTidyUp={handleTidyUp}
            onArrangeRow={handleArrangeRow}
            onArrangeColumn={handleArrangeColumn}
            onSmartOrganize={handleSmartOrganize}
            onDeleteSelected={deleteSelected}
            onDuplicateSelected={duplicateSelected}
            onGroup={handleGroupSelected}
            onUngroup={handleUngroupSelected}
            onClose={() => setSelectedIds(new Set())}
            scale={scale}
            canvasPosition={position}
          />
        )}
      </AnimatePresence>

      {/* ── Global Inspector (Bulk edit panel) ───────── */}
      {(isEditMode || isPlayground) && (
        <GlobalInspector
          allTables={[...filteredTables, ...(draftTables as any[])]}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
          sections={sections}
          onBatchUpdate={handleBatchUpdate}
          onDeleteSelected={deleteSelected}
          onExportLayout={handleExportLayout}
          onImportLayout={handleImportLayout}
          onCloneZone={handleCloneZone}
          pendingUpdates={pendingUpdates}
        />
      )}

      {/* ── Mini-Map ──────────────────────────────────── */}
      <div className="absolute bottom-16 right-4 z-20">
        <MiniMap
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          viewportX={position.x}
          viewportY={position.y}
          scale={scale}
          containerWidth={containerSize.w}
          containerHeight={containerSize.h}
          tables={filteredTables}
          draftTables={draftTables}
          pendingUpdates={pendingUpdates}
          onPanTo={handleMiniMapPan}
        />
      </div>

      {/* ── Legend ─────────────────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-20 bg-white/95 backdrop-blur rounded-lg shadow-md p-3 border border-slate-200">
        <div className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">Status</div>
        <div className="flex flex-wrap gap-3 text-xs">
          {[
            { label: 'Available', grad: ['#F3E8FF', '#C4B5FD'], border: '#8B5CF6' },
            { label: 'Reserved', grad: ['#CCFBF1', '#2DD4BF'], border: '#0D9488' },
            { label: 'Occupied', grad: ['#FFF7ED', '#FDBA74'], border: '#EA580C' },
            { label: 'Cleaning', grad: ['#FEFCE8', '#FDE047'], border: '#CA8A04' },
            { label: 'Blocked', grad: ['#F9FAFB', '#D1D5DB'], border: '#6B7280' },
          ].map(({ label, grad, border }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-4 h-4 rounded-full" style={{ background: `linear-gradient(135deg, ${grad[0]}, ${grad[1]})`, border: `2px solid ${border}` }} />
              <span className="text-slate-600">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Stats / Hints ─────────────────────────────── */}
      <div className="absolute bottom-4 right-4 z-20 flex gap-2">
        <div className="bg-white/95 backdrop-blur rounded-lg shadow-md px-3 py-2 border border-slate-200 text-xs">
          <span className="text-slate-500">Tables:</span>{' '}
          <span className="font-bold text-slate-700">{filteredTables.length}</span>
          {draftTables.length > 0 && (
            <span className="ml-1 text-amber-600 font-medium">+{draftTables.length} draft</span>
          )}
          {stagedDeletions.size > 0 && (
            <span className="ml-1 text-red-500 font-medium">−{stagedDeletions.size} staged</span>
          )}
        </div>
        <div className="bg-white/95 backdrop-blur rounded-lg shadow-md px-3 py-2 border border-slate-200 text-[10px] text-slate-400">
          {isEditMode
            ? 'Dbl-click: Add table • Shift+Drag: Select • G: Grab • R: Rotate • Del: Delete • Ctrl+D: Duplicate • Ctrl+Z/Y: Undo/Redo'
            : 'Ctrl+Scroll: Zoom • Alt+Drag: Pan • Click table for details'}
        </div>
      </div>

      {/* ── Save Toast ────────────────────────────────── */}
      <AnimatePresence>
        {saveToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50"
          >
            <div
              className={`px-5 py-2.5 rounded-xl text-sm font-medium shadow-xl backdrop-blur-md border ${
                saveToast.includes('failed')
                  ? 'bg-red-50/95 text-red-700 border-red-200'
                  : 'bg-emerald-50/95 text-emerald-700 border-emerald-200'
              }`}
            >
              {saveToast.includes('failed') ? '✗' : '✓'} {saveToast}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
