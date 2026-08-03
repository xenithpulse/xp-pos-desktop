// lib/realtime/wsServer.ts
// In-process WebSocket server. Replaces the Soketi sidecar.
//
// WHY THIS EXISTS AT ALL: Soketi 1.6 is a Node-16-era app built on
// uWebSockets.js, a native C++ addon pinned to specific Node ABI versions.
// Shipping it natively would mean putting an end-of-life Node 16 runtime on a
// box that processes payments. `ws` is pure JS, so it just comes along with the
// app and needs no compiler, no prebuild, and no second process.
//
// ── How it attaches ─────────────────────────────────────────────────────────
// This module is imported ONLY from instrumentation.ts, and only under
// NEXT_RUNTIME === 'nodejs', via a dynamic import. That indirection is not
// stylistic: Next compiles instrumentation.ts for every runtime including edge,
// and the compile-time module trace does NOT respect a runtime `if` guard. A
// static import of `ws` or `node:http` from instrumentation is an edge build
// error.
//
// We do not create an HTTP server — we borrow the one Next already made.
// `register()` runs AFTER next/dist/server/lib/start-server.js has called
// http.createServer() and bound the port, so monkeypatching http.createServer
// from here is too late and silently never fires. Instead we find the live
// server in the event loop's active handles and add a second 'upgrade'
// listener beside Next's own. Verified on Next 16.2.10 standalone: Next's
// listener is registered first, ours is additive, and taking the socket with
// handleUpgrade() in noServer mode produces no error from Next's handler.
//
// The upshot is one process, one Windows service, one port. `broadcastEvent`
// reaches sockets by direct function call — no inter-process hop, and no
// shared secret to keep in sync between two services.

import type { Server } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { getToken } from 'next-auth/jwt';
import { REALTIME_REGISTRY_KEY, type RealtimeRegistry } from './eventBus';
import type { RealtimeEvent } from './types';

/** Path the browser connects to. Same origin as the app — see wsClient.ts. */
const WS_PATH = '/ws';

/**
 * Keep-alive tuning. Mirrors the pusher-js values this replaces
 * (activityTimeout 30s / pongTimeout 10s) so behaviour on a flaky café WiFi is
 * unchanged: ping after 30s, give up 10s later.
 */
const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

/** Per-socket state we need but `ws` does not carry for us. */
interface SocketState {
  username: string | null;
  pongTimer: ReturnType<typeof setTimeout> | null;
}

const state = new WeakMap<WebSocket, SocketState>();

// ── Cookie / session handling ────────────────────────────────────────────────

/**
 * Minimal cookie-header parser.
 *
 * next-auth's getToken() reads `req.cookies` and NEVER falls back to
 * `req.headers.cookie` (see SessionStore in next-auth/core/lib/cookie.js). A
 * raw IncomingMessage from an 'upgrade' event has no `.cookies`, so getToken
 * would always return null and every client would be rejected. We parse the
 * header ourselves and hand getToken the shape it expects.
 *
 * Decoding the JWT by hand was the other option and is worse: next-auth v4
 * session tokens are JWE-encrypted (A256GCM), so "just verify the signature"
 * would mean reimplementing its HKDF key derivation. Feeding getToken proper
 * cookies keeps next-auth responsible for its own crypto.
 */
function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

/**
 * Resolve the signed-in username for an upgrade request, or null to reject.
 *
 * Soketi was completely unauthenticated: any device that could reach the LAN
 * port received every order, table and settings event. We do not carry that
 * forward — the socket now requires the same session cookie as the rest of the
 * app.
 */
async function authenticate(req: IncomingMessage): Promise<string | null> {
  const cookies = parseCookies(req.headers.cookie);

  // Which cookie name is in play depends on deployment mode: plain-HTTP LAN
  // access uses the unprefixed name, APP_DOMAIN/HTTPS mode uses the __Secure-
  // prefix. Rather than infer it from env (COOKIE_SECURE and NEXTAUTH_URL can
  // disagree with what the browser actually sent), look at what arrived.
  const secureName = '__Secure-next-auth.session-token';
  const plainName = 'next-auth.session-token';
  const isSecure = Object.keys(cookies).some((n) => n.startsWith(secureName));
  const cookieName = isSecure ? secureName : plainName;

  try {
    const token = await getToken({
      // getToken only needs these two fields; the cast keeps us honest about
      // the fact that this is not a real Next request object.
      req: { cookies, headers: req.headers } as unknown as Parameters<typeof getToken>[0]['req'],
      secret: process.env.NEXTAUTH_SECRET || process.env.SECRET,
      cookieName,
      secureCookie: isSecure,
    });
    const name = token?.user?.name;
    return typeof name === 'string' && name.length > 0 ? name : null;
  } catch (err) {
    console.warn('[realtime] session verification failed:', err);
    return null;
  }
}

