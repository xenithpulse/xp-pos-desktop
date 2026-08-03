// lib/updates/verify.ts
//
// Authenticode verification of a downloaded installer.
//
// The sha256 check in download.ts proves the file matches the manifest. It does
// NOT prove the manifest came from XenithPulse — anyone who can serve that JSON
// can name their own hash. The Authenticode signature is the part that ties the
// payload to a certificate, and it is what makes "download and run as
// Administrator" something other than a remote code execution path into every
// restaurant we supply.
//
// Verification is delegated to Windows rather than reimplemented. What matters
// is what the CUSTOMER'S machine thinks of the signature, including its own
// trust store and revocation state, and Get-AuthenticodeSignature is that
// answer. A hand-rolled PE parser would agree with Windows right up until it
// mattered.
//
// Phase 9 built the signing side and it is complete, but the certificate has
// not been purchased yet, so today's builds are unsigned. That is why
// POS_UPDATE_ALLOW_UNSIGNED exists — and why it defaults to false, is reported
// as a hole wherever it is on, and does not disable this check, only the
// refusal that follows it.

import { runPowerShellJson, psLiteral } from "@/lib/win/powershell";
import type { SignatureInfo } from "./state";

// Revocation checks can go out to the network, and this runs on an appliance
// that may have no internet. Windows falls back to a cached/offline verdict
// rather than hanging forever, but give it room before we call it a timeout.
const VERIFY_TIMEOUT_MS = 60_000;

/**
 * Ask Windows what it thinks of the file's signature.
 *
 * Returns a SignatureInfo in every case that produced an answer, including
 * "NotSigned" — that is a result, not a failure. Returns null only when the
 * check itself could not run (not Windows, PowerShell missing, timeout), which
 * callers must treat as "unverified", never as "fine".
 */
export async function inspectSignature(
  file: string,
  expectedPublisher: string
): Promise<SignatureInfo | null> {
  if (process.platform !== "win32") return null;

  const script = `
$ErrorActionPreference = 'Stop'
try {
  $sig = Get-AuthenticodeSignature -LiteralPath '${psLiteral(file)}'
  $subject = ''
  if ($sig.SignerCertificate) { $subject = $sig.SignerCertificate.Subject }
  [pscustomobject]@{
    status  = $sig.Status.ToString()
    subject = $subject
  } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ status = 'CheckFailed'; subject = '' } | ConvertTo-Json -Compress
}
`.trim();

  const parsed = await runPowerShellJson<{ status?: unknown; subject?: unknown }>(
    script,
    VERIFY_TIMEOUT_MS
  );
  if (!parsed) return null;

  const status = typeof parsed.status === "string" ? parsed.status : "Unknown";
  const subject = typeof parsed.subject === "string" && parsed.subject ? parsed.subject : null;

  // Trusted means BOTH that Windows validated the chain and that the signer is
  // who we expect. A valid signature from someone else is not our installer.
  const publisherMatches =
    subject !== null &&
    expectedPublisher.length > 0 &&
    subject.toLowerCase().includes(expectedPublisher.toLowerCase());

  return { status, subject, trusted: status === "Valid" && publisherMatches };
}

/** Human-readable reason a signature was rejected, for the dashboard. */
export function describeSignature(sig: SignatureInfo | null, expectedPublisher: string): string {
  if (!sig) return "Could not be checked on this machine.";
  if (sig.trusted) return `Signed by ${sig.subject}.`;
  if (sig.status === "NotSigned") return "The installer is not code-signed.";
  if (sig.status !== "Valid") return `Windows reports the signature as "${sig.status}".`;
  return `Signed, but not by ${expectedPublisher} (signer: ${sig.subject ?? "unknown"}).`;
}
