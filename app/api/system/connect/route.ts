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
import { isLocalNameInstalled } from "@/lib/net/localName";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [addresses, localNameInstalled] = await Promise.all([
      getPosAddresses(),
      isLocalNameInstalled(),
    ]);

    return NextResponse.json({
      ...addresses,
      localNameInstalled,
      // What the QR code carries.
      //
      // The NUMERIC address, always - and this is the one decision on this
      // screen worth being stubborn about. The QR exists for devices that are
      // not this computer, and the numeric address is the only form that
      // reaches them all: it is what crosses a router to a floor on its own
      // subnet, and it is what works on an Android old enough not to speak
      // mDNS. Every name we have is either link-local or local to this box.
      //
      // A number that a waiter never types is not a usability problem. Scanning
      // is what removes the typing, so the address only has to be RIGHT, and
      // the screen re-reads it every 30s so it stays right.
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
