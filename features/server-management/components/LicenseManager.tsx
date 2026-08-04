// features/server-management/components/LicenseManager.tsx
//
// The licence panel.
//
// Two audiences, one screen:
//
//   The restaurant owner, who wants to know whether their POS is going to stop
//   working and what to do about it. They get a headline, a day count and a
//   sentence in plain English. No jargon, no hardware talk.
//
//   The technician standing in the restaurant with a phone hotspot, who needs
//   the machine code, somewhere to paste a key, and a straight answer when it
//   is refused. They get the code in large monospace with a copy button, and
//   the refusal reason verbatim rather than "activation failed".
//
// Nothing here enforces anything. Every decision on this screen was already
// made by the server in lib/licensing/status.ts - this only renders it. A
// licence check living in a React bundle is removed with DevTools in a minute,
// so there is deliberately no logic here worth removing.

"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Clock,
  KeyRound,
  ShieldCheck,
} from "lucide-react";

interface LicenseStatus {
  state: "licensed" | "trial" | "grace" | "trial_expired" | "unlicensed";
  restricted: boolean;
  warn: boolean;
  daysRemaining: number | null;
  expiresAt: string | null;
  perpetual: boolean;
  serial: string | null;
  edition: string | null;
  issuedTo: string | null;
  machineCode: string;
  signalsAvailable: number;
  signalsMatched: number | null;
  signalsRequired: number | null;
  trialStartedAt: string | null;
  trialSource: string;
  graceEndsAt: string | null;
  clockWarning: string | null;
  headline: string;
  detail: string;
  rejection: string | null;
  checkedAt: string;
  siteId: string;
}

