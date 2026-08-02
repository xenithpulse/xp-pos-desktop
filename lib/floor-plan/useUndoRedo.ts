// lib/floor-plan/useUndoRedo.ts
// Undo/Redo stack for canvas table movements & draft changes

import { useState, useCallback, useRef } from 'react';
import { CanvasSnapshot, TablePositionUpdate, DraftTable } from '@/types/table.types';

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const MAX_HISTORY = 50;

// ─────────────────────────────────────────────────────────────────────────────
// Helper — deep-clone a snapshot
// ─────────────────────────────────────────────────────────────────────────────

function cloneSnapshot(snap: CanvasSnapshot): CanvasSnapshot {
  return {
    pendingUpdates: { ...snap.pendingUpdates },
    pendingEdits: snap.pendingEdits
      ? Object.fromEntries(Object.entries(snap.pendingEdits).map(([k, v]) => [k, { ...v }]))
      : {},
    draftTables: snap.draftTables.map((d) => ({ ...d })),
    stagedDeletions: [...(snap.stagedDeletions ?? [])],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useUndoRedo() {
  const [undoStack, setUndoStack] = useState<CanvasSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasSnapshot[]>([]);
  const lastPushedRef = useRef<number>(0);

  /** Push a snapshot onto the undo stack (debounced — skips if <100ms since last push) */
  const pushSnapshot = useCallback(
    (snapshot: CanvasSnapshot) => {
      const now = Date.now();
      if (now - lastPushedRef.current < 100) return; // debounce fast drags
      lastPushedRef.current = now;

      setUndoStack((prev) => {
        const next = [...prev, cloneSnapshot(snapshot)];
        return next.length > MAX_HISTORY ? next.slice(-MAX_HISTORY) : next;
      });
      // Any new action clears the redo stack
      setRedoStack([]);
    },
    [],
  );

  /** Undo: pop undo stack, push current state onto redo, return restored snapshot */
  const undo = useCallback(
    (currentSnapshot: CanvasSnapshot): CanvasSnapshot | null => {
      let restored: CanvasSnapshot | null = null;

      setUndoStack((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        restored = cloneSnapshot(next.pop()!);
        return next;
      });

      if (restored) {
        setRedoStack((prev) => [...prev, cloneSnapshot(currentSnapshot)]);
      }

      return restored;
    },
    [],
  );

  /** Redo: pop redo stack, push current state onto undo, return restored snapshot */
  const redo = useCallback(
    (currentSnapshot: CanvasSnapshot): CanvasSnapshot | null => {
      let restored: CanvasSnapshot | null = null;

      setRedoStack((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        restored = cloneSnapshot(next.pop()!);
        return next;
      });

      if (restored) {
        setUndoStack((prev) => [...prev, cloneSnapshot(currentSnapshot)]);
      }

      return restored;
    },
    [],
  );

  /** Clear both stacks (e.g. on save or cancel) */
  const clearHistory = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  return {
    pushSnapshot,
    undo,
    redo,
    clearHistory,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}
