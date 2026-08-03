// instrumentation.ts
// Next.js startup hook. Boots the in-process realtime WebSocket server that
// replaced the Soketi container.
//
// Two things about this file are load-bearing and easy to "clean up" by
// mistake:
//
//  1. The NEXT_RUNTIME guard. register() is invoked in every runtime, edge
//     included, and the edge runtime has no net/http.
//
//  2. The dynamic import. Next compiles this file for every runtime and the
//     compile-time module trace does NOT respect the runtime guard above — a
//     static `import './lib/realtime/wsServer'` makes the edge build fail on
//     `ws` and node:http. Verified during the migration spike: even bare
//     `process.pid` at module scope here produced edge-runtime build errors.
//     Keeping the Node-only code behind await import() is what actually keeps
//     it out of that bundle.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  await import('./lib/realtime/wsServer');
}
