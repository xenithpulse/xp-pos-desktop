// tools/licensing/cross-check-erp.mjs
//
// Prove that a licence minted by the ERP validates on a customer's POS.
//
//   node tools/licensing/cross-check-erp.mjs
//   node tools/licensing/cross-check-erp.mjs --erp E:/Xenith_Main/erp
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// The ERP mints licences using its own copy of the wire format. The customer's
// POS validates them using lib/licensing/format.ts, compiled into the product
// by Next. Those are two different files, in two different repositories, on two
// different release cycles.
//
// If they ever disagree, NOTHING VISIBLE HAPPENS AT ISSUE TIME. The ERP prints
// a licence that looks perfect. The failure lands on the customer - days later,
// on a box that may have no internet, with a technician already on site, and no
// obvious connection back to whatever commit caused it.
//
// vectors.mjs pins each implementation against frozen expectations, which
// catches drift within one repo. This closes the loop across both: it mints
// with the ERP's code and verifies with the PRODUCT's code, end to end, using
// the real signing key and the real compiled-in public key.
//
// Run it after touching anything in lib/licensing, tools/licensing, or the
// ERP's lib/licensing - and before shipping a build that changes the format.
//
// It mints throwaway licences for fabricated machine codes, entirely in a temp
// directory. Nothing is published, recorded or sent anywhere.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const erpRoot = path.resolve(arg("--erp", "E:/Xenith_Main/erp"));
const work = path.join(tmpdir(), "xp-licence-crosscheck");
const erpOut = path.join(work, "erp");
const posOut = path.join(work, "pos");
const keyPath = path.resolve(
  arg("--key", path.join(homedir(), ".xenithpulse", "licence-signing-key.pem"))
);

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  :: ${detail}` : ""}`);
  if (!ok) failures++;
}

if (!existsSync(erpRoot)) {
  console.error(`\n  No ERP at ${erpRoot}. Pass --erp <path>.\n`);
  process.exit(1);
}
if (!existsSync(keyPath)) {
  console.error(`\n  No signing key at ${keyPath}. Pass --key <path>.\n`);
  process.exit(1);
}

// node_modules/.bin/tsc resolves to a .cmd on Windows, which execFileSync
// cannot run without a shell. Invoke the compiler's entry script with this
// node instead - the same approach, and the same reason, as e2e.mjs.
const tscBin = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tscBin)) {
  console.error(`\n  TypeScript is not installed (${tscBin}). Run npm install.\n`);
  process.exit(1);
}
const runTsc = (tsconfigPath) =>
  execFileSync(process.execPath, [tscBin, "-p", tsconfigPath], { cwd: repoRoot, stdio: "pipe" });

console.log("\n  Cross-checking ERP issuing against the product's verifier\n");
rmSync(work, { recursive: true, force: true });
mkdirSync(erpOut, { recursive: true });
mkdirSync(posOut, { recursive: true });

// ── 1. Compile the ERP's signer to ESM ──────────────────────────────────────
//
// ESM rather than CommonJS because signer.ts imports codec.mjs, and node cannot
// require() an ES module from CommonJS. The package.json marks the output tree
// as ESM so tsc's .js output is loaded as such.
cpSync(path.join(erpRoot, "lib", "licensing", "codec.mjs"), path.join(erpOut, "codec.mjs"));
cpSync(path.join(erpRoot, "lib", "licensing", "vectors.mjs"), path.join(erpOut, "vectors.mjs"));
writeFileSync(path.join(erpOut, "package.json"), JSON.stringify({ type: "module" }));

const erpTsconfig = path.join(work, "tsconfig.erp.json");
writeFileSync(
  erpTsconfig,
  JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "esnext",
      moduleResolution: "bundler",
      esModuleInterop: true,
      skipLibCheck: true,
      strict: false,
      types: ["node"],
      typeRoots: [path.join(repoRoot, "node_modules", "@types").split(path.sep).join("/")],
      outDir: erpOut.split(path.sep).join("/"),
      rootDir: path.join(erpRoot, "lib", "licensing").split(path.sep).join("/"),
    },
    files: [path.join(erpRoot, "lib", "licensing", "signer.ts").split(path.sep).join("/")],
  })
);
runTsc(erpTsconfig);
check("ERP signer.ts compiles", existsSync(path.join(erpOut, "signer.js")));

// ── 2. Compile the PRODUCT's verifier to CommonJS ───────────────────────────
const posTsconfig = path.join(work, "tsconfig.pos.json");
writeFileSync(
  posTsconfig,
  JSON.stringify({
    compilerOptions: {
      target: "es2022",
      module: "commonjs",
      moduleResolution: "node",
      esModuleInterop: true,
      skipLibCheck: true,
      strict: false,
      types: ["node"],
      typeRoots: [path.join(repoRoot, "node_modules", "@types").split(path.sep).join("/")],
      outDir: posOut.split(path.sep).join("/"),
      rootDir: repoRoot.split(path.sep).join("/"),
    },
    files: [
      path.join(repoRoot, "lib/licensing/format.ts").split(path.sep).join("/"),
      path.join(repoRoot, "lib/licensing/keys.ts").split(path.sep).join("/"),
    ],
  })
);
runTsc(posTsconfig);

