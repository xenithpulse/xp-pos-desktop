// lib/realtime/pusher-server.ts
// Server-side Pusher instance (singleton, survives HMR).
// Handles batching, payload size enforcement, and transient-failure retry.

import Pusher from 'pusher';

const KEY = Symbol.for('xp-pos.pusherServer');

/** Pusher enforces a 10 KB limit per event payload. */
const MAX_PAYLOAD_BYTES = 10_000;

function getPusherServer(): Pusher | null {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.PUSHER_KEY;
  const secret = process.env.PUSHER_SECRET;
  const cluster = process.env.PUSHER_CLUSTER;
  // Self-hosted (Soketi) mode: PUSHER_HOST points at the local realtime server
  // on the docker network (e.g. "soketi"). Takes precedence over cluster so the
  // LAN appliance never talks to the Pusher cloud.
  const host = process.env.PUSHER_HOST;
  const port = process.env.PUSHER_PORT || '6001';
  const useTLS = process.env.PUSHER_USE_TLS === 'true';

  if (!appId || !key || !secret || (!host && !cluster)) {
    console.warn('[Pusher] Missing env vars — Pusher disabled, falling back to polling');
    return null;
  }

  const g = globalThis as Record<symbol, Pusher | undefined>;
  if (!g[KEY]) {
    g[KEY] = host
      ? new Pusher({ appId, key, secret, host, port, useTLS })
      : new Pusher({ appId, key, secret, cluster: cluster!, useTLS: true });
  }
  return g[KEY]!;
}

export const pusherServer = getPusherServer();

/** The Pusher channel name used for all real-time POS events. */
export const PUSHER_CHANNEL = 'xp-pos';

/**
 * Safely trigger a Pusher event with payload-size enforcement and retry.
 * If the serialised payload exceeds Pusher's 10 KB limit, it is trimmed
 * to just the essential fields so subscribers still get a "something changed"
 * notification and can fetch the full data themselves.
 */
export async function safeTrigger(
  eventName: string,
  data: Record<string, unknown>,
  retries = 1,
): Promise<void> {
  if (!pusherServer) return;

  let payload = data;
  const raw = JSON.stringify(data);
  if (Buffer.byteLength(raw, 'utf8') > MAX_PAYLOAD_BYTES) {
    // Trim to essentials — the client will re-fetch the full entity
    payload = {
      type: data.type,
      entityId: data.entityId,
      timestamp: data.timestamp,
      payload: { trimmed: true },
    };
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await pusherServer.trigger(PUSHER_CHANNEL, eventName, payload);
      return;
    } catch (err: unknown) {
      const isLast = attempt === retries;
      if (isLast) {
        console.error('[Pusher] trigger failed after retries:', err);
        return; // swallow — clients will fall back to polling
      }
      // Brief jitter before retry
      await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    }
  }
}
