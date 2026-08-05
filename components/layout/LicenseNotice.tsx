// components/layout/LicenseNotice.tsx
//
// What the restaurant sees about its licence, everywhere except the login page
// and Server Management.
//
// ── This component enforces NOTHING ─────────────────────────────────────────
//
// Every restriction is applied on the server, in lib/licensing/enforce.ts,
// behind the same authentication call the routes already make. This file only
// says out loud what the server has already decided. Deleting it with DevTools
// removes the message and changes nothing about what the POS will do, which is
// the property that makes it safe to put licensing messaging in the browser at
// all.
//
// ── The escalation, and why it is shaped like this ──────────────────────────
//
//   > 7 days of trial   a small pill in the corner. It must be possible to run
//                       a restaurant for three weeks without being nagged.
//   <= 7 days           a persistent bar. Not dismissible: the owner needs to
//                       have seen this before the morning it stops.
//   restricted          a bar everywhere, and a blocking dialog on the
//                       management screens only.
//
// The blocking dialog deliberately does NOT cover the floor, the daily sheet or
// the home screen. A restaurant whose trial ended at 20:00 on a Friday still
// has tables mid-meal, and those orders have to be closable, payable and
// printable. Blocking the screen they are closed on would be the exact failure
// this phase ranks as unacceptable.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Clock } from "lucide-react";

interface LicenseNoticeStatus {
  state: "licensed" | "trial" | "grace" | "trial_expired" | "unlicensed";
  restricted: boolean;
  warn: boolean;
  daysRemaining: number | null;
  headline: string;
  detail: string;
}

/** Screens where a modal must never appear: this is where service happens. */
const SERVICE_ROUTES = ["/", "/dine-in", "/hub", "/daily-sheet"];

function isServiceRoute(pathname: string | null): boolean {
  if (!pathname) return true;
  return SERVICE_ROUTES.some((r) => pathname === r || (r !== "/" && pathname.startsWith(r + "/")));
}

export default function LicenseNotice() {
  const pathname = usePathname();
  const [status, setStatus] = useState<LicenseNoticeStatus | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/server-config/license");
      if (res.ok) setStatus(await res.json());
    } catch {
      // Offline or mid-restart. Saying nothing is correct - this component has
      // no business reporting a network blip as a licensing problem.
    }
  }, []);

  useEffect(() => {
    load();
    // Five minutes matches the server's own status cache, so this poll never
    // costs more than a cached read.
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  if (!status || status.state === "licensed") return null;

  if (status.restricted) {
    return (
      <>
        <Bar tone="danger">
          <strong>{status.headline}.</strong> Open orders can still be completed and
          printed. New orders and changes to the menu, staff and settings are blocked.{" "}
          <LicenceLink tone="danger" />
        </Bar>
        {!isServiceRoute(pathname) && <BlockingDialog status={status} />}
      </>
    );
  }

  const days = status.daysRemaining ?? 0;

  if (status.state === "grace" || (status.state === "trial" && days <= 7)) {
    return (
      <Bar tone="warning">
        <strong>{status.headline}.</strong> {status.detail} <LicenceLink tone="warning" />
      </Bar>
    );
  }

  // Comfortable trial: a pill, out of the way, no colour that reads as an alert.
  // Bottom RIGHT - the sidebar owns the left edge at every width.
  return (
    <Link
      href="/server-management"
      className="fixed bottom-3 right-3 z-50 inline-flex items-center gap-1.5 rounded-full border border-neutral-300 bg-white/90 px-3 py-1.5 text-xs font-medium text-neutral-600 shadow-sm backdrop-blur transition-colors hover:text-neutral-900"
    >
      <Clock size={13} />
      Trial - {days} days left
    </Link>
  );
}

function LicenceLink({ tone }: { tone: "danger" | "warning" }) {
  return (
    <Link
      href="/server-management"
      className={`underline underline-offset-2 ${
        tone === "danger" ? "text-white" : "text-yellow-950"
      }`}
    >
      Open Server Management to activate a licence.
    </Link>
  );
}

function Bar({ tone, children }: { tone: "danger" | "warning"; children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`sticky top-0 z-50 flex items-start gap-2 px-4 py-2.5 text-sm ${
        tone === "danger" ? "bg-red-600 text-white" : "bg-yellow-300 text-yellow-950"
      }`}
    >
      <AlertTriangle size={16} className="mt-0.5 shrink-0" />
      <p className="min-w-0">{children}</p>
    </div>
  );
}

/**
 * The blocking dialog. No dismiss button, on purpose - it is only ever shown on
 * a management screen, where there is nothing behind it that a restaurant needs
 * during service, and where the API calls it would make are already refused by
 * the server.
 */
function BlockingDialog({ status }: { status: LicenseNoticeStatus }) {
  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl border border-red-500 bg-white p-6 shadow-2xl">
        <div className="flex gap-3">
          <AlertTriangle size={28} className="mt-0.5 shrink-0 text-red-600" />
          <div>
            <h2 className="text-xl font-bold text-neutral-900">{status.headline}</h2>
            <p className="mt-2 text-sm text-neutral-700">{status.detail}</p>
          </div>
        </div>

        <div className="mt-5 rounded-lg bg-neutral-100 p-4 text-sm text-neutral-700">
          <p className="font-medium text-neutral-900">The restaurant can still:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            <li>finish, pay for and print every order that is already open</li>
            <li>use the floor plan and the daily sheet</li>
            <li>reach Server Management, backups and diagnostics</li>
          </ul>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Link
            href="/server-management"
            className="flex-1 rounded-lg bg-red-600 px-5 py-3 text-center font-medium text-white transition-colors hover:bg-red-700"
          >
            Activate a licence
          </Link>
          <Link
            href="/dine-in"
            className="flex-1 rounded-lg border border-neutral-300 px-5 py-3 text-center font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
          >
            Back to the floor
          </Link>
        </div>
      </div>
    </div>
  );
}
