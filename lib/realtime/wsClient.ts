// lib/realtime/wsClient.ts
// Browser-side WebSocket connection to the in-process realtime server.
//
// ── One socket per browser, not one per hook ────────────────────────────────
// This is a module-level singleton with a subscriber list. Two different
// consumers (the hub's useRealtimeSync and DailySheetContext) both need the
// realtime feed, and opening a second socket per consumer would double the
// connection count on every terminal for no benefit. Subscribers are
// ref-counted: the socket opens on the first subscriber and closes when the
// last one leaves.
//
// ── Reconnection is ours now ────────────────────────────────────────────────
// pusher-js did this for free; the native WebSocket does not. Exponential
// backoff with jitter, capped at 30s. The jitter matters on an appliance: when
// the box reboots, every terminal in the restaurant reconnects at once, and
// un-jittered backoff would have them all retry in lockstep forever.
//
// ── Same-origin by construction ─────────────────────────────────────────────
// The URL is derived from window.location, never from a NEXT_PUBLIC_* build
// arg. That is what lets ONE compiled artifact ship to every client site and
// keep working when the box's LAN IP changes. Do not "improve" this by making
// the host configurable — the previous Pusher setup carried four
// NEXT_PUBLIC_PUSHER_* build args purely to work around not doing this.

import type { RealtimeEvent } from './types';

export type RealtimeStatus = 'connecting' | 'connected' | 'polling' | 'disconnected';

/**
 * Anything the server sends. Broadcast events are bare RealtimeEvents (no
 * envelope — the consumer filters by `type`). User-scoped messages carry their
 * own `type` string outside the RealtimeEventType union, so a consumer that
 * only knows about POS events naturally ignores them.
 */
export type RealtimeMessage = RealtimeEvent | { type: string; [k: string]: unknown };

type MessageHandler = (message: RealtimeMessage) => void;
type StatusHandler = (status: RealtimeStatus) => void;

/** Backoff: 500ms doubling to 30s, with up to 30% jitter subtracted. */
const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 30_000;
const JITTER_RATIO = 0.3;

function backoffDelay(attempt: number): number {
  const raw = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS);
  return Math.round(raw * (1 - Math.random() * JITTER_RATIO));
}

/** ws:// or wss:// on the SAME host and port the page came from, at /ws. */
function socketUrl(): string {
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${window.location.host}/ws`;
}

interface ClientState {
  socket: WebSocket | null;
  messageHandlers: Set<MessageHandler>;
  statusHandlers: Set<StatusHandler>;
  status: RealtimeStatus;
  attempt: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  /** True once close() was called deliberately, so onclose does not reconnect. */
  closing: boolean;
}

// Survives dev HMR — a fresh module instance would otherwise leak the old
// socket and double every event.
const KEY = Symbol.for('xp-pos.realtimeClient');

function getState(): ClientState {
  const g = globalThis as Record<symbol, ClientState | undefined>;
  if (!g[KEY]) {
    g[KEY] = {
      socket: null,
      messageHandlers: new Set(),
      statusHandlers: new Set(),
      status: 'disconnected',
      attempt: 0,
      retryTimer: null,
      closing: false,
    };
  }
  return g[KEY]!;
}

function setStatus(s: ClientState, next: RealtimeStatus): void {
  if (s.status === next) return;
  s.status = next;
  for (const h of s.statusHandlers) {
    try {
      h(next);
    } catch {
      // A throwing subscriber must not take down the others.
    }
  }
}

function scheduleReconnect(s: ClientState): void {
  if (s.closing || s.retryTimer || s.messageHandlers.size === 0) return;
  const delay = backoffDelay(s.attempt);
  s.attempt += 1;
  s.retryTimer = setTimeout(() => {
    s.retryTimer = null;
    open(s);
  }, delay);
}

function open(s: ClientState): void {
  if (typeof window === 'undefined') return;
  if (s.socket && (s.socket.readyState === WebSocket.OPEN || s.socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  setStatus(s, 'connecting');

  let socket: WebSocket;
  try {
    socket = new WebSocket(socketUrl());
  } catch {
    setStatus(s, 'polling');
    scheduleReconnect(s);
    return;
  }
  s.socket = socket;

  socket.onopen = () => {
    s.attempt = 0;
    setStatus(s, 'connected');
  };

  socket.onmessage = (ev) => {
    let parsed: RealtimeMessage;
    try {
      parsed = JSON.parse(typeof ev.data === 'string' ? ev.data : '');
    } catch {
      return; // ignore anything that is not JSON we sent
    }
    if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') return;
    for (const h of s.messageHandlers) {
      try {
        h(parsed);
      } catch (err) {
        console.error('[realtime] subscriber threw:', err);
      }
    }
  };

  // A rejected upgrade (401) surfaces as an error followed by a close. We do
  // not special-case it: the consumer drops to polling and keeps retrying,
  // which is the right behaviour if the session merely expired mid-shift.
  socket.onerror = () => setStatus(s, 'polling');

  socket.onclose = () => {
    s.socket = null;
    if (s.closing) {
      setStatus(s, 'disconnected');
      return;
    }
    setStatus(s, 'polling');
    scheduleReconnect(s);
  };
}

function closeIfIdle(s: ClientState): void {
  if (s.messageHandlers.size > 0) return;
  s.closing = true;
  if (s.retryTimer) {
    clearTimeout(s.retryTimer);
    s.retryTimer = null;
  }
  if (s.socket) {
    try {
      s.socket.close();
    } catch {
      // already gone
    }
    s.socket = null;
  }
  setStatus(s, 'disconnected');
}

/**
 * Subscribe to the realtime feed. Returns an unsubscribe function.
 * The socket is opened on the first subscriber and closed after the last one
 * unsubscribes.
 */
export function subscribeRealtime(
  onMessage: MessageHandler,
  onStatus?: StatusHandler,
): () => void {
  const s = getState();
  s.messageHandlers.add(onMessage);
  if (onStatus) {
    s.statusHandlers.add(onStatus);
    onStatus(s.status); // report current state immediately
  }

  s.closing = false;
  open(s);

  return () => {
    s.messageHandlers.delete(onMessage);
    if (onStatus) s.statusHandlers.delete(onStatus);
    closeIfIdle(s);
  };
}

/** Current connection status without subscribing. */
export function realtimeStatus(): RealtimeStatus {
  return getState().status;
}

/**
 * Drop the socket and reconnect immediately, resetting backoff.
 * Backs the manual `reconnect()` that useRealtimeSync exposes.
 */
export function reconnectRealtime(): void {
  const s = getState();
  if (s.retryTimer) {
    clearTimeout(s.retryTimer);
    s.retryTimer = null;
  }
  s.attempt = 0;
  s.closing = false;
  if (s.socket) {
    try {
      // onclose would schedule a backoff reconnect; we want an immediate one.
      s.socket.onclose = null;
      s.socket.close();
    } catch {
      // already gone
    }
    s.socket = null;
  }
  open(s);
}
