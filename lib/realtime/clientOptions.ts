// lib/realtime/clientOptions.ts
// Builds the pusher-js connection options for BOTH deployment modes:
//
//   • Self-hosted Soketi (the LAN appliance, default): NEXT_PUBLIC_PUSHER_CLUSTER
//     is blank. The browser connects to the same host:port it loaded the page
//     from — Caddy proxies /app/* to the soketi container — so the box's LAN IP
//     can change freely without rebuilding the client bundle.
//     NEXT_PUBLIC_PUSHER_HOST/PORT can still override this for a direct
//     (non-proxied) soketi connection.
//
//   • Cloud Pusher: NEXT_PUBLIC_PUSHER_CLUSTER is set and no host override —
//     behaves exactly as before.
//
// No runtime import of pusher-js here (type-only) so consumers keep lazy-loading.

import type { Options } from 'pusher-js';

/** Shared keep-alive tuning: ping after 30s idle, reconnect if no pong in 10s. */
const KEEPALIVE: Pick<Options, 'activityTimeout' | 'pongTimeout'> = {
  activityTimeout: 30_000,
  pongTimeout: 10_000,
};

/** Restrict to raw websockets — never fall back to pusher.com's sockjs hosts. */
const WS_ONLY: Options['enabledTransports'] = ['ws'];

/**
 * Returns the pusher-js Options for this deployment, or null when realtime is
 * not configured (missing key) or when called on the server.
 */
export function getRealtimeOptions(): Options | null {
  if (typeof window === 'undefined') return null;

  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  if (!key) return null;

  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  const host = process.env.NEXT_PUBLIC_PUSHER_HOST;
  const port = process.env.NEXT_PUBLIC_PUSHER_PORT;

  // Cloud Pusher mode — a real cluster, no local host override.
  if (cluster && !host) {
    return { cluster, ...KEEPALIVE };
  }

  // Self-hosted with explicit host — direct connection to soketi's own port.
  if (host) {
    return {
      cluster: 'mt1', // required by pusher-js validation; ignored when wsHost is set
      wsHost: host,
      wsPort: port ? Number(port) : 6001,
      forceTLS: false,
      enabledTransports: WS_ONLY,
      ...KEEPALIVE,
    };
  }

  // Self-hosted, same-origin (the appliance default): Caddy proxies /app/* to
  // soketi, so the websocket lives at exactly the address the user typed.
  // Works over http (ws) and https (wss) and survives LAN IP changes.
  const isTLS = window.location.protocol === 'https:';
  const originPort = window.location.port
    ? Number(window.location.port)
    : isTLS
      ? 443
      : 80;

  return {
    cluster: 'mt1',
    wsHost: window.location.hostname,
    wsPort: originPort,
    wssPort: originPort,
    forceTLS: isTLS,
    enabledTransports: WS_ONLY,
    ...KEEPALIVE,
  };
}

/** The public key the client authenticates with (null = realtime disabled). */
export function getRealtimeKey(): string | null {
  return process.env.NEXT_PUBLIC_PUSHER_KEY || null;
}
