// features/server-management/components/SystemHealth.tsx

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";
import { IServerConfig } from "@/models/schemas/server-config.schema";

export default function SystemHealth({
  config,
  onRefresh,
}: {
  config: IServerConfig | null;
  onRefresh: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [healthData, setHealthData] = useState<any>(null);

  const handleHealthCheck = async () => {
    setChecking(true);
    try {
      const res = await fetch("/api/admin/server-config/health", {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setHealthData(data);
      }
    } finally {
      setChecking(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-green-500";
      case "warning":
        return "text-yellow-500";
      case "critical":
        return "text-red-500";
      default:
        return "text-neutral-400";
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* System Status Overview */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">System Status</h2>
          <button
            onClick={handleHealthCheck}
            disabled={checking}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {checking ? "Checking..." : "Run Health Check"}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <StatusBox
            label="Overall Status"
            value={config?.systemStatus || "unknown"}
            color={getStatusColor(config?.systemStatus || "unknown")}
          />
          <StatusBox
            label="Last Check"
            value={
              config?.lastHealthCheck
                ? new Date(config.lastHealthCheck).toLocaleString()
                : "Never"
            }
            color="text-neutral-400"
          />
          <StatusBox
            label="Disk Usage Threshold"
            value={`${config?.diskUsageThresholdPercent}%`}
            color="text-blue-500"
          />
          <StatusBox
            label="Active Connections"
            value={String(config?.activeConnections.filter((c) => c.isActive).length)}
            color="text-cyan-500"
          />
        </div>
      </div>

      {/* Health Check Results */}
      {healthData && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neutral-900 border border-neutral-800 rounded-lg p-6"
        >
          <h3 className="text-lg font-bold mb-4">Health Check Results</h3>
          <div className="space-y-3">
            <HealthCheckItem
              label="Database"
              status={healthData.checks.database ? "healthy" : "failed"}
              details={`Latency: ${healthData.database?.latency}ms`}
            />
            <HealthCheckItem
              label="Disk Space"
              status={healthData.checks.diskSpace ? "healthy" : "low"}
              details={`Usage: ${healthData.diskUsage?.percent}%`}
            />
            <HealthCheckItem
              label="Memory"
              status={healthData.checks.memory ? "healthy" : "low"}
              details={`Available: ${(healthData.memory?.available / 1024 / 1024).toFixed(0)}MB`}
            />
            <HealthCheckItem
              label="Ports"
              status={healthData.checks.ports ? "open" : "restricted"}
              details="Key ports accessible"
            />
          </div>
        </motion.div>
      )}

      {/* Security Settings */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Security Settings</h3>
        <div className="space-y-3">
          <SettingRow
            label="HTTPS Required"
            value={config?.requireHttps ? "Yes" : "No"}
          />
          <SettingRow
            label="Rate Limiting"
            value={config?.enableRateLimiting ? `${config.rateLimitPerMinute}/min` : "Disabled"}
          />
          <SettingRow
            label="Audit Logging"
            value={config?.enableAuditLog ? "Enabled" : "Disabled"}
          />
          <SettingRow
            label="Audit Log Retention"
            value={`${config?.auditLogRetentionDays} days`}
          />
        </div>
      </div>

      {/* System Recommendations */}
      <div className="bg-yellow-900/20 border border-yellow-600/50 rounded-lg p-6">
        <div className="flex gap-3">
          <AlertTriangle size={20} className="text-yellow-500 flex-shrink-0 mt-1" />
          <div>
            <h4 className="font-bold text-yellow-400">Recommendations</h4>
            <ul className="text-sm text-yellow-300 mt-2 space-y-1 list-disc list-inside">
              <li>Keep OS and Docker updated with latest security patches</li>
              <li>Enable HTTPS for production deployments</li>
              <li>Maintain regular off-box backups (at least weekly)</li>
              <li>Monitor disk usage to avoid running out of space</li>
              <li>Review and update device whitelists regularly</li>
            </ul>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatusBox({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4">
      <p className="text-neutral-400 text-sm">{label}</p>
      <p className={`text-lg font-bold mt-2 ${color}`}>{value}</p>
    </div>
  );
}

function HealthCheckItem({
  label,
  status,
  details,
}: {
  label: string;
  status: string;
  details: string;
}) {
  const isHealthy = status === "healthy" || status === "open";
  const icon = isHealthy ? (
    <CheckCircle2 size={18} className="text-green-500" />
  ) : (
    <AlertTriangle size={18} className="text-yellow-500" />
  );

  return (
    <div className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 flex items-center gap-4">
      <div>{icon}</div>
      <div className="flex-1">
        <p className="font-medium">{label}</p>
        <p className="text-sm text-neutral-400 mt-1">{details}</p>
      </div>
      <span className={`px-3 py-1 rounded text-xs font-medium ${
        isHealthy
          ? "bg-green-900/30 text-green-400"
          : "bg-yellow-900/30 text-yellow-400"
      }`}>
        {status}
      </span>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-neutral-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
