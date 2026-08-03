// lib/licensing/trial.ts
//
// When did this installation's trial start, and what time is it really?
//
// ── Two attacks, one honest failure ─────────────────────────────────────────
//
// Deleting ProgramData to reset the trial is the first thing anybody tries, so
// the start date is cross-checked against three independent places and the
// OLDEST wins:
//
//   1. license-state.json in the data root  - deleted by "reinstall clean"
//   2. HKLM\SOFTWARE\XenithPulse\XP POS     - survives that, and survives an
//                                             uninstall (see registry.ts)
//   3. the first admin account's createdAt  - survives both, and cannot be
//                                             removed without destroying the
//                                             restaurant's own data
//
// Whichever source is missing gets written back, so the answer converges rather
// than degrading.
//
// Setting the clock back is the second thing anybody tries, so the highest
// timestamp ever seen is persisted and time is never counted backwards.
//
// And then there is the honest failure that must NOT be mistaken for either: an
// appliance with a dead CMOS battery, on a LAN with no NTP, genuinely boots
// thinking it is 1980. That box gets a warning and keeps working - trial days
// simply stop advancing until the clock is right. A POS that bricks itself
// because its battery died would be a worse bug than anything licensing
// prevents.

import { readRegistryValue, writeRegistryValue } from "./registry";
import { patchLicenseState, type LicenseState } from "./store";

export const TRIAL_DAYS = 30;
export const TRIAL_WARN_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/**
 * How far the clock may fall behind the high-water mark before it is called
 * out. Below this it is timezone noise, an NTP correction or a VM resuming, and
 * saying anything about it would just alarm a restaurant for nothing.
 */
const CLOCK_BACKWARDS_TOLERANCE_MS = 2 * MS_PER_DAY;

/** Don't rewrite the high-water mark for every request. */
const HIGH_WATER_FILE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const HIGH_WATER_REGISTRY_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12 hours

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  // A timestamp before the product existed is corruption, not history.
  if (t < Date.UTC(2020, 0, 1)) return null;
  return new Date(t);
}

export interface TimeBasis {
  /** What the box's clock says. */
  now: Date;
  /** The highest time ever observed here. Never decreases. */
  highWaterAt: Date;
  /**
   * The time licensing actually counts with: max(now, highWaterAt).
   *
   * This is the whole clock-rollback defence, in one line. Winding the clock
   * back does not extend anything; it freezes the count where it was.
   */
  effectiveNow: Date;
  /** Set when the clock is behind the high-water mark by more than a nudge. */
  clockWarning: string | null;
}

/**
 * Resolve the time basis and advance the high-water mark.
 *
 * Writes are throttled: the mark is persisted at most hourly to the state file
 * and twice a day to the registry. Every request path calls this (behind the
 * status cache), and an appliance's system disk is not something to write to on
 * every till operation.
 */
export async function resolveTimeBasis(state: LicenseState): Promise<TimeBasis> {
  const now = new Date();
  const stored = parseDate(state.highWaterAt);
  const registryStored = parseDate(await readRegistryValue("HighWaterAt"));

  // The highest of everything we know about, including the current clock.
  let highWater = now;
  for (const candidate of [stored, registryStored]) {
    if (candidate && candidate.getTime() > highWater.getTime()) highWater = candidate;
  }

  const behindBy = highWater.getTime() - now.getTime();
  let clockWarning: string | null = null;
  if (behindBy > CLOCK_BACKWARDS_TOLERANCE_MS) {
    const days = Math.round(behindBy / MS_PER_DAY);
    clockWarning =
      `This box's clock reads ${now.toLocaleString()}, which is ${days} day(s) earlier ` +
      `than a time it has already run at. Check the date and time, and the CMOS ` +
      `battery. The POS is working normally; licence and trial dates are being ` +
      `counted from the later time.`;
  }

  const persist: Partial<LicenseState> = {};
  if (!stored || highWater.getTime() - stored.getTime() >= HIGH_WATER_FILE_INTERVAL_MS) {
    persist.highWaterAt = highWater.toISOString();
  }
  if (Object.keys(persist).length > 0) {
    await patchLicenseState(persist).catch(() => {
      // A read-only or missing data root. The registry and the database still
      // carry the trial; nothing here is worth failing a request over.
    });
  }
  if (
    !registryStored ||
    highWater.getTime() - registryStored.getTime() >= HIGH_WATER_REGISTRY_INTERVAL_MS
  ) {
    await writeRegistryValue("HighWaterAt", highWater.toISOString()).catch(() => false);
  }

  return { now, highWaterAt: highWater, effectiveNow: highWater, clockWarning };
}

