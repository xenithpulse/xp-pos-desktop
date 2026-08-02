// features/server-management/components/RouterManagement.tsx

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { IServerConfig, IRouterWhitelistEntry } from "@/models/schemas/server-config.schema";

export default function RouterManagement({
  config,
  onUpdate,
}: {
  config: IServerConfig | null;
  onUpdate: () => void;
}) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState({
    macAddress: "",
    deviceName: "",
    deviceType: "laptop" as const,
    notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist a partial config change, then refresh from the server.
  const patchConfig = async (patch: Record<string, unknown>) => {
    setError(null);
    try {
      const res = await fetch("/api/admin/server-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to save setting");
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleAddDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/server-config/router", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Failed to add device");
      }

      setFormData({ macAddress: "", deviceName: "", deviceType: "laptop", notes: "" });
      setShowAddForm(false);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDevice = async (macAddress: string) => {
    if (!confirm("Remove this device from whitelist?")) return;

    try {
      const res = await fetch("/api/admin/server-config/router", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macAddress }),
      });

      if (!res.ok) throw new Error("Failed to remove device");
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleToggleStatus = async (
    macAddress: string,
    currentStatus: string
  ) => {
    const newStatus = currentStatus === "active" ? "blocked" : "active";

    try {
      const res = await fetch("/api/admin/server-config/router", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ macAddress, status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update status");
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Settings */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Router Settings</h2>
        <div className="space-y-4">
          <ToggleSetting
            label="Enable MAC Filtering"
            value={config?.routerEnabled || false}
            onChange={() =>
              patchConfig({ routerEnabled: !config?.routerEnabled })
            }
          />
          <ToggleSetting
            label="Block Unknown Devices"
            value={config?.routerBlockUnknownDevices || false}
            onChange={() =>
              patchConfig({
                routerBlockUnknownDevices: !config?.routerBlockUnknownDevices,
              })
            }
          />
          <ToggleSetting
            label="Blacklist Mode"
            value={config?.routerBlacklistEnabled || false}
            onChange={() =>
              patchConfig({
                routerBlacklistEnabled: !config?.routerBlacklistEnabled,
              })
            }
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-500 rounded-lg p-4">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Add Device Form */}
      {showAddForm && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-neutral-900 border border-neutral-800 rounded-lg p-6"
        >
          <h3 className="text-lg font-bold mb-4">Add Device to Whitelist</h3>
          <form onSubmit={handleAddDevice} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">MAC Address</label>
              <input
                type="text"
                placeholder="00:1A:2B:3C:4D:5E"
                value={formData.macAddress}
                onChange={(e) =>
                  setFormData({ ...formData, macAddress: e.target.value.toUpperCase() })
                }
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Device Name</label>
              <input
                type="text"
                placeholder="e.g., John's Laptop"
                value={formData.deviceName}
                onChange={(e) =>
                  setFormData({ ...formData, deviceName: e.target.value })
                }
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Device Type</label>
              <select
                value={formData.deviceType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    deviceType: e.target.value as any,
                  })
                }
                className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
              >
                <option value="laptop">Laptop</option>
                <option value="tablet">Tablet</option>
                <option value="phone">Phone</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Notes (Optional)</label>
              <textarea
                placeholder="Add notes about this device..."
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
                {loading ? "Adding..." : "Add Device"}
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

      {/* Device List */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Whitelisted Devices ({config?.routerMacWhitelist.length || 0})</h3>
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
            >
              <Plus size={18} />
              Add Device
            </button>
          )}
        </div>

        {config?.routerMacWhitelist.length === 0 ? (
          <p className="text-neutral-400 text-center py-8">No devices whitelisted yet</p>
        ) : (
          <div className="space-y-2">
            {config?.routerMacWhitelist.map((device) => (
              <DeviceRow
                key={device.macAddress}
                device={device}
                onToggleStatus={() =>
                  handleToggleStatus(device.macAddress, device.status)
                }
                onDelete={() => handleDeleteDevice(device.macAddress)}
              />
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function DeviceRow({
  device,
  onToggleStatus,
  onDelete,
}: {
  device: IRouterWhitelistEntry;
  onToggleStatus: () => void;
  onDelete: () => void;
}) {
  const statusColor =
    device.status === "active"
      ? "text-green-500"
      : device.status === "blocked"
      ? "text-red-500"
      : "text-neutral-500";

  const statusIcon =
    device.status === "active" ? (
      <CheckCircle2 size={18} className={statusColor} />
    ) : device.status === "blocked" ? (
      <XCircle size={18} className={statusColor} />
    ) : (
      <AlertCircle size={18} className={statusColor} />
    );

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="bg-neutral-800 border border-neutral-700 rounded-lg p-4 flex items-center justify-between hover:border-neutral-600 transition-colors"
    >
      <div className="flex items-center gap-4 flex-1">
        <div className="flex gap-2 items-center">{statusIcon}</div>
        <div className="flex-1">
          <p className="font-medium">{device.deviceName}</p>
          <p className="text-sm text-neutral-400">{device.macAddress}</p>
          {device.notes && <p className="text-xs text-neutral-500 mt-1">{device.notes}</p>}
        </div>
        <div className="text-right">
          <span className="inline-block px-3 py-1 bg-neutral-700 rounded text-xs font-medium">
            {device.deviceType}
          </span>
        </div>
      </div>

      <div className="flex gap-2 ml-4">
        <button
          onClick={onToggleStatus}
          className="p-2 hover:bg-neutral-700 rounded transition-colors"
          title={device.status === "active" ? "Block device" : "Unblock device"}
        >
          {device.status === "active" ? (
            <XCircle size={18} className="text-red-500 hover:text-red-400" />
          ) : (
            <CheckCircle2 size={18} className="text-green-500 hover:text-green-400" />
          )}
        </button>
        <button
          onClick={onDelete}
          className="p-2 hover:bg-red-900/20 rounded transition-colors"
        >
          <Trash2 size={18} className="text-red-500 hover:text-red-400" />
        </button>
      </div>
    </motion.div>
  );
}

function ToggleSetting({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="font-medium">{label}</label>
      <button
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          value ? "bg-blue-600" : "bg-neutral-700"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
