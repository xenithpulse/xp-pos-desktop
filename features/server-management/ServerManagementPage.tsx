// features/server-management/ServerManagementPage.tsx
//
// The dashboard an owner opens when something needs doing to the appliance
// itself, rather than to the restaurant.
//
// ── WHY A SIDEBAR, AND WHY THE MODE TOGGLE IS GONE ───────────────────────────
// This screen used to have two navigation systems at once: a Simple/Advanced
// toggle, and a row of eleven scrolling tabs inside Advanced. That meant the
// answer to "where is the thing I need" depended on a mode the user had to know
// they were in, and the tab strip - the only route to most of the product - was
// horizontally scrolled on the screen sizes these boxes actually have.
//
// One sidebar replaces both. The grouping does the job the mode toggle was
// trying to do, without asking anyone to choose a mode first: everyday work is
// at the top, the things you touch once a year are under "Advanced", and
// everything is one click away and visible at a glance.
//
// ── WHY THE HASH ─────────────────────────────────────────────────────────────
// The section lives in window.location.hash, which buys three things that
// component state alone does not:
//
//   - Back and Close behave. On a till, "back" is a physical reflex; losing the
//     section on every press made this feel broken.
//   - A section can be linked. Support can say "open /server-management#licence"
//     instead of describing a path through the UI over the phone.
//   - A reload keeps you where you were, which matters on the one screen people
//     reload when something is wrong.
//
// The hash is deliberately NOT read during render. Doing so would produce
// server HTML that disagrees with the client on first paint - see the note on
// the effect below.

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  FlaskConical,
  Gauge,
  HardDrive,
  Home,
  KeyRound,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Smartphone,
  Stethoscope,
  X,
} from "lucide-react";
import { IServerConfig } from "@/models/schemas/server-config.schema";
import BackupManager from "./components/BackupManager";
import SystemHealth from "./components/SystemHealth";
import UpdateManager from "./components/UpdateManager";
import Diagnostics from "./components/Diagnostics";
import LicenseManager from "./components/LicenseManager";
import ConnectDevices from "./components/ConnectDevices";
import DemoDataManager from "./components/DemoDataManager";

// ── Three tabs were removed in Phase 15, and it is worth recording why ───────
//
//   WiFi Router        A MAC "whitelist" that nothing enforced. No code in this
//                      repo has ever talked to a router; the addresses were
//                      written to MongoDB and read back by the same screen. It
//                      presented itself as access control while providing none,
//                      which is worse than not shipping it. Real device access
//                      control is POS_ALLOWED_CIDRS, enforced by Caddy - see
//                      installer/config/Caddyfile.http.
//
//   Network Settings   Rate limit, max connections, session timeout and a
//                      never-wired "DNS integration" field. Duplicated .env and
//                      the Caddyfile, which are what actually take effect.
//
//   Active Connections A per-device session list that cannot be per-device on a
//                      multi-floor site: every device behind an upstairs router
//                      arrives NAT'd as that router's single WAN address, so
//                      the list showed one IP for a whole floor.
//
// The MongoDB fields behind them are deliberately LEFT IN
// models/schemas/server-config.schema.ts. They are inert, they cost nothing, and
// dropping columns from an appliance database that upgrades in place - on sites
// we cannot inspect first - buys tidiness at the price of a migration that can
// fail in a restaurant.

type SectionId =
  | "overview"
  | "connect"
  | "backups"
  | "updates"
  | "licence"
  | "health"
  | "diagnostics"
  | "sample-data";

