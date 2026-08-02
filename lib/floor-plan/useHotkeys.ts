// lib/floor-plan/useHotkeys.ts
// Global hotkey listener for the Layout Playground — Power-User Command Center

import { useEffect, useCallback, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HotkeyActions {
  /** G: Toggle Grab/Drag mode */
  toggleGrabMode: () => void;
  /** R: Rotate selected tables by 45° */
  rotateSelected: (degrees?: number) => void;
  /** Backspace/Delete: Bulk delete selected */
  deleteSelected: () => void;
  /** Ctrl/Cmd + A: Select all tables in active zone */
  selectAll: () => void;
  /** Ctrl/Cmd + Z: Undo */
  undo: () => void;
  /** Ctrl/Cmd + Y / Ctrl/Cmd + Shift + Z: Redo */
  redo: () => void;
  /** Arrow Keys: Nudge selected tables (1px or 10px with Shift) */
  nudgeSelected: (dx: number, dy: number) => void;
  /** Escape: Deselect all */
  deselectAll: () => void;
  /** Ctrl/Cmd + D: Duplicate selected tables */
  duplicateSelected?: () => void;
  /** Ctrl/Cmd + G: Group selected tables */
  groupSelected?: () => void;
  /** Ctrl/Cmd + Shift + G: Ungroup selected tables */
  ungroupSelected?: () => void;
}

interface UseHotkeysOptions {
  /** Only fire when edit mode is active */
  enabled: boolean;
  /** Actions to bind */
  actions: HotkeyActions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useHotkeys({ enabled, actions }: UseHotkeysOptions) {
  // Keep actions ref-stable to avoid re-registering listeners
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const handler = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;

      // Ignore when user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      const a = actionsRef.current;
      const isMod = e.ctrlKey || e.metaKey;

      // ── Ctrl/Cmd combos ──
      if (isMod) {
        switch (e.key.toLowerCase()) {
          case 'a':
            e.preventDefault();
            a.selectAll();
            return;
          case 'z':
            e.preventDefault();
            if (e.shiftKey) {
              a.redo();
            } else {
              a.undo();
            }
            return;
          case 'y':
            e.preventDefault();
            a.redo();
            return;
          case 'd':
            e.preventDefault();
            a.duplicateSelected?.();
            return;
          case 'g':
            e.preventDefault();
            if (e.shiftKey) {
              a.ungroupSelected?.();
            } else {
              a.groupSelected?.();
            }
            return;
        }
        return; // Don't process further if mod was held
      }

      // ── Single-key shortcuts ──
      switch (e.key.toLowerCase()) {
        case 'g':
          e.preventDefault();
          a.toggleGrabMode();
          return;

        case 'r':
          e.preventDefault();
          a.rotateSelected(45);
          return;

        case 'backspace':
        case 'delete':
          e.preventDefault();
          a.deleteSelected();
          return;

        case 'escape':
          e.preventDefault();
          a.deselectAll();
          return;
      }

      // ── Arrow-key nudge ──
      const NUDGE_STEP = e.shiftKey ? 10 : 1;
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          a.nudgeSelected(0, -NUDGE_STEP);
          return;
        case 'ArrowDown':
          e.preventDefault();
          a.nudgeSelected(0, NUDGE_STEP);
          return;
        case 'ArrowLeft':
          e.preventDefault();
          a.nudgeSelected(-NUDGE_STEP, 0);
          return;
        case 'ArrowRight':
          e.preventDefault();
          a.nudgeSelected(NUDGE_STEP, 0);
          return;
      }
    },
    [enabled],
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, handler]);
}