// ── Server ───────────────────────────────────────────────────────────────────

/**
 * Locate the HTTP server Next is listening on.
 *
 * `_getActiveHandles` is undocumented but stable across Node 18-25, and it is
 * the only way to reach a server instance we did not create. We pick a
 * listening handle that has a 'request' listener, preferring one whose bound
 * port matches PORT when that is set (in `next dev` there can be more than one
 * server alive).
 */
function findHttpServer(): Server | null {
  const handles =
    (process as unknown as { _getActiveHandles?: () => unknown[] })._getActiveHandles?.() ?? [];

  const candidates: Server[] = [];
  for (const h of handles) {
    const maybe = h as Partial<Server> & { listening?: boolean };
    if (!maybe || typeof maybe.listen !== 'function' || !maybe.listening) continue;
    const emitter = h as unknown as { eventNames?: () => (string | symbol)[] };
    if (!(emitter.eventNames?.() ?? []).includes('request')) continue;
    candidates.push(h as Server);
  }
  if (candidates.length === 0) return null;

  const wanted = process.env.PORT ? Number(process.env.PORT) : null;
  if (wanted) {
    const match = candidates.find((s) => {
      const addr = s.address();
      return addr && typeof addr === 'object' && addr.port === wanted;
    });
    if (match) return match;
  }
  return candidates[0];
}

/** Send a JSON payload to one socket, swallowing a dead-socket write. */
function sendJson(socket: WebSocket, data: unknown): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify(data));
  } catch {
    // A socket that died between the readyState check and the write is not an
    // error worth logging on every broadcast — the close handler cleans up.
  }
}

function startServer(): void {
  const g = globalThis as Record<symbol, unknown>;
  if (g[REALTIME_REGISTRY_KEY]) return; // already attached (HMR re-import)

  const server = findHttpServer();
  if (!server) {
    // Not fatal: broadcastEvent no-ops when the registry is absent and the
    // clients fall back to polling, exactly as they did when Pusher env vars
    // were missing. Log loudly because realtime is silently degraded.
    console.error('[realtime] could not find the HTTP server — realtime disabled, clients will poll');
    return;
  }

  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (socket: WebSocket, _req: IncomingMessage, username: string) => {
    state.set(socket, { username, pongTimer: null });

    socket.on('pong', () => {
      const s = state.get(socket);
      if (s?.pongTimer) {
        clearTimeout(s.pongTimer);
        s.pongTimer = null;
      }
    });

    socket.on('close', () => {
      const s = state.get(socket);
      if (s?.pongTimer) clearTimeout(s.pongTimer);
      state.delete(socket);
    });

    // The client never sends us anything (see the protocol note in wsClient).
    // Ignore whatever arrives rather than letting a malformed frame throw.
    socket.on('message', () => {});
    socket.on('error', () => socket.terminate());
  });

  // Heartbeat. Ping every 30s; if the pong has not landed 10s later the
  // connection is wedged (a NAT that dropped the flow without a FIN is the
  // common case on café WiFi) and we terminate so the client reconnects.
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const s = state.get(socket);
      if (!s) continue;
      if (s.pongTimer) continue; // a ping is already outstanding
      s.pongTimer = setTimeout(() => socket.terminate(), PONG_TIMEOUT_MS);
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }
  }, PING_INTERVAL_MS);
  // Do not hold the process open just for the heartbeat.
  heartbeat.unref?.();

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    // Anything that is not ours must be left alone — `next dev` serves its HMR
    // socket through Next's own upgrade listener on this same server.
    let pathname: string;
    try {
      pathname = new URL(req.url ?? '', 'http://localhost').pathname;
    } catch {
      return;
    }
    if (pathname !== WS_PATH) return;

    void (async () => {
      const username = await authenticate(req);
      if (!username) {
        socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (client) => {
        wss.emit('connection', client, req, username);
      });
    })();
  });

  const registry: RealtimeRegistry = {
    broadcast(event: RealtimeEvent) {
      for (const socket of wss.clients) sendJson(socket, event);
    },
    sendToUser(username: string, message: unknown) {
      for (const socket of wss.clients) {
        if (state.get(socket)?.username === username) sendJson(socket, message);
      }
    },
    clientCount() {
      return wss.clients.size;
    },
  };

  g[REALTIME_REGISTRY_KEY] = registry;
  console.log(`[realtime] websocket server attached at ${WS_PATH} (pid ${process.pid})`);
}

startServer();
