// lib/updates/agent.ts
//
// The update agent: an outbound-only polling loop that lives inside the app
// process.
//
// Direction of connection is not a style choice. The box sits behind a
// restaurant's NAT with no port forwarding, so nothing can connect INWARD to
// it. It polls out, on a long interval, over HTTPS. There is no new listener,
// nothing binds 0.0.0.0, and the network posture is unchanged: Caddy remains
// the only LAN-facing component.
//
// It runs here rather than in a fourth Windows service for the same reason the
// realtime WebSocket server does — it reuses a process that already exists,
// already has config, and already has a log. The XP Thermal Service polling
// pattern (backup.pollIntervalMs) is the precedent being followed.
//
// Three properties matter more than anything the agent actually does:
//
//   1. It must not block or slow startup. A restaurant coming back from a power
//      cut is waiting on this process; nothing here may be on that path.
//   2. On a box with no internet it must be silent. Most of these boxes have no
//      internet, forever, by design. "No updates available" is the correct and
//      complete behaviour, and a warning banner in a restaurant that will never
//      see the internet is a support call we created ourselves.
//   3. It never installs anything on its own unless explicitly configured to,
//      and even then only inside a maintenance window with no orders open.

import { getUpdateSettings, isUpdateChannelEnabled, type UpdateSettings } from "./config";
import { fetchChannel, ManifestError } from "./manifest";
import { downloadAndVerify, DownloadError, pruneDownloads, verifyExistingPayload } from "./download";
import { inspectSignature } from "./verify";
import { getInstalledVersion } from "./identity";
import { isNewer } from "./version";
import { readState, patchState, type AvailableUpdate, type UpdateState } from "./state";
import { assessReadiness, launchInstall, reconcileInterruptedInstall } from "./install";
import { updatesDir } from "./paths";

/**
 * How long after startup the first check runs.
 *
 * Long enough to be well clear of boot: the services come up on a 30s delayed
 * start, MongoDB recovers its journal, and the first thing staff do is load the
 * POS. Nothing about updates is urgent enough to compete with that.
 */
const FIRST_CHECK_DELAY_MS = 5 * 60 * 1000;

/** Spread checks out so a fleet of sites does not hit the host in lockstep. */
const JITTER_MS = 10 * 60 * 1000;

let started = false;
let checking = false;
let downloading = false;
/** Remembers the last reachability so an offline box logs once, not forever. */
let lastReachable: boolean | null = null;

function log(message: string): void {
  console.log(`[updates] ${message}`);
}

/**
 * Fetch the payload for `candidate`, verify it, and record the result.
 *
 * Split out from checkForUpdate so the dashboard's "check now" button can
 * return as soon as the manifest has been read. A 118 MB download over a
 * restaurant's ADSL line takes minutes, and holding an HTTP request open for
 * that long is a spinner nobody can tell apart from a hung POS.
 *
 * Never throws, and never runs twice at once.
 */