interface SectionDef {
  id: SectionId;
  label: string;
  /** Shown under the label in the sidebar. One short line, plain language. */
  blurb: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

/**
 * The sidebar, in two groups.
 *
 * EVERYDAY is what an owner opens on purpose. ADVANCED is what they open once,
 * or because support asked them to - it is not hidden, because hiding the
 * licence screen from the person whose trial is expiring is how you generate
 * the support call, but it is visually subordinate so it does not compete.
 */
const EVERYDAY: SectionDef[] = [
  { id: "overview", label: "Overview", blurb: "Status at a glance", icon: LayoutDashboard },
  { id: "connect", label: "Connect Devices", blurb: "QR code and addresses", icon: Smartphone },
  { id: "backups", label: "Backups", blurb: "Your data, kept safe", icon: HardDrive },
  { id: "updates", label: "Updates", blurb: "Install new versions", icon: RefreshCw },
  { id: "licence", label: "Licence", blurb: "Subscription and activation", icon: KeyRound },
];

const ADVANCED: SectionDef[] = [
  { id: "health", label: "System Health", blurb: "Disk, memory, database", icon: Gauge },
  { id: "diagnostics", label: "Diagnostics", blurb: "Services, ports and logs", icon: Stethoscope },
  { id: "sample-data", label: "Sample Data", blurb: "Go live for real", icon: FlaskConical },
];

const ALL_SECTIONS = [...EVERYDAY, ...ADVANCED];
const DEFAULT_SECTION: SectionId = "overview";

function isSectionId(value: string): value is SectionId {
  return ALL_SECTIONS.some((s) => s.id === value);
}

export default function ServerManagementPage() {
  const [section, setSection] = useState<SectionId>(DEFAULT_SECTION);
  const [config, setConfig] = useState<IServerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

  // The hash is read HERE and not during render. Reading window during render
  // makes the server-rendered markup disagree with the first client paint,
  // which React resolves by throwing away the tree - a visible flash on a screen
  // that is often opened in a hurry. Starting from the default and correcting on
  // mount costs one extra paint and is always consistent.
  useEffect(() => {
    const sync = () => {
      const raw = window.location.hash.replace(/^#/, "");
      setSection(isSectionId(raw) ? raw : DEFAULT_SECTION);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Navigation writes the hash and lets the listener above set the state, so
  // there is exactly one path from "a section changed" to "the UI updated" -
  // whether the change came from a click, the back button, or a pasted link.
  const go = useCallback((id: SectionId) => {
    window.location.hash = id;
    setNavOpen(false);
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/server-config");
      if (!res.ok) throw new Error("Failed to fetch config");
      setConfig(await res.json());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
    const interval = setInterval(() => void fetchConfig(), 30000);
    return () => clearInterval(interval);
  }, [fetchConfig]);

  const runBackup = async () => {
    setBackupBusy(true);
    try {
      await fetch("/api/admin/server-config/backups/run", { method: "POST" });
      void fetchConfig();
      setTimeout(() => void fetchConfig(), 8000);
      setTimeout(() => {
        void fetchConfig();
        setBackupBusy(false);
      }, 40000);
    } catch {
      setBackupBusy(false);
    }
  };

  if (loading) return <LoadingSkeleton />;

  const active = ALL_SECTIONS.find((s) => s.id === section) ?? EVERYDAY[0];

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <Sidebar
          section={section}
          onGo={go}
          open={navOpen}
          onClose={() => setNavOpen(false)}
          licenceNeedsAttention={config?.systemStatus !== "healthy"}
        />

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1">
          {/* Mobile bar. The sidebar is off-canvas below lg, so this is the only
              way to reach it there - and on a till in landscape it is the only
              thing between the user and every other section. */}
          <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-neutral-800 bg-black/90 px-4 py-3 backdrop-blur lg:hidden">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              className="rounded-lg border border-neutral-800 p-2 text-neutral-300 transition-colors hover:border-neutral-600 hover:text-white"
              aria-label="Open menu"
            >
              <Menu size={18} />
            </button>
            <span className="text-sm font-semibold">{active.label}</span>
          </div>

          <div className="px-4 py-6 sm:px-8 sm:py-10">
            <header className="mb-6 hidden lg:block">
              <h1 className="text-2xl font-bold">{active.label}</h1>
              <p className="mt-1 text-sm text-neutral-400">{active.blurb}</p>
            </header>

            {error && (
              <div className="mb-6 flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-900/20 p-4 text-sm text-red-300">
                <AlertTriangle size={18} className="shrink-0" />
                {error}
              </div>
            )}

            <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              {section === "overview" && (
                <Overview
                  config={config}
                  onRunBackup={runBackup}
                  backupBusy={backupBusy}
                  onGo={go}
                />
              )}
              {section === "connect" && <ConnectDevices />}
              {section === "backups" && <BackupManager config={config} onUpdate={fetchConfig} />}
              {section === "updates" && <UpdateManager />}
              {section === "licence" && <LicenseManager />}
              {section === "health" && <SystemHealth config={config} onRefresh={fetchConfig} />}
              {section === "diagnostics" && <Diagnostics />}
              {section === "sample-data" && <DemoDataManager />}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({
  section,
  onGo,
  open,
  onClose,
  licenceNeedsAttention,
}: {
  section: SectionId;
  onGo: (id: SectionId) => void;
  open: boolean;
  onClose: () => void;
  licenceNeedsAttention: boolean;
}) {
  return (
    <>
      {/* Scrim, mobile only. */}
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/70 lg:hidden"
        />
      )}

      <nav
        className={`fixed inset-y-0 left-0 z-40 w-72 shrink-0 overflow-y-auto border-r border-neutral-800 bg-neutral-950
                    px-4 py-6 transition-transform duration-200 ease-out
                    lg:sticky lg:top-0 lg:h-screen lg:translate-x-0
                    ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="mb-6 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
              XP POS
            </p>
            <p className="text-lg font-bold leading-tight">Server Management</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-500 hover:text-white lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <SidebarGroup
          items={EVERYDAY}
          section={section}
          onGo={onGo}
          badgeFor={(id) => (id === "licence" && licenceNeedsAttention ? "!" : null)}
        />

        <p className="mb-2 mt-6 px-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-neutral-600">
          Advanced
        </p>
        <SidebarGroup items={ADVANCED} section={section} onGo={onGo} badgeFor={() => null} />

        <Link
          href="/"
          className="mt-6 flex items-center gap-2 rounded-lg border border-neutral-800 px-3 py-2.5 text-sm
                     font-medium text-neutral-400 transition-colors hover:border-neutral-600 hover:text-white"
        >
          <Home size={16} />
          Back to the POS
        </Link>
      </nav>
    </>
  );
}

function SidebarGroup({
  items,
  section,
  onGo,
  badgeFor,
}: {
  items: SectionDef[];
  section: SectionId;
  onGo: (id: SectionId) => void;
  badgeFor: (id: SectionId) => string | null;
}) {
  return (
    <div className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const activeItem = section === item.id;
        const badge = badgeFor(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onGo(item.id)}
            aria-current={activeItem ? "page" : undefined}
            className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
              activeItem
                ? "bg-emerald-500/10 text-white ring-1 ring-emerald-500/30"
                : "text-neutral-400 hover:bg-white/[0.04] hover:text-white"
            }`}
          >
            <Icon
              size={17}
              className={`mt-0.5 shrink-0 ${activeItem ? "text-emerald-400" : "text-neutral-500"}`}
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                {item.label}
                {badge && (
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
                    {badge}
                  </span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-xs text-neutral-500">{item.blurb}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * The landing section.
 *
 * This is the old "Simple" view, promoted to being the front page rather than a
 * mode. Everything on it answers a question an owner actually asks - is it
 * working, where do staff connect, is my data backed up - and every card is a
 * route into the section that can do something about the answer.
 */
function Overview({
  config,
  onRunBackup,
  backupBusy,
  onGo,
}: {
  config: IServerConfig | null;
  onRunBackup: () => void;
  backupBusy: boolean;
  onGo: (id: SectionId) => void;
}) {
  const healthy = config?.systemStatus === "healthy";
  const activeSessions = config?.activeConnections.filter((c) => c.isActive).length || 0;
  const serverUrl = (config as { serverUrl?: string } | null)?.serverUrl;
  const localNameUrl = (config as { localNameUrl?: string } | null)?.localNameUrl;

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
    <div className="space-y-6">
      <LicenceAlert onOpen={() => onGo("licence")} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Tile
          icon={
            healthy ? (
              <CheckCircle2 size={28} className="text-green-500" />
            ) : (
              <AlertTriangle size={28} className="text-yellow-500" />
            )
          }
          value={config?.systemStatus || "unknown"}
          label="System"
          onClick={() => onGo("health")}
        />
        <Tile
          icon={<Activity size={28} className="text-blue-500" />}
          value={String(activeSessions)}
          label="Staff signed in"
        />
        <Tile
          icon={<Database size={28} className={backupColor} />}
          value={backupStatus}
          label="Last backup"
          valueClass={backupColor}
          onClick={() => onGo("backups")}
        />
      </div>

      {/* Two addresses, two audiences. Conflating them is what made this
          confusing before: the name is for this computer and never changes, the
          number is for everyone else and can. */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-lg font-bold">Opening the POS</h2>

        <p className="mt-3 text-sm text-neutral-400">On this computer — always the same:</p>
        <p className="font-mono text-xl text-emerald-400 break-all">
          {localNameUrl || "Detecting…"}
        </p>

        <p className="mt-5 text-sm text-neutral-400">On phones and tablets:</p>
        <p className="font-mono text-lg text-neutral-200 break-all">{serverUrl || "Detecting…"}</p>

        <button
          type="button"
          onClick={() => onGo("connect")}
          className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/90 px-4 py-2.5 text-sm font-semibold
                     text-black transition-colors hover:bg-emerald-400"
        >
          <Smartphone size={15} />
          Show the QR code
        </button>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold">Backup</h2>
            <p className="mt-1 text-sm text-neutral-400">
              {config?.lastBackupAt
                ? `Last run: ${new Date(config.lastBackupAt).toLocaleString()}`
                : "No backup has run yet."}
            </p>
            {config?.backupRunRequestedAt && (
              <p className="mt-1 text-sm text-blue-400">Requested — running on the next check…</p>
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
    </div>
  );
}

function Tile({
  icon,
  value,
  label,
  valueClass = "",
  onClick,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  valueClass?: string;
  onClick?: () => void;
}) {
  const inner = (
    <>
      {icon}
      <div className="min-w-0">
        <p className={`truncate text-2xl font-bold capitalize ${valueClass}`}>{value}</p>
        <p className="text-sm text-neutral-400">{label}</p>
      </div>
    </>
  );

  if (!onClick) {
    return (
      <div className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6">
        {inner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-4 rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-left
                 transition-colors hover:border-neutral-600"
    >
      {inner}
    </button>
  );
}

/**
 * Licence state, on the front page.
 *
 * Renders NOTHING while the POS is quietly licensed - a working appliance
 * should not have a licence widget on its front page. It appears only when
 * there is something the owner has to act on: a trial running down, a grace
 * period, or a POS that has gone read-only.
 */
function LicenceAlert({ onOpen }: { onOpen: () => void }) {
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
        // The licence section reports properly; a fetch failure here means
        // showing nothing, which is the right amount of noise.
      }
    };
    void load();
    const t = setInterval(() => void load(), 60000);
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

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-black">
      <div className="mx-auto flex max-w-[1400px]">
        <div className="hidden w-72 shrink-0 border-r border-neutral-800 p-4 lg:block">
          <div className="mb-6 h-10 animate-pulse rounded bg-neutral-900" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="mb-2 h-12 animate-pulse rounded-lg bg-neutral-900" />
          ))}
        </div>
        <div className="flex-1 p-8">
          <div className="mb-6 h-9 w-64 animate-pulse rounded bg-neutral-900" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-neutral-900" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
