// tools/licensing/e2e.mjs
//
// End-to-end exercise of lib/licensing against a throwaway data root.
//
//   node tools/licensing/e2e.mjs
//
// Every acceptance criterion in docs/handover/PHASE-11-LICENSING.md that can be
// checked without installing on a real box is checked here, on the REAL modules
// - not a re-implementation. It compiles lib/licensing with tsc into a temp
// directory, points POS_DATA_DIR at a scratch folder, and drives the same
// functions the app calls.
//
// It is worth the machinery. This is the one subsystem that can lock a paying
// restaurant out of its own till, the interesting cases are all about dates and
// hardware rather than user input, and "I set the clock back and it still
// worked" is not something anybody is going to check by hand before a release.
//
// What it CANNOT check, because it is not running on a client box:
//
//   * the registry backstop actually being written - that needs Administrator,
//     and HKLM writes here fail soft and are skipped
//   * the database source for the trial start (no mongod in this process)
//   * enforcement in the HTTP layer - the 402 comes from lib/auth.ts, which
//     needs Next
//
// Those three are the manual checklist in the phase document.
//
// The signing key is read from ~/.xenithpulse/licence-signing-key.pem, the same
// place keygen.mjs writes it. Without it, this test cannot mint a licence to
// test with, and it says so rather than pretending to pass.

import { createPrivateKey, sign as cryptoSign, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const work = path.join(tmpdir(), "xppos-licence-e2e");
const compiled = path.join(work, "compiled");
const dataRoot = path.join(work, "dataroot");

const tool = await import(pathToFileURL(path.join(here, "lib", "codec.mjs")).href);

const keyFile = path.join(homedir(), ".xenithpulse", "licence-signing-key.pem");
if (!existsSync(keyFile)) {
  console.error(`\n  No signing key at ${keyFile}`);
  console.error("  Run: node tools/licensing/keygen.mjs\n");
  process.exit(1);
}
const priv = createPrivateKey(readFileSync(keyFile, "utf8"));

// ── Compile lib/licensing exactly as it is, into a temp tree ────────────────
//
// tsc does not rewrite the "@/..." path alias, so the emitted requires are
// rewritten afterwards. Compiling rather than transpiling on the fly keeps this
// script dependency-free: the repo already has typescript.
console.log("  compiling lib/licensing...");
rmSync(work, { recursive: true, force: true });
mkdirSync(compiled, { recursive: true });
mkdirSync(dataRoot, { recursive: true });

const tsconfig = path.join(work, "tsconfig.json");
writeFileSync(
  tsconfig,
  JSON.stringify(
    {
      compilerOptions: {
        target: "es2022",
        module: "commonjs",
        moduleResolution: "node",
        esModuleInterop: true,
        skipLibCheck: true,
        strict: true,
        types: ["node"],
        typeRoots: [path.join(repoRoot, "node_modules", "@types").split(path.sep).join("/")],
        outDir: compiled.split(path.sep).join("/"),
        rootDir: repoRoot.split(path.sep).join("/"),
        baseUrl: repoRoot.split(path.sep).join("/"),
        paths: { "@/*": ["./*"] },
      },
      files: [
        path.join(repoRoot, "lib/licensing/status.ts").split(path.sep).join("/"),
        path.join(repoRoot, "lib/licensing/activate.ts").split(path.sep).join("/"),
      ],
    },
    null,
    2
  ),
  "utf8"
);

// The compiler is invoked through node directly rather than through npx: npx
// resolves to a .cmd on Windows, which execFileSync cannot run without a shell,
// and a test harness that fails for shell-quoting reasons teaches nobody
// anything.
const tscBin = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");
if (!existsSync(tscBin)) {
  console.error(`\n  TypeScript is not installed (${tscBin}). Run npm install.\n`);
  process.exit(1);
}
try {
  execFileSync(process.execPath, [tscBin, "-p", tsconfig], { cwd: repoRoot, stdio: "pipe" });
} catch (err) {
  // tsc also type-checks the modules licensing lazily imports (mongoose, the
  // models), and those can carry errors that belong to the app rather than to
  // this subsystem. Only complaints about lib/licensing stop the run; the real
  // gate for everything else is `npx tsc --noEmit` on the repo's own config.
  const out = String(err.stdout ?? "") + String(err.stderr ?? "");
  const relevant = out
    .split(/\r?\n/)
    .filter((l) => /lib[\\/]licensing/.test(l));
  if (relevant.length) {
    console.error("\n  lib/licensing does not compile:\n");
    for (const line of relevant) console.error("    " + line);
    process.exit(1);
  }
}

if (!existsSync(path.join(compiled, "lib/licensing/status.js"))) {
  console.error("\n  The compiler produced no output. Full tsc run:\n");
  try {
    execFileSync(process.execPath, [tscBin, "-p", tsconfig], { cwd: repoRoot, stdio: "inherit" });
  } catch {
    /* the output above is the point */
  }
  process.exit(1);
}

// Rewrite "@/..." requires to absolute paths inside the compiled tree.
(function dealias(dir) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) dealias(p);
    else if (p.endsWith(".js")) {
      const src = readFileSync(p, "utf8");
      const out = src.replace(/require\("@\/([^"]+)"\)/g, (_m, rel) =>
        "require(" + JSON.stringify(path.join(compiled, rel).split(path.sep).join("/")) + ")"
      );
      if (out !== src) writeFileSync(p, out, "utf8");
    }
  }
})(compiled);

