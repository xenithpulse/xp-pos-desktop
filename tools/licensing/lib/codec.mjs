// tools/licensing/lib/codec.mjs
//
// The licence wire format, XenithPulse side.
//
// ── THIS IS A MIRROR, AND THERE ARE NOW THREE ───────────────────────────────
//
//   1. lib/licensing/format.ts        compiled into the POS by Next
//   2. tools/licensing/lib/codec.mjs  this file - bare node, issuing machine
//   3. erp lib/licensing/codec.mjs    the XenithPulse ERP issuing page
//
// All three MUST agree byte for byte. They are separate because the product
// half is TypeScript compiled by Next into the customer's bundle, this half
// runs under plain `node` on the issuing machine with no build step and no
// dependencies - a licence has to be issuable from a laptop with nothing
// installed - and the ERP is a third deployment on its own release cycle.
//
// (3) is a VERBATIM COPY of this file, kept byte-identical on purpose so that
// `fc` / `diff` is itself the drift check. Do not "tidy" it on arrival, do not
// add an ERP-specific header, do not convert it to TypeScript. If it needs to
// change, change THIS file and copy it across again.
//
// If you change the payload layout, the signing context, the alphabet or
// FORMAT_VERSION here, change it everywhere in the same commit. `node
// tools/licensing/issue.mjs --selftest` round-trips a key through both halves
// of THIS file, which catches a self-inconsistent edit but cannot catch a
// divergence from the product. `node tools/licensing/vectors.mjs` pins the
// format itself against frozen expectations and DOES catch that - it is what
// the ERP calls before it is allowed to issue anything. Read the header of
// lib/licensing/format.ts.
//
// NOTHING IN THIS DIRECTORY IS SHIPPED. installer/build.ps1 stages
// installer/scripts and the Next standalone bundle; tools/ is not part of
// either, and build.ps1 asserts that no private key material reaches a payload.

import { createHash, createPublicKey, verify as cryptoVerify } from "node:crypto";

export const FORMAT_VERSION = 1;

export const SIGNAL_SLOTS = ["machine", "board", "cpu", "net"];
export const DIGEST_BYTES = 4;
export const BINDING_BYTES = SIGNAL_SLOTS.length * DIGEST_BYTES;

const DAY_EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_DAY = 86_400_000;
export const PERPETUAL_DAY = 0xffff;

const PAYLOAD_BYTES = 26;
const SIGNATURE_BYTES = 64;
export const KEY_BYTES = PAYLOAD_BYTES + SIGNATURE_BYTES;

const SIGNING_CONTEXT = Buffer.from("XPPOS-LICENCE-v1", "ascii");

export const EDITIONS = ["standard", "pro"];

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const DECODE_MAP = (() => {
  const map = Object.create(null);
  for (let i = 0; i < ALPHABET.length; i++) map[ALPHABET[i]] = i;
  map["I"] = 1;
  map["L"] = 1;
  map["O"] = 0;
  map["U"] = map["V"];
  return map;
})();

export function base32Encode(bytes) {
  let out = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text, expectedBytes) {
  const cleaned = String(text).toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (cleaned.length === 0) return null;
  const out = Buffer.alloc(expectedBytes);
  let index = 0;
  let bits = 0;
  let value = 0;
  for (const ch of cleaned) {
    const digit = DECODE_MAP[ch];
    if (digit === undefined) return null;
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      if (index >= expectedBytes) return null;
      out[index++] = (value >>> (bits - 8)) & 0xff;
      bits -= 8;
    }
  }
  return index === expectedBytes ? out : null;
}

export function groupCode(code, size) {
  const groups = [];
  for (let i = 0; i < code.length; i += size) groups.push(code.slice(i, i + size));
  return groups.join("-");
}

export function toDayNumber(date) {
  return Math.floor((date.getTime() - DAY_EPOCH_MS) / MS_PER_DAY);
}

export function fromDayNumber(day) {
  return new Date(DAY_EPOCH_MS + day * MS_PER_DAY);
}

// ── Machine code ─────────────────────────────────────────────────────────────

