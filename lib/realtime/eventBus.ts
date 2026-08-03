// lib/realtime/eventBus.ts
// Server-side event broadcaster.
// API route handlers call `broadcastEvent(…)` after mutations.
// Events are pushed to clients over the in-process WebSocket server
// (lib/realtime/wsServer.ts). If that server is not attached — during startup,
// or if it failed to bind — broadcasting is a no-op and clients fall back to
// polling automatically, exactly as they did when Pusher env vars were absent.
//
// This module deliberately imports NOTHING from wsServer at runtime. It reaches
// the server through a globalThis slot instead, for two reasons:
//   1. Importing wsServer here would pull `ws` and node:http into every route
//      that broadcasts, and would run wsServer's attach side effect from
//      whichever route happened to be compiled first.
//   2. The indirection is what makes "realtime not running" a normal state
//      rather than an import error.

import type { RealtimeEvent } from './types';

/**
 * Where wsServer publishes itself. A Symbol.for key survives module
 * duplication (dev HMR, separate compilation units) because it is looked up in
 * the global symbol registry rather than by module identity.
 */
export const REALTIME_REGISTRY_KEY = Symbol.for('xp-pos.realtimeServer');

/** The surface wsServer exposes to the rest of the server-side code. */
export interface RealtimeRegistry {
  /** Fan an event out to every connected client. */
  broadcast(event: RealtimeEvent): void;
  /** Send an arbitrary payload to every socket belonging to one username. */
  sendToUser(username: string, message: unknown): void;
  /** Currently connected sockets — diagnostics only. */
  clientCount(): number;
}

function registry(): RealtimeRegistry | null {
  const g = globalThis as Record<symbol, unknown>;
  return (g[REALTIME_REGISTRY_KEY] as RealtimeRegistry | undefined) ?? null;
}

/**
 * Broadcast a real-time event to all connected clients.
 * Fires-and-forgets — a realtime failure does NOT block the API response and
 * never throws into a route handler.
 *
 * Note there is no payload-size trimming here any more. That existed to stay
 * under Pusher's 10 KB per-event cloud limit; we are writing to a local socket
 * and no such limit applies. Clients therefore always get the full payload and
 * the `trimmed` flag in the event payload types is now vestigial.
 */
export function broadcastEvent(event: RealtimeEvent): void {
  try {
    registry()?.broadcast(event);
  } catch (err) {
    // Swallow — callers must never need to handle broadcast failures.
    console.error('[realtime] broadcast failed:', err);
  }
}

/**
 * Send a payload to one signed-in user's sockets (all their tabs and devices).
 * Used for per-user fan-out that is not a POS-wide event — see
 * app/api/daily-sheet/edit-context/route.ts.
 *
 * Same contract as broadcastEvent: fire-and-forget, never throws.
 */
export function sendToUser(username: string, message: unknown): void {
  try {
    registry()?.sendToUser(username, message);
  } catch (err) {
    console.error('[realtime] sendToUser failed:', err);
  }
}