process.env.POS_DATA_DIR = dataRoot;
const require = createRequire(import.meta.url);
const status = require(path.join(compiled, "lib/licensing/status.js"));
const activate = require(path.join(compiled, "lib/licensing/activate.js"));
const fingerprint = require(path.join(compiled, "lib/licensing/fingerprint.js"));
const store = require(path.join(compiled, "lib/licensing/store.js"));
const paths = require(path.join(compiled, "lib/licensing/paths.js"));

// ── Helpers ─────────────────────────────────────────────────────────────────

let failures = 0;
function check(name, ok, extra = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  :: " + extra : ""}`);
  if (!ok) failures++;
}

function mint(binding, { expiryDay = tool.PERPETUAL_DAY, serial = 0xabcd0001, key = priv } = {}) {
  const payload = tool.encodePayload({
    edition: "standard",
    issuedDay: tool.toDayNumber(new Date()),
    expiryDay,
    serial,
    binding,
  });
  return tool.formatLicenseKey(
    Buffer.concat([payload, cryptoSign(null, tool.signingMessage(payload), key)])
  );
}

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const fresh = async () => {
  status.invalidateLicenseStatus();
  return status.getLicenseStatus(true);
};

// ── The tests ───────────────────────────────────────────────────────────────

const fp = await fingerprint.getFingerprint();
console.log(`\n  machine code : ${fp.machineCode}`);
console.log(`  signals      : ${fp.present.join(", ") || "(none)"}\n`);
check("this machine reads at least 3 of 4 hardware signals", fp.present.length >= 3, `${fp.present.length}/4`);

let s = await fresh();
check("a fresh install starts a 30-day trial", s.state === "trial" && s.daysRemaining === 30, `${s.state}, ${s.daysRemaining}d`);
check("a fresh trial restricts nothing", s.restricted === false);
check("the trial start is written to the state file", existsSync(paths.licenseStatePath()));

s = await fresh();
check("trial state survives a process restart", s.state === "trial" && s.daysRemaining === 30);

await store.patchLicenseState({ trialStartedAt: daysAgo(25), highWaterAt: daysAgo(0) });
s = await fresh();
check("25 days in, 5 days remain", s.daysRemaining === 5, String(s.daysRemaining));
check("the last week of the trial warns", s.warn === true);

// Clock rollback: the high-water mark is ahead of "now" by a year.
await store.patchLicenseState({
  trialStartedAt: daysAgo(25),
  highWaterAt: new Date(Date.now() + 300 * 86_400_000).toISOString(),
});
s = await fresh();
check("setting the clock back does NOT extend the trial", s.restricted === true, `${s.state}, ${s.daysRemaining}d`);
check("a clock that went backwards is reported", typeof s.clockWarning === "string" && s.clockWarning.length > 0);

await store.writeLicenseState({ schema: 1, trialStartedAt: daysAgo(31) });
s = await fresh();
check("a 31-day-old trial is expired and restricted", s.state === "trial_expired" && s.restricted === true);

rmSync(paths.licensePath(), { force: true });
s = await fresh();
check("deleting license.dat does not reset the trial", s.restricted === true);

