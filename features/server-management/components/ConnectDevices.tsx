// features/server-management/components/ConnectDevices.tsx
//
// The screen you hold up so a waiter can point a phone at it.
//
// The address of a POS is the one thing everybody needs and nobody can be
// expected to remember, and it MOVES: the port is chosen at install time, and
// the IP comes from the router by DHCP. So this screen never hardcodes it and
// never trusts a stored copy - it asks the server, and it re-asks on a timer so
// a card left open on a back-office monitor does not quietly go stale.
//
// ── TWO AUDIENCES, TWO ADDRESSES ─────────────────────────────────────────────
// Conflating these is what made this screen confusing, so it is now explicit:
//
//   THIS COMPUTER      http://pos.xenithpulse.local:<port>. Fixed, branded, and
//                      backed by a hosts entry (lib/net/localName.ts) so it
//                      resolves here even with the network unplugged. It is on
//                      the desktop shortcut, so the owner never has to find out
//                      what their own IP is.
//
//   EVERY OTHER DEVICE The QR code, carrying the numeric address. On a site
//                      with a router per floor this is the ONLY form that
//                      reaches an upstairs tablet: mDNS has TTL 1 and dies at
//                      the first router, whereas the number routes fine. And a
//                      scanned address is not typed, so its being a number
//                      costs the waiter nothing.
//
// The address on the QR is re-read every 30s, so it follows a DHCP change
// without anyone reloading the page.

"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import QrCode from "@/components/ui/QrCode";
import {
  AlertTriangle,
  Check,
  Copy,
  Globe,
  Loader2,
  Lock,
  Printer,
  RefreshCw,
  Smartphone,
  Unlock,
  Wifi,
  WifiOff,
} from "lucide-react";

interface ConnectInfo {
  port: number;
  lanIps: string[];
  lanUrls: string[];
  localNameUrl: string;
  localNameInstalled: boolean;
  mdnsUrl: string | null;
  hostnameUrl: string;
  hostname: string;
  localUrl: string;
  primaryUrl: string;
  onNetwork: boolean;
}

// Re-checked on this interval so the card follows a DHCP change without anyone
// reloading the page.
const REFRESH_MS = 30_000;

/** How long to wait for an address to answer before calling it unreachable. */
const PROBE_TIMEOUT_MS = 6_000;

type ProbeState = "idle" | "checking" | "ok" | "blocked";

/**
 * Test an address from THIS device.
 *
 * Used on the fixed name, because whether a name resolves is a property of the
 * device doing the resolving and cannot be answered from the server. On the
 * server box the hosts entry makes it certain; on a tablet it depends on mDNS
 * support and on whether a router sits in between - so the screen asks rather
 * than claims.
 *
 * Cross-origin on purpose - see app/api/system/ping/route.ts.
 */
function useNameProbe(url: string | null): ProbeState {
  // The result is stored WITH the address it belongs to, and the state below is
  // derived from that rather than assigned. Two things fall out of it for free:
  // nothing calls setState synchronously during the effect, and a result that
  // arrives late for an address we are no longer showing is ignored, because it
  // no longer matches - which is what would otherwise report the old address's
  // verdict against the new one.
  const [result, setResult] = useState<{ url: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    fetch(`${url}/api/system/ping`, { signal: controller.signal, cache: "no-store" })
      .then((res) => {
        if (!cancelled) setResult({ url, ok: res.ok });
      })
      .catch(() => {
        // Abort fires this too, which is why `cancelled` guards it.
        if (!cancelled) setResult({ url, ok: false });
      })
      .finally(() => clearTimeout(timer));

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [url]);

  if (!url) return "idle";
  if (result?.url === url) return result.ok ? "ok" : "blocked";
  return "checking";
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          // Clipboard is blocked on insecure origins in some browsers. The
          // address is on screen in full, so this is a convenience, not a
          // dependency - fail quietly rather than showing an error.
        }
      }}
      className="shrink-0 rounded-md p-1.5 text-neutral-500 transition-colors hover:bg-white/5 hover:text-neutral-200"
      aria-label={`Copy ${value}`}
      title="Copy"
    >
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
    </button>
  );
}