export default function LicenseManager() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [key, setKey] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [siteIdCopied, setSiteIdCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/server-config/license");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // A minute is plenty. Nothing here changes without somebody doing something.
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load]);

  const copyCode = async () => {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.machineCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // No clipboard permission (or plain HTTP on some browsers). The code is
      // on screen in a selectable font; that is the fallback and it is fine.
    }
  };

  const copySiteId = async () => {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.siteId);
      setSiteIdCopied(true);
      setTimeout(() => setSiteIdCopied(false), 2500);
    } catch {
      // No clipboard permission. The id is on screen in a selectable font.
    }
  };

  const activate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/server-config/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, issuedTo: issuedTo || undefined }),
      });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        setMessage({
          ok: false,
          text: "You need to be signed in as an admin to activate a licence.",
        });
      } else if (!res.ok || !data.activated) {
        setMessage({
          ok: false,
          text: [data.message, data.hint].filter(Boolean).join(" "),
        });
      } else {
        setMessage({ ok: true, text: data.message });
        setKey("");
      }
      await load();
    } catch {
      setMessage({ ok: false, text: "Could not reach this box's licence service." });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <div className="h-6 w-48 animate-pulse rounded bg-neutral-800" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-neutral-400">
        Licence status is unavailable.
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <StatusPanel status={status} />

      {status.clockWarning && (
        <Callout icon={<Clock size={18} />} title="This box's clock looks wrong">
          {status.clockWarning}
        </Callout>
      )}

      {/* Activation. Shown even when licensed - renewals and re-issues are the
          normal reason somebody comes to this screen a second time. */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h3 className="mb-1 text-lg font-bold">Activate a licence</h3>
        <p className="mb-5 text-sm text-neutral-400">
          Works with no internet connection. Read the machine code below to
          XenithPulse, then type or paste the licence key you are given.
        </p>

        <div className="mb-5 rounded-lg border border-neutral-700 bg-neutral-800/60 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-400">
            This machine&apos;s code
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-lg leading-relaxed break-all text-white select-all">
              {status.machineCode}
            </p>
            <button
              onClick={copyCode}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-neutral-700 px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-600"
            >
              <ClipboardCopy size={15} />
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Built from {status.signalsAvailable} of 4 hardware identifiers. It
            changes only if this machine is substantially replaced.
          </p>
        </div>

        <label className="mb-1 block text-sm text-neutral-400" htmlFor="licence-key">
          Licence key
        </label>
        <textarea
          id="licence-key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          rows={4}
          spellCheck={false}
          autoCapitalize="characters"
          placeholder="XXXXXX-XXXXXX-XXXXXX-…"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3 font-mono text-sm tracking-wide text-white outline-none focus:border-blue-500"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Dashes, spaces and line breaks are ignored, and it is not case
          sensitive - paste it however it arrived.
        </p>

        <label className="mt-4 mb-1 block text-sm text-neutral-400" htmlFor="licence-to">
          Customer name (optional, for your own records)
        </label>
        <input
          id="licence-to"
          value={issuedTo}
          onChange={(e) => setIssuedTo(e.target.value)}
          className="w-full rounded-lg border border-neutral-700 bg-neutral-950 p-3 text-sm text-white outline-none focus:border-blue-500"
        />

        <button
          onClick={activate}
          disabled={busy || key.trim().length === 0}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-5 py-3 font-medium transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <KeyRound size={16} />
          {busy ? "Activating…" : "Activate"}
        </button>

        {message && (
          <div
            className={`mt-4 rounded-lg border p-4 text-sm ${
              message.ok
                ? "border-green-600/50 bg-green-900/20 text-green-200"
                : "border-red-600/50 bg-red-900/20 text-red-200"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* Site ID — the identifier XenithPulse subscriptions (e.g. WhatsApp
          confirmations, billed on xenithpulse.com) key off, so a Stripe
          subscription can find this specific box. Not a secret on its own,
          same reasoning as the machine code above. */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h3 className="mb-1 text-lg font-bold">Site ID</h3>
        <p className="mb-4 text-sm text-neutral-400">
          Give this to XenithPulse when you subscribe to an add-on (like
          WhatsApp order confirmations) on xenithpulse.com, so your
          subscription can find this box.
        </p>
        <div className="rounded-lg border border-neutral-700 bg-neutral-800/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-mono text-lg leading-relaxed break-all text-white select-all">
              {status.siteId}
            </p>
            <button
              onClick={copySiteId}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-neutral-700 px-3 py-2 text-sm font-medium transition-colors hover:bg-neutral-600"
            >
              <ClipboardCopy size={15} />
              {siteIdCopied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h3 className="mb-4 text-lg font-bold">Details</h3>
        <div className="space-y-3 text-sm">
          <Row label="Status" value={describeState(status)} />
          {status.serial && <Row label="Licence" value={status.serial} />}
          {status.edition && <Row label="Edition" value={status.edition} />}
          {status.issuedTo && <Row label="Issued to" value={status.issuedTo} />}
          {status.expiresAt && (
            <Row label="Expires" value={new Date(status.expiresAt).toLocaleDateString()} />
          )}
          {status.trialStartedAt && status.state !== "licensed" && (
            <Row
              label="Trial started"
              value={`${new Date(status.trialStartedAt).toLocaleDateString()} (source: ${status.trialSource})`}
            />
          )}
          {status.signalsMatched !== null && status.signalsRequired !== null && (
            <Row
              label="Hardware match"
              value={`${status.signalsMatched} of 4 signals (${status.signalsRequired} required)`}
            />
          )}
          <Row label="Checked" value={new Date(status.checkedAt).toLocaleString()} />
        </div>
        <p className="mt-4 text-xs text-neutral-500">
          The licence lives in C:\ProgramData\XP POS\license.dat. The installer
          never touches that folder, so upgrades and re-provisioning keep it.
        </p>
      </div>
    </motion.div>
  );
}

function describeState(status: LicenseStatus): string {
  switch (status.state) {
    case "licensed":
      return status.perpetual ? "Licensed" : `Licensed, ${status.daysRemaining} day(s) left`;
    case "trial":
      return `Trial, ${status.daysRemaining} day(s) left`;
    case "grace":
      return `Grace period, ${status.daysRemaining} day(s) left`;
    case "trial_expired":
      return "Trial ended - read-only";
    case "unlicensed":
      return "Not licensed - read-only";
  }
}

function StatusPanel({ status }: { status: LicenseStatus }) {
  const tone = status.restricted ? "danger" : status.warn ? "warning" : "ok";
  const border =
    tone === "danger"
      ? "border-red-600/50 bg-red-900/20"
      : tone === "warning"
        ? "border-yellow-600/50 bg-yellow-900/20"
        : "border-neutral-800 bg-neutral-900";

  return (
    <div className={`rounded-lg border p-6 ${border}`}>
      <div className="flex gap-4">
        <div className="mt-0.5 shrink-0">
          {tone === "danger" ? (
            <AlertTriangle size={24} className="text-red-400" />
          ) : tone === "warning" ? (
            <AlertTriangle size={24} className="text-yellow-400" />
          ) : (
            <ShieldCheck size={24} className="text-green-500" />
          )}
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold">{status.headline}</h2>
          <p className="mt-2 text-sm text-neutral-300">{status.detail}</p>
          {status.restricted && (
            <ul className="mt-4 space-y-1 text-sm text-neutral-300">
              <li className="flex gap-2">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-500" />
                Open orders can still be edited, paid and printed.
              </li>
              <li className="flex gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
                New orders, and changes to the menu, staff and settings, are blocked.
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function Callout({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-yellow-600/50 bg-yellow-900/20 p-4">
      <div className="mt-0.5 shrink-0 text-yellow-400">{icon}</div>
      <div className="text-sm">
        <p className="font-medium text-yellow-300">{title}</p>
        <p className="mt-1 text-yellow-200/80">{children}</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
