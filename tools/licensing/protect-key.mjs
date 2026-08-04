// tools/licensing/protect-key.mjs
//
// Wrap the licence signing key for storage on the ERP.
//
//   node tools/licensing/protect-key.mjs
//   node tools/licensing/protect-key.mjs --key ~/.xenithpulse/licence-signing-key.pem
//
// Prints one long line to paste into the ERP's LICENCE_SIGNING_KEY_ENC.
//
// ── WHAT THIS DOES AND DOES NOT PROTECT ─────────────────────────────────────
//
// The decision on record (PHASE-11-LICENSING.md) is that the ERP signs
// licences on demand, and the ERP is a public, internet-facing deployment.
// That means the signing key has to be reachable from a server on the
// internet, which is a real exposure and this file does not pretend otherwise.
//
// What it buys:
//
//   * A LEAKED ENVIRONMENT is not enough. The value below is AES-256-GCM
//     ciphertext. Without the passphrase it is 100-odd bytes of noise.
//   * A DATABASE DUMP is not enough - the key is not in the database at all.
//   * A BACKUP, a misconfigured log, a screenshot of the env panel, a stale
//     .env in a container image: all of these leak the ciphertext, none of
//     them leak the key.
//
// What it does NOT buy, stated plainly so nobody is surprised later:
//
//   * An attacker with CODE EXECUTION on the ERP at the moment somebody issues
//     a licence can read the passphrase as it is typed and the key once it is
//     decrypted. There is no arrangement that avoids this while the server is
//     the thing doing the signing. It is the cost of the chosen design.
//
// So: the passphrase is NEVER stored on the server, never in an env var, never
// in the database. It is typed by the operator each time a licence is issued.
// If you put the passphrase in the environment next to the ciphertext you have
// undone this entire file and you may as well store the PEM directly.
//
// KEEP THE ORIGINAL .pem. This is a copy for the ERP to use, not a backup and
// not a substitute. If you lose the original AND forget the passphrase, no
// licence can ever be issued again for any box already in the field, because
// the matching public key is compiled into every shipped build.

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  createPrivateKey,
} from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const keyPath = path.resolve(
  arg("--key", path.join(homedir(), ".xenithpulse", "licence-signing-key.pem"))
);

if (!existsSync(keyPath)) {
  console.error(`\n  No signing key at ${keyPath}\n`);
  process.exit(1);
}

const pem = readFileSync(keyPath, "utf8");

// Fail before asking for a passphrase if this is not actually a usable key.
try {
  createPrivateKey(pem);
} catch (err) {
  console.error(`\n  ${keyPath} is not a valid private key: ${err.message}\n`);
  process.exit(1);
}

// scrypt parameters. N=2^15 costs ~100ms and ~32MB per derivation, which is
// nothing for a human issuing a licence and expensive for anybody working
// through a wordlist against a stolen ciphertext.
//
// THESE MUST MATCH lib/licensing/signer.ts IN THE ERP. N, r and p change the
// derived key, so a mismatch makes every blob produced here undecryptable
// there - and the symptom is the useless "that passphrase did not unlock the
// signing key", which sends you hunting for a typo that does not exist.
//
// maxmem does NOT change the derived key; it only decides whether node lets the
// derivation run at all. Node's default is 32MB and N=2^15 needs slightly more,
// so WITHOUT it scryptSync throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS. It was
// missing here while being present in signer.ts, so the ERP could decrypt a
// blob this file could not produce.
const SCRYPT_N = 32768;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_MAXMEM = 128 * 1024 * 1024;
const KEY_LEN = 32;

// ONE readline interface for both prompts. A fresh one per question consumes
// the input stream and the second question then never resolves - which shows up
// only when stdin is a pipe rather than a terminal, i.e. in a test.
//
// Echo is suppressed while a passphrase is being typed, so it does not end up in
// terminal scrollback or a screen recording. Only meaningful on a TTY; piped
// input is not echoed anyway.
const isTTY = Boolean(process.stdin.isTTY);
const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: isTTY,
});

