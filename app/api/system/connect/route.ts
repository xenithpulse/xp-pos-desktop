// app/api/system/connect/route.ts
//
// "What address do the staff devices use?"
//
// Read live on every call, never cached. The port can move (provisioning picks
// a free one) and the IP can move (DHCP), and a stale answer here is exactly
// the failure this endpoint exists to prevent.
//
// PUBLIC, like the rest of the server-management surface (see
// app/server-management/page.tsx). It discloses nothing to a caller who does
// not already have it: to reach this endpoint you must already be on the LAN
// and already know an address that works.

import { NextResponse } from "next/server";
import { getPosAddresses } from "@/lib/net/addresses";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const addresses = await getPosAddresses();

    return NextResponse.json({
      ...addresses,
      // The one to print, put on a card, or encode in a QR. Prefer a numeric
      // address over the mDNS name: the number works everywhere, and the name
      // does not work on older Android or where the access point blocks
      // multicast between clients.
      primaryUrl: addresses.lanUrls[0] ?? addresses.localUrl,
      onNetwork: addresses.lanIps.length > 0,
    });
  } catch (err) {
    console.error("[connect] could not resolve addresses:", err);
    return NextResponse.json(
      { error: "Could not work out this machine's network address." },
      { status: 500 },
    );
  }
}
