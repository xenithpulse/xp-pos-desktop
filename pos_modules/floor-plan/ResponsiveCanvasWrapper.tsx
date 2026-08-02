// pos_modules/floor-plan/ResponsiveCanvasWrapper.tsx
// Device-aware responsive wrapper — renders the full 2D canvas on Desktop/Tablet,
// and a high-density Grid/List view on Mobile (phone) for tap-to-open actions.
// Uses matchMedia to detect device class with SSR-safe hydration.

'use client';

import { useState, useEffect, useMemo, ReactNode } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DeviceClass = 'desktop' | 'tablet' | 'phone';

interface ResponsiveCanvasWrapperProps {
  /** Full 2D interactive canvas (Desktop + Tablet) */
  canvasContent: ReactNode;
  /** Grid/List fallback for mobile phones */
  mobileContent: ReactNode;
  /** Optional breakpoint for phone (default: 768px) */
  phoneBreakpoint?: number;
  /** Optional breakpoint for tablet (default: 1024px) */
  tabletBreakpoint?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Device Detection Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useDeviceClass(
  phoneBreakpoint = 768,
  tabletBreakpoint = 1024,
): DeviceClass {
  const [deviceClass, setDeviceClass] = useState<DeviceClass>('desktop');

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      // Also check for touch capability to distinguish tablet from small desktop
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      if (w < phoneBreakpoint) {
        setDeviceClass('phone');
      } else if (w < tabletBreakpoint || (hasTouch && w < 1200)) {
        setDeviceClass('tablet');
      } else {
        setDeviceClass('desktop');
      }
    };

    update();

    const mql = window.matchMedia(`(max-width: ${phoneBreakpoint}px)`);
    const tabletMql = window.matchMedia(`(max-width: ${tabletBreakpoint}px)`);

    const listener = () => update();
    mql.addEventListener('change', listener);
    tabletMql.addEventListener('change', listener);
    window.addEventListener('resize', listener);

    return () => {
      mql.removeEventListener('change', listener);
      tabletMql.removeEventListener('change', listener);
      window.removeEventListener('resize', listener);
    };
  }, [phoneBreakpoint, tabletBreakpoint]);

  return deviceClass;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ResponsiveCanvasWrapper({
  canvasContent,
  mobileContent,
  phoneBreakpoint = 768,
  tabletBreakpoint = 1024,
}: ResponsiveCanvasWrapperProps) {
  const device = useDeviceClass(phoneBreakpoint, tabletBreakpoint);

  return (
    <div className="w-full h-full">
      {device === 'phone' ? (
        // Mobile phones — skip the heavy 2D canvas, show grid fallback
        <div className="w-full h-full">{mobileContent}</div>
      ) : (
        // Desktop & Tablet — show full interactive 2D canvas
        <div
          className="w-full h-full"
          style={{
            // Ensure touch targets are large enough on tablets
            ...(device === 'tablet'
              ? { touchAction: 'manipulation' }
              : {}),
          }}
        >
          {canvasContent}
        </div>
      )}
    </div>
  );
}
