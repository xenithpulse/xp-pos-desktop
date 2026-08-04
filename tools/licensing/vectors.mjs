// tools/licensing/vectors.mjs
//
// Frozen test vectors for the licence wire format.
//
// WHY THIS EXISTS
//
// The format now has THREE implementations:
//
//   1. lib/licensing/format.ts        compiled into the POS by Next
//   2. tools/licensing/lib/codec.mjs  bare node, on the issuing machine
//   3. erp lib/licensing/codec.mjs    the XenithPulse ERP issuing page
//
// Two was already a liability the phase document warns about. Three cannot be
// held in one person's head, and the failure it produces is the worst kind:
// nothing breaks at issue time, the ERP happily prints a key, and it is the
// CUSTOMER whose activation fails - on a box that may have no internet, days
// later, with a technician already on site.
//
// A shared package would be the textbook answer and is the wrong one here: the
// POS bundles its copy through Next's compiler, the tools run under bare node
// with no build step, and the ERP is a separate deployment on a separate
// release cycle. Making them share a dependency couples three release cycles to
// remove a duplication that a test can catch for free.
//
// So instead: these vectors pin the format itself. Given a FIXED private key
// and FIXED inputs, Ed25519 signing is deterministic - the same bytes in must
// produce exactly the same key string out, in every implementation, forever.
// Any drift in payload layout, base32 alphabet, grouping or signing message
// changes the output and fails here.
//
// THE KEY BELOW IS A THROWAWAY, generated for this file and used nowhere else.
// It is not the XenithPulse signing key, it signs nothing real, and a licence
// minted with it validates on no shipped build - the public key compiled into
// the product is a different one. It is in the repo on purpose, because a test
// vector nobody can reproduce is not a test vector.
//
//   node tools/licensing/vectors.mjs            verify this implementation
//   node tools/licensing/vectors.mjs --print    regenerate (see REGENERATING)
//
// REGENERATING
//
// Do not regenerate to make a failing check pass. A changed vector means a
// changed format, which means every licence already issued must still decode -
// that is what FORMAT_VERSION is for, and it is a deliberate migration, not a
// green test. Regenerate only when you have bumped FORMAT_VERSION on purpose,
// and keep the OLD vectors alongside the new ones so the decoder is proven to
// still read them.

import { createPrivateKey, createPublicKey, sign as cryptoSign } from "node:crypto";
import {
  decodeMachineCode,
  encodeMachineCode,
  encodePayload,
  formatLicenseKey,
  signingMessage,
  verifyLicenseKey,
} from "./lib/codec.mjs";

