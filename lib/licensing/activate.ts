// lib/licensing/activate.ts
//
// Turning a key string into an activated licence.
//
// The whole activation path is OFFLINE. Nothing here calls out to anything: the
// signature proves the key came from XenithPulse, and the fingerprint proves it
// was issued for this box. A restaurant with no internet - most of them - is
// activated by reading 24 groups of characters down a phone, and that has to
// work on the first try, so this refuses a key it cannot fully accept rather
// than writing a broken licence file and leaving the technician to discover it
// after they have driven away.

import { verifyLicenseKey, formatSerial, fromDayNumber, PERPETUAL_DAY, toDayNumber } from "./format";
import { compareBinding, getFingerprint } from "./fingerprint";
import { readLicenseState, writeLicenseFile, type LicenseFile } from "./store";
import { resolveTimeBasis } from "./trial";
import { getLicenseStatus, invalidateLicenseStatus, type LicenseStatus } from "./status";

export interface ActivationInput {
  key: string;
  /** Free text from the issuer for the humans. Never trusted, never verified. */
  issuedTo?: string;
  note?: string;
}

export interface ActivationResult {
  activated: boolean;
  message: string;
  status: LicenseStatus;
}

export class ActivationError extends Error {
  constructor(
    message: string,
    /** What the operator should be told to do about it. */
    readonly hint?: string
  ) {
    super(message);
    this.name = "ActivationError";
  }
}

export async function activateLicense(input: ActivationInput): Promise<ActivationResult> {
  const raw = (input.key ?? "").trim();
  if (!raw) throw new ActivationError("No licence key was entered.");

  const verified = verifyLicenseKey(raw);
  if (!verified.ok) throw new ActivationError(verified.detail);

  const { payload } = verified;
  const serial = formatSerial(payload.serial);

  const [fingerprint, basis] = await Promise.all([
    getFingerprint(),
    resolveTimeBasis(await readLicenseState()),
  ]);

  // Expiry is checked against the effective time, not the raw clock, so a key
  // cannot be activated by winding the box's date back past its expiry.
  if (payload.expiryDay !== PERPETUAL_DAY && payload.expiryDay < toDayNumber(basis.effectiveNow)) {
    throw new ActivationError(
      `Licence ${serial} expired on ${fromDayNumber(payload.expiryDay).toLocaleDateString()}.`,
      "Ask XenithPulse for a renewal."
    );
  }

  const match = compareBinding(payload.binding, fingerprint.binding);
  const cannotCheckMachine = fingerprint.present.length === 0;
  if (!match.ok && !cannotCheckMachine) {
    throw new ActivationError(
      `Licence ${serial} was issued for a different machine - ${match.matched} of ` +
        `${match.required} required hardware signals match.`,
      `Check the machine code was read to XenithPulse correctly. If this box has had ` +
        `its motherboard or Windows installation replaced, the licence has to be ` +
        `re-issued against the code shown on this screen.`
    );
  }

  const file: LicenseFile = {
    schema: 1,
    key: verified.normalised,
    issuedTo: input.issuedTo?.trim() || undefined,
    note: input.note?.trim() || undefined,
    activatedAt: new Date().toISOString(),
  };
  await writeLicenseFile(file);

  // The cache is what every request reads. Not clearing it here would leave the
  // restaurant restricted for up to five minutes after a successful activation,
  // with a technician standing there watching it.
  invalidateLicenseStatus();
  const status = await getLicenseStatus(true);

  return {
    activated: status.state === "licensed",
    message:
      status.state === "licensed"
        ? `Licence ${serial} activated. This POS is licensed.`
        : `Licence ${serial} was accepted but the POS did not end up licensed: ${status.detail}`,
    status,
  };
}
