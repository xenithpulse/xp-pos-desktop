// lib/hooks/useNow.ts
// Ticking clock for time-derived UI.
//
// Reservation state is a function of the clock, not of server writes: a hold
// window that opens at 20:30 must appear at 20:30 even if nothing has been
// fetched since 18:00. Components that render countdowns or phase chips read
// `now` from here so they re-render on their own.

'use client';

import { useEffect, useState } from 'react';

/**
 * Current time, re-rendered every `intervalMs` (default 30s).
 * The interval realigns to the wall clock so several components sharing the
 * same cadence flip together rather than drifting apart.
 */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (intervalMs <= 0) return;

    let intervalId: ReturnType<typeof setInterval>;

    const tick = () => setNow(new Date());

    // Align the first tick to the next interval boundary, then settle into a
    // steady interval.
    const delay = intervalMs - (Date.now() % intervalMs);
    const timeoutId = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, intervalMs);
    }, delay);

    // Coming back to a backgrounded tab: throttled timers may have skipped, so
    // resync immediately rather than showing a stale countdown.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return now;
}

export default useNow;
