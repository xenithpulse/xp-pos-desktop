"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useNavTriggerHost
//
// Phase 17 §1.1. The sidebar's floating menu button is `fixed top-4 right-4
// z-50`; the POS context bar is `z-40`. On every POS screen below `lg` the
// button therefore sat ON TOP of the bar's right-hand cluster — over the user
// menu and refresh, both of which it made unreachable.
//
// The button exists for pages that have no chrome of their own. Where a page
// DOES have chrome, that chrome should carry the nav trigger, and the floating
// button should stand down rather than be nudged out of the way with a
// page-aware offset — two triggers for one drawer is the bug, not their
// spacing.
//
// A component that renders its own trigger calls this hook. `MobileSidebar`
// renders the floating button only while nothing has claimed it.
//
// Why a layout effect: Sidebar and the claiming host commit in the same pass,
// so a plain `useEffect` would let the browser paint the floating button once
// before the claim removed it — a flicker in the corner of every POS screen on
// every navigation. `useLayoutEffect` runs before paint. It has no server
// equivalent, hence the isomorphic alias; on the server nothing has claimed the
// trigger, which is the correct SSR answer for a page with no chrome.
//
// Why the store holds a COUNT: during a route transition React mounts the
// incoming context bar before unmounting the outgoing one. With a boolean the
// unmount would clear a flag the new bar had just set, and the POS screen would
// be left with no trigger at all until something forced a re-render.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useLayoutEffect } from "react";
import { usePOSStore } from "@/stores/posStore";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Declare that this component supplies its own nav trigger while mounted. */
export function useNavTriggerHost(): void {
  useIsomorphicLayoutEffect(() => {
    const { registerNavTriggerHost, unregisterNavTriggerHost } = usePOSStore.getState();
    registerNavTriggerHost();
    return unregisterNavTriggerHost;
  }, []);
}