const require_ = createRequire(import.meta.url);
const productFormat = require_(path.join(posOut, "lib", "licensing", "format.js"));
const productKeys = require_(path.join(posOut, "lib", "licensing", "keys.js"));
check("product format.ts compiles and loads", typeof productFormat.verifyLicenseKey === "function");
check(
  "product ships a licence public key",
  typeof productKeys.LICENSE_PUBLIC_KEY_SPKI_BASE64 === "string" &&
    productKeys.LICENSE_PUBLIC_KEY_SPKI_BASE64.length > 0
);

// ── 3. Wrap the key by RUNNING protect-key.mjs, not by reimplementing it ────
//
// This originally inlined the scrypt/AES calls, which made the test agree with
// itself and with nothing else. It missed a real bug: protect-key.mjs was
// calling scryptSync without `maxmem`, so the tool every operator actually runs
// threw ERR_CRYPTO_INVALID_SCRYPT_PARAMS while this test sailed past. A harness
// that reimplements the thing it is testing proves only that the author can
// write the same code twice.
const PASSPHRASE = "cross-check-passphrase";
const protectKey = path.join(repoRoot, "tools", "licensing", "protect-key.mjs");
let blob;
try {
  const out = execFileSync(process.execPath, [protectKey, "--key", keyPath], {
    input: `${PASSPHRASE}\n${PASSPHRASE}\n`,
    encoding: "utf8",
  });
  blob = out.split(/\r?\n/).find((l) => l.startsWith("v1."));
} catch (err) {
  check("protect-key.mjs wraps the signing key", false, err.message);
}
check("protect-key.mjs wraps the signing key", Boolean(blob));
if (!blob) {
  console.error("\n  Cannot continue without a key blob.\n");
  process.exit(1);
}
process.env.LICENCE_SIGNING_KEY_ENC = blob;

const { issueLicence, LicenceError } = await import(
  pathToFileURL(path.join(erpOut, "signer.js")).href
);

// ── 4. Mint with the ERP, verify with the product ───────────────────────────
//
// The machine code has to be one the ERP will accept, so it is built with the
// ERP's own encoder from a binding with all four signals present.
const erpCodec = await import(pathToFileURL(path.join(erpOut, "codec.mjs")).href);
const binding = Buffer.from("a1b2c3d4e5f60718293a4b5c6d7e8f90", "hex");
const machineCode = erpCodec.encodeMachineCode(binding);

for (const [label, opts] of [
  ["dated licence", { days: 365, edition: "standard" }],
  ["perpetual licence", { days: null, edition: "pro" }],
]) {
  let issued;
  try {
    issued = issueLicence({ machineCode, passphrase: PASSPHRASE, ...opts });
  } catch (err) {
    check(`ERP mints a ${label}`, false, err.message);
    continue;
  }
  check(`ERP mints a ${label}`, true, issued.serial);

  const verdict = productFormat.verifyLicenseKey(
    issued.key,
    productKeys.LICENSE_PUBLIC_KEY_SPKI_BASE64
  );
  check(`the PRODUCT accepts that ${label}`, verdict.ok === true, verdict.detail ?? "");

  if (verdict.ok) {
    check(
      `${label}: binding survives the round trip`,
      Buffer.from(verdict.payload.binding).toString("hex") === binding.toString("hex")
    );
    check(
      `${label}: edition survives the round trip`,
      verdict.payload.edition === opts.edition,
      verdict.payload.edition
    );
  }
}

// ── 5. The refusals must still refuse ───────────────────────────────────────
try {
  issueLicence({ machineCode, passphrase: "wrong-passphrase", days: 365 });
  check("a wrong passphrase is refused", false, "it minted anyway");
} catch (err) {
  check("a wrong passphrase is refused", err instanceof LicenceError, err.message);
}

try {
  issueLicence({ machineCode: "NOT-A-REAL-CODE", passphrase: PASSPHRASE, days: 365 });
  check("a mistyped machine code is refused", false, "it minted anyway");
} catch (err) {
  check("a mistyped machine code is refused", err instanceof LicenceError);
}

// A binding with only two signals present: the zero digests read as absent.
const weak = Buffer.concat([Buffer.from("a1b2c3d4e5f60718", "hex"), Buffer.alloc(8)]);
try {
  issueLicence({ machineCode: erpCodec.encodeMachineCode(weak), passphrase: PASSPHRASE, days: 365 });
  check("a box with too few hardware signals is refused", false, "it minted anyway");
} catch (err) {
  check("a box with too few hardware signals is refused", err instanceof LicenceError);
}

rmSync(work, { recursive: true, force: true });

console.log(
  failures === 0
    ? "\n  All cross-checks passed. The ERP and the product agree on the format.\n"
    : `\n  ${failures} cross-check(s) FAILED. Do not issue licences from the ERP until this is understood.\n`
);
process.exit(failures === 0 ? 0 : 1);
