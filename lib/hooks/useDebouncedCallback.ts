// lib/hooks/useDebouncedCallback.ts
// Debounce utility hook for expensive/bulk operations.
// Only the LAST invocation within `delayMs` triggers the actual callback.
// Returns a stable function reference + a `flush()` to force-fire immediately.

'use client';

import { useCallback, useRef, useEffect } from 'react';

export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delayMs: number,
): { debouncedFn: (...args: Parameters<T>) => void; flush: () => void; cancel: () => void } {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArgsRef = useRef<Parameters<T> | null>(null);

  // Keep callback ref up-to-date without invalidating memoised functions
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingArgsRef.current = null;
  }, []);

  const flush = useCallback(() => {
    if (pendingArgsRef.current) {
      const args = pendingArgsRef.current;
      cancel();
      callbackRef.current(...args);
    }
  }, [cancel]);

  const debouncedFn = useCallback(
    (...args: Parameters<T>) => {
      pendingArgsRef.current = args;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const a = pendingArgsRef.current;
        pendingArgsRef.current = null;
        timerRef.current = null;
        if (a) callbackRef.current(...a);
      }, delayMs);
    },
    [delayMs],
  );

  // Cleanup on unmount
  useEffect(() => cancel, [cancel]);

  return { debouncedFn, flush, cancel };
}
