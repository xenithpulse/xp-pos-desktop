// tools/licensing/issue.mjs
//
// Issue a licence for a customer's machine. XenithPulse side only.
//
//   node tools/licensing/issue.mjs --machine "ABCD-EFGH-..." --days 365
//   node tools/licensing/issue.mjs --machine "..." --perpetual --to "Bella Roma"
//   node tools/licensing/issue.mjs --machine "..." --perpetual --out license.dat
//   node tools/licensing/issue.mjs --selftest
//
// The machine code comes off the customer's POS: Server Management ->
// Licence. It IS the fingerprint - there is no lookup, no database and no
// network call anywhere in this process, which is what lets a licence be issued
// for a restaurant that has never been online.
//
// What comes out is a key string in 24 groups of six characters, and
// optionally a license.dat the technician can drop into
// C:\ProgramData\XP POS. Both carry the same bytes; the file exists so the
// technician does not have to read 144 characters down a phone when email
// happens to work.
//
// The signing key is read from ~/.xenithpulse/licence-signing-key.pem unless
// --key says otherwise. See keygen.mjs.

import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  randomBytes,
} from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import {
  EDITIONS,
  PERPETUAL_DAY,
  countSignals,
  decodeMachineCode,
  encodeMachineCode,
  encodePayload,
  formatLicenseKey,
  formatSerial,
  fromDayNumber,
  signingMessage,
  toDayNumber,
  verifyLicenseKey,
} from "./lib/codec.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function flag(name) {
  return process.argv.includes(name);
}
function die(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const keyPath = path.resolve(
  arg("--key", path.join(homedir(), ".xenithpulse", "licence-signing-key.pem"))
);

function loadPrivateKey() {
  if (!existsSync(keyPath)) {
    die(
      `No signing key at ${keyPath}\n  Run: node tools/licensing/keygen.mjs\n` +
        `  Or point at the real one with --key <path>`
    );
  }
  return createPrivateKey(readFileSync(keyPath, "utf8"));
}

/**
 * Round-trip a licence through the encoder and the verifier.
 *
 * This catches an edit that made this file inconsistent with ITSELF. It cannot
 * catch a divergence from lib/licensing/format.ts in the product - only reading
 * both can - which is why both files carry the same warning at the top.
 */
function selftest() {
  const privateKey = loadPrivateKey();
  const publicSpki = createPrivateKeyPublic(privateKey);
  const binding = randomBytes(16);
  const machineCode = encodeMachineCode(binding);
  const decoded = decodeMachineCode(machineCode);
  if (!decoded || !decoded.equals(binding)) die("SELFTEST FAILED: machine code did not round-trip");

  const key = mint({ privateKey, binding, expiryDay: PERPETUAL_DAY, edition: "standard" });
  const check = verifyLicenseKey(key.text, publicSpki);
  if (!check.ok) die(`SELFTEST FAILED: ${check.detail}`);
  if (!check.payload.binding.equals(binding)) die("SELFTEST FAILED: binding did not round-trip");

  // The confusable characters Crockford base32 exists to absorb.
  const mangled = key.text.toLowerCase().replace(/o/g, "0").replace(/l/g, "1").replace(/-/g, " ");
  if (!verifyLicenseKey(mangled, publicSpki).ok) {
    die("SELFTEST FAILED: a key mistyped the way a human mistypes it was rejected");
  }

  console.log("\n  Selftest passed: machine code, payload, signature and human typos.\n");
}

/** Node derives the public half from the private one; no second file needed. */
function createPrivateKeyPublic(privateKey) {
  return createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64");
}

function mint({ privateKey, binding, expiryDay, edition, serial }) {
  const issuedDay = toDayNumber(new Date());
  const finalSerial = serial ?? randomBytes(4).readUInt32BE(0);
  const payloadBytes = encodePayload({
    edition,
    issuedDay,
    expiryDay,
    serial: finalSerial,
    binding,
  });
  // `null` as the algorithm is how Node asks for Ed25519.
  const signature = cryptoSign(null, signingMessage(payloadBytes), privateKey);
  return {
    text: formatLicenseKey(Buffer.concat([payloadBytes, signature])),
    serial: finalSerial,
    issuedDay,
    expiryDay,
    edition,
  };
}

// ── main ─────────────────────────────────────────────────────────────────────

if (flag("--selftest")) {
  selftest();
  process.exit(0);
}

const machineArg = arg("--machine", "");
if (!machineArg) {
  die(
    "Usage: node tools/licensing/issue.mjs --machine <code> [--days N | --perpetual]\n" +
      "                                     [--edition standard|pro] [--to \"Name\"]\n" +
      "                                     [--out license.dat] [--key <pem>]"
  );
}

const binding = decodeMachineCode(machineArg);
if (!binding) {
  die(
    "That machine code is not valid.\n" +
      "  The check characters do not match, which almost always means it was\n" +
      "  mistyped on the way here. Ask for it to be read again - it is on the\n" +
      "  POS under Server Management -> Licence."
  );
}

const signals = countSignals(binding);
if (signals < 3 && !flag("--allow-weak")) {
  die(
    `That box could only read ${signals} of 4 hardware signals.\n` +
      `  A licence issued against fewer than three has no tolerance for a hardware\n` +
      `  change: replacing a disk or a dock would invalidate it and lock the\n` +
      `  customer out. Find out why the box cannot read its motherboard serial or\n` +
      `  MachineGuid first. Override with --allow-weak only if you have decided\n` +
      `  that is acceptable for this site.`
  );
}

const edition = arg("--edition", "standard");
if (!EDITIONS.includes(edition)) die(`--edition must be one of: ${EDITIONS.join(", ")}`);

let expiryDay;
if (flag("--perpetual")) {
  expiryDay = PERPETUAL_DAY;
} else {
  const days = Number(arg("--days", "365"));
  if (!Number.isFinite(days) || days < 1) die("--days must be a positive number");
  expiryDay = toDayNumber(new Date(Date.now() + days * 86_400_000));
  if (expiryDay >= PERPETUAL_DAY) die("--days is too far in the future for this format");
}

const privateKey = loadPrivateKey();
const licence = mint({ privateKey, binding, expiryDay, edition });

// Verify what we just produced before handing it to a customer. The cost is
// microseconds; the cost of not doing it is a technician on site with a key
// that does not work.
const check = verifyLicenseKey(licence.text, createPrivateKeyPublic(privateKey));
if (!check.ok) die(`Refusing to issue: the licence did not verify (${check.detail})`);

const issuedTo = arg("--to", "");
const outPath = arg("--out", "");

console.log("");
console.log(`  Licence   ${formatSerial(licence.serial)}  (${edition})`);
console.log(`  Machine   ${encodeMachineCode(binding)}`);
console.log(`  Signals   ${signals} of 4`);
console.log(
  `  Expires   ${expiryDay === PERPETUAL_DAY ? "never" : fromDayNumber(expiryDay).toISOString().slice(0, 10)}`
);
if (issuedTo) console.log(`  Issued to ${issuedTo}`);
console.log("");
console.log("  Key (read this out, or paste it into the POS):");
console.log("");
// Six groups per line: short enough to read out without losing your place, and
// it wraps in an 80-column console and in an email.
const groups = licence.text.split("-");
for (let i = 0; i < groups.length; i += 6) {
  console.log(`    ${groups.slice(i, i + 6).join("-")}`);
}
console.log("");

if (outPath) {
  const file = {
    schema: 1,
    key: licence.text,
    issuedTo: issuedTo || undefined,
    issuedAt: new Date().toISOString(),
    note: "Drop this file in C:\\ProgramData\\XP POS and restart the XPPOS-App service.",
  };
  writeFileSync(path.resolve(outPath), JSON.stringify(file, null, 2), "utf8");
  console.log(`  Written: ${path.resolve(outPath)}`);
  console.log("");
}