async function downloadPending(
  candidate: AvailableUpdate,
  settings: UpdateSettings
): Promise<UpdateState> {
  if (downloading) return readState();
  downloading = true;
  try {
    let downloadResult;
    try {
      downloadResult = await downloadAndVerify(candidate, settings.maxDownloadBytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const unreachable = err instanceof DownloadError && err.unreachable;
      // A verification failure is reported loudly. That is either a corrupted
      // download or a tampered payload, and both need to be visible.
      log(unreachable ? `download interrupted: ${message}` : `DOWNLOAD REJECTED: ${message}`);
      return await patchState({
        lastCheckOk: false,
        lastCheckError: message,
        reachable: !unreachable,
        downloaded: undefined,
      });
    }

    const signature = await inspectSignature(downloadResult.file, settings.expectedPublisher);
    if (signature && !signature.trusted) {
      log(`WARNING: ${candidate.version} signature is "${signature.status}" and was not trusted`);
    }

    const state = await patchState({
      downloaded: {
        version: candidate.version,
        file: downloadResult.file,
        sha256: downloadResult.sha256,
        sizeBytes: downloadResult.sizeBytes,
        verifiedAt: new Date().toISOString(),
        signature,
      },
    });
    log(`${candidate.version} downloaded and verified - waiting for the site to install it`);
    return state;
  } catch (err) {
    log(`unexpected download error: ${err instanceof Error ? err.message : String(err)}`);
    return readState();
  } finally {
    downloading = false;
  }
}

/**
 * Run one check: fetch the manifest, and if it offers something newer,
 * download, hash-verify and signature-inspect it.
 *
 * Never throws. This runs on a timer inside the POS process; an unhandled
 * rejection here would be an unhandled rejection in the till.
 */
export async function checkForUpdate(options: { manual?: boolean } = {}): Promise<UpdateState> {
  const settings = getUpdateSettings();
  if (!isUpdateChannelEnabled(settings)) return readState();

  if (checking) return readState();
  checking = true;

  try {
    const installed = await getInstalledVersion();
    const now = new Date().toISOString();

    let candidate;
    try {
      candidate = await fetchChannel(settings.manifestUrl, settings.channel, settings.maxDownloadBytes);
    } catch (err) {
      const unreachable = err instanceof ManifestError && err.unreachable;
      const message = err instanceof Error ? err.message : String(err);

      // An offline site is the expected case, not a fault. Log the transition
      // only, so a permanently offline box writes one line ever rather than one
      // every six hours for the life of the install.
      if (!unreachable || lastReachable !== false || options.manual) {
        log(unreachable ? `no internet - update check skipped (${message})` : `check failed: ${message}`);
      }
      lastReachable = !unreachable;

      return await patchState({
        lastCheckAt: now,
        lastCheckOk: false,
        lastCheckError: message,
        reachable: !unreachable,
      });
    }

    lastReachable = true;

    if (!isNewer(candidate.version, installed)) {
      // Up to date. Drop any payload kept from an older offer so a superseded
      // installer cannot sit on disk waiting to be run by mistake.
      await pruneDownloads(updatesDir(), null);
      log(`up to date (installed ${installed}, channel ${settings.channel} offers ${candidate.version})`);
      return await patchState({
        lastCheckAt: now,
        lastCheckOk: true,
        lastCheckError: undefined,
        reachable: true,
        available: undefined,
        downloaded: undefined,
      });
    }

    log(`update available: ${candidate.version} (installed ${installed})`);

    // Already downloaded and still intact? Do not spend a restaurant's ADSL
    // line re-fetching 118 MB on every check.
    const existing = (await readState()).downloaded;
    if (
      existing?.version === candidate.version &&
      existing.sha256 === candidate.sha256 &&
      (await verifyExistingPayload(existing.file, existing.sha256))
    ) {
      return await patchState({
        lastCheckAt: now,
        lastCheckOk: true,
        lastCheckError: undefined,
        reachable: true,
        available: candidate,
      });
    }

    const pending = await patchState({
      lastCheckAt: now,
      lastCheckOk: true,
      lastCheckError: undefined,
      reachable: true,
      available: candidate,
      downloaded: undefined,
    });

    // A manual check returns as soon as the manifest has been read and lets the
    // download continue behind it. Someone pressed a button in the dashboard;
    // holding that request open for the minutes a 118 MB download takes over a
    // restaurant's line looks exactly like a hung POS.
    if (options.manual) {
      void downloadPending(candidate, settings);
      return pending;
    }

    return await downloadPending(candidate, settings);
  } catch (err) {
    // Belt and braces: this function is called from a timer.
    log(`unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    return readState();
  } finally {
    checking = false;
  }
}

/**
 * One agent tick: check, then install if the site has opted into unattended
 * updates AND every gate agrees.
 */
async function tick(): Promise<void> {
  const settings = getUpdateSettings();
  const state = await checkForUpdate();

  if (!settings.autoInstall || !state.downloaded) return;

  const readiness = await assessReadiness(state.downloaded, true, settings);
  if (!readiness.ready) {
    // Not a failure. "Orders are open" and "it is 3pm" are the normal answers.
    return;
  }
  for (const warning of readiness.warnings) log(`WARNING: ${warning}`);

  log(`installing ${state.downloaded.version} unattended - the POS will restart`);
  try {
    await launchInstall(state.downloaded);
  } catch (err) {
    log(`could not start the installer: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Start the agent. Safe to call more than once; only the first call does
 * anything.
 *
 * Returns immediately. Everything real happens on a timer minutes later, and
 * the timer is unref'd so it can never hold the process open.
 */
export function startUpdateAgent(): void {
  if (started) return;
  started = true;

  const settings = getUpdateSettings();

  // Reconciling an interrupted install matters even with the channel switched
  // off: a site can be updated by hand, and a power cut during THAT should
  // still be reported rather than leaving a marker on disk forever.
  void getInstalledVersion()
    .then((v) => reconcileInterruptedInstall(v))
    .catch(() => {});

  if (!isUpdateChannelEnabled(settings)) {
    // Silent. No POS_UPDATE_URL means the site does not use this, which is the
    // default and the common case.
    return;
  }

  const intervalMs = settings.checkIntervalHours * 60 * 60 * 1000;
  const firstDelay = FIRST_CHECK_DELAY_MS + Math.floor(Math.random() * JITTER_MS);

  log(
    `channel "${settings.channel}" enabled, checking every ${settings.checkIntervalHours}h ` +
      `(auto-install ${settings.autoInstall ? "ON" : "off - the site chooses when"})`
  );

  const first = setTimeout(() => {
    void tick();
    const repeating = setInterval(() => void tick(), intervalMs);
    repeating.unref?.();
  }, firstDelay);
  first.unref?.();
}
