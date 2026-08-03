// lib/updates/install.ts
//
// Deciding whether an update may be installed, and starting it.
//
// The install itself is NOT reimplemented here. Re-running the installer is the
// supported upgrade path and it already handles the hard part correctly:
// PrepareToInstall stops the three services before any file is replaced and
// ABORTS with an actionable message if they will not stop, program files are
// replaced wholesale, C:\ProgramData\XP POS is never touched, and provisioning
// re-runs afterwards. Anything in this file that started stopping services or
// replacing binaries itself would be a worse copy of code that already works.
//
// So this module does two things: gate, and launch.
//
// The launch is deliberately indirect. The installer's first act is to stop
// XPPOS-App, which kills this process — so it cannot be awaited, its exit code
// cannot be read here, and any cleanup written after the spawn would never run.
// scripts\apply-update.ps1 owns the part that has to outlive us: it re-verifies
// the payload, runs the installer, and puts the services back if the install
// fails so the box keeps serving the PREVIOUS version rather than nothing.

import { promises as fs } from "fs";
import { spawn } from "child_process";
import path from "path";
import { dataRoot, installDir, installMarkerPath, installResultPath, ensureUpdatesDir } from "./paths";
import { getUpdateSettings, isWithinWindow, formatWindow, type UpdateSettings } from "./config";
import { readState, patchState, type DownloadedUpdate, type UpdateState } from "./state";
import { verifyExistingPayload } from "./download";
import { describeSignature } from "./verify";
import { getServiceActivity } from "./service-state";

/**
 * An install that has been "in progress" for longer than this did not finish.
 * The installer is a ~118 MB self-extractor that also stops services, runs
 * provisioning and waits up to five minutes for the POS to answer; 45 minutes
 * is generous enough that a slow box is never declared broken.
 */
const MARKER_STALE_MS = 45 * 60 * 1000;

export interface InstallMarker {
  version: string;
  startedAt: string;
  file: string;
}

/** What scripts\apply-update.ps1 leaves behind when the installer returns. */
interface InstallResultFile {
  version?: string;
  startedAt?: string;
  finishedAt?: string;
  outcome?: string;
  exitCode?: number;
  detail?: string;
}

export interface Readiness {
  ready: boolean;
  /** Reasons an install must not start. Shown to the operator verbatim. */
  blockers: string[];
  /** Things worth saying that do not prevent an install. */
  warnings: string[];
}

async function readMarker(): Promise<InstallMarker | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(installMarkerPath(), "utf8")) as InstallMarker;
    return typeof parsed?.version === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** True when a marker exists and is recent enough to mean "running now". */
export async function isInstallRunning(): Promise<boolean> {
  const marker = await readMarker();
  if (!marker) return false;
  const age = Date.now() - Date.parse(marker.startedAt);
  return Number.isFinite(age) && age < MARKER_STALE_MS;
}

/**
 * Work out how the last install ended, and record it.
 *
 * Called once at startup. There are three ways an install can end and the box
 * has to be able to tell them apart, because they need different things said to
 * the restaurant:
 *
 *   The installer ran and reported an exit code. apply-update.ps1 wrote
 *   install-result.json before this process existed. That file is authoritative
 *   — it is the only place the exit code survives, since our own installer
 *   killed the process that launched it.
 *
 *   No result file, but the running version is now the one being installed. The
 *   install worked; we were simply killed before anything could be written.
 *
 *   No result file and the version has not moved. The update was interrupted —
 *   a power cut mid-install is exactly this. The box is on its previous,
 *   working version, which is the right place to be, and the dashboard says so
 *   rather than leaving a marker on disk forever.
 */
export async function reconcileInterruptedInstall(installedVersion: string): Promise<void> {
  const result = await readInstallResult();
  if (result) {
    const succeeded = result.outcome === "success";
    await patchState({
      lastInstall: {
        version: result.version ?? installedVersion,
        startedAt: result.startedAt ?? new Date().toISOString(),
        finishedAt: result.finishedAt ?? new Date().toISOString(),
        outcome: succeeded ? "success" : "failed",
        detail: result.detail,
      },
      ...(succeeded ? { available: undefined, downloaded: undefined } : {}),
    });
    await fs.rm(installResultPath(), { force: true }).catch(() => {});
    await fs.rm(installMarkerPath(), { force: true }).catch(() => {});
    return;
  }

  const marker = await readMarker();
  if (!marker) return;

  const age = Date.now() - Date.parse(marker.startedAt);
  if (Number.isFinite(age) && age < MARKER_STALE_MS && marker.version !== installedVersion) {
    // Too recent to judge: an install may genuinely still be running.
    return;
  }

  const succeeded = marker.version === installedVersion;
  await patchState({
    lastInstall: {
      version: marker.version,
      startedAt: marker.startedAt,
      finishedAt: new Date().toISOString(),
      outcome: succeeded ? "success" : "interrupted",
      detail: succeeded
        ? undefined
        : `The POS restarted still running ${installedVersion}. The update did not complete ` +
          `and nothing was lost - this box is on its previous, working version. ` +
          `Re-run the update, or run the downloaded installer by hand.`,
    },
    ...(succeeded ? { available: undefined, downloaded: undefined } : {}),
  });
  await fs.rm(installMarkerPath(), { force: true }).catch(() => {});
}

async function readInstallResult(): Promise<InstallResultFile | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(installResultPath(), "utf8")) as InstallResultFile;
    return typeof parsed?.outcome === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Can this box install `downloaded` right now?
 *
 * `automatic` tightens the rules: an unattended install additionally requires
 * the configured maintenance window. An operator pressing the button in the
 * dashboard has chosen their moment and does not.
 */
