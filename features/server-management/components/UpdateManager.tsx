// features/server-management/components/UpdateManager.tsx
//
// The software update panel.
//
// The hard requirement this UI has to meet is that a box with NO INTERNET looks
// completely normal here. Most of these appliances never see the internet, by
// design, and a restaurant that will never be online must not be shown a
// warning, a red badge, or a "could not reach the update server" error about a
// service it does not use. So there are three distinct calm states — channel
// not configured, configured but offline, configured and up to date — and only
// a genuine verification failure is ever shown in red.

"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  WifiOff,
} from "lucide-react";

interface AvailableUpdate {
  version: string;
  sizeBytes: number;
  releasedAt?: string;
  notes?: string;
}

interface UpdateStatus {
  enabled: boolean;
  installedVersion: string;
  channel: string;
  checkIntervalHours: number;
  autoInstall: boolean;
  maintenanceWindow: string;
  allowUnsigned: boolean;
  lastCheckAt: string | null;
  lastCheckOk: boolean | null;
  lastCheckDetail: string | null;
  reachable: boolean | null;
  available: AvailableUpdate | null;
  downloaded: {
    version: string;
    sizeBytes: number;
    verifiedAt: string;
    signature: string;
    signatureTrusted: boolean;
  } | null;
  installRunning: boolean;
  readyToInstall: boolean;
  blockers: string[];
  warnings: string[];
  lastInstall: {
    version: string;
    startedAt: string;
    finishedAt?: string;
    outcome: string;
    detail?: string;
  } | null;
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export default function UpdateManager() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"check" | "install" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/server-config/updates");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const checkNow = async () => {
    setBusy("check");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/server-config/updates/check", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.checked === false) {
        setMessage(data.message ?? "Could not check for updates.");
      } else if (data.available) {
        setMessage(`Version ${data.available.version} is available.`);
      } else {
        setMessage("This POS is up to date.");
      }
      await load();
    } catch {
      setMessage("Could not reach this box's update service.");
    } finally {
      setBusy(null);
    }
  };

  const installNow = async () => {
    // A confirm() rather than a styled modal: this stops the restaurant's till
    // for several minutes and the wording matters more than the presentation.
    const ok = window.confirm(
      `Install version ${status?.downloaded?.version}?\n\n` +
        `The POS will stop responding for a few minutes while it updates, on ` +
        `every device. Orders, menu, images and settings are kept.\n\n` +
        `Do not power the box off during the update.`
    );
    if (!ok) return;

    setBusy("install");
    setMessage(null);
    try {
      const res = await fetch("/api/admin/server-config/updates/install", { method: "POST" });
      const data = await res.json();
      if (res.status === 401 || res.status === 403) {
        setMessage("You need to be signed in as an admin to install an update.");
      } else if (!res.ok) {
        setMessage(
          Array.isArray(data.blockers) && data.blockers.length
            ? data.blockers.join(" ")
            : (data.message ?? "The update could not be started.")
        );
      } else {
        setMessage(data.message);
      }
      await load();
    } catch {
      // Expected: the app is being stopped by its own installer.
      setMessage("The update has started. This page will stop responding until it finishes.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <div className="h-6 w-48 bg-neutral-800 rounded animate-pulse" />
      </div>
    );
  }

  if (!status) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 text-neutral-400">
        Update status is unavailable.
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">Software Updates</h2>
            <p className="text-neutral-400 text-sm mt-1">
              This POS is running version{" "}
              <span className="font-mono text-white">{status.installedVersion}</span>
            </p>
          </div>
          {status.enabled && (
            <button
              onClick={checkNow}
              disabled={busy !== null}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <RefreshCw size={16} className={busy === "check" ? "animate-spin" : ""} />
              {busy === "check" ? "Checking…" : "Check for updates"}
            </button>
          )}
        </div>

        {message && (
          <p className="mt-4 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 text-sm">
            {message}
          </p>
        )}

        <div className="mt-6">
          {!status.enabled ? (
            <CalmState
              icon={<CheckCircle2 size={20} className="text-neutral-500" />}
              title="Updates are managed by XenithPulse"
              body="This box does not check for updates on its own. That is the normal setting for a POS with no internet connection - it will keep running exactly as it is."
            />
          ) : status.installRunning ? (
            <CalmState
              icon={<Download size={20} className="animate-pulse text-blue-400" />}
              title="An update is being installed"
              body="The POS will stop responding for a few minutes and come back on the new version. Do not power the box off."
            />
          ) : status.reachable === false ? (
            <CalmState
              icon={<WifiOff size={20} className="text-neutral-500" />}
              title="No internet connection"
              body="This box could not reach the update server, so it is staying on the version it has. Nothing is wrong - a POS with no internet works normally."
            />
          ) : status.downloaded ? (
            <ReadyToInstall status={status} busy={busy} onInstall={installNow} />
          ) : status.available ? (
            <CalmState
              icon={<Download size={20} className="text-blue-400" />}
              title={`Version ${status.available.version} is being downloaded`}
              body="It is verified before anything is installed. You will be asked before the POS restarts."
            />
          ) : (
            <CalmState
              icon={<CheckCircle2 size={20} className="text-green-500" />}
              title="This POS is up to date"
              body={
                status.lastCheckAt
                  ? `Last checked ${new Date(status.lastCheckAt).toLocaleString()}.`
                  : `Checked automatically every ${status.checkIntervalHours} hours.`
              }
            />
          )}
        </div>

        {/* A verification failure is the one thing that is genuinely alarming
            here, and it is reported as such: it means a payload did not match
            what the manifest promised. */}
        {status.enabled &&
          status.lastCheckOk === false &&
          status.reachable !== false &&
          status.lastCheckDetail && (
            <div className="mt-4 flex gap-3 rounded-lg border border-red-600/50 bg-red-900/20 p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-red-400" />
              <div className="text-sm">
                <p className="font-medium text-red-300">The last update check was rejected</p>
                <p className="mt-1 text-red-200/80">{status.lastCheckDetail}</p>
              </div>
            </div>
          )}

        {status.lastInstall && status.lastInstall.outcome !== "success" && (
          <div className="mt-4 flex gap-3 rounded-lg border border-yellow-600/50 bg-yellow-900/20 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-yellow-500" />
            <div className="text-sm">
              <p className="font-medium text-yellow-300">
                The last update to {status.lastInstall.version} did not complete
              </p>
              <p className="mt-1 text-yellow-200/80">
                {status.lastInstall.detail ??
                  "This box is still running its previous, working version."}
              </p>
            </div>
          </div>
        )}
      </div>

      {status.enabled && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
          <h3 className="text-lg font-bold mb-4">Update settings</h3>
          <div className="space-y-3 text-sm">
            <Row label="Channel" value={status.channel} />
            <Row label="Checks every" value={`${status.checkIntervalHours} hours`} />
            <Row
              label="Unattended install"
              value={
                status.autoInstall
                  ? `On, only between ${status.maintenanceWindow} with no orders open`
                  : "Off - the restaurant chooses when to update"
              }
            />
            <Row
              label="Signature check"
              value={
                status.allowUnsigned
                  ? "DISABLED (POS_UPDATE_ALLOW_UNSIGNED=true)"
                  : "Required - an unsigned installer is refused"
              }
              alert={status.allowUnsigned}
            />
          </div>
          <p className="mt-4 text-xs text-neutral-500">
            These are read from C:\ProgramData\XP POS\.env. Change them there and
            re-run provisioning as Administrator.
          </p>
        </div>
      )}
    </motion.div>
  );
}