let muted = false;
rl._writeToOutput = (str) => {
  if (!muted) {
    process.stdout.write(str);
    return;
  }
  // Let the line break through so the cursor moves on; swallow the characters.
  if (str.includes("\n")) process.stdout.write("\n");
};

// Read through the async iterator rather than rl.question(). With a non-TTY
// stdin (a pipe, i.e. any test) readline emits every buffered line as soon as
// the stream is readable - before a second rl.question() has registered its
// callback - so the second answer is dropped and its promise never settles. The
// iterator queues lines instead of racing them.
const lines = rl[Symbol.asyncIterator]();

async function ask(question, hide = false) {
  process.stdout.write(question);
  muted = hide && isTTY;
  const { value, done } = await lines.next();
  muted = false;
  if (hide) process.stdout.write("\n"); // the echoed newline was swallowed
  if (done) {
    console.error("\n  No input.\n");
    process.exit(1);
  }
  return value ?? "";
}

const passphrase = await ask("  Passphrase (you will type this in the ERP on every issue): ", true);
if (passphrase.length < 12) {
  console.error("\n  Use at least 12 characters. This is the only thing standing between\n" +
                "  a leaked environment variable and your signing key.\n");
  process.exit(1);
}
const again = await ask("  Again: ", true);
// Close it here: nothing else reads stdin, and an open interface keeps the
// process alive after the last line is printed.
rl.close();
if (passphrase !== again) {
  console.error("\n  They do not match.\n");
  process.exit(1);
}

const salt = randomBytes(16);
const iv = randomBytes(12);
const derived = scryptSync(passphrase, salt, KEY_LEN, {
  N: SCRYPT_N,
  r: SCRYPT_r,
  p: SCRYPT_p,
  maxmem: SCRYPT_MAXMEM,
});

const cipher = createCipheriv("aes-256-gcm", derived, iv);
const ciphertext = Buffer.concat([cipher.update(pem, "utf8"), cipher.final()]);
const tag = cipher.getAuthTag();

// v1.<salt>.<iv>.<tag>.<ciphertext> - the version prefix so a future change of
// KDF or cipher can be told apart from this one rather than guessed at.
const blob = [
  "v1",
  salt.toString("base64url"),
  iv.toString("base64url"),
  tag.toString("base64url"),
  ciphertext.toString("base64url"),
].join(".");

// Unwrap what we just produced, exactly the way the ERP will, before handing it
// over. The same principle as issue.mjs verifying a licence before printing it:
// the cost is milliseconds, and the cost of skipping it is discovering the blob
// is unusable while standing in a hosting panel with a customer waiting.
{
  const parts = blob.split(".");
  const [, s, i, t, c] = parts;
  let roundTripped;
  try {
    const d = scryptSync(passphrase, Buffer.from(s, "base64url"), KEY_LEN, {
      N: SCRYPT_N,
      r: SCRYPT_r,
      p: SCRYPT_p,
      maxmem: SCRYPT_MAXMEM,
    });
    const decipher = createDecipheriv("aes-256-gcm", d, Buffer.from(i, "base64url"));
    decipher.setAuthTag(Buffer.from(t, "base64url"));
    roundTripped = Buffer.concat([
      decipher.update(Buffer.from(c, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch (err) {
    console.error(`\n  Refusing to print: the blob did not decrypt back (${err.message}).\n`);
    process.exit(1);
  }
  if (roundTripped !== pem) {
    console.error("\n  Refusing to print: the blob decrypted to something other than the key.\n");
    process.exit(1);
  }
  try {
    createPrivateKey(roundTripped);
  } catch {
    console.error("\n  Refusing to print: what came back is not a usable private key.\n");
    process.exit(1);
  }
}

console.log("\n  Put this in the ERP environment as LICENCE_SIGNING_KEY_ENC:\n");
console.log(blob);
console.log(
  "\n  Do NOT also put the passphrase there. You type that in the ERP each time\n" +
    "  you issue a licence - that separation is the entire point.\n"
);
