// features/server-management/components/BackupManager.tsx

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, AlertTriangle, CheckCircle2, XCircle, Play } from "lucide-react";
import { IServerConfig, IBackupPath } from "@/models/schemas/server-config.schema";

export default function BackupManager({
  config,
  onUpdate,
}: {
  config: IServerConfig | null;
  onUpdate: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [formData, setFormData] = useState({
    path: "",
    type: "local" as const,
    backupRetention: 14,
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleAddBackupPath = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/server-config/backups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add backup path");
      }

      setFormData({
        path: "",
        type: "local",
        backupRetention: 14,
        notes: "",
      });
      setShowAddForm(false);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBackupPath = async (path: string) => {
    if (!confirm("Remove this backup path?")) return;

    try {
      const res = await fetch("/api/admin/server-config/backups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });

      if (!res.ok) throw new Error("Failed to remove backup path");
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleRunBackupNow = async () => {
    setRunningBackup(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/server-config/backups/run", {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Failed to request backup");
      }
      // The XP Thermal Service backup subsystem picks this up on its next poll,
      // runs the dump/copy, and reports back. Refresh a few times so the status
      // lands without a manual reload (the page also auto-refreshes every 30s).
      onUpdate();
      setTimeout(onUpdate, 8000);
      setTimeout(() => {
        onUpdate();
        setRunningBackup(false);
      }, 40000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setRunningBackup(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
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

      {/* Backup Settings */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Backup Configuration</h2>
        <div className="grid grid-cols-2 gap-6">
          <SettingItem
            label="Backup System"
            value={config?.backupEnabled ? "Enabled" : "Disabled"}
          />
          <SettingItem label="Daily Backup Time" value={`${config?.backupHour}:00`} />
          <SettingItem
            label="Retention Period"
            value={`${config?.backupRetentionDays} days`}
          />
          <SettingItem
            label="Max Concurrent Backups"
            value={String(config?.maxBackupConcurrency)}
          />
        </div>
      </div>

      {/* Backup Status */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Backup Status</h3>
        {config?.backupRunRequestedAt && (
          <div className="mb-4 bg-blue-900/20 border border-blue-600/50 rounded-lg p-3 text-sm text-blue-300">
            Backup requested — the backup service will run it on its next check.
          </div>
        )}
        <div className="grid grid-cols-2 gap-6">
          <SettingItem
            label="Last Backup"
            value={
              config?.lastBackupAt
                ? new Date(config.lastBackupAt).toLocaleString()
                : "Never"
            }
          />
          <div>
            <p className="text-neutral-400 text-sm">Last Result</p>
            <p
              className={`text-lg font-semibold mt-1 ${
                config?.lastBackupStatus === "success"
                  ? "text-green-500"
                  : config?.lastBackupStatus === "partial"
                  ? "text-yellow-500"
                  : config?.lastBackupStatus === "error"
                  ? "text-red-500"
                  : "text-neutral-400"
              }`}
            >
              {config?.lastBackupStatus || "never"}
            </p>
          </div>
        </div>
        {config?.lastBackupMessage && (
          <p className="text-sm text-neutral-400 mt-3">{config.lastBackupMessage}</p>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h3 className="text-lg font-bold mb-4">Backup Actions</h3>
        <div className="flex gap-3">
          <button
            onClick={handleRunBackupNow}
            disabled={runningBackup}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            <Play size={18} />
            {runningBackup ? "Running..." : "Run Backup Now"}
          </button>
          <button className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg font-medium transition-colors">
            View Backup History
          </button>
          <button className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg font-medium transition-colors">
            Export Backups
          </button>
        </div>
      </div>

      {/* Add Backup Path Form */}
      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neutral-900 border border-neutral-800 rounded-lg p-6"
        >
          <h3 className="text-lg font-bold mb-4">Add Backup Path</h3>
          <form onSubmit={handleAddBackupPath} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Backup Path</label>
              <input
                type="text"
                placeholder="/backups, /mnt/external, \\network\backups"
                value={formData.path}
                onChange={(e) =>
                  setFormData({ ...formData, path: e.target.value })
                }
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Path Type</label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value as any })
                  }
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="local">Local Storage</option>
                  <option value="external">External Drive</option>
                  <option value="network">Network Storage</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Retention (days)
                </label>
                <input
                  type="number"
                  value={formData.backupRetention}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      backupRetention: parseInt(e.target.value),
                    })
                  }
                  className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  min={1}
                  max={365}
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Notes (Optional)
              </label>
              <textarea
                placeholder="Add notes about this backup location..."
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 h-20 resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {loading ? "Adding..." : "Add Path"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Backup Paths */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Backup Paths ({config?.backupPaths.length || 0})</h3>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              <Plus size={18} />
              Add Path
            </button>
          )}
        </div>

        {config?.backupPaths.length === 0 ? (
          <p className="text-neutral-400 text-center py-8">No backup paths configured</p>
        ) : (
          <div className="space-y-2">
            {config?.backupPaths.map((backup) => (
              <BackupPathRow
                key={backup.path}
                backup={backup}
                onDelete={() => handleDeleteBackupPath(backup.path)}
                formatBytes={formatBytes}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function BackupPathRow({
  backup,
  onDelete,
  formatBytes,
}: {
  backup: IBackupPath;
  onDelete: () => void;
  formatBytes: (bytes: number) => string;
}) {
  const statusIcon =
    backup.status === "active" ? (
      <CheckCircle2 size={18} className="text-green-500" />
    ) : backup.status === "error" ? (
      <XCircle size={18} className="text-red-500" />
    ) : (
      <AlertTriangle size={18} className="text-yellow-500" />
    );

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 flex items-center justify-between hover:border-neutral-600 transition-colors"
    >
      <div className="flex items-center gap-4 flex-1">
        <div>{statusIcon}</div>
        <div className="flex-1">
          <p className="font-medium">{backup.path}</p>
          <div className="flex gap-4 text-sm text-neutral-400 mt-1">
            <span>{backup.type}</span>
            <span>Storage: {formatBytes(backup.storageUsed)}</span>
            <span>Retention: {backup.backupRetention} days</span>
            {backup.lastBackupTime && (
              <span>
                Last: {new Date(backup.lastBackupTime).toLocaleDateString()}
              </span>
            )}
          </div>
          {backup.notes && (
            <p className="text-xs text-neutral-500 mt-2">{backup.notes}</p>
          )}
        </div>
      </div>

      <button
        onClick={onDelete}
        className="p-2 hover:bg-red-900/20 rounded transition-colors"
      >
        <Trash2 size={18} className="text-red-500 hover:text-red-400" />
      </button>
    </motion.div>
  );
}

function SettingItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-neutral-400 text-sm">{label}</p>
      <p className="text-lg font-semibold mt-1">{value}</p>
    </div>
  );
}
