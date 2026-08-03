// lib/licensing/status.ts
//
// The one place that decides what this installation is entitled to.
//
// ── The ranking that shaped this file ───────────────────────────────────────
//
// From the phase brief, worst outcome first:
//
//   1. A paying customer locked out mid-service. Unacceptable.
//   2. A hardware change invalidating a valid licence.
//   3. A clock rollback granting an unlimited trial.
//   4. A licence file copied to a second box.
//
// Every ambiguous case in here therefore resolves TOWARDS the customer keeping
// their POS. A fingerprint that cannot be read, a database that is down, a
// state file that will not write - none of them restrict anything. The only
// paths that restrict are the two unambiguous ones: a trial that has run its 30
// days, and a licence that stopped validating more than 14 days ago on a box
// that had a working one.
//
// ── Where this is enforced ──────────────────────────────────────────────────
//
// Server side, in this process. Nothing in the browser bundle decides anything
// - a check in React is deleted with DevTools in about a minute. The UI reads
// the same status only to say the right thing to the restaurant.

import {
  PERPETUAL_DAY,
  formatSerial,
  fromDayNumber,
  toDayNumber,
  verifyLicenseKey,
  type Edition,
} from "./format";
import { compareBinding, getFingerprint } from "./fingerprint";
import { patchLicenseState, readLicenseFile, readLicenseState } from "./store";
import { writeRegistryValue } from "./registry";
import { resolveTimeBasis, resolveTrial, TRIAL_DAYS, TRIAL_WARN_DAYS } from "./trial";

/**
 * How long a box that WAS licensed keeps working after its licence stops
 * validating.
 *
 * This window exists because of failure mode 1. If validation has a bug - and
 * the first release of any licensing code has a bug - it surfaces as a paying
 * customer being restricted. Fourteen days turns that from an emergency into a
 * support ticket, and it is long enough to ship a fix through the Phase 10
 * update channel and have somebody install it.
 */
export const GRACE_DAYS = 14;

const MS_PER_DAY = 86_400_000;

/** Re-resolving costs a PowerShell round trip; a till must not pay that often. */
const CACHE_TTL_MS = 5 * 60 * 1000;

export type LicenseStateName = "licensed" | "trial" | "grace" | "trial_expired" | "unlicensed";

export interface LicenseStatus {
  schema: 1;
  state: LicenseStateName;
  /** True when the POS must refuse new business operations. */
  restricted: boolean;
  /** True when the restaurant should be told something, calmly or loudly. */
  warn: boolean;

  /** Days left in whatever is currently keeping this box working. */
  daysRemaining: number | null;
  /** Licence expiry, ISO date, null when perpetual or unlicensed. */
  expiresAt: string | null;
  perpetual: boolean;

  serial: string | null;
  edition: Edition | null;
  issuedTo: string | null;

  /** Shown on the dashboard so it can be read to XenithPulse. */
  machineCode: string;
  signalsAvailable: number;
  signalsMatched: number | null;
  signalsRequired: number | null;

  trialStartedAt: string | null;
  trialSource: string;
  graceEndsAt: string | null;

  clockWarning: string | null;

  /** One line, safe to put in a banner. */
  headline: string;
  /** A paragraph, for the dashboard and for a support call. */
  detail: string;
  /** Present when a licence exists but was not accepted. */
  rejection: string | null;

  checkedAt: string;
}

let cached: { status: LicenseStatus; at: number } | null = null;
let inFlight: Promise<LicenseStatus> | null = null;

/** Call after anything that changes the licence on disk. */
export function invalidateLicenseStatus(): void {
  cached = null;
}

