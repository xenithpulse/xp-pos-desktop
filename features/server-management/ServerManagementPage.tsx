// features/server-management/ServerManagementPage.tsx

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  SettingsIcon,
  Router,
  Activity,
  HardDrive,
  AlertTriangle,
  CheckCircle2,
  Home,
} from "lucide-react";
import { IServerConfig } from "@/models/schemas/server-config.schema";
import RouterManagement from "./components/RouterManagement";
import ConnectionsManager from "./components/ConnectionsManager";
import BackupManager from "./components/BackupManager";
import SystemHealth from "./components/SystemHealth";
import NetworkSettings from "./components/NetworkSettings";
import UpdateManager from "./components/UpdateManager";
import Diagnostics from "./components/Diagnostics";
import LicenseManager from "./components/LicenseManager";

type TabType =
  | "overview"
  | "router"
  | "connections"
  | "backups"
  | "network"
  | "health"
  | "updates"
  | "licence"
  | "diagnostics";

type ViewMode = "simple" | "advanced";

export default function ServerManagementPage() {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [config, setConfig] = useState<IServerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>("simple");
  const [backupBusy, setBackupBusy] = useState(false);

  // Remember the last chosen view so the owner isn't dropped into "Advanced".
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("sm-mode") === "advanced") {
      setMode("advanced");
    }
  }, []);

  const switchMode = (next: ViewMode) => {
    setMode(next);
    if (typeof window !== "undefined") localStorage.setItem("sm-mode", next);
  };

  const runBackup = async () => {
    setBackupBusy(true);
    try {
      await fetch("/api/admin/server-config/backups/run", { method: "POST" });
      fetchConfig();
      setTimeout(fetchConfig, 8000);
      setTimeout(() => {
        fetchConfig();
        setBackupBusy(false);
      }, 40000);
    } catch {
      setBackupBusy(false);
    }
  };

  useEffect(() => {
    fetchConfig();
    const interval = setInterval(fetchConfig, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/admin/server-config");
      if (!res.ok) throw new Error("Failed to fetch config");
      const data = await res.json();
      setConfig(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black p-4 text-white sm:p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-500" />
              <span>{error}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
          <Link
            href="/"
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-300 transition-colors hover:border-neutral-700 hover:text-white"
          >
            <Home size={15} />
            Back to Home
          </Link>
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <SettingsIcon size={32} className="text-blue-500" />
              <div>
                <h1 className="text-2xl font-bold sm:text-3xl">Server Management</h1>
                <p className="text-neutral-400 text-sm">
                  Manage WiFi, connections, backups, and system settings
                </p>
              </div>
            </div>
            <div className="flex items-center rounded-lg border border-neutral-800 overflow-hidden text-sm shrink-0">
              <button
                onClick={() => switchMode("simple")}
                className={`px-4 py-2 font-medium transition-colors ${
                  mode === "simple"
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-900 text-neutral-400 hover:text-white"
                }`}
              >
                Simple
              </button>
              <button
                onClick={() => switchMode("advanced")}
                className={`px-4 py-2 font-medium transition-colors ${
                  mode === "advanced"
                    ? "bg-blue-600 text-white"
                    : "bg-neutral-900 text-neutral-400 hover:text-white"
                }`}
              >
                Advanced
              </button>
            </div>
          </div>

          {/* Quick Status (advanced only — Simple mode has its own layout) */}
          {mode === "advanced" && (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatusCard
              label="System Status"
              value={config?.systemStatus || "unknown"}
              icon={
                config?.systemStatus === "healthy" ? (
                  <CheckCircle2 size={20} className="text-green-500" />
                ) : (
                  <AlertTriangle size={20} className="text-yellow-500" />
                )
              }
            />
            <StatusCard
              label="Active Connections"
              value={String(config?.activeConnections.filter(c => c.isActive).length || 0)}
              icon={<Activity size={20} className="text-blue-500" />}
            />
            <StatusCard
              label="Whitelisted Devices"
              value={String(config?.routerMacWhitelist.length || 0)}
              icon={<Router size={20} className="text-purple-500" />}
            />
            <StatusCard
              label="Backup Paths"
              value={String(config?.backupPaths.length || 0)}
              icon={<HardDrive size={20} className="text-orange-500" />}
            />
          </div>
          )}
        </div>
      </div>

      {mode === "simple" ? (
        <SimpleView
          config={config}
          onRunBackup={runBackup}
          backupBusy={backupBusy}
          onOpenAdvanced={() => switchMode("advanced")}
          onOpenLicence={() => {
            setActiveTab("licence");
            switchMode("advanced");
          }}
        />
      ) : (
      <>
      {/* Tab Navigation */}
      <div className="border-b border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto">
            {[
              { id: "overview" as const, label: "Overview" },
              { id: "router" as const, label: "WiFi Router" },
              { id: "connections" as const, label: "Active Connections" },
              { id: "backups" as const, label: "Backups" },
              { id: "network" as const, label: "Network Settings" },
              { id: "health" as const, label: "System Health" },
              { id: "updates" as const, label: "Updates" },
              { id: "licence" as const, label: "Licence" },
              { id: "diagnostics" as const, label: "Diagnostics" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-blue-500 text-blue-500"
                    : "border-transparent text-neutral-400 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        {activeTab === "overview" && (
          <OverviewTab
            config={config}
            onRefresh={fetchConfig}
            onOpenDiagnostics={() => setActiveTab("diagnostics")}
            onRunBackup={runBackup}
            backupBusy={backupBusy}
          />
        )}
        {activeTab === "router" && <RouterManagement config={config} onUpdate={fetchConfig} />}
        {activeTab === "connections" && (
          <ConnectionsManager config={config} onUpdate={fetchConfig} />
        )}
        {activeTab === "backups" && (
          <BackupManager config={config} onUpdate={fetchConfig} />
        )}
        {activeTab === "network" && (
          <NetworkSettings config={config} onUpdate={fetchConfig} />
        )}
        {activeTab === "health" && <SystemHealth config={config} onRefresh={fetchConfig} />}
        {activeTab === "updates" && <UpdateManager />}
        {activeTab === "licence" && <LicenseManager />}
        {activeTab === "diagnostics" && <Diagnostics />}
      </div>
      </>
      )}
    </div>
  );
}

function SimpleView({
  config,
  onRunBackup,
  backupBusy,
  onOpenAdvanced,
  onOpenLicence,
}: {
  config: IServerConfig | null;
  onRunBackup: () => void;
  backupBusy: boolean;
  onOpenAdvanced: () => void;
  onOpenLicence: () => void;
}) {
  const healthy = config?.systemStatus === "healthy";
  const activeDevices =
    config?.activeConnections.filter((c) => c.isActive).length || 0;
  const serverUrl = (config as { serverUrl?: string } | null)?.serverUrl;

  const backupStatus = config?.lastBackupStatus || "never";
  const backupColor =
    backupStatus === "success"
      ? "text-green-500"
      : backupStatus === "partial"
      ? "text-yellow-500"
      : backupStatus === "error"
      ? "text-red-500"
      : "text-neutral-400";

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      {/* Licence, ABOVE everything else when there is something to say. The
          owner who needs this is the one whose trial is running out, and they
          are not going to find it behind "Advanced settings". */}
      <SimpleLicenceCard onOpen={onOpenLicence} />

      {/* Big status tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex items-center gap-4">
          {healthy ? (
            <CheckCircle2 size={32} className="text-green-500" />
          ) : (
            <AlertTriangle size={32} className="text-yellow-500" />
          )}
          <div>
            <p className="text-2xl font-bold capitalize">
              {config?.systemStatus || "unknown"}
            </p>
            <p className="text-neutral-400 text-sm">System</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex items-center gap-4">
          <Activity size={32} className="text-blue-500" />
          <div>
            <p className="text-2xl font-bold">{activeDevices}</p>
            <p className="text-neutral-400 text-sm">Devices connected</p>
          </div>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex items-center gap-4">
          <HardDrive size={32} className={backupColor} />
          <div>
            <p className={`text-2xl font-bold capitalize ${backupColor}`}>
              {backupStatus}
            </p>
            <p className="text-neutral-400 text-sm">Last backup</p>
          </div>
        </div>
      </div>

      {/* Backup panel */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Backup</h2>
            <p className="text-neutral-400 text-sm mt-1">
              {config?.lastBackupAt
                ? `Last run: ${new Date(config.lastBackupAt).toLocaleString()}`
                : "No backup has run yet."}
            </p>
            {config?.backupRunRequestedAt && (
              <p className="text-blue-400 text-sm mt-1">
                Requested — running on the next check…
              </p>
            )}
          </div>
          <button
            onClick={onRunBackup}
            disabled={backupBusy}
            className="w-full rounded-lg bg-green-600 px-5 py-3 font-medium transition-colors hover:bg-green-700 disabled:opacity-50 sm:w-auto"
          >
            {backupBusy ? "Backing up…" : "Back Up Now"}
          </button>
        </div>
      </div>

      {/* Server address */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <h2 className="text-lg font-bold mb-1">Open the POS on other devices</h2>
        <p className="text-neutral-400 text-sm mb-3">
          Staff devices on the same WiFi can open this address in a browser:
        </p>
        <p className="text-xl font-mono text-blue-400 break-all">
          {serverUrl || "Detecting…"}
        </p>
      </div>

      {/* Advanced entry */}
      <div className="text-center pt-2">
        <button
          onClick={onOpenAdvanced}
          className="text-neutral-400 hover:text-white text-sm font-medium underline underline-offset-4"
        >
          Advanced settings (WiFi devices, network, backups, health)
        </button>
      </div>
    </div>
  );
}

/**
 * Licence state in Simple mode.
 *
 * Renders NOTHING while the POS is quietly licensed - a working appliance
 * should not have a licence widget on its front page. It appears only when
 * there is something the owner has to act on: a trial running down, a grace
 * period, or a POS that has gone read-only.
 */
function SimpleLicenceCard({ onOpen }: { onOpen: () => void }) {
  const [status, setStatus] = useState<{
    restricted: boolean;
    warn: boolean;
    headline: string;
    detail: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/server-config/license");
        if (res.ok && !cancelled) setStatus(await res.json());
      } catch {
        // The licence panel in Advanced reports properly; a fetch failure here
        // means showing nothing, which is the right amount of noise.
      }
    };
    load();
    const t = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!status || (!status.warn && !status.restricted)) return null;

  const danger = status.restricted;
  return (
    <div
      className={`rounded-xl border p-6 ${
        danger ? "border-red-500 bg-red-900/20" : "border-yellow-600/60 bg-yellow-900/20"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <AlertTriangle
            size={24}
            className={`mt-0.5 shrink-0 ${danger ? "text-red-400" : "text-yellow-400"}`}
          />
          <div>
            <p className="text-lg font-bold">{status.headline}</p>
            <p className="mt-1 text-sm text-neutral-300">{status.detail}</p>
          </div>
        </div>
        <button
          onClick={onOpen}
          className={`w-full shrink-0 rounded-lg px-5 py-3 font-medium transition-colors sm:w-auto ${
            danger ? "bg-red-600 hover:bg-red-700" : "bg-yellow-600 hover:bg-yellow-700"
          }`}
        >
          Licence
        </button>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-neutral-900 border border-neutral-800 rounded-lg p-4"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-neutral-400 text-sm">{label}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
        </div>
        <div className="opacity-60">{icon}</div>
      </div>
    </motion.div>
  );
}

function OverviewTab({
  config,
  onRefresh,
  onOpenDiagnostics,
  onRunBackup,
  backupBusy,
}: {
  config: IServerConfig | null;
  onRefresh: () => void;
  onOpenDiagnostics: () => void;
  onRunBackup: () => void;
  backupBusy: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">System Overview</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-6">
          <InfoItem
            label="Server Address (auto-detected)"
            value={
              (config as { serverUrl?: string } | null)?.serverUrl ||
              "Detecting…"
            }
          />
          <InfoItem label="Last Health Check" value={config?.lastHealthCheck ? new Date(config.lastHealthCheck).toLocaleString() : "Never"} />
          <InfoItem label="Router Management" value={config?.routerEnabled ? "Enabled" : "Disabled"} />
          <InfoItem label="Backup System" value={config?.backupEnabled ? "Enabled" : "Disabled"} />
          <InfoItem label="Backup Time" value={`${config?.backupHour}:00 (Daily)`} />
          <InfoItem label="Session Timeout" value={`${config?.sessionTimeoutMinutes} minutes`} />
          <InfoItem label="Max Connections" value={String(config?.maxConcurrentConnections)} />
        </div>
      </div>

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Quick Actions</h2>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={onRefresh}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium transition-colors hover:bg-blue-700 sm:w-auto"
          >
            Refresh Status
          </button>
          <button
            onClick={onRunBackup}
            disabled={backupBusy}
            className="rounded-lg bg-neutral-800 px-4 py-2 font-medium transition-colors hover:bg-neutral-700 disabled:opacity-50 sm:w-auto"
          >
            {backupBusy ? "Backing up…" : "Run Backup Now"}
          </button>
          <button
            onClick={onOpenDiagnostics}
            className="rounded-lg bg-neutral-800 px-4 py-2 font-medium transition-colors hover:bg-neutral-700 sm:w-auto"
          >
            System Diagnostics
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-neutral-400 text-sm">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-neutral-800">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-6">
          <div className="h-8 w-64 bg-neutral-800 rounded animate-pulse mb-6" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-neutral-900 rounded-lg p-4 h-20 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