/**
 * The earliest record in the database.
 *
 * The first admin account is created during setup, before the restaurant has
 * done anything, so its createdAt is effectively the install date - and unlike
 * a file or a registry key, it cannot be removed to reset the trial without
 * also removing the ability to log in.
 *
 * Imported lazily, exactly as lib/updates/service-state.ts does and for the
 * same reason: lib/mongoose throws on import when MONGODB_URI is missing, and
 * this module is reachable from startup. A misconfigured site must come up and
 * say what is wrong, not refuse to boot.
 */
async function readFirstAdminCreatedAt(): Promise<Date | null> {
  try {
    const [{ mongooseConnect }, { AdminModel }] = await Promise.all([
      import("@/lib/mongoose"),
      import("@/models/factories/Admin"),
    ]);
    const conn = await mongooseConnect();
    const Admin = AdminModel(conn);
    const first = await Admin.findOne({}, { createdAt: 1 })
      .sort({ createdAt: 1 })
      .lean<{ createdAt?: Date } | null>();
    const created = first?.createdAt;
    return created ? parseDate(new Date(created).toISOString()) : null;
  } catch {
    // The database is not up yet, or this box has no admin account. Neither is
    // an error here - the other two sources answer.
    return null;
  }
}

export type TrialSource = "state file" | "registry" | "database" | "first run";

export interface TrialBasis {
  startedAt: Date;
  source: TrialSource;
  daysUsed: number;
  daysRemaining: number;
  expired: boolean;
}

/**
 * Resolve the trial start, taking the OLDEST of the three sources, and write it
 * back to any source that disagrees or is missing.
 *
 * The write-back is what makes deleting one source pointless: delete
 * license-state.json and the registry restores it; clear the registry and the
 * state file restores it; do both and the database's first admin restores it.
 */
export async function resolveTrial(state: LicenseState, basis: TimeBasis): Promise<TrialBasis> {
  const fromFile = parseDate(state.trialStartedAt);
  const fromRegistry = parseDate(await readRegistryValue("TrialStartedAt"));
  const fromDatabase = await readFirstAdminCreatedAt();

  const candidates: Array<[Date, TrialSource]> = [];
  if (fromFile) candidates.push([fromFile, "state file"]);
  if (fromRegistry) candidates.push([fromRegistry, "registry"]);
  if (fromDatabase) candidates.push([fromDatabase, "database"]);

  let startedAt: Date;
  let source: TrialSource;
  if (candidates.length === 0) {
    // Genuinely first run. Use the effective time, not the raw clock: a box
    // whose clock is set far into the future must not be able to claim a trial
    // that started in 2099 and therefore never ends.
    startedAt = basis.effectiveNow;
    source = "first run";
  } else {
    candidates.sort((a, b) => a[0].getTime() - b[0].getTime());
    [startedAt, source] = candidates[0];
  }

  // A start date in the future is a clock that was wrong when it was written.
  // Clamp rather than discard: discarding it would restart the trial.
  if (startedAt.getTime() > basis.effectiveNow.getTime()) {
    startedAt = basis.effectiveNow;
  }

  const iso = startedAt.toISOString();
  if (state.trialStartedAt !== iso) {
    await patchLicenseState({ trialStartedAt: iso }).catch(() => {});
  }
  if (!fromRegistry || fromRegistry.getTime() !== startedAt.getTime()) {
    await writeRegistryValue("TrialStartedAt", iso).catch(() => false);
  }

  const daysUsed = Math.floor((basis.effectiveNow.getTime() - startedAt.getTime()) / MS_PER_DAY);
  const daysRemaining = TRIAL_DAYS - daysUsed;

  return {
    startedAt,
    source,
    daysUsed,
    daysRemaining,
    expired: daysRemaining <= 0,
  };
}
