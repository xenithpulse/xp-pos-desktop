"use client";

// ─────────────────────────────────────────────────────────────────────────────
// useMinWidth
//
// "Is the viewport at least this wide?", for the cases where a breakpoint has
// to be known in TypeScript rather than expressed as a Tailwind prefix —
// layout decisions that remove a component from the tree, not just hide it.
//
// Prefer a `md:`/`lg:` class whenever the answer is purely visual. Reach for
// this only when the component genuinely must not mount.
//
// The px values are the Tailwind v4 defaults, spelled out here so a caller
// cannot drift from them. This project has no `@theme` screens block, so these
// four are the only breakpoints that exist — see Phase 17's rule against
// inventing a fifth.
//
// SSR: there is no viewport on the server, so the first render always reports
// `false` and the real answer arrives in a layout effect, before paint. Callers
// must therefore pick a `false` default that is SAFE rather than merely common
// — for the nav that means "show it", since a nav wrongly shown for one frame
// is recoverable and a nav wrongly hidden is not.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

export const BREAKPOINTS = { sm: 640, md: 768, lg: 1024, xl: 1280 } as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

export function useMinWidth(breakpoint: BreakpointName | number): boolean {
  const px = typeof breakpoint === "number" ? breakpoint : BREAKPOINTS[breakpoint];
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${px}px)`);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [px]);

  return matches;
}
