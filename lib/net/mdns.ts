// lib/net/mdns.ts
//
// Advertise `xppos.local` on the local network.
//
// THE PROBLEM. The POS is reached at http://<ip>:<port>. The port is stable
// once provisioning has chosen it, but the IP is handed out by the router over
// DHCP - so a router reboot, a power cut, or a replacement router can move it.
// Every tablet with the old address bookmarked then fails, showing a browser
// timeout that says nothing about what happened. On a Saturday night that is a
// site-visit-shaped problem.
//
// THE FIX. A name instead of a number. This answers mDNS queries for
// `xppos.local` with whatever the machine's current LAN address is, re-read on
// every query - so when the IP moves, the name follows it and the tablets do
// not notice.
//
// WHAT THIS IS NOT. mDNS is not universal. It works on iOS, iPadOS, macOS,
// Windows 11 and Android 12+, and it does not work on older Android or on
// networks where the access point blocks multicast between clients. So the name
// is offered as an ADDITIONAL address, never as a replacement - the connection
// card and the connect screen always show the numeric address too. See
// lib/net/addresses.ts.
//
// It is also strictly LAN-local: 224.0.0.251 is not routable off the subnet, so
// nothing here is reachable from the internet.

import { MDNS_HOST, getLanIps } from "./addresses";

const RECORD_TTL_SECONDS = 120;

// multicast-dns ships no typings; the module is declared in
// types/multicast-dns.d.ts. The query shape is restated here rather than
// derived from that file's overloaded `on`, because Parameters<> resolves an
// overload set to its LAST signature - which is the error handler, giving
// `unknown`.
interface MdnsQuery {
  questions?: { name?: string; type?: string }[];
}

type MdnsResponder = ReturnType<typeof import("multicast-dns")>;

let responder: MdnsResponder | null = null;
let running = false;

export function isMdnsRunning(): boolean {
  return running;
}

export async function startMdnsResponder(): Promise<void> {
  if (responder) return;
  if (process.env.XP_POS_DISABLE_MDNS === "true") {
    console.log("[mdns] disabled by XP_POS_DISABLE_MDNS");
    return;
  }

  try {
    // Imported lazily and defensively. This is a nicety: a box where UDP 5353
    // is taken, or where multicast is blocked, must still serve the POS.
    //
    // multicast-dns is CommonJS (`export =`), so under Next's ESM interop the
    // callable lands on .default in some builds and on the namespace in others.
    const mod = await import("multicast-dns");
    const makeMdns = mod.default ?? (mod as unknown as typeof mod.default);

    // reuseAddr matters: Windows 10 and later run their own mDNS responder on
    // 5353. Without it, binding fails on every modern Windows box - which is
    // every box this product runs on.
    const mdns = makeMdns({ loopback: false, reuseAddr: true });

    mdns.on("error", (err: unknown) => {
      console.error("[mdns] responder error:", err);
    });

    mdns.on("query", (query: MdnsQuery) => {
      if (!query.questions) return;

      const wantsUs = query.questions.some(
        (q) => (q.type === "A" || q.type === "ANY") && q.name?.toLowerCase() === MDNS_HOST,
      );
      if (!wantsUs) return;

      // Resolved per query, never cached. That is the entire point: when DHCP
      // moves the box, the very next answer carries the new address.
      const ips = getLanIps();
      if (ips.length === 0) return;

      mdns.respond({
        answers: ips.map((ip) => ({
          name: MDNS_HOST,
          type: "A",
          ttl: RECORD_TTL_SECONDS,
          data: ip,
        })),
      });
    });

    responder = mdns;
    running = true;
    console.log(`[mdns] advertising ${MDNS_HOST} on the local network`);
  } catch (err) {
    running = false;
    console.error("[mdns] could not start; the POS continues without it:", err);
  }
}

export function stopMdnsResponder(): void {
  if (!responder) return;
  try {
    responder.destroy();
  } catch {
    // Shutting down; nothing useful to do about a failure here.
  }
  responder = null;
  running = false;
}
