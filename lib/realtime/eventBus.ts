// lib/realtime/eventBus.ts
// Server-side event broadcaster.
// API route handlers call `broadcastEvent(…)` after mutations.
// Events are pushed to clients via Pusher with retry + payload-size safety.
// If Pusher is unavailable (missing env vars or trigger failure), clients
// fall back to polling automatically.

import { RealtimeEvent } from './types';
import { safeTrigger } from './pusher-server';

/**
 * Broadcast a real-time event to all connected clients via Pusher.
 * Fires-and-forgets — a Pusher failure does NOT block the API response.
 */
export function broadcastEvent(event: RealtimeEvent): void {
  safeTrigger(event.type, event as unknown as Record<string, unknown>).catch(
    () => {
      // Already logged inside safeTrigger — swallow here so callers
      // never need to handle broadcast failures.
    },
  );
}