export default function ConnectDevices() {
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/system/connect", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not read the network address");
      setInfo((await res.json()) as ConnectInfo);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const probe = useNameProbe(info?.localNameUrl ?? null);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
        <Loader2 size={16} className="animate-spin" />
        Working out this machine&apos;s address...
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="rounded-lg border border-red-500/50 bg-red-900/20 p-4">
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle size={18} />
          {error ?? "No address available"}
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* ── The card ──────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 print:border-black print:bg-white">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold print:text-black">
              <Smartphone size={20} className="text-emerald-400 print:hidden" />
              Connect a device
            </h2>
            <p className="mt-1 text-sm text-neutral-400 print:text-neutral-700">
              Scan this with a phone or tablet camera, or type the address into a browser.
              The device must be on the restaurant&apos;s network.
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-md p-2 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white"
              title="Check again"
              aria-label="Check again"
            >
              <RefreshCw size={16} />
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-xs font-medium text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white"
            >
              <Printer size={14} />
              Print
            </button>
          </div>
        </div>

        {info.onNetwork ? (
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <QrCode text={info.primaryUrl} />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-500">
                Scan, or type
              </p>
              <p className="mt-1 break-all font-mono text-2xl font-bold text-emerald-400 print:text-black">
                {info.primaryUrl}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-neutral-400 print:text-neutral-700">
                Works on every device on the restaurant&apos;s network, including floors that
                have their own router. Scanning it means nobody has to type it.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-neutral-500 print:text-neutral-700">
                This address can change if your router restarts — this screen always shows the
                current one. To stop it changing, see below.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <WifiOff size={18} className="mt-0.5 shrink-0 text-amber-400" />
            <div className="text-sm">
              <p className="font-medium text-amber-300">This computer is not on a network</p>
              <p className="mt-1 text-neutral-400">
                Connect it to your restaurant&apos;s Wi-Fi or plug in a network cable, then
                press Check again. Until then the POS can only be used on this computer, at{" "}
                <span className="font-mono">{info.localUrl}</span>.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── The fixed name, for this computer ─────────────────────────────── */}
      <LocalNameCard info={info} probe={probe} />

      {/* ── Every address that works ──────────────────────────────────────── */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 print:hidden">
        <h3 className="mb-1 text-lg font-bold">Other addresses that work</h3>
        <p className="mb-4 text-sm text-neutral-400">
          Any of these reach the same POS. Use the numeric one if a device cannot find the others.
        </p>

        <div className="space-y-2">
          {info.lanUrls.map((url, i) => (
            <AddressRow
              key={url}
              url={url}
              label={i === 0 ? "Network address" : "Also on this network"}
              hint={
                i === 0
                  ? "Always works on this network, but it can change if your router restarts."
                  : "A second network adapter on this computer."
              }
            />
          ))}
          <AddressRow
            url={info.localNameUrl}
            label="Fixed name — this computer, and nearby devices"
            hint="Always works on this computer. On phones and tablets it works only on the same part of the network — it does not cross a floor that has its own router."
          />
          <AddressRow
            url={info.hostnameUrl}
            label="Computer name"
            hint="Works from Windows computers on the same part of the network."
          />
          <AddressRow
            url={info.localUrl}
            label="This computer only"
            hint="Always works here, never works from another device."
          />
        </div>
      </div>

      {/* ── The thing that actually prevents the support call ─────────────── */}
      <FixedAddress hostname={info.hostname} onChanged={load} />
    </motion.div>
  );
}

/**
 * The fixed name, and what it is honestly good for.
 *
 * The wording here matters more than it looks. This name is guaranteed on the
 * server box and merely likely anywhere else, and a screen that blurs those two
 * produces exactly the support call it was meant to prevent - somebody writes
 * it on a card, the upstairs tablets cannot open it, and nobody knows why. So
 * the panel states the guarantee and the limit in the same breath, and points
 * at the QR code for everything the name cannot serve.
 */
function LocalNameCard({ info, probe }: { info: ConnectInfo; probe: ProbeState }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 print:hidden">
      <h3 className="mb-1 flex items-center gap-2 text-lg font-bold">
        <Globe size={18} className="text-emerald-400" />
        On this computer
      </h3>
      <p className="text-sm text-neutral-400">
        The till itself has a fixed address that never changes, whatever the router does.
        It is on the desktop shortcut, so nobody has to look up an IP.
      </p>

      <p className="mt-3 break-all font-mono text-xl font-bold text-emerald-400">
        {info.localNameUrl}
      </p>

      {probe === "ok" && (
        <p className="mt-3 flex items-center gap-2 text-sm text-emerald-300">
          <Check size={15} className="shrink-0" />
          Confirmed working on the device you are using now.
        </p>
      )}

      {probe === "blocked" && (
        <p className="mt-3 flex items-start gap-2 text-sm text-neutral-400">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
          <span>
            This name did not open on the device you are using now. That is expected on a
            phone or tablet — especially one on a floor with its own router. Use the QR code
            above on those devices.
          </span>
        </p>
      )}

      {!info.localNameInstalled && (
        <p className="mt-3 flex items-start gap-2 text-sm text-neutral-400">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-400" />
          <span>
            The entry that makes this name work on this computer is missing, and the POS
            could not restore it. Re-run{" "}
            <span className="font-mono text-neutral-200">provision.ps1</span> as
            Administrator. Until then use{" "}
            <span className="font-mono text-neutral-200">{info.localUrl}</span> here.
          </span>
        </p>
      )}

      <p className="mt-4 border-t border-neutral-800 pt-4 text-xs leading-relaxed text-neutral-500">
        Staff phones and tablets should use the QR code above instead. Names like this one
        are found by asking the local network directly, which does not reach past a router —
        so on a building with a router per floor they work near this computer and not
        upstairs. The address in the QR code has no such limit.
      </p>
    </div>
  );
}


