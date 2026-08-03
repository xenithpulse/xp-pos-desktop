// features/server-management/components/Diagnostics.tsx
//
// Read-only box diagnostics — the panel that answers a support call.
//
// It is built around what someone on the phone to a restaurant actually needs
// to know, in the order they need it: are the three services running, is
// anything reachable from the LAN that should not be, where is the data, and
// what do the logs say.
//
// The "reachable off this box" column is not decoration. Caddy is the only
// component that should be LAN-facing; the app binds 127.0.0.1 and MongoDB
// binds loopback with no authentication at all. A row appearing there that is
// not Caddy is a serious finding, and this makes it visible without anyone
// having to run Get-NetTCPConnection on site.

"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, FileText, RefreshCw, XCircle } from "lucide-react";

interface Diagnostics {
  collectedAt: string;
  identity: { siteId: string; machineId: string | null; hostname: string; appVersion: string };
  host: {
    platform: string;
    release: string;
    uptimeSeconds: number;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
    cpuCount: number;
  };
  paths: { installDir: string; dataRoot: string; logsDir: string; configuredPort: string | null };
  services: { id: string; status: string; startType: string; delayedAutoStart: boolean }[];
  listeners: { address: string; port: number; process: string | null; lanFacing: boolean }[];
  logs: { name: string; relativePath: string; sizeBytes: number; modifiedAt: string }[];
  problems: string[];
}

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function duration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function Diagnostics() {
  const [data, setData] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [logText, setLogText] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/server-config/diagnostics");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openLog = async (relativePath: string) => {
    setLogPath(relativePath);
    setLogText(null);
    setLogError(null);
    try {
      const res = await fetch(
        `/api/admin/server-config/diagnostics/logs?file=${encodeURIComponent(relativePath)}`
      );
      const body = await res.json();
      if (res.status === 401 || res.status === 403) {
        setLogError("Sign in as an admin to read log contents.");
      } else if (!res.ok) {
        setLogError(body.message ?? "Could not read that log.");
      } else {
        setLogText(body.text || "(empty)");
      }
    } catch {
      setLogError("Could not read that log.");
    }
  };

  if (loading && !data) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <div className="h-6 w-48 bg-neutral-800 rounded animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6 text-neutral-400">
        Diagnostics are unavailable.
      </div>
    );
  }

  const lanFacing = data.listeners.filter((l) => l.lanFacing);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold">Diagnostics</h2>
            <p className="text-neutral-400 text-sm mt-1">
              Collected {new Date(data.collectedAt).toLocaleString()}
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Info label="POS version" value={data.identity.appVersion} mono />
          <Info label="Computer name" value={data.identity.hostname} />
          <Info label="Site ID" value={data.identity.siteId} mono />
          <Info label="Windows" value={`${data.host.platform} ${data.host.release}`} />
          <Info label="Uptime" value={duration(data.host.uptimeSeconds)} />
          <Info
            label="Memory"
            value={`${bytes(data.host.totalMemoryBytes - data.host.freeMemoryBytes)} used of ${bytes(
              data.host.totalMemoryBytes
            )}`}
          />
          <Info label="POS address port" value={data.paths.configuredPort ?? "unknown"} mono />
          <Info label="Data folder" value={data.paths.dataRoot} mono />
        </div>

        {data.problems.length > 0 && (
          <ul className="mt-5 list-inside list-disc space-y-1 text-sm text-yellow-400">
            {data.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Services */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Windows services</h3>
        <div className="space-y-3">
          {data.services.map((s) => {
            const running = s.status === "Running";
            return (
              <div
                key={s.id}
                className="flex items-center gap-4 rounded-lg border border-neutral-700 bg-neutral-800 p-4"
              >
                {running ? (
                  <CheckCircle2 size={18} className="shrink-0 text-green-500" />
                ) : (
                  <XCircle size={18} className="shrink-0 text-red-500" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-medium">{s.id}</p>
                  <p className="mt-1 text-xs text-neutral-400">{s.startType}</p>
                </div>
                <span
                  className={`shrink-0 rounded px-3 py-1 text-xs font-medium ${
                    running ? "bg-green-900/30 text-green-400" : "bg-red-900/30 text-red-400"
                  }`}
                >
                  {s.status}
                </span>
              </div>
            );
          })}
        </div>
        {data.services.some((s) => !s.delayedAutoStart && s.status !== "NOT INSTALLED") && (
          <p className="mt-4 flex gap-2 text-sm text-yellow-400">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            Not every service is set to Automatic (Delayed Start). Those will not come back on
            their own after a power cut.
          </p>
        )}
      </div>

      {/* Network exposure */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-bold">Reachable from the network</h3>
        <p className="mt-1 text-sm text-neutral-400">
          Only the POS web address should appear here. Everything else binds to this computer
          only.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="pb-2 pr-4 font-medium">Port</th>
                <th className="pb-2 pr-4 font-medium">Address</th>
                <th className="pb-2 font-medium">Program</th>
              </tr>
            </thead>
            <tbody>
              {lanFacing.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-neutral-500">
                    Nothing is listening on a network-facing address.
                  </td>
                </tr>
              )}
              {lanFacing.map((l) => (
                <tr key={`${l.address}:${l.port}`} className="border-t border-neutral-800">
                  <td className="py-2 pr-4 font-mono">{l.port}</td>
                  <td className="py-2 pr-4 font-mono text-neutral-400">{l.address}</td>
                  <td className="py-2 text-neutral-300">{l.process ?? "unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Logs */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Logs</h3>
        {data.logs.length === 0 ? (
          <p className="text-sm text-neutral-400">No log files found in {data.paths.logsDir}.</p>
        ) : (
          <div className="space-y-2">
            {data.logs.slice(0, 25).map((f) => (
              <button
                key={f.relativePath}
                onClick={() => openLog(f.relativePath)}
                className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                  logPath === f.relativePath
                    ? "border-blue-600 bg-blue-900/20"
                    : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                }`}
              >
                <FileText size={16} className="shrink-0 text-neutral-400" />
                <span className="min-w-0 flex-1 truncate font-mono text-sm">
                  {f.relativePath}
                </span>
                <span className="shrink-0 text-xs text-neutral-500">{bytes(f.sizeBytes)}</span>
              </button>
            ))}
          </div>
        )}

        {logPath && (
          <div className="mt-4">
            <p className="mb-2 font-mono text-sm text-neutral-400">{logPath}</p>
            {logError ? (
              <p className="rounded-lg border border-yellow-600/50 bg-yellow-900/20 px-4 py-3 text-sm text-yellow-300">
                {logError}
              </p>
            ) : (
              <pre className="max-h-96 overflow-auto rounded-lg border border-neutral-700 bg-black p-4 text-xs leading-relaxed text-neutral-300">
                {logText ?? "Loading…"}
              </pre>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-neutral-400 text-sm">{label}</p>
      <p className={`mt-1 break-all font-semibold ${mono ? "font-mono text-sm" : ""}`}>{value}</p>
    </div>
  );
}
