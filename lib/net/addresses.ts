// lib/net/addresses.ts
//
// Where is this POS, right now?
//
// This is a harder question than it looks, and getting it wrong is the single
// most common way a site loses its staff devices:
//
//   - The PORT is not fixed. Provisioning moves off 8080 when something else
//     holds it and persists the choice in .env, so it is READ, never assumed.
//   - The IP is not fixed either. It comes from the router by DHCP, so a router
//     reboot or a new router can change it - and every tablet that had the old
//     address bookmarked stops working, with no error that explains why.
//
// So nothing anywhere caches an address. Everything asks this module, and this
// module looks it up each time.

import os from "os";
import fs from "fs/promises";
import path from "path";

export interface PosAddresses {
  /** The LAN-facing port Caddy listens on. */
  port: number;
  /** LAN IPv4 addresses, best first. */
  lanIps: string[];
  /** http://<ip>:<port> for each LAN address. */
  lanUrls: string[];
  /**
   * The fixed name for the machine the POS is installed on.
   *
   * Always present and never changes. On the server box itself it resolves from
   * the hosts file (lib/net/localName.ts), so it does not depend on the network
   * being up. On other devices on the SAME subnet it resolves over mDNS. It
   * does NOT cross a router - staff devices on another floor use the QR code.
   */
  localNameUrl: string;
  /** The stable mDNS name, when the responder is running. */
  mdnsUrl: string | null;
  /** http://<machine-name>:<port> - works for Windows clients via NetBIOS. */
  hostnameUrl: string;
  hostname: string;
  /** Loopback, for use on the server box itself. */
  localUrl: string;
}

/**
 * The branded name for this machine.
 *
 * Two mechanisms serve it and they are independent on purpose: a hosts entry on
 * the server box (lib/net/localName.ts) and an mDNS answer for everything else
 * on the same subnet (lib/net/mdns.ts). Change it here and both follow, along
 * with installer/scripts/connect-card.ps1 - which is NOT imported from here and
 * has to be edited to match.
 */
export const MDNS_HOST = "pos.xenithpulse.local";

/**
 * Every name the mDNS responder answers for.
 *
 * xppos.local is kept alongside the branded name because a single-label .local
 * name is the most broadly supported form of mDNS, and because sites installed
 * before the rename have it on their printed cards.
 */
export const MDNS_ALIASES = [MDNS_HOST, "xppos.local"] as const;

const DEFAULT_PORT = 8080;

function dataRoot(): string {
  return process.env.XP_POS_DATA_ROOT || "C:\\ProgramData\\XP POS";
}

/**
 * The LAN-facing port.
 *
 * The app process gets .env loaded by the service wrapper (--env-file), so the
 * variable is normally just there. The file is read as a fallback for the
 * development case and for a box where the wrapper was started by hand.
 */
export async function getPosPort(): Promise<number> {
  const fromEnv = Number(process.env.POS_HTTP_PORT);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;

  try {
    const raw = await fs.readFile(path.join(dataRoot(), ".env"), "utf8");
    const m = /^\s*POS_HTTP_PORT\s*=\s*(\d+)\s*$/m.exec(raw);
    if (m) return Number(m[1]);
  } catch {
    // Not fatal - fall through to the default below.
  }
  return DEFAULT_PORT;
}

/**
 * LAN IPv4 addresses, best first.
 *
 * Filters out loopback, link-local (169.254.x, which means DHCP failed) and
 * internal interfaces. Ordering matters because the first entry is what gets
 * printed on the connection card and encoded into the QR code: a box with a
 * Wi-Fi adapter and a Hyper-V virtual switch has several addresses and only one
 * of them is reachable from a tablet.
 */
export function getLanIps(): string[] {
  const out: string[] = [];
  const virtualHints = /(virtual|vethernet|hyper-v|vmware|virtualbox|loopback|docker|wsl|tap|tun)/i;

  const interfaces = Object.entries(os.networkInterfaces());
  const scored: { ip: string; score: number }[] = [];

  for (const [name, addrs] of interfaces) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (a.address.startsWith("169.254.")) continue;

      // Virtual adapters are almost never the way in. Rank them last rather
      // than dropping them: on a box that genuinely only has one, an address
      // that might work beats no address at all.
      let score = virtualHints.test(name) ? 100 : 0;
      // Prefer ordinary private ranges over anything else.
      if (/^192\.168\./.test(a.address)) score -= 3;
      else if (/^10\./.test(a.address)) score -= 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) score -= 1;

      scored.push({ ip: a.address, score });
    }
  }

  scored.sort((a, b) => a.score - b.score);
  for (const s of scored) if (!out.includes(s.ip)) out.push(s.ip);
  return out;
}

export async function getPosAddresses(): Promise<PosAddresses> {
  const port = await getPosPort();
  const lanIps = getLanIps();
  const hostname = os.hostname();

  // Only advertise the mDNS name when the responder actually came up. Printing
  // an address that does not resolve is worse than printing one fewer.
  const { isMdnsRunning } = await import("./mdns");

  return {
    port,
    lanIps,
    lanUrls: lanIps.map((ip) => `http://${ip}:${port}`),
    // Unconditional, unlike mdnsUrl. This one is backed by the hosts file on
    // the machine the POS runs on, so it is correct there whether or not the
    // mDNS responder came up and whether or not there is a network at all.
    localNameUrl: `http://${MDNS_HOST}:${port}`,
    mdnsUrl: isMdnsRunning() ? `http://${MDNS_HOST}:${port}` : null,
    hostnameUrl: `http://${hostname}:${port}`,
    hostname,
    localUrl: `http://127.0.0.1:${port}`,
  };
}