export async function assessReadiness(
  downloaded: DownloadedUpdate | undefined,
  automatic: boolean,
  settings: UpdateSettings = getUpdateSettings(),
  /**
   * Re-hash the payload before judging it.
   *
   * ON for anything that leads to an install. OFF for the dashboard's status
   * poll, which runs every 30 seconds — hashing a 118 MB installer that often
   * would burn a client box's disk for a display value. Nothing skips it on the
   * path that actually runs the file: the install route re-assesses with it on,
   * and apply-update.ps1 hashes it a third time before executing anything.
   */
  rehashPayload = true
): Promise<Readiness> {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!downloaded) {
    blockers.push("No verified update has been downloaded.");
    return { ready: false, blockers, warnings };
  }

  if (await isInstallRunning()) {
    blockers.push("An update is already being installed.");
    return { ready: false, blockers, warnings };
  }

  // The payload has been on disk since it was verified, possibly for days.
  // Re-hashing is cheap next to running the wrong file as Administrator.
  if (rehashPayload && !(await verifyExistingPayload(downloaded.file, downloaded.sha256))) {
    blockers.push(
      "The downloaded installer no longer matches its verified checksum. " +
        "It will be downloaded again on the next check."
    );
    return { ready: false, blockers, warnings };
  }

  const sig = downloaded.signature;
  if (!sig?.trusted) {
    const reason = describeSignature(sig ?? null, settings.expectedPublisher);
    if (settings.allowUnsigned) {
      warnings.push(
        `SIGNATURE NOT VERIFIED: ${reason} Installing anyway because ` +
          `POS_UPDATE_ALLOW_UNSIGNED is true. Turn this off once the code-signing ` +
          `certificate is in use.`
      );
    } else {
      blockers.push(
        `The installer's signature could not be trusted. ${reason} ` +
          `Refusing to run it as Administrator.`
      );
    }
  }

  // Database unreachable is NOT evidence the restaurant is closed.
  try {
    const activity = await getServiceActivity();
    if (!activity.idle) {
      const parts: string[] = [];
      if (activity.openOrders > 0) parts.push(`${activity.openOrders} open order(s)`);
      if (activity.activeDrafts > 0) parts.push(`${activity.activeDrafts} draft(s) in progress`);
      blockers.push(`The restaurant is mid-service: ${parts.join(" and ")}.`);
    }
    if (activity.staleDrafts > 0) {
      warnings.push(
        `${activity.staleDrafts} abandoned draft order(s) ignored (older than 30 minutes).`
      );
    }
  } catch (err) {
    blockers.push(
      `Could not check for open orders (${err instanceof Error ? err.message : String(err)}). ` +
        `Not restarting the POS without knowing.`
    );
  }

  if (automatic && !isWithinWindow(settings.window)) {
    blockers.push(
      `Outside the maintenance window (${formatWindow(settings.window)}). ` +
        `An unattended update only starts inside it.`
    );
  }

  return { ready: blockers.length === 0, blockers, warnings };
}

/**
 * Start the installer.
 *
 * Returns once the launcher has been spawned, NOT once the install is done —
 * there is no "done" this process will live to see. The caller should answer
 * the HTTP request immediately; the POS will stop responding within seconds and
 * come back on the new version.
 */
export async function launchInstall(downloaded: DownloadedUpdate): Promise<void> {
  await ensureUpdatesDir();

  const script = path.join(installDir(), "scripts", "apply-update.ps1");
  if (!(await fs.stat(script).catch(() => null))) {
    throw new Error(
      `The update script is missing: ${script}. ` +
        `Reinstall the POS, or run the downloaded installer by hand.`
    );
  }

  const marker: InstallMarker = {
    version: downloaded.version,
    startedAt: new Date().toISOString(),
    file: downloaded.file,
  };
  // Written BEFORE the spawn. If the box loses power one second later, the
  // marker is what tells the next boot that an update was interrupted.
  await fs.writeFile(installMarkerPath(), JSON.stringify(marker, null, 2), "utf8");

  await patchState({
    lastInstall: {
      version: downloaded.version,
      startedAt: marker.startedAt,
      outcome: "started",
    },
  });

  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const powershell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe"
  );

  // detached + ignored stdio + unref is what lets the launcher outlive this
  // process. Without it the installer's very first action - stopping
  // XPPOS-App - would kill the thing running the installer.
  const child = spawn(
    powershell,
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-Installer",
      downloaded.file,
      "-ExpectedSha256",
      downloaded.sha256,
      "-Version",
      downloaded.version,
      // Passed explicitly rather than recomputed in PowerShell: POS_DATA_DIR
      // can move the data root, and the script must write its result exactly
      // where this process will look for it on the next startup.
      "-DataRoot",
      dataRoot(),
      "-InstallDir",
      installDir(),
    ],
    { detached: true, stdio: "ignore", windowsHide: true }
  );
  child.unref();
}

/**
 * Current state plus a readiness assessment, for the dashboard.
 *
 * Display only, so the payload re-hash is skipped — see assessReadiness. The
 * install route re-assesses with the full check before anything runs.
 */
export async function getInstallStatus(): Promise<{
  state: UpdateState;
  readiness: Readiness;
  installRunning: boolean;
}> {
  const state = await readState();
  const [readiness, installRunning] = await Promise.all([
    assessReadiness(state.downloaded, false, getUpdateSettings(), false),
    isInstallRunning(),
  ]);
  return { state, readiness, installRunning };
}
