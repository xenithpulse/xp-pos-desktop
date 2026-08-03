// lib/win/powershell.ts
//
// Running a PowerShell snippet from the app process and getting JSON back.
//
// Shared by signature verification and by diagnostics. Both need to ask Windows
// something the Node runtime cannot answer — what it thinks of an Authenticode
// signature, what state a service is in, what is listening on a port — and both
// need it to fail soft rather than throw into a request handler.

import { execFile } from "child_process";
import path from "path";

const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Full path rather than a bare "powershell.exe".
 *
 * Same reasoning as setup.iss: a client box may have a damaged or hijacked
 * PATH, and this process runs as LocalSystem. Resolving an interpreter we hand
 * a script to through PATH is not worth the risk.
 */
export function powershellPath(): string {
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  return path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

export interface PowerShellResult {
  ok: boolean;
  stdout: string;
}

/**
 * Execute `script` via -EncodedCommand.
 *
 * Base64/UTF-16LE rather than a quoted -Command string: these snippets embed
 * filesystem paths, and PowerShell's quoting rules for a path containing
 * spaces, brackets or an apostrophe are a reliable source of subtle breakage.
 * Encoding removes the whole class of problem.
 */
export function runPowerShell(
  script: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<PowerShellResult> {
  if (process.platform !== "win32") {
    return Promise.resolve({ ok: false, stdout: "" });
  }
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return new Promise((resolve) => {
    execFile(
      powershellPath(),
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => resolve({ ok: !err, stdout: stdout ?? "" })
    );
  });
}

/**
 * Run a snippet whose last statement is `ConvertTo-Json` and parse the result.
 *
 * Returns null on any failure. ConvertTo-Json emits a bare object for a single
 * item and an array for several, so callers that expect a list get one either
 * way via `asArray`.
 */
export async function runPowerShellJson<T>(
  script: string,
  timeoutMs?: number
): Promise<T | null> {
  const { stdout } = await runPowerShell(script, timeoutMs);
  const text = stdout.trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Normalise ConvertTo-Json's "one object OR an array" into an array. */
export function asArray<T>(value: T | T[] | null): T[] {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Escape a string for embedding in a single-quoted PowerShell literal. */
export function psLiteral(value: string): string {
  return value.replace(/'/g, "''");
}
