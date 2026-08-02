// features/server-management/components/ConnectionsManager.tsx

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, AlertTriangle } from "lucide-react";
import { IServerConfig, IActiveConnection } from "@/models/schemas/server-config.schema";

export default function ConnectionsManager({
  config,
  onUpdate,
}: {
  config: IServerConfig | null;
  onUpdate: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const activeConnections =
    config?.activeConnections.filter((c) => c.isActive) || [];

  const handleTerminateConnection = async (connectionId: string) => {
    if (!confirm("Terminate this connection?")) return;

    try {
      const res = await fetch("/api/admin/server-config/connections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connectionId }),
      });

      if (!res.ok) throw new Error("Failed to terminate connection");
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-500" />
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        </div>
      )}

      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Active Connections</h2>
            <p className="text-neutral-400 text-sm mt-1">
              {activeConnections.length} user{activeConnections.length !== 1 ? "s" : ""} currently
              connected
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-500">
              {activeConnections.length}
            </div>
          </div>
        </div>
      </div>

      {/* Connections List */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        {activeConnections.length === 0 ? (
          <p className="text-neutral-400 text-center py-8">
            No active connections at the moment
          </p>
        ) : (
          <div className="space-y-3">
            {activeConnections.map((conn) => (
              <ConnectionRow
                key={conn._id}
                connection={conn}
                onTerminate={() => handleTerminateConnection(conn._id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Connection Settings</h3>
        <div className="space-y-4">
          <SettingRow
            label="Max Concurrent Connections"
            value={String(config?.maxConcurrentConnections || 100)}
          />
          <SettingRow
            label="Session Timeout"
            value={`${config?.sessionTimeoutMinutes || 480} minutes`}
          />
          <SettingRow
            label="Connection Logging"
            value={config?.trackConnections ? "Enabled" : "Disabled"}
          />
          <SettingRow
            label="Log Retention"
            value={`${config?.connectionLogRetentionDays || 30} days`}
          />
        </div>
      </div>
    </motion.div>
  );
}

function ConnectionRow({
  connection,
  onTerminate,
}: {
  connection: IActiveConnection;
  onTerminate: () => void;
}) {
  const loginTime = new Date(connection.loginTime);
  const lastActivity = new Date(connection.lastActivityTime);
  const uptime = Math.round(
    (Date.now() - loginTime.getTime()) / 1000 / 60
  ); // minutes

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 flex items-center justify-between hover:border-neutral-600 transition-colors"
    >
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          <h4 className="font-medium">{connection.username}</h4>
          <span className="px-2 py-1 bg-neutral-700 rounded text-xs">{connection.role}</span>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-neutral-400">
          <div>
            <p className="text-xs text-neutral-500">IP Address</p>
            <p>{connection.ipAddress}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Device</p>
            <p>{connection.deviceName || "Unknown"}</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Connected</p>
            <p>{loginTime.toLocaleTimeString()} ({uptime}m ago)</p>
          </div>
          <div>
            <p className="text-xs text-neutral-500">Last Activity</p>
            <p>{lastActivity.toLocaleTimeString()}</p>
          </div>
        </div>
      </div>

      <button
        onClick={onTerminate}
        className="p-2 hover:bg-red-900/20 rounded transition-colors"
        title="Terminate connection"
      >
        <X size={18} className="text-red-500 hover:text-red-400" />
      </button>
    </motion.div>
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
