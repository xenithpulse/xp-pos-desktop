"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useSidebarCollapsed
//
// Tiny shared store for the desktop sidebar's collapsed/expanded state.
//   • Persists to localStorage (`sidebar:collapsed`)
//   • Syncs across components via a window CustomEvent
//   • Mirrors the current width into a CSS variable (`--sidebar-w`) on
//     <html>, so the page layout (e.g. <main>'s left margin) can transition
//     smoothly with pure CSS, no prop-drilling required.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "sidebar:collapsed";
const EVENT_NAME = "sidebar:collapsed-change";

export const SIDEBAR_WIDTH_COLLAPSED = 64; // px (w-16)
export const SIDEBAR_WIDTH_EXPANDED = 248; // px

function readInitial(): boolean {
  if (typeof window === "undefined") return true; // SSR: collapsed by default
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false; // first-time visitors: expanded for discoverability
    return raw === "1";
  } catch {
    return true;
  }
}

function applyWidthVar(collapsed: boolean) {
  if (typeof document === "undefined") return;
  const px = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED;
  document.documentElement.style.setProperty("--sidebar-w", `${px}px`);
}

export function useSidebarCollapsed(): {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
} {
  const [collapsed, setCollapsedState] = useState<boolean>(() => readInitial());

  // Apply CSS variable as soon as we mount with the resolved value.
  useEffect(() => {
    applyWidthVar(collapsed);
  }, [collapsed]);

  // Listen for changes from other Sidebar instances (e.g. mobile <-> desktop swap)
  useEffect(() => {
    const handler = (e: Event) => {
      const next = (e as CustomEvent<boolean>).detail;
      setCollapsedState(next);
    };
    window.addEventListener(EVENT_NAME, handler as EventListener);
    return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
  }, []);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    try {
      window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
    applyWidthVar(v);
    window.dispatchEvent(new CustomEvent<boolean>(EVENT_NAME, { detail: v }));
  }, []);

  const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

  return { collapsed, setCollapsed, toggle };
}
