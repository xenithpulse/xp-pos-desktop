// instrumentation.ts
// Next.js startup hook. Boots the in-process realtime WebSocket server that
// replaced the Soketi container, and starts the outbound update agent.
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
//
// The update agent is started AFTER the realtime server and is deliberately
// not awaited beyond its synchronous setup: startUpdateAgent() only arms a
// timer minutes out, so nothing here is on the path a restaurant waits on when
// the box comes back from a power cut. It is a no-op when POS_UPDATE_URL is
// blank, which is the default and the case for every offline site.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  await import('./lib/realtime/wsServer');

  // First-run bootstrap: the admin account, and the sample menu and floor plan.
  //
  // Done here rather than on the first request so that by the time provisioning
  // polls /login, the account already exists. It is idempotent and a no-op on
  // every boot after the first, and the login page calls it too - so a boot
  // that happened before Mongo was ready still recovers on the first page view.
  //
  // Wrapped for the same reason as everything else in this function: a POS that
  // will not start is worse than a POS with no sample data.
  try {
    const { ensureBootstrapped } = await import('./lib/firstRun');
    await ensureBootstrapped();
  } catch (err) {
    console.error('[first-run] bootstrap deferred to the first request:', err);
  }

  // Advertise xppos.local on the LAN. See lib/net/mdns.ts for why this exists:
  // the machine's IP changes when the router reassigns it, and a name does not.
  try {
    const { startMdnsResponder } = await import('./lib/net/mdns');
    await startMdnsResponder();
  } catch (err) {
    console.error('[mdns] responder failed to start; the POS continues without it:', err);
  }

  // Wrapped, and wrapped deliberately. Nothing about checking for updates is
  // worth a POS that will not start: a throw out of register() is a till that
  // is dead until somebody drives to the site. If the agent cannot start, the
  // restaurant loses the update channel and keeps its POS, which is the right
  // way round.
  try {
    const { startUpdateAgent } = await import('./lib/updates/agent');
    startUpdateAgent();
  } catch (err) {
    console.error('[updates] agent failed to start; the POS continues without it:', err);
  }

  // Entitlements: whether this site's XenithPulse subscription (WhatsApp
  // confirmations, billed via Stripe on xenithpulse.com) is currently active.
  // Same posture as the update agent: a no-op when POS_ENTITLEMENTS_URL is
  // blank (every site until it opts into this billing scheme), and wrapped so
  // a failure here can never take the POS down.
  try {
    const { startEntitlementAgent } = await import('./lib/entitlements/agent');
    startEntitlementAgent();
  } catch (err) {
    console.error('[entitlements] agent failed to start; the POS continues without it:', err);
  }

  // Licensing, warmed up here rather than on the first request.
  //
  // Resolving status reads the registry and asks Windows for four hardware
  // identifiers, which costs a second or two on the low-end hardware these
  // boxes are. Doing it now means the first till operation after a power cut
  // reads a cached answer instead of waiting on WMI. It also writes back the
  // trial start to any of its three sources that has gone missing, so a box
  // that had ProgramData wiped repairs itself at boot rather than at the moment
  // somebody is trying to take an order.
  //
  // Wrapped and NOT awaited into the startup path, for the same reason the
  // update agent is: nothing about licensing is worth a POS that will not
  // start. getLicenseStatus already fails open, so the worst case here is a
  // logged line and a slightly slower first request.
  void (async () => {
    try {
      const { getLicenseStatus } = await import('./lib/licensing/status');
      const status = await getLicenseStatus(true);
      console.log(
        `[licence] ${status.state}: ${status.headline}` +
          (status.restricted ? ' - new orders and admin changes are blocked' : '')
      );
      if (status.clockWarning) console.warn(`[licence] ${status.clockWarning}`);
    } catch (err) {
      console.error('[licence] status could not be resolved; the POS continues:', err);
    }
  })();
}