function ReadyToInstall({
  status,
  busy,
  onInstall,
}: {
  status: UpdateStatus;
  busy: "check" | "install" | null;
  onInstall: () => void;
}) {
  const d = status.downloaded!;
  return (
    <div className="rounded-lg border border-blue-600/50 bg-blue-900/20 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-lg font-bold">Version {d.version} is ready to install</p>
          <p className="mt-1 text-sm text-neutral-300">
            {mb(d.sizeBytes)}, downloaded and checked on{" "}
            {new Date(d.verifiedAt).toLocaleString()}.
          </p>

          <p className="mt-3 flex items-start gap-2 text-sm">
            {d.signatureTrusted ? (
              <ShieldCheck size={16} className="mt-0.5 shrink-0 text-green-400" />
            ) : (
              <ShieldAlert size={16} className="mt-0.5 shrink-0 text-yellow-500" />
            )}
            <span className={d.signatureTrusted ? "text-green-300" : "text-yellow-300"}>
              {d.signature}
            </span>
          </p>

          {status.available?.notes && (
            <p className="mt-3 whitespace-pre-line text-sm text-neutral-300">
              {status.available.notes}
            </p>
          )}
        </div>

        <button
          onClick={onInstall}
          disabled={busy !== null || !status.readyToInstall}
          className="shrink-0 rounded-lg bg-green-600 px-5 py-3 font-medium transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy === "install" ? "Starting…" : "Install now"}
        </button>
      </div>

      {status.blockers.length > 0 && (
        <div className="mt-4 border-t border-blue-600/30 pt-4">
          <p className="text-sm font-medium text-yellow-300">
            Not right now, because:
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-yellow-200/80">
            {status.blockers.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CalmState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-3 rounded-lg border border-neutral-700 bg-neutral-800/60 p-5">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-neutral-400">{body}</p>
      </div>
    </div>
  );
}

function Row({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-neutral-400">{label}</span>
      <span className={`font-medium ${alert ? "text-yellow-400" : ""}`}>{value}</span>
    </div>
  );
}
