// lib/diagnostics/index.ts
//
// Read-only diagnostics for a client box: what is running, what is listening,
// where the data is, and how big the logs have got.
//
// This is the cheapest thing in Phase 10 and the one that most reduces support
// calls, because it answers over the phone the questions that otherwise need
// someone at the site: are the three services running, is the app on the port
// we think, did the last update do anything, is the disk full.
//
// Everything here is a READ. Nothing in this module starts, stops, configures
// or installs anything — that separation is deliberate, because it is what lets
// the diagnostics endpoint stay on the public dashboard alongside the existing
// health check while the endpoints that can change the box do not.
//
// The listening-ports section exists specifically to make the Phase 10
// acceptance criterion checkable from the dashboard rather than from a
// technician's PowerShell prompt: an update agent must add NO new inbound
// listener, and Caddy must remain the only thing reachable off-box.

import os from "os";
import path from "path";
import { promises as fs } from "fs";
import { runPowerShellJson, asArray } from "@/lib/win/powershell";
import { dataRoot, logsDir, installDir } from "@/lib/updates/paths";
import { getSiteIdentity } from "@/lib/updates/identity";

export const SERVICE_IDS = ["XPPOS-MongoDB", "XPPOS-App", "XPPOS-Caddy"] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

export interface ServiceStatus {
  id: string;
  displayName: string | null;
  status: string;
  /** "Auto (Delayed)" is the one that matters — it is what makes the POS come
   *  back after a power cut with nobody logged in. */
  startType: string;
  delayedAutoStart: boolean;
}

export interface ListeningPort {
  address: string;
  port: number;
  process: string | null;
  /** True when the address is reachable from the LAN rather than loopback. */
  lanFacing: boolean;
}

export interface LogFile {
  name: string;
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface Diagnostics {
  collectedAt: string;
  identity: {
    siteId: string;
    machineId: string | null;
    hostname: string;
    appVersion: string;
  };
  host: {
    platform: string;
    release: string;
    uptimeSeconds: number;
    totalMemoryBytes: number;
    freeMemoryBytes: number;
    cpuCount: number;
  };
  paths: {
    installDir: string;
    dataRoot: string;
    logsDir: string;
    configuredPort: string | null;
  };
  services: ServiceStatus[];
  listeners: ListeningPort[];
  logs: LogFile[];
  /** Populated when a section could not be gathered, rather than failing all. */
  problems: string[];
}

/** Ask Windows about the three POS services. */
async function readServices(problems: string[]): Promise<ServiceStatus[]> {
  const filter = SERVICE_IDS.map((id) => `Name='${id}'`).join(" or ");
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Service -Filter "${filter}" |
  Select-Object @{n='id';e={$_.Name}},
                @{n='displayName';e={$_.DisplayName}},
                @{n='status';e={$_.State}},
                @{n='startType';e={$_.StartMode}},
                @{n='delayedAutoStart';e={[bool]$_.DelayedAutoStart}} |
  ConvertTo-Json -Compress
`.trim();

  const raw = await runPowerShellJson<ServiceStatus | ServiceStatus[]>(script);
  const found = asArray(raw);
  if (found.length === 0 && process.platform === "win32") {
    problems.push("Could not read the Windows service state.");
  }

  // Report every expected service, including ones Windows does not know about:
  // "XPPOS-Caddy is not installed" is a far more useful answer than an absent
  // row that reads as though nothing is wrong.
  return SERVICE_IDS.map((id) => {
    const hit = found.find((s) => s?.id === id);
    if (!hit) {
      return {
        id,
        displayName: null,
        status: "NOT INSTALLED",
        startType: "-",
        delayedAutoStart: false,
      };
    }
    return {
      id,
      displayName: hit.displayName ?? null,
      status: hit.status ?? "Unknown",
      startType: hit.delayedAutoStart ? "Auto (Delayed)" : (hit.startType ?? "Unknown"),
      delayedAutoStart: Boolean(hit.delayedAutoStart),
    };
  });
}

/** What is actually listening, and which of it is reachable off the box. */
async function readListeners(problems: string[]): Promise<ListeningPort[]> {
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
Get-NetTCPConnection -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess |
  ForEach-Object {
    $procName = (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    [pscustomobject]@{
      address = $_.LocalAddress
      port    = [int]$_.LocalPort
      process = $procName
    }
  } | Sort-Object port | ConvertTo-Json -Compress
`.trim();

  const raw = await runPowerShellJson<
    { address?: string; port?: number; process?: string } | Array<{ address?: string; port?: number; process?: string }>
  >(script);
  const rows = asArray(raw);
  if (rows.length === 0 && process.platform === "win32") {
    problems.push("Could not enumerate listening ports.");
    return [];
  }

  // 127.0.0.1 and ::1 are loopback. 0.0.0.0 and :: are wildcard binds, which
  // ARE reachable from the LAN — that is the distinction that matters, and it
  // is the one the app's HOSTNAME=127.0.0.1 setting exists to preserve.
  const loopback = new Set(["127.0.0.1", "::1"]);
  return rows
    .filter((r) => typeof r?.port === "number")
    .map((r) => ({
      address: r.address ?? "?",
      port: r.port as number,
      process: r.process ?? null,
      lanFacing: !loopback.has(r.address ?? ""),
    }));
}

/** List the service logs, newest first. Names and sizes only — not content. */
async function readLogIndex(problems: string[]): Promise<LogFile[]> {
  const root = logsDir();
  const out: LogFile[] = [];

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > 2) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(full, rel, depth + 1);
        continue;
      }
      try {
        const st = await fs.stat(full);
        out.push({
          name: entry.name,
          relativePath: rel,
          sizeBytes: st.size,
          modifiedAt: st.mtime.toISOString(),
        });
      } catch {
        // A log being rotated out from under us is not a diagnostic failure.
      }
    }
  }

  await walk(root, "", 0);
  if (out.length === 0) problems.push(`No log files found under ${root}.`);
  return out.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

