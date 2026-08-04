// types/multicast-dns.d.ts
//
// multicast-dns ships no typings, and @types/multicast-dns does not exist.
//
// Only the surface lib/net/mdns.ts actually uses is declared. Declaring the
// whole protocol would be a maintenance burden for no benefit, and `declare
// module 'multicast-dns'` on its own would type the import as `any`, which
// removes the only reason to have this file.

declare module "multicast-dns" {
  interface MdnsQuestion {
    name?: string;
    type?: string;
    class?: string;
  }

  interface MdnsQuery {
    questions?: MdnsQuestion[];
  }

  interface MdnsAnswer {
    name: string;
    type: string;
    ttl: number;
    data: string;
  }

  interface MulticastDns {
    on(event: "query", cb: (query: MdnsQuery) => void): void;
    on(event: "response", cb: (response: unknown) => void): void;
    on(event: "error", cb: (err: unknown) => void): void;
    respond(packet: { answers: MdnsAnswer[] }): void;
    destroy(): void;
  }

  interface MulticastDnsOptions {
    /** Receive our own multicast packets back. Off for a pure responder. */
    loopback?: boolean;
    /**
     * Required on Windows 10+: the OS runs its own mDNS responder on UDP 5353,
     * so binding without this fails on every box this product ships to.
     */
    reuseAddr?: boolean;
    port?: number;
    multicast?: boolean;
    ttl?: number;
  }

  function makeMulticastDns(options?: MulticastDnsOptions): MulticastDns;
  export = makeMulticastDns;
}