/**
 * Pin the address so it stops moving.
 *
 * Still worth doing even with a permanent name in place: the name is only ever
 * as current as the last registration, so a box whose IP never moves has one
 * fewer moving part - and it is the fallback that keeps working when the site
 * has no internet at all.
 *
 * This reconfigures the network adapter that the person clicking it is very
 * probably connected THROUGH, so the UI is deliberately explicit about what
 * will be set and offers the way back before it offers the way forward.
 */
function FixedAddress({ hostname, onChanged }: { hostname: string; onChanged: () => void }) {
  const [adapter, setAdapter] = useState<{
    onNetwork: boolean;
    adapterName?: string;
    ipAddress?: string;
    gateway?: string;
    dhcp?: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirming, setConfirming] = useState(false);

  const read = useCallback(async () => {
    try {
      const res = await fetch("/api/system/network", { cache: "no-store" });
      setAdapter(await res.json());
    } catch {
      setAdapter(null);
    }
  }, []);

  useEffect(() => {
    void read();
  }, [read]);

  const apply = async (action: "pin" | "auto") => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/system/network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg({
          kind: "err",
          text:
            (data.error ?? "The change failed.") +
            (data.revertedToAutomatic ? " This computer has been put back on an automatic address." : ""),
        });
        return;
      }
      setMsg({
        kind: "ok",
        text:
          action === "pin"
            ? `This computer now keeps ${data.ipAddress} permanently.`
            : "This computer is back to getting its address from the router.",
      });
      setConfirming(false);
      await read();
      onChanged();
    } catch (err) {
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 print:hidden">
      <h3 className="mb-3 flex items-center gap-2 text-lg font-bold">
        <Wifi size={18} className="text-emerald-400" />
        Stop the address changing
      </h3>
      <p className="text-sm leading-relaxed text-neutral-400">
        Your router gives this computer its address, and it can hand out a different one after
        a power cut or a router restart. When that happens, devices that had the old address
        bookmarked stop working.
      </p>

      {msg && (
        <p
          className={`mt-4 rounded-lg border p-3 text-sm ${
            msg.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-300"
              : "border-red-500/50 bg-red-900/20 text-red-400"
          }`}
        >
          {msg.text}
        </p>
      )}

      {adapter?.onNetwork && (
        <div className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="text-neutral-500">
              Adapter <span className="text-neutral-200">{adapter.adapterName}</span>
            </span>
            <span className="text-neutral-500">
              Address <span className="font-mono text-neutral-200">{adapter.ipAddress}</span>
            </span>
            <span className={adapter.dhcp ? "text-amber-400" : "text-emerald-400"}>
              {adapter.dhcp ? "Can change" : "Fixed"}
            </span>
          </div>

          {adapter.dhcp ? (
            !confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                disabled={busy}
                className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/90 px-4 py-2.5 text-sm font-semibold text-black
                           transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Lock size={15} />
                Keep this address permanently
              </button>
            ) : (
              <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-4">
                <p className="text-sm font-semibold text-amber-300">Before you do this</p>
                <p className="mt-2 text-sm leading-relaxed text-neutral-300">
                  This computer will keep{" "}
                  <span className="font-mono text-white">{adapter.ipAddress}</span> instead of
                  asking the router each time. Nothing about how you reach the POS changes right
                  now &mdash; it is the same address, just made permanent.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-neutral-300">
                  <span className="font-semibold text-amber-300">This is not the complete fix.</span>{" "}
                  Your router does not know this address is taken, so it could give the same one to
                  another device later and the two would clash. Ask whoever set up your network for
                  a <span className="text-white">DHCP reservation</span> for{" "}
                  <span className="font-mono text-white">{hostname}</span> as well &mdash; that takes
                  about a minute on most routers and is the permanent answer.
                </p>
                <p className="mt-3 text-xs text-neutral-500">
                  If anything goes wrong, this computer is put back on an automatic address
                  automatically. You can also undo it here at any time.
                </p>
                <div className="mt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => void apply("pin")}
                    disabled={busy}
                    className="flex items-center gap-2 rounded-lg bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-black
                               transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    {busy ? "Applying..." : "Keep this address"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    disabled={busy}
                    className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300
                               transition-colors hover:border-neutral-500 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )
          ) : (
            <div className="mt-4">
              <p className="text-sm text-neutral-400">
                This address is fixed and will not change on its own. Make sure your router also has
                a DHCP reservation for <span className="font-mono text-neutral-200">{hostname}</span>,
                so it never hands the same address to another device.
              </p>
              <button
                type="button"
                onClick={() => void apply("auto")}
                disabled={busy}
                className="mt-3 flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300
                           transition-colors hover:border-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Unlock size={15} />}
                Use an automatic address again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddressRow({
  url,
  label,
  hint,
  highlight = false,
}: {
  url: string;
  label: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        highlight ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-neutral-800 bg-neutral-950"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 break-all font-mono text-sm text-neutral-100">{url}</span>
        <CopyButton value={url} />
      </div>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="mt-0.5 text-xs text-neutral-400">{hint}</p>
    </div>
  );
}