const result = await activate.activateLicense({ key: mint(fp.binding), issuedTo: "Test Restaurant" });
check("a valid key activates offline", result.activated === true, result.message);
s = await fresh();
check("an activated box is licensed and unrestricted", s.state === "licensed" && s.restricted === false);
check("the licence serial is reported", s.serial === "ABCD0001", String(s.serial));
check("a perpetual licence has no expiry", s.perpetual === true && s.expiresAt === null);

rmSync(paths.licenseStatePath(), { force: true });
s = await fresh();
check("a licence survives losing license-state.json", s.state === "licensed");

// A licence issued for a different machine, on a box that never had one.
const otherBinding = Buffer.from(fp.binding);
for (const i of [0, 4, 8, 12]) otherBinding[i] ^= 0xff;
await store.writeLicenseFile({ schema: 1, key: mint(otherBinding, { serial: 0xdead0002 }) });
await store.writeLicenseState({ schema: 1, trialStartedAt: daysAgo(31) });
s = await fresh();
check("a licence copied to another machine is refused", s.restricted === true, s.rejection ?? "");
check("a copied licence gets no grace period", s.graceEndsAt === null && s.state !== "grace");

// One signal changing - a new dock, a replaced network adapter.
const oneChanged = Buffer.from(fp.binding);
oneChanged[12] ^= 0xff;
await store.writeLicenseFile({ schema: 1, key: mint(oneChanged, { serial: 0xabcd0003 }) });
await store.writeLicenseState({ schema: 1, trialStartedAt: daysAgo(31) });
s = await fresh();
check("changing one hardware signal keeps a licence valid", s.state === "licensed", `${s.signalsMatched}/${s.signalsRequired} matched`);

// Grace, for a box that WAS licensed.
await store.writeLicenseFile({ schema: 1, key: mint(otherBinding, { serial: 0xdead0004 }) });
await store.writeLicenseState({
  schema: 1,
  trialStartedAt: daysAgo(400),
  lastValidSerial: "DEAD0004",
  lastValidAt: daysAgo(2),
});
s = await fresh();
check("a previously licensed box gets a 14-day grace period", s.state === "grace" && s.daysRemaining === 14 && s.restricted === false);

await store.patchLicenseState({ graceStartedAt: daysAgo(15) });
s = await fresh();
check("an exhausted grace period restricts", s.state === "unlicensed" && s.restricted === true);

// An expired licence.
await store.writeLicenseFile({
  schema: 1,
  key: mint(fp.binding, {
    expiryDay: tool.toDayNumber(new Date(Date.now() - 5 * 86_400_000)),
    serial: 0xabcd0005,
  }),
});
await store.writeLicenseState({ schema: 1, trialStartedAt: daysAgo(400) });
s = await fresh();
check("an expired licence is refused", s.restricted === true && /expired/i.test(s.rejection ?? ""), s.rejection ?? "");

// A licence signed by somebody else's key.
const rogue = generateKeyPairSync("ed25519").privateKey;
await store.writeLicenseFile({ schema: 1, key: mint(fp.binding, { serial: 99, key: rogue }) });
await store.writeLicenseState({
  schema: 1,
  trialStartedAt: daysAgo(400),
  lastValidSerial: "ABCD0001",
  lastValidAt: daysAgo(2),
});
s = await fresh();
check("a self-signed licence is refused", s.restricted === true, s.rejection ?? "");
check("a forged licence gets no grace period", s.state !== "grace");

// Activation refuses rather than writing a licence that will not work.
let refused = null;
try {
  await activate.activateLicense({ key: mint(otherBinding, { serial: 0xdead0006 }) });
} catch (err) {
  refused = err;
}
check("activation refuses a licence for another machine", refused !== null, refused?.message ?? "");

// A technician who saved the key into Notepad rather than using the file.
writeFileSync(paths.licensePath(), "\n" + mint(fp.binding, { serial: 0xabcd0007 }) + "\n", "utf8");
s = await fresh();
check("a bare key string in license.dat is accepted", s.state === "licensed" && s.serial === "ABCD0007");

console.log("");
if (failures) {
  console.error(`  ${failures} check(s) FAILED\n`);
  process.exit(1);
}
console.log("  all checks passed\n");
