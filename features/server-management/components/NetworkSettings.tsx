// features/server-management/components/NetworkSettings.tsx

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { IServerConfig } from "@/models/schemas/server-config.schema";

export default function NetworkSettings({
  config,
  onUpdate,
}: {
  config: IServerConfig | null;
  onUpdate: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [newNetwork, setNewNetwork] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [dnsProvider, setDnsProvider] = useState(
    config?.integrations?.dnsProvider || "cloudflare"
  );
  const [values, setValues] = useState<Record<string, any>>({
    maxConcurrentConnections: config?.maxConcurrentConnections || 100,
    sessionTimeoutMinutes: config?.sessionTimeoutMinutes || 480,
    rateLimitPerMinute: config?.rateLimitPerMinute || 60,
  });

  // Persist an arbitrary partial config change, then refresh.
  const patchConfig = async (patch: Record<string, unknown>) => {
    setError(null);
    try {
      const res = await fetch("/api/admin/server-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleSaveSettings = async () => {
    await patchConfig(values);
    setEditingField(null);
  };

  const handleAddNetwork = async () => {
    const cidr = newNetwork.trim();
    if (!cidr) return;
    const next = [...(config?.allowedNetworks ?? []), cidr];
    await patchConfig({ allowedNetworks: next });
    setNewNetwork("");
  };

  const handleDeleteNetwork = async (cidr: string) => {
    const next = (config?.allowedNetworks ?? []).filter((n) => n !== cidr);
    await patchConfig({ allowedNetworks: next });
  };

  const handleSaveIntegration = async () => {
    const integrations: Record<string, unknown> = { dnsProvider };
    if (apiToken.trim()) integrations.cloudflareToken = apiToken.trim();
    await patchConfig({ integrations });
    setApiToken("");
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

      {/* Connection Settings */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Connection Settings</h2>
        <div className="space-y-4">
          <SettingField
            label="Max Concurrent Connections"
            value={values.maxConcurrentConnections}
            type="number"
            onChange={(val) =>
              setValues({ ...values, maxConcurrentConnections: parseInt(val) })
            }
            onSave={handleSaveSettings}
            isEditing={editingField === "maxConcurrentConnections"}
            setEditing={() =>
              setEditingField(
                editingField === "maxConcurrentConnections"
                  ? null
                  : "maxConcurrentConnections"
              )
            }
          />

          <SettingField
            label="Session Timeout (minutes)"
            value={values.sessionTimeoutMinutes}
            type="number"
            onChange={(val) =>
              setValues({ ...values, sessionTimeoutMinutes: parseInt(val) })
            }
            onSave={handleSaveSettings}
            isEditing={editingField === "sessionTimeoutMinutes"}
            setEditing={() =>
              setEditingField(
                editingField === "sessionTimeoutMinutes"
                  ? null
                  : "sessionTimeoutMinutes"
              )
            }
          />

          <SettingField
            label="Rate Limit (requests/minute)"
            value={values.rateLimitPerMinute}
            type="number"
            onChange={(val) =>
              setValues({ ...values, rateLimitPerMinute: parseInt(val) })
            }
            onSave={handleSaveSettings}
            isEditing={editingField === "rateLimitPerMinute"}
            setEditing={() =>
              setEditingField(
                editingField === "rateLimitPerMinute" ? null : "rateLimitPerMinute"
              )
            }
          />
        </div>
      </div>

      {/* Allowed Networks */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Allowed Networks (CIDR)</h2>
        <p className="text-neutral-400 text-sm mb-4">
          Which device network ranges may reach the POS. Enforced at the proxy
          (vendor-agnostic — no router needed). To apply a change, set{" "}
          <span className="font-mono text-neutral-300">POS_ALLOWED_CIDRS</span> in{" "}
          <span className="font-mono text-neutral-300">.env</span> to match, then run{" "}
          <span className="font-mono text-neutral-300">docker compose up -d caddy</span>.
          Leave empty to allow all LAN devices.
        </p>
        <div className="space-y-2">
          {config?.allowedNetworks && config.allowedNetworks.length > 0 ? (
            config.allowedNetworks.map((network, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-neutral-800 border border-neutral-700 rounded-lg p-3 flex items-center justify-between"
              >
                <span className="font-mono text-sm">{network}</span>
                <button
                  onClick={() => handleDeleteNetwork(network)}
                  className="p-1 hover:bg-red-900/20 rounded transition-colors"
                >
                  <Trash2 size={16} className="text-red-500" />
                </button>
              </motion.div>
            ))
          ) : (
            <p className="text-neutral-400 text-center py-4">No restrictions active</p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={newNetwork}
            onChange={(e) => setNewNetwork(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAddNetwork();
            }}
            placeholder="e.g., 192.168.1.0/24"
            className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleAddNetwork}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
          >
            <Plus size={18} />
            Add
          </button>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Security</h2>
        <div className="space-y-4">
          <ToggleSetting
            label="Require HTTPS"
            value={config?.requireHttps || false}
            onChange={() => patchConfig({ requireHttps: !config?.requireHttps })}
          />
          <ToggleSetting
            label="Enable Rate Limiting"
            value={config?.enableRateLimiting || false}
            onChange={() =>
              patchConfig({ enableRateLimiting: !config?.enableRateLimiting })
            }
          />
          <ToggleSetting
            label="Enable Audit Logging"
            value={config?.enableAuditLog || false}
            onChange={() =>
              patchConfig({ enableAuditLog: !config?.enableAuditLog })
            }
          />
        </div>
      </div>

      {/* DNS & Integration Settings */}
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">Integrations</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">DNS Provider</label>
            <select
              value={dnsProvider}
              onChange={(e) => setDnsProvider(e.target.value)}
              className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
            >
              <option value="cloudflare">Cloudflare</option>
              <option value="route53">AWS Route 53</option>
              <option value="digitalocean">DigitalOcean</option>
              <option value="namecheap">Namecheap</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">API Token</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                className="flex-1 bg-neutral-800 border border-neutral-700 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                placeholder={
                  config?.integrations?.cloudflareToken
                    ? "•••••••• (saved — enter to replace)"
                    : "Enter API token"
                }
              />
              <button
                onClick={handleSaveIntegration}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors"
              >
                Update
              </button>
            </div>
            <p className="text-xs text-neutral-400 mt-2">
              Required for HTTPS with custom domain
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function SettingField({
  label,
  value,
  type,
  onChange,
  onSave,
  isEditing,
  setEditing,
}: {
  label: string;
  value: any;
  type: string;
  onChange: (val: string) => void;
  onSave: () => void;
  isEditing: boolean;
  setEditing: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-neutral-800 border border-neutral-700 rounded-lg p-4">
      <div className="flex-1">
        <p className="text-neutral-400 text-sm">{label}</p>
        {isEditing ? (
          <div className="flex gap-2 mt-2">
            <input
              type={type}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="flex-1 bg-neutral-700 border border-neutral-600 rounded px-3 py-1 text-white focus:outline-none focus:border-blue-500"
              autoFocus
            />
            <button
              onClick={onSave}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-medium transition-colors"
            >
              Save
            </button>
            <button
              onClick={setEditing}
              className="px-3 py-1 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 mt-2">
            <p className="text-lg font-bold">{value}</p>
            <button
              onClick={setEditing}
              className="text-blue-500 hover:text-blue-400 text-sm font-medium"
            >
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
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
    <div className="flex items-center justify-between bg-neutral-800 border border-neutral-700 rounded-lg p-4">
      <p className="font-medium">{label}</p>
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