const MACHINE_CODE_VERSION = 1;
const MACHINE_CHECK_BYTES = 3;
const MACHINE_CODE_BYTES = 1 + BINDING_BYTES + MACHINE_CHECK_BYTES;

function machineCheckBytes(head) {
  return createHash("sha256")
    .update("xppos-machine-code-v1")
    .update(head)
    .digest()
    .subarray(0, MACHINE_CHECK_BYTES);
}

export function encodeMachineCode(binding) {
  const head = Buffer.concat([Buffer.from([MACHINE_CODE_VERSION]), binding]);
  return groupCode(base32Encode(Buffer.concat([head, machineCheckBytes(head)])), 4);
}

/**
 * Decode a machine code read off a customer's POS.
 *
 * Returns null when the check bytes disagree, which on this side of the
 * transaction is the common case and the useful one: it means the code was
 * mistyped on its way to us, and issuing against it would produce a licence
 * bound to a machine that does not exist.
 */
export function decodeMachineCode(text) {
  const bytes = base32Decode(text, MACHINE_CODE_BYTES);
  if (!bytes) return null;
  if (bytes[0] !== MACHINE_CODE_VERSION) return null;
  const head = bytes.subarray(0, 1 + BINDING_BYTES);
  if (!machineCheckBytes(head).equals(bytes.subarray(1 + BINDING_BYTES))) return null;
  return Buffer.from(head.subarray(1));
}

/** How many of the four fingerprint signals the customer's box could read. */
export function countSignals(binding) {
  let n = 0;
  for (let i = 0; i < SIGNAL_SLOTS.length; i++) {
    const slot = binding.subarray(i * DIGEST_BYTES, (i + 1) * DIGEST_BYTES);
    if (!slot.equals(Buffer.alloc(DIGEST_BYTES))) n++;
  }
  return n;
}

// ── Payload ──────────────────────────────────────────────────────────────────

export function encodePayload({ edition, issuedDay, expiryDay, serial, binding }) {
  const editionIndex = EDITIONS.indexOf(edition);
  if (editionIndex < 0) throw new Error(`unknown edition ${edition}`);
  if (binding.length !== BINDING_BYTES) throw new Error(`binding must be ${BINDING_BYTES} bytes`);
  const buf = Buffer.alloc(PAYLOAD_BYTES);
  buf[0] = FORMAT_VERSION;
  buf[1] = editionIndex;
  buf.writeUInt16BE(issuedDay, 2);
  buf.writeUInt16BE(expiryDay, 4);
  buf.writeUInt32BE(serial >>> 0, 6);
  binding.copy(buf, 10);
  return buf;
}

export function decodePayload(buf) {
  if (buf.length !== PAYLOAD_BYTES) return null;
  const edition = EDITIONS[buf[1]];
  if (!edition) return null;
  return {
    formatVersion: buf[0],
    edition,
    issuedDay: buf.readUInt16BE(2),
    expiryDay: buf.readUInt16BE(4),
    serial: buf.readUInt32BE(6),
    binding: Buffer.from(buf.subarray(10)),
  };
}

export function signingMessage(payloadBytes) {
  return Buffer.concat([SIGNING_CONTEXT, payloadBytes]);
}

export function formatLicenseKey(keyBytes) {
  return groupCode(base32Encode(keyBytes), 6);
}

export function formatSerial(serial) {
  return (serial >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

/** Verify a key we just issued, with the public half of the signing key. */
export function verifyLicenseKey(text, publicKeySpkiBase64) {
  const bytes = base32Decode(text, KEY_BYTES);
  if (!bytes) return { ok: false, detail: "not a complete licence key" };
  const payloadBytes = bytes.subarray(0, PAYLOAD_BYTES);
  const payload = decodePayload(Buffer.from(payloadBytes));
  if (!payload) return { ok: false, detail: "unreadable payload" };
  const key = createPublicKey({
    key: Buffer.from(publicKeySpkiBase64, "base64"),
    format: "der",
    type: "spki",
  });
  const valid = cryptoVerify(
    null,
    signingMessage(Buffer.from(payloadBytes)),
    key,
    bytes.subarray(PAYLOAD_BYTES)
  );
  return valid ? { ok: true, payload } : { ok: false, detail: "signature does not verify" };
}
