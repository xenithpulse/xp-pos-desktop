// tools/licensing/keygen.mjs
//
// Generate the XenithPulse licence signing key. Run this ONCE, ever.
//
//   node tools/licensing/keygen.mjs
//   node tools/licensing/keygen.mjs --out "D:\safe\licence-signing-key.pem"
//
// What comes out:
//
//   PRIVATE key  -> a .pem file OUTSIDE this repository. It is written with
//                   restrictive ACLs where the platform allows it. Whoever
//                   holds it can issue licences for every XP POS ever shipped.
//                   Back it up somewhere that is not this laptop. Losing it
//                   means no new licence can ever be issued for any existing
//                   installation, because the public half is compiled into
//                   builds already on customer sites.
//
//   PUBLIC key   -> printed as base64 SPKI, to paste into
//                   lib/licensing/keys.ts. It is not a secret; it ships in
//                   every installer by design.
//
// The default output path is deliberately outside the repository. A private key
// under a git working tree gets committed eventually - .gitignore covers *.pem
// today, but the file that leaks is always the one somebody renamed.

import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const defaultOut = path.join(homedir(), ".xenithpulse", "licence-signing-key.pem");
const out = path.resolve(arg("--out", defaultOut));
const force = process.argv.includes("--force");

if (existsSync(out) && !force) {
  console.error(`\nA key already exists at:\n  ${out}\n`);
  console.error("Refusing to overwrite it. Generating a second signing key would");
  console.error("invalidate every licence issued with the first one, because the");
  console.error("public half is already compiled into shipped installers.\n");
  console.error("Pass --force only if you are certain no licence has been issued.\n");
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, privateKey.export({ format: "pem", type: "pkcs8" }), "utf8");
try {
  // Best effort. On Windows this is close to a no-op - NTFS ACLs are what
  // matter there and node cannot set them - so the real protection is that the
  // file lives in the operator's profile and is backed up deliberately.
  chmodSync(out, 0o600);
} catch {
  /* not fatal */
}

const spki = publicKey.export({ format: "der", type: "spki" }).toString("base64");

console.log("");
console.log("  Licence signing key generated.");
console.log("");
console.log(`  PRIVATE key written to:  ${out}`);
console.log("    Back this up now, offline. It cannot be regenerated.");
console.log("");
console.log("  PUBLIC key - paste into lib/licensing/keys.ts:");
console.log("");
console.log(`    ${spki}`);
console.log("");
