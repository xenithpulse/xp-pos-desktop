// lib/hooks/useRealtimeSync.ts
// Real-time synchronisation hook.
//  • Primary channel: Pusher (push from server)
//  • Fallback: Throttled polling when Pusher is unavailable or disconnects
//  • Event dedup: ignores events already seen within a sliding window
//  • Reconnect catch-up: fires a full refresh after reconnecting so nothing
//    is missed while the socket was down.

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeEvent, RealtimeEventType } from '@/lib/realtime/types';
import type PusherClient from 'pusher-js';
import type { Channel } from 'pusher-js';
import { getRealtimeKey, getRealtimeOptions } from '@/lib/realtime/clientOptions';

// ── Configuration ────────────────────────────────────────────────────────────

interface UseRealtimeSyncOptions {
  /** Polling interval in ms when Pusher is unavailable (default: 10_000) */
  pollingInterval?: number;
  /** Which event types this consumer cares about */
  eventFilter?: RealtimeEventType[];
  /** Called whenever a matching event arrives */
  onEvent?: (event: RealtimeEvent) => void;
  /** If true, don't start Pusher at all */
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

const PUSHER_CHANNEL = 'xp-pos';

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
  const pusherRef = useRef<PusherClient | null>(null);
  const channelRef = useRef<Channel | null>(null);
  const mountedRef = useRef(true);
  const connectingRef = useRef(false); // Guard against double-init

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

    setStatus('polling');
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

  // ── Cleanup helper ───────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unbind_all();
      channelRef.current = null;
    }
    if (pusherRef.current) {
      pusherRef.current.disconnect();
      pusherRef.current = null;
    }
    stopPolling();
    connectingRef.current = false;
  }, [stopPolling]);

  // ── Pusher Connection ────────────────────────────────────────────────────

  const connectPusher = useCallback(() => {
    if (disabled || typeof window === 'undefined' || !mountedRef.current) return;
    if (connectingRef.current) return; // Already connecting — prevent double-init
    connectingRef.current = true;

    const key = getRealtimeKey();
    const connectionOptions = getRealtimeOptions();

    if (!key || !connectionOptions) {
      console.warn('[Realtime] NEXT_PUBLIC_PUSHER_KEY missing, using sync polling');
      connectingRef.current = false;
      startPolling();
      return;
    }

    setStatus('connecting');

    import('pusher-js').then((mod) => {
      if (!mountedRef.current) return;
      const PusherConstructor = mod.default;

      // Cleanup previous instance
      if (pusherRef.current) {
        pusherRef.current.disconnect();
      }

      // Options resolve to local Soketi (same-origin via Caddy, or explicit
      // host) or cloud Pusher depending on env — see lib/realtime/clientOptions.
      // pusher-js handles reconnection with back-off internally.
      const client = new PusherConstructor(key, connectionOptions);
      pusherRef.current = client;

      const channel = client.subscribe(PUSHER_CHANNEL);
      channelRef.current = channel;

      // Bind events with dedup
      const eventsToListen = filterRef.current ?? ALL_EVENTS;
      for (const eventType of eventsToListen) {
        channel.bind(eventType, (data: RealtimeEvent) => {
          if (!mountedRef.current) return;
          if (isDuplicate(data)) return;
          onEventRef.current?.(data);
        });
      }

      // ── Connection state management ────────────────────────────────────

      client.connection.bind('connected', () => {
        if (!mountedRef.current) return;
        const wasPolling = pollingRef.current !== null;
        setStatus('connected');
        stopPolling();
        connectingRef.current = false;

        // Catch-up: if we were polling or reconnecting, we may have missed
        // events — fire a synthetic poll so the consumer refreshes everything.
        if (wasPolling) {
          onEventRef.current?.({
            type: 'table:updated',
            entityId: '__poll__',
            payload: { poll: true, reason: 'reconnect-catchup' },
            timestamp: Date.now(),
          });
        }
      });

      client.connection.bind('disconnected', () => {
        if (!mountedRef.current) return;
        setStatus('polling');
        connectingRef.current = false;
        startPolling();
      });

      client.connection.bind('failed', () => {
        if (!mountedRef.current) return;
        setStatus('polling');
        connectingRef.current = false;
        startPolling();
      });

      client.connection.bind('unavailable', () => {
        if (!mountedRef.current) return;
        setStatus('polling');
        connectingRef.current = false;
        startPolling();
      });

    }).catch(() => {
      if (!mountedRef.current) return;
      console.warn('[Realtime] Failed to load pusher-js, using sync polling');
      connectingRef.current = false;
      startPolling();
    });
  }, [disabled, startPolling, stopPolling, isDuplicate]);

  // ── Lifecycle ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (disabled) return;

    connectPusher();

    return () => {
      cleanup();
      setStatus('disconnected');
    };
  }, [connectPusher, disabled, cleanup]);

  // ── Manual trigger ──────────────────────────────────────────────────────

  const reconnect = useCallback(() => {
    cleanup();
    connectPusher();
  }, [connectPusher, cleanup]);

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