export async function getLicenseStatus(force = false): Promise<LicenseStatus> {
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.status;
  if (inFlight) return inFlight;
  inFlight = resolve()
    .then((status) => {
      cached = { status, at: Date.now() };
      return status;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/**
 * Resolve from scratch.
 *
 * Never throws. This is called from request handlers and from startup; an
 * exception escaping here would turn a licensing bug into a POS that will not
 * serve a page, which is the exact failure the grace period exists to prevent.
 */
async function resolve(): Promise<LicenseStatus> {
  try {
    return await resolveInner();
  } catch (err) {
    // Fail OPEN, loudly. We could not work out what this box is entitled to, so
    // it keeps working and says so. The alternative - restricting on an
    // internal error - is failure mode 1 with extra steps.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[licence] could not resolve licence status; the POS continues:", message);
    return {
      schema: 1,
      state: "licensed",
      restricted: false,
      warn: true,
      daysRemaining: null,
      expiresAt: null,
      perpetual: true,
      serial: null,
      edition: null,
      issuedTo: null,
      machineCode: "unavailable",
      signalsAvailable: 0,
      signalsMatched: null,
      signalsRequired: null,
      trialStartedAt: null,
      trialSource: "unknown",
      graceEndsAt: null,
      clockWarning: null,
      headline: "Licence status could not be checked",
      detail:
        `The POS could not read its own licence state (${message}). It is running ` +
        `normally and nothing is restricted. Report this to XenithPulse.`,
      rejection: null,
      checkedAt: new Date().toISOString(),
    };
  }
}

async function resolveInner(): Promise<LicenseStatus> {
  const state = await readLicenseState();
  const basis = await resolveTimeBasis(state);
  const [fingerprint, file] = await Promise.all([getFingerprint(), readLicenseFile()]);

  const base = {
    schema: 1 as const,
    machineCode: fingerprint.machineCode,
    signalsAvailable: fingerprint.present.length,
    clockWarning: basis.clockWarning,
    checkedAt: basis.now.toISOString(),
  };

  // ── A licence is present: is it good? ─────────────────────────────────────
  let rejection: string | null = null;
  let serial: string | null = null;
  let matched: number | null = null;
  let required: number | null = null;

  if (file) {
    const verified = verifyLicenseKey(file.key);
    if (!verified.ok) {
      // A forged or corrupt key gets NO grace period. Grace exists for a
      // customer whose real licence stopped validating, not for a file that was
      // never issued by us - otherwise "grace" is just a 14-day free trial for
      // anybody who can type gibberish into license.dat.
      rejection = verified.detail;
    } else {
      const { payload } = verified;
      serial = formatSerial(payload.serial);
      const match = compareBinding(payload.binding, fingerprint.binding);
      matched = match.matched;
      required = match.required;

      const today = toDayNumber(basis.effectiveNow);
      const perpetual = payload.expiryDay === PERPETUAL_DAY;
      const expired = !perpetual && payload.expiryDay < today;

      // Failure mode 1 outranks failure mode 4. If this box cannot read a
      // single hardware signal - a locked-down VM, a CIM service that is not
      // running - we cannot prove the licence has moved, so we do not act as
      // though it has. It is reported, and it is not a restriction.
      const cannotCheckMachine = fingerprint.present.length === 0;

      if (!expired && (match.ok || cannotCheckMachine)) {
        await recordValid(serial, basis.effectiveNow, state);
        const expiresAt = perpetual ? null : fromDayNumber(payload.expiryDay);
        const daysRemaining = expiresAt
          ? Math.ceil((expiresAt.getTime() - basis.effectiveNow.getTime()) / MS_PER_DAY)
          : null;
        const expiringSoon = daysRemaining !== null && daysRemaining <= 30;

        return {
          ...base,
          state: "licensed",
          restricted: false,
          warn: expiringSoon || cannotCheckMachine || basis.clockWarning !== null,
          daysRemaining,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
          perpetual,
          serial,
          edition: payload.edition,
          issuedTo: file.issuedTo ?? null,
          signalsMatched: matched,
          signalsRequired: required,
          trialStartedAt: state.trialStartedAt ?? null,
          trialSource: "n/a",
          graceEndsAt: null,
          headline: perpetual
            ? "Licensed"
            : expiringSoon
              ? `Licence expires in ${daysRemaining} day(s)`
              : "Licensed",
          detail: buildLicensedDetail(
            serial,
            payload.edition,
            expiresAt,
            match.matched,
            match.required,
            cannotCheckMachine
          ),
          rejection: null,
        };
      }

      rejection = expired
        ? `This licence expired on ${fromDayNumber(payload.expiryDay).toLocaleDateString()}.`
        : `This licence was issued for a different machine (${match.matched} of ` +
          `${match.required} required hardware signals match). If this box has had ` +
          `hardware replaced, ask XenithPulse to re-issue it against the machine ` +
          `code below.`;
    }
  }

  // ── No usable licence. Is this box in a grace period? ─────────────────────
  //
  // Grace applies only where a licence PREVIOUSLY validated on this machine.
  // That is what stops a copied license.dat from buying two free weeks on every
  // box it is dropped onto: a fresh box has never recorded a valid licence, so
  // it falls straight through to the trial.
  const wasLicensed = Boolean(state.lastValidSerial);
  const eligibleForGrace = wasLicensed && file !== null && rejection !== null && serial !== null;

  if (eligibleForGrace) {
    const graceStartedAt = state.graceStartedAt
      ? new Date(state.graceStartedAt)
      : basis.effectiveNow;
    if (!state.graceStartedAt) {
      await patchLicenseState({
        graceStartedAt: graceStartedAt.toISOString(),
        graceReason: rejection ?? undefined,
      }).catch(() => {});
    }
    const graceEndsAt = new Date(graceStartedAt.getTime() + GRACE_DAYS * MS_PER_DAY);
    const daysRemaining = Math.ceil(
      (graceEndsAt.getTime() - basis.effectiveNow.getTime()) / MS_PER_DAY
    );

    if (daysRemaining > 0) {
      return {
        ...base,
        state: "grace",
        restricted: false,
        warn: true,
        daysRemaining,
        expiresAt: null,
        perpetual: false,
        serial,
        edition: null,
        issuedTo: file?.issuedTo ?? null,
        signalsMatched: matched,
        signalsRequired: required,
        trialStartedAt: state.trialStartedAt ?? null,
        trialSource: "n/a",
        graceEndsAt: graceEndsAt.toISOString(),
        headline: `Licence problem - ${daysRemaining} day(s) before the POS is restricted`,
        detail:
          `${rejection} This POS was licensed before, so it keeps working for ` +
          `${GRACE_DAYS} days while it is sorted out. Contact XenithPulse with ` +
          `licence ${serial} and the machine code below. Nothing is restricted yet.`,
        rejection,
      };
    }
  }

  // ── Trial ────────────────────────────────────────────────────────────────
  const trial = await resolveTrial(state, basis);
  const daysRemaining = trial.daysRemaining;

  if (daysRemaining > 0) {
    const closing = daysRemaining <= TRIAL_WARN_DAYS;
    return {
      ...base,
      state: "trial",
      restricted: false,
      warn: closing || rejection !== null,
      daysRemaining,
      expiresAt: new Date(
        trial.startedAt.getTime() + TRIAL_DAYS * MS_PER_DAY
      ).toISOString(),
      perpetual: false,
      serial,
      edition: null,
      issuedTo: null,
      signalsMatched: matched,
      signalsRequired: required,
      trialStartedAt: trial.startedAt.toISOString(),
      trialSource: trial.source,
      graceEndsAt: null,
      headline: closing
        ? `Trial ends in ${daysRemaining} day(s)`
        : `Trial - ${daysRemaining} days left`,
      detail:
        (rejection ? `${rejection} ` : "") +
        `This is a ${TRIAL_DAYS}-day trial that started on ` +
        `${trial.startedAt.toLocaleDateString()}. Everything works normally until ` +
        `it ends. To buy a licence, give XenithPulse the machine code below.`,
      rejection,
    };
  }

  return {
    ...base,
    state: wasLicensed ? "unlicensed" : "trial_expired",
    restricted: true,
    warn: true,
    daysRemaining: 0,
    expiresAt: null,
    perpetual: false,
    serial,
    edition: null,
    issuedTo: null,
    signalsMatched: matched,
    signalsRequired: required,
    trialStartedAt: trial.startedAt.toISOString(),
    trialSource: trial.source,
    graceEndsAt: null,
    headline: wasLicensed ? "This POS is no longer licensed" : "The trial has ended",
    detail:
      (rejection ? `${rejection} ` : "") +
      `Orders that are already open can still be completed and printed. New orders ` +
      `and changes to the menu, staff and settings are blocked until a licence is ` +
      `activated. Give XenithPulse the machine code below to get one.`,
    rejection,
  };
}

function buildLicensedDetail(
  serial: string,
  edition: Edition,
  expiresAt: Date | null,
  matched: number,
  required: number,
  cannotCheckMachine: boolean
): string {
  const parts = [`Licence ${serial}, ${edition} edition.`];
  parts.push(
    expiresAt ? `Valid until ${expiresAt.toLocaleDateString()}.` : "This licence does not expire."
  );
  if (cannotCheckMachine) {
    parts.push(
      "This box could not read any of its hardware identifiers, so the licence was " +
        "accepted without a machine check. That is deliberate - a POS is never " +
        "restricted because Windows would not answer a question - but it is worth " +
        "reporting."
    );
  } else if (matched < 4) {
    parts.push(
      `${matched} of 4 hardware signals match (${required} required) - normal after ` +
        `a disk, network adapter or dock change.`
    );
  }
  return parts.join(" ");
}

/**
 * Remember that this licence validated here.
 *
 * This record is what makes the grace period possible later, and it is also
 * what keeps grace away from a licence copied onto a machine that never had
 * one. Written at most once a day: it is on the request path.
 */
async function recordValid(
  serial: string,
  at: Date,
  state: Awaited<ReturnType<typeof readLicenseState>>
): Promise<void> {
  const last = state.lastValidAt ? Date.parse(state.lastValidAt) : 0;
  const changed = state.lastValidSerial !== serial;
  const stale = !Number.isFinite(last) || at.getTime() - last > MS_PER_DAY;
  if (!changed && !stale && !state.graceStartedAt) return;

  await patchLicenseState({
    lastValidSerial: serial,
    lastValidAt: at.toISOString(),
    graceStartedAt: undefined,
    graceReason: undefined,
  }).catch(() => {});
  if (changed) await writeRegistryValue("LicenseSerial", serial).catch(() => false);
}
