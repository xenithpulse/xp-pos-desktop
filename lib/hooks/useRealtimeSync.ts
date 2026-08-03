// lib/hooks/useRealtimeSync.ts
// Real-time synchronisation hook.
//  • Primary channel: the in-process WebSocket server (push from server)
//  • Fallback: Throttled polling when the socket is unavailable or drops
//  • Event dedup: ignores events already seen within a sliding window
//  • Reconnect catch-up: fires a full refresh after reconnecting so nothing
//    is missed while the socket was down.
//
// The public contract is unchanged from the Pusher implementation this
// replaced: same options in, same { status, reconnect } out. Reconnection and
// backoff now live in lib/realtime/wsClient.ts (pusher-js used to provide
// them); this hook only reacts to the status it reports.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeEvent, RealtimeEventType } from '@/lib/realtime/types';
import {
  subscribeRealtime,
  reconnectRealtime,
  type RealtimeMessage,
  type RealtimeStatus,
} from '@/lib/realtime/wsClient';

// ── Configuration ────────────────────────────────────────────────────────────

interface UseRealtimeSyncOptions {
  /** Polling interval in ms when the socket is unavailable (default: 10_000) */
  pollingInterval?: number;
  /** Which event types this consumer cares about */
  eventFilter?: RealtimeEventType[];
  /** Called whenever a matching event arrives */
  onEvent?: (event: RealtimeEvent) => void;
  /** If true, don't open the socket at all */
  disabled?: boolean;
}

type ConnectionStatus = 'connecting' | 'connected' | 'polling' | 'disconnected';

const ALL_EVENTS: RealtimeEventType[] = [
  'table:updated', 'table:session_started', 'table:session_closed',
  'order:updated', 'order:items_fired', 'order:items_updated',
  'order:completed', 'order:cancelled',
  'session:updated', 'session:closed',
  'menu:item_created', 'menu:item_updated',
  'menu:category_created', 'menu:category_updated',
  'settings:updated',
];

/** Sliding window (ms) for event dedup — ignore events with same entityId+type within this window */
const DEDUP_WINDOW_MS = 500;
/** Max number of tracked dedup keys before pruning (sized for 50+ concurrent users) */
const DEDUP_MAX_SIZE = 500;

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRealtimeSync(options: UseRealtimeSyncOptions = {}) {
  const {
    pollingInterval = 10_000,
    eventFilter,
    onEvent,
    disabled = false,
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEventRef = useRef(onEvent);
  const filterRef = useRef(eventFilter);
  const mountedRef = useRef(true);

  // Event dedup map: key → timestamp of last seen
  const dedupMap = useRef<Map<string, number>>(new Map());

  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { filterRef.current = eventFilter; }, [eventFilter]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Event dedup ──────────────────────────────────────────────────────────

  const isDuplicate = useCallback((event: RealtimeEvent): boolean => {
    const key = `${event.type}:${event.entityId}:${event.timestamp}`;
    const now = Date.now();
    const lastSeen = dedupMap.current.get(key);
    if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) return true;

    dedupMap.current.set(key, now);

    // Prune old entries when map grows too large
    if (dedupMap.current.size > DEDUP_MAX_SIZE) {
      const cutoff = now - DEDUP_WINDOW_MS;
      for (const [k, ts] of dedupMap.current) {
        if (ts < cutoff) dedupMap.current.delete(k);
      }
    }
    return false;
  }, []);

  // ── Polling Fallback ─────────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (pollingRef.current || !mountedRef.current) return;

    pollingRef.current = setInterval(() => {
      if (!mountedRef.current) return;
      onEventRef.current?.({
        type: 'table:updated',
        entityId: '__poll__',
        payload: { poll: true },
        timestamp: Date.now(),
      });
    }, pollingInterval);
  }, [pollingInterval]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // ── Socket subscription ──────────────────────────────────────────────────

  useEffect(() => {
    if (disabled) {
      setStatus('disconnected');
      return;
    }

    const handleMessage = (message: RealtimeMessage) => {
      if (!mountedRef.current) return;

      // Only POS events reach the consumer. Anything else on the socket —
      // e.g. the per-user daily-sheet message — carries a `type` outside this
      // union and is ignored here, which mirrors how the Pusher version bound
      // only the event names it cared about.
      const allowed = filterRef.current ?? ALL_EVENTS;
      if (!allowed.includes(message.type as RealtimeEventType)) return;

      const event = message as RealtimeEvent;
      if (isDuplicate(event)) return;
      onEventRef.current?.(event);
    };

    const handleStatus = (next: RealtimeStatus) => {
      if (!mountedRef.current) return;

      if (next === 'connected') {
        // Catch-up: if we were polling, we may have missed events while the
        // socket was down — fire a synthetic poll so the consumer refreshes
        // everything. The hub depends on this to resync its floor plan.
        const wasPolling = pollingRef.current !== null;
        stopPolling();
        setStatus('connected');
        if (wasPolling) {
          onEventRef.current?.({
            type: 'table:updated',
            entityId: '__poll__',
            payload: { poll: true, reason: 'reconnect-catchup' },
            timestamp: Date.now(),
          });
        }
        return;
      }

      setStatus(next);
      if (next === 'polling' || next === 'disconnected') startPolling();
    };

    const unsubscribe = subscribeRealtime(handleMessage, handleStatus);

    return () => {
      unsubscribe();
      stopPolling();
      setStatus('disconnected');
    };
  }, [disabled, isDuplicate, startPolling, stopPolling]);

  // ── Manual trigger ──────────────────────────────────────────────────────

  const reconnect = useCallback(() => {
    stopPolling();
    reconnectRealtime();
  }, [stopPolling]);

  return { status, reconnect };
}

