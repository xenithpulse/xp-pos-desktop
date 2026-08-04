// features/server-management/components/DemoDataManager.tsx
//
// "I have finished trying it out."
//
// A fresh install arrives loaded with a sample menu and floor plan, and an
// admin/admin account, so that somebody who has just plugged the box in can get
// in and use it. This is where both are given up, together and deliberately -
// see app/api/admin/demo-data/route.ts for why they are the same action.

"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Download,
  Eye,
  EyeOff,
  Loader2,
  PartyPopper,
  ShieldAlert,
  Trash2,
} from "lucide-react";

interface DemoStatus {
  demoDataLoaded: boolean;
  demoDataSeeding: boolean;
  usingDefaultPassword: boolean;
  wentLiveAt: string | null;
  counts: { menuItems: number; categories: number; ingredients: number; tables: number };
}

interface RemovalResult {
  removed: { menuItems: number; categories: number; ingredients: number; tables: number; sections: number };
  tablesLeftInPlace: number;
  passwordChanged: boolean;
}

const MIN_PASSWORD = 8;

export default function DemoDataManager() {
  const [status, setStatus] = useState<DemoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [includeIngredients, setIncludeIngredients] = useState(true);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<RemovalResult | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/demo-data", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        setError("Sign in as the owner account to manage sample data.");
        return;
      }
      if (!res.ok) throw new Error("Could not read the setup state");
      setStatus((await res.json()) as DemoStatus);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needsPassword = status?.usingDefaultPassword === true;
  const passwordOk =
    !needsPassword ||
    (password.length >= MIN_PASSWORD && password === confirmPassword);

  const handleLoad = async () => {
    if (working) return;
    setWorking(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/demo-data", { method: "PUT" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not load the sample data.");
        return;
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setWorking(false);
    }
  };

  const handleGoLive = async () => {
    if (!passwordOk || working) return;
    setWorking(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/demo-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPassword: needsPassword ? password : undefined,
          includeIngredients,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not remove the sample data.");
        return;
      }
      setResult(data as RemovalResult);
      setConfirming(false);
      setPassword("");
      setConfirmPassword("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setWorking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-sm text-neutral-400">
        <Loader2 size={16} className="animate-spin" />
        Checking...
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/50 bg-red-900/20 p-4 text-sm text-red-400">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/[0.08] p-5">
          <p className="flex items-center gap-2 font-semibold text-emerald-300">
            <PartyPopper size={18} />
            This POS is now live
          </p>
          <p className="mt-2 text-sm text-neutral-300">
            Removed {result.removed.menuItems} menu items, {result.removed.categories} categories,{" "}
            {result.removed.ingredients} ingredients and {result.removed.tables} tables.
            {result.passwordChanged && " Your new password is in effect."}
          </p>
          {result.tablesLeftInPlace > 0 && (
            <p className="mt-2 text-sm text-amber-300">
              {result.tablesLeftInPlace} sample {result.tablesLeftInPlace === 1 ? "table was" : "tables were"} left in
              place because {result.tablesLeftInPlace === 1 ? "it is" : "they are"} occupied or
              have an open session. Close them and run this again to remove them.
            </p>
          )}
        </div>
      )}

      {/* ── Default password warning ──────────────────────────────────────── */}
      {status?.usingDefaultPassword && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.08] p-5">
          <p className="flex items-center gap-2 font-semibold text-amber-300">
            <ShieldAlert size={18} />
            This POS still uses the default password
          </p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">
            Anyone who can reach this POS on your network can sign in as the owner. That is
            fine while you are trying it out. It is not fine once you are taking real orders.
            Setting a real password is part of finishing setup, below.
          </p>
        </div>
      )}

      {/* ── The main panel ────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6">
        <h2 className="text-xl font-bold">Sample data</h2>

        {status?.demoDataSeeding ? (
          <p className="mt-2 flex items-center gap-2 text-sm text-neutral-400">
            <Loader2 size={14} className="animate-spin" />
            Still loading the sample menu and floor plan...
          </p>
        ) : status?.demoDataLoaded ? (
          <>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              This POS is loaded with a sample menu, ingredients and a floor plan so you can
              try everything without setting it up first. When you are ready to use it for
              real, remove all of it in one go.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Menu items" value={status.counts.menuItems} />
              <Stat label="Categories" value={status.counts.categories} />
              <Stat label="Ingredients" value={status.counts.ingredients} />
              <Stat label="Tables" value={status.counts.tables} />
            </div>

            <p className="mt-4 text-xs leading-relaxed text-neutral-500">
              Only the sample records are removed. Anything you created yourself &mdash; your own
              menu items, your own tables &mdash; is left exactly as it is, and a sample table
              with an open session is kept until that session is closed.
            </p>

            {!confirming ? (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="mt-5 flex items-center gap-2 rounded-lg bg-red-500/90 px-4 py-2.5 text-sm font-semibold text-white
                           transition-colors hover:bg-red-500"
              >
                <Trash2 size={16} />
                Remove sample data and go live
              </button>
            ) : (
              <div className="mt-5 rounded-lg border border-neutral-700 bg-neutral-950 p-5">
                <p className="font-semibold">Finish setting up</p>

                {needsPassword ? (
                  <>
                    <p className="mt-1 text-sm text-neutral-400">
                      Choose a real password for the owner account. You will use this to sign in
                      from now on, so write it down somewhere safe &mdash; nobody can reset it for you.
                    </p>

                    <div className="mt-4 space-y-3">
                      <div className="relative">
                        <input
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="New password"
                          autoComplete="new-password"
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 pr-11 text-sm text-white
                                     outline-none transition focus:border-emerald-500/70"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          tabIndex={-1}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md
                                     text-neutral-500 hover:text-neutral-200"
                        >
                          {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                      </div>

                      <input
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Type it again"
                        autoComplete="new-password"
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2.5 text-sm text-white
                                   outline-none transition focus:border-emerald-500/70"
                      />

                      <ul className="space-y-1.5 pt-0.5">
                        <Requirement
                          ok={password.length >= MIN_PASSWORD}
                          label={`At least ${MIN_PASSWORD} characters`}
                        />
                        <Requirement
                          ok={password.length > 0 && password === confirmPassword}
                          label="Both entries match"
                        />
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-neutral-400">
                    Your password has already been changed. This will just remove the sample data.
                  </p>
                )}

                <label className="mt-4 flex cursor-pointer items-start gap-2.5 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={includeIngredients}
                    onChange={(e) => setIncludeIngredients(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-emerald-500"
                  />
                  <span>
                    Also remove the sample ingredients
                    <span className="block text-xs text-neutral-500">
                      Untick if you have started using them for your own stock tracking.
                    </span>
                  </span>
                </label>

                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={() => void handleGoLive()}
                    disabled={!passwordOk || working}
                    className="flex items-center gap-2 rounded-lg bg-emerald-500/90 px-4 py-2.5 text-sm font-semibold text-black
                               transition-colors hover:bg-emerald-400
                               disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {working ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    {working ? "Working..." : "Confirm"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirming(false);
                      setPassword("");
                      setConfirmPassword("");
                    }}
                    disabled={working}
                    className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm text-neutral-300
                               transition-colors hover:border-neutral-500 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-neutral-400">
              No sample data is loaded. This POS is running on your own menu and floor plan.
              {status?.wentLiveAt && (
                <> Sample data was removed on {new Date(status.wentLiveAt).toLocaleDateString()}.</>
              )}
            </p>
            <p className="mt-3 text-sm leading-relaxed text-neutral-400">
              You can load it to try things out. Nothing you already have is overwritten:
              menu items are matched by name, and a table number that already exists is
              left exactly as it is.
            </p>
            <button
              type="button"
              onClick={() => void handleLoad()}
              disabled={working}
              className="mt-4 flex items-center gap-2 rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-semibold text-neutral-200
                         transition-colors hover:border-emerald-500/60 hover:text-white
                         disabled:cursor-not-allowed disabled:opacity-60"
            >
              {working ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {working ? "Loading..." : "Load sample data"}
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <p className="text-2xl font-bold text-neutral-100">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className={`flex items-center gap-2 text-xs ${ok ? "text-emerald-400" : "text-neutral-500"}`}>
      <span
        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
          ok ? "border-emerald-400/60 bg-emerald-400/15" : "border-neutral-700"
        }`}
      >
        {ok && <Check size={9} strokeWidth={3.5} />}
      </span>
      {label}
    </li>
  );
}
