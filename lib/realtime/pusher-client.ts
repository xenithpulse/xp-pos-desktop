// lib/realtime/pusher-client.ts
// Client-side Pusher instance (singleton).
// Connection options come from lib/realtime/clientOptions so this stays in
// lock-step with useRealtimeSync (local Soketi on the LAN, or cloud Pusher).

import PusherClient from 'pusher-js';
import { getRealtimeKey, getRealtimeOptions } from './clientOptions';

const KEY = Symbol.for('xp-pos.pusherClient');

function getPusherClient(): PusherClient | null {
  if (typeof window === 'undefined') return null;

  const key = getRealtimeKey();
  const options = getRealtimeOptions();
  if (!key || !options) return null;

  const g = globalThis as Record<symbol, PusherClient | undefined>;
  if (!g[KEY]) {
    g[KEY] = new PusherClient(key, options);
  }
  return g[KEY]!;
}

export const pusherClient = getPusherClient();

export const PUSHER_CHANNEL = 'xp-pos';