// ── SWR-style fetcher ────────────────────────────────────────────────────────

interface UseSWRFetchOptions<T> {
  /** Fetch function that returns fresh data */
  fetcher: () => Promise<T>;
  /** Revalidation interval in ms (default: 30_000). 0 = never auto-revalidate */
  revalidateInterval?: number;
  /** If true, don't fetch on mount */
  disabled?: boolean;
  /** Called when a fetch fails */
  onError?: (err: unknown) => void;
}

interface SWRState<T> {
  data: T | null;
  error: unknown | null;
  isValidating: boolean;
  isStale: boolean;
}

export function useSWRFetch<T>(options: UseSWRFetchOptions<T>) {
  const { fetcher, revalidateInterval = 30_000, disabled = false, onError } = options;

  const [state, setState] = useState<SWRState<T>>({
    data: null,
    error: null,
    isValidating: false,
    isStale: true,
  });

  const fetcherRef = useRef(fetcher);
  const mountedRef = useRef(true);
  const dedupRef = useRef<Promise<T> | null>(null);
  const lastFetchRef = useRef(0);

  useEffect(() => { fetcherRef.current = fetcher; }, [fetcher]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const mutate = useCallback(async (revalidate = true) => {
    if (!mountedRef.current) return;

    // Dedup: if already fetching, return existing promise
    if (dedupRef.current) return dedupRef.current;

    // Throttle: skip if fetched less than 2s ago
    const now = Date.now();
    if (now - lastFetchRef.current < 2_000) return;

    setState((prev) => ({ ...prev, isValidating: true }));

    const promise = fetcherRef.current();
    dedupRef.current = promise;

    try {
      const data = await promise;
      lastFetchRef.current = Date.now();
      if (mountedRef.current) {
        setState({ data, error: null, isValidating: false, isStale: false });
      }
    } catch (err) {
      if (mountedRef.current) {
        setState((prev) => ({ ...prev, error: err, isValidating: false, isStale: true }));
        onError?.(err);
      }
    } finally {
      dedupRef.current = null;
    }
  }, [onError]);

  // Initial fetch
  useEffect(() => {
    if (!disabled) mutate();
  }, [disabled, mutate]);

  // Background revalidation interval
  useEffect(() => {
    if (disabled || revalidateInterval <= 0) return;
    const id = setInterval(() => mutate(), revalidateInterval);
    return () => clearInterval(id);
  }, [disabled, revalidateInterval, mutate]);

  return { ...state, mutate };
}