export const TEST_PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIENkWI+Wz4XNZ76i6L3VwLs57eQrMPvc5vA+7KhJ9PRn
-----END PRIVATE KEY-----`;

/**
 * Inputs chosen to exercise the parts that silently differ between two
 * hand-written implementations of the same format: a binding with high bytes
 * and zero bytes, a serial that uses the full 32 bits, both editions, and both
 * a dated expiry and the perpetual sentinel.
 */
export const VECTORS = [
  {
    name: "standard, dated expiry",
    bindingHex: "000102030405060708090a0b0c0d0e0f",
    edition: "standard",
    issuedDay: 20000,
    expiryDay: 20365,
    serial: 1,
    expected:
      "0404W8-2FHM00-000100-0G40R4-0M30E2-09185G-R38E1Y-ZHPYTA-QK7B3P-XADQHR-5GSK6E-2TKDHR-MWZFX6-6QY0H5-H9JXR9-V19VRW-CEPWCB-SPVY11-2GWGG3-FM5888-AY545K-RM40TJ-D4TMFV-XHSHGE",
    expectedMachineCode: "0400-20G3-0G2G-C1R8-1450-P30D-1R7X-7CQN",
  },
  {
    name: "pro, perpetual, full-width serial",
    bindingHex: "fffefdfcfbfaf9f8f7f6f5f4f3f2f1f0",
    edition: "pro",
    issuedDay: 20000,
    expiryDay: 65535,
    serial: 4294967295,
    expected:
      "040MW8-7ZZZZZ-ZZZZZZ-ZFVZ7V-ZBWZHX-ZPYQTF-7WQHY2-MBCB7N-0XAV3Y-4B3CY0-4ST61K-E7ER6J-SBWTEJ-T81EMR-42SDSV-04Y8CB-ZBNJ67-1VCN01-WM6M88-9KMVSP-5ZRX2X-9XGB4G-MRS1Q2-RXGMGE",
    expectedMachineCode: "07ZZ-XZFW-ZFXF-KY7Q-YVTZ-9WZJ-Y7R4-V0DH",
  },
  {
    name: "zero binding, zero serial",
    bindingHex: "00000000000000000000000000000000",
    edition: "standard",
    issuedDay: 0,
    expiryDay: 1,
    serial: 0,
    expected:
      "040000-000400-000000-000000-000000-000000-000000-KM7DZP-19V7E7-TRW9JP-AKFGDV-RNA937-QJNEWE-9YWNEH-HYVGV5-7PJS6G-AKRHPM-YEZEWN-9ZA7DS-G2H8S5-ATH00Y-EV1BP5-AKTJNM-T7F406",
    expectedMachineCode: "0400-0000-0000-0000-0000-0000-0009-TRNJ",
  },
];

/** Mint deterministically. Mirrors issue.mjs's mint(), minus the randomness. */
function mintFixed(privateKey, v) {
  const payloadBytes = encodePayload({
    edition: v.edition,
    issuedDay: v.issuedDay,
    expiryDay: v.expiryDay,
    serial: v.serial,
    binding: Buffer.from(v.bindingHex, "hex"),
  });
  const signature = cryptoSign(null, signingMessage(payloadBytes), privateKey);
  return formatLicenseKey(Buffer.concat([payloadBytes, signature]));
}

/**
 * Check this implementation against the frozen expectations.
 *
 * Returns { ok, failures[] } rather than throwing or exiting, so the ERP can
 * call it at startup and refuse to issue rather than taking the process down.
 */
export function checkVectors() {
  const privateKey = createPrivateKey(TEST_PRIVATE_KEY_PEM);
  const publicSpki = createPublicKey(privateKey)
    .export({ format: "der", type: "spki" })
    .toString("base64");

  const failures = [];

  for (const v of VECTORS) {
    let key;
    try {
      key = mintFixed(privateKey, v);
    } catch (err) {
      failures.push(`${v.name}: minting threw - ${err.message}`);
      continue;
    }

    if (v.expected && key !== v.expected) {
      failures.push(
        `${v.name}: key string changed\n      expected ${v.expected}\n      actual   ${key}`
      );
      continue;
    }

    // Round-trip through the verifier too. A format change that altered BOTH
    // the encoder and the expectation in the same way would slip past the
    // string comparison; this catches the payload no longer meaning what it did.
    const check = verifyLicenseKey(key, publicSpki);
    if (!check.ok) {
      failures.push(`${v.name}: minted key does not verify - ${check.detail}`);
      continue;
    }
    if (check.payload.serial !== v.serial) {
      failures.push(`${v.name}: serial decoded as ${check.payload.serial}, expected ${v.serial}`);
    }
    if (check.payload.binding.toString("hex") !== v.bindingHex) {
      failures.push(`${v.name}: binding did not round-trip`);
    }
  }

  // Machine codes are what a human reads down a phone, so pin their encoding
  // separately - the licence key could be byte-identical while the machine
  // code grouping or check characters drifted.
  for (const v of VECTORS) {
    const binding = Buffer.from(v.bindingHex, "hex");
    const code = encodeMachineCode(binding);
    if (v.expectedMachineCode && code !== v.expectedMachineCode) {
      failures.push(
        `${v.name}: machine code changed\n      expected ${v.expectedMachineCode}\n      actual   ${code}`
      );
      continue;
    }
    const back = decodeMachineCode(code);
    if (!back || !back.equals(binding)) {
      failures.push(`${v.name}: machine code did not round-trip`);
    }
  }

  return { ok: failures.length === 0, failures };
}

// ── CLI ──────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && process.argv[1].endsWith("vectors.mjs");
if (isMain) {
  if (process.argv.includes("--print")) {
    const privateKey = createPrivateKey(TEST_PRIVATE_KEY_PEM);
    console.log("\n  Paste these into VECTORS as `expected` / `expectedMachineCode`:\n");
    for (const v of VECTORS) {
      console.log(`  ${v.name}`);
      console.log(`    expected:           ${JSON.stringify(mintFixed(privateKey, v))}`);
      console.log(
        `    expectedMachineCode: ${JSON.stringify(encodeMachineCode(Buffer.from(v.bindingHex, "hex")))}`
      );
      console.log("");
    }
    process.exit(0);
  }

  const { ok, failures } = checkVectors();
  if (ok) {
    console.log(`\n  Licence format vectors OK (${VECTORS.length} vectors).\n`);
    process.exit(0);
  }
  console.error("\n  LICENCE FORMAT DRIFT\n");
  for (const f of failures) console.error(`    FAIL  ${f}`);
  console.error(
    "\n  This implementation no longer produces the same bytes as the one these\n" +
      "  vectors were frozen from. A licence minted here may not activate on a\n" +
      "  customer's box. Do not regenerate the vectors to clear this - read the\n" +
      "  REGENERATING note at the top of this file.\n"
  );
  process.exit(1);
}
