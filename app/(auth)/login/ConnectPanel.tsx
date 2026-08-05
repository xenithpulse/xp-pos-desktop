// app/(auth)/login/ConnectPanel.tsx
//
// "What address do I open on the other devices?" - answered on the sign-in
// screen, which is the one screen everybody reaches.
//
// WHY IT BELONGS HERE. The address lives in Server Management, which is behind
// a sign-in, on a machine somebody has to walk to. On a Friday night the person
// holding a tablet that will not connect is not that person. Putting the same
// QR code on the login screen means any device that CAN reach the POS can show
// the address to one that cannot - hold the till screen up, scan, done.
//
// WHY THIS DISCLOSES NOTHING. To see this you must already have reached the POS
// over the LAN, which means you already have a working address for it. The
// endpoint it reads is public for the same reason - see app/api/system/connect.
//
// Collapsed by default so the daily sign-in stays a username, a password and
// nothing else. Open on a first run, because that is exactly when somebody is
// trying to get a second device connected.

"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, Printer, Smartphone, WifiOff } from "lucide-react";
import QrCode from "@/components/ui/QrCode";

interface ConnectInfo {
  primaryUrl: string;
  localNameUrl: string;
  localUrl: string;
  onNetwork: boolean;
}

export default function ConnectPanel({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/system/connect", { cache: "no-store" });
      if (!res.ok) throw new Error();
      setInfo((await res.json()) as ConnectInfo);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  // Only fetched once the panel is opened. The sign-in screen is the first
  // thing rendered on a box that has just booted, and it should not be issuing
  // requests nobody asked for while Mongo is still coming up.
  useEffect(() => {
    if (open && !info && !failed) void load();
  }, [open, info, failed, load]);

  return (
    <div className="w-full max-w-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px]
                   font-medium uppercase tracking-[0.12em] text-white/35 outline-none
                   transition-colors hover:text-white/70 focus-visible:ring-2 focus-visible:ring-emerald-400/40
                   print:hidden"
      >
        <Smartphone size={13} className="shrink-0" />
        Connect another device
        <ChevronDown
          size={13}
          className={`shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="xp-rise mt-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 print:border-black print:bg-white">
          {failed ? (
            <p className="text-center text-xs text-white/40">
              Could not read this computer&apos;s address.
            </p>
          ) : !info ? (
            <p className="flex items-center justify-center gap-2 py-6 text-xs text-white/40">
              <Loader2 size={13} className="animate-spin" />
              Finding the address…
            </p>
          ) : !info.onNetwork ? (
            <div className="flex items-start gap-2 text-xs">
              <WifiOff size={14} className="mt-0.5 shrink-0 text-amber-400" />
              <div>
                <p className="font-medium text-amber-300">This computer is not on a network</p>
                <p className="mt-1 text-white/40">
                  Plug in a network cable or connect it to the restaurant&apos;s Wi-Fi. Until then
                  the POS only works on this computer.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <QrCode text={info.primaryUrl} size={168} />
              <p className="break-all text-center font-mono text-sm font-semibold text-emerald-300 print:text-black">
                {info.primaryUrl}
              </p>
              <p className="text-center text-[11px] leading-relaxed text-white/40 print:text-neutral-700">
                Point a phone or tablet camera at the code, or type the address into its browser.
                The device must be on the restaurant&apos;s network.
              </p>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5
                           text-[11px] font-medium text-white/50 outline-none transition-colors
                           hover:border-white/25 hover:text-white
                           focus-visible:ring-2 focus-visible:ring-emerald-400/40 print:hidden"
              >
                <Printer size={12} />
                Print this
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
