// lib/hooks/useFullscreen.ts
//
// Browser fullscreen, wrapped so a screen can offer it in one line.
//
// WHY THE KITCHEN NEEDS THIS. A kitchen display is a monitor bolted to a wall
// that nobody touches for the rest of the shift. Every pixel spent on browser
// chrome - tab strip, address bar, bookmarks - is a pixel not spent on tickets
// somebody is reading from three metres away across a hot pass.
//
// WHY useSyncExternalStore AND NOT useState + useEffect. Fullscreen is external
// state that this code does not own: it can be left via the Escape key, F11,
// the window manager, or another element claiming it. A local boolean would
// drift out of step and leave the button offering "Exit" on a windowed screen.
// This subscribes to the browser's own event instead and reads the answer from
// document.fullscreenElement every time, which is the only honest source.
//
// The third argument is the server snapshot. It has to be there: `document`
// does not exist during SSR, and without it the two renders disagree.
//
// The vendor-prefixed shapes are for Safari, which still ships webkit- only.

"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Safari's prefixed surface, absent from the standard DOM typings. */
interface WebkitDocument extends Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
}
interface WebkitElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

function currentElement(): Element | null {
  const d = document as WebkitDocument;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

function subscribeToFullscreen(onChange: () => void): () => void {
  document.addEventListener("fullscreenchange", onChange);
  document.addEventListener("webkitfullscreenchange", onChange);
  return () => {
    document.removeEventListener("fullscreenchange", onChange);
    document.removeEventListener("webkitfullscreenchange", onChange);
  };
}

/** Support never changes for the life of the document, so there is nothing to
 *  subscribe to - but it still needs a server snapshot, hence the same hook. */
const NEVER_CHANGES = () => () => {};

export function useFullscreen() {
  const isFullscreen = useSyncExternalStore(
    subscribeToFullscreen,
    () => Boolean(currentElement()),
    () => false,
  );

  // False in embedded webviews that block the API. The button is hidden rather
  // than shown and silently doing nothing.
  const supported = useSyncExternalStore(
    NEVER_CHANGES,
    () => {
      const el = document.documentElement as WebkitElement;
      return Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
    },
    () => false,
  );

  const toggle = useCallback(async () => {
    const d = document as WebkitDocument;
    try {
      if (currentElement()) {
        await (d.exitFullscreen?.() ?? d.webkitExitFullscreen?.());
      } else {
        const el = document.documentElement as WebkitElement;
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      }
    } catch {
      // Denied, or the gesture was not user-initiated. The subscription above
      // keeps the button honest either way, so there is nothing useful to
      // report - and a kitchen screen is the last place to pop an error dialog.
    }
  }, []);

  return { isFullscreen, supported, toggle };
}