/**
 * Read POS_HTTP_PORT out of the live .env.
 *
 * The installed port varies per site — provisioning moves off a busy 8080 and
 * persists the choice — so it is read, never assumed. This is a value the app
 * itself does not otherwise see: the app binds 3000 and Caddy owns the LAN
 * port.
 */
async function readConfiguredPort(): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(dataRoot(), ".env"), "utf8");
    const m = /^\s*POS_HTTP_PORT\s*=\s*(\S+)\s*$/m.exec(raw);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export async function collectDiagnostics(): Promise<Diagnostics> {
  const problems: string[] = [];

  const [identity, services, listeners, logs, configuredPort] = await Promise.all([
    getSiteIdentity(),
    readServices(problems),
    readListeners(problems),
    readLogIndex(problems),
    readConfiguredPort(),
  ]);

  return {
    collectedAt: new Date().toISOString(),
    identity: {
      siteId: identity.siteId,
      machineId: identity.machineId,
      hostname: identity.hostname,
      appVersion: identity.appVersion,
    },
    host: {
      platform: `${os.type()} ${os.arch()}`,
      release: os.release(),
      uptimeSeconds: Math.round(os.uptime()),
      totalMemoryBytes: os.totalmem(),
      freeMemoryBytes: os.freemem(),
      cpuCount: os.cpus().length,
    },
    paths: {
      installDir: installDir(),
      dataRoot: dataRoot(),
      logsDir: logsDir(),
      configuredPort,
    },
    services,
    listeners,
    logs,
    problems,
  };
}

/** Bytes of log returned by a single tail request. */
export const MAX_TAIL_BYTES = 256 * 1024;

/**
 * Read the tail of one log file.
 *
 * `relativePath` comes from the client, so it is resolved and then checked to
 * be inside the logs directory. Rejecting on the resolved path rather than by
 * pattern-matching for ".." is the check that actually holds: on Windows a
 * path can also escape via a drive letter, a UNC prefix or an alternate data
 * stream, and none of those contain "..".
 */
export async function tailLog(
  relativePath: string,
  maxBytes: number = MAX_TAIL_BYTES
): Promise<{ path: string; sizeBytes: number; truncated: boolean; text: string }> {
  const root = path.resolve(logsDir());
  const target = path.resolve(root, relativePath);

  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("That log file is outside the logs directory.");
  }

  const st = await fs.stat(target);
  if (!st.isFile()) throw new Error("That is not a log file.");

  const start = Math.max(0, st.size - maxBytes);
  const handle = await fs.open(target, "r");
  try {
    const length = st.size - start;
    const buf = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buf, 0, length, start);
    return {
      path: rel.replace(/\\/g, "/"),
      sizeBytes: st.size,
      truncated: start > 0,
      text: buf.subarray(0, bytesRead).toString("utf8"),
    };
  } finally {
    await handle.close().catch(() => {});
  }
}
