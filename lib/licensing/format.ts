// lib/licensing/format.ts
//
// The wire format of a machine code and a licence key.
//
// ── READ THIS BEFORE CHANGING ANYTHING IN THIS FILE ─────────────────────────
//
// tools/licensing/lib/codec.mjs is a second implementation of everything here.
// It has to be: this file is TypeScript compiled into the customer's app, and
// the issuing tool runs on the XenithPulse side under plain node with no build
// step. A change to one that is not mirrored in the other produces licences the
// product refuses, discovered by a customer rather than by us.
//
// Both files carry FORMAT_VERSION. Bump it in both, and keep the decoder able
// to read the older value, or every licence already issued stops working.
//
// ── Why the format is this shape ────────────────────────────────────────────
//
// A key has to be readable down a phone line to a restaurant with no internet.
// That rules out JSON, base64 (case-sensitive, has + / =) and anything with
// ambiguous glyphs. Crockford base32 has no I, L, O or U, so "1" cannot be read
// back as "l" and "0" cannot become "O", and its decoder accepts the confusions
// a human makes anyway. The payload is a fixed-width binary struct because
// every byte costs the technician another character to read out.
//
// The signature is Ed25519: 64 bytes, in Node's crypto since 12, no native
// dependency - which the project's "pure JS, no native deps" constraint
// requires. RSA would be correct too and four times longer on the phone.

import { createHash, createPublicKey, verify as cryptoVerify } from "crypto";
import { LICENSE_PUBLIC_KEY_SPKI_BASE64 } from "./keys";

export const FORMAT_VERSION = 1;

/** Slots in a fingerprint, in the ONE order they are ever serialised. */
export const SIGNAL_SLOTS = ["machine", "board", "cpu", "net"] as const;
export type SignalSlot = (typeof SIGNAL_SLOTS)[number];

/** Bytes of each signal digest carried in a key. 4 slots x 4 bytes = 16. */
export const DIGEST_BYTES = 4;
export const BINDING_BYTES = SIGNAL_SLOTS.length * DIGEST_BYTES;

/** Days are counted from this date so the whole field fits in 16 bits. */
const DAY_EPOCH_MS = Date.UTC(2020, 0, 1);
const MS_PER_DAY = 86_400_000;

/** An expiry field of 0xFFFF means the licence never expires. */
export const PERPETUAL_DAY = 0xffff;

const PAYLOAD_BYTES = 26;
const SIGNATURE_BYTES = 64;
export const KEY_BYTES = PAYLOAD_BYTES + SIGNATURE_BYTES;

/**
 * Prefixed to the payload before signing.
 *
 * Domain separation: it makes a signature produced for a licence useless as a
 * signature for anything else we might sign with the same key later (an update
 * manifest, say). It costs nothing and closes a whole class of mistake.
 */
const SIGNING_CONTEXT = Buffer.from("XPPOS-LICENCE-v1", "ascii");

export const EDITIONS = ["standard", "pro"] as const;
export type Edition = (typeof EDITIONS)[number];

export interface LicensePayload {
  formatVersion: number;
  edition: Edition;
  /** Whole days since 2020-01-01 UTC. */
  issuedDay: number;
  /** Whole days since 2020-01-01 UTC, or PERPETUAL_DAY. */
  expiryDay: number;
  /** Support reference, shown to humans as 8 hex characters. */
  serial: number;
  /** The 16 bytes of truncated per-signal digests this licence is bound to. */
  binding: Buffer;
}

// ── Crockford base32 ─────────────────────────────────────────────────────────

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const DECODE_MAP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < ALPHABET.length; i++) map[ALPHABET[i]] = i;
  // The confusions a human reading over a phone actually makes. Crockford
  // specifies exactly these, which is most of the reason for choosing it.
  map["I"] = 1;
  map["L"] = 1;
  map["O"] = 0;
  map["U"] = map["V"];
  return map;
})();

export function base32Encode(bytes: Buffer): string {
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
  // Left-over bits are padded with zeros on the right. The decoder knows the
  // expected byte count, so the padding is never ambiguous.
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * Decode, accepting anything a human or a mail client might have done to it:
 * lower case, dashes, spaces, line breaks, a stray tab.
 *
 * Returns null when a character is not in the alphabet at all, or when the
 * result is not `expectedBytes` long - both mean a mistyped key, and the
 * difference is not worth explaining to the person typing it.
 */
export function base32Decode(text: string, expectedBytes: number): Buffer | null {
  const cleaned = text.toUpperCase().replace(/[^0-9A-Z]/g, "");
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

/** Group a base32 string for a human: `ABCD-EFGH-...`. */
export function groupCode(code: string, size: number): string {
  const groups: string[] = [];
  for (let i = 0; i < code.length; i += size) groups.push(code.slice(i, i + size));
  return groups.join("-");
}

// ── Dates ────────────────────────────────────────────────────────────────────

export function toDayNumber(date: Date): number {
  return Math.floor((date.getTime() - DAY_EPOCH_MS) / MS_PER_DAY);
}

export function fromDayNumber(day: number): Date {
  return new Date(DAY_EPOCH_MS + day * MS_PER_DAY);
}

// ── Machine code ─────────────────────────────────────────────────────────────
//
// What the technician reads off the POS and gives to XenithPulse. It is not a
// secret and it is not an identifier we look up - it IS the fingerprint, so the
// issuing side needs no database to bind a licence to this box.

const MACHINE_CODE_VERSION = 1;
const MACHINE_CHECK_BYTES = 3;
const MACHINE_CODE_BYTES = 1 + BINDING_BYTES + MACHINE_CHECK_BYTES; // 20 -> 32 chars

function machineCheckBytes(head: Buffer): Buffer {
  return createHash("sha256")
    .update("xppos-machine-code-v1")
    .update(head)
    .digest()
    .subarray(0, MACHINE_CHECK_BYTES);
}

/**
 * Encode a binding as the code shown on the POS.
 *
 * The check bytes are not security, they are ergonomics: they catch a
 * transposed pair of characters at the point the technician pastes the code
 * into our site, instead of producing a licence bound to a machine that does
 * not exist and a support call three days later.
 */
export function encodeMachineCode(binding: Buffer): string {
  if (binding.length !== BINDING_BYTES) {
    throw new Error(`binding must be ${BINDING_BYTES} bytes`);
  }
  const head = Buffer.concat([Buffer.from([MACHINE_CODE_VERSION]), binding]);
  const bytes = Buffer.concat([head, machineCheckBytes(head)]);
  return groupCode(base32Encode(bytes), 4);
}

export function decodeMachineCode(text: string): Buffer | null {
  const bytes = base32Decode(text, MACHINE_CODE_BYTES);
  if (!bytes) return null;
  if (bytes[0] !== MACHINE_CODE_VERSION) return null;
  const head = bytes.subarray(0, 1 + BINDING_BYTES);
  const check = bytes.subarray(1 + BINDING_BYTES);
  if (!machineCheckBytes(head).equals(check)) return null;
  return Buffer.from(head.subarray(1));
}

// ── Licence key ──────────────────────────────────────────────────────────────

export function encodePayload(payload: LicensePayload): Buffer {
  const editionIndex = EDITIONS.indexOf(payload.edition);
  if (editionIndex < 0) throw new Error(`unknown edition ${payload.edition}`);
  if (payload.binding.length !== BINDING_BYTES) {
    throw new Error(`binding must be ${BINDING_BYTES} bytes`);
  }

  const buf = Buffer.alloc(PAYLOAD_BYTES);
  buf[0] = payload.formatVersion;
  buf[1] = editionIndex;
  buf.writeUInt16BE(payload.issuedDay, 2);
  buf.writeUInt16BE(payload.expiryDay, 4);
  buf.writeUInt32BE(payload.serial >>> 0, 6);
  payload.binding.copy(buf, 10);
  return buf;
}

function decodePayload(buf: Buffer): LicensePayload | null {
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

/** The exact bytes that are signed. Shared by the product and the issuer. */
export function signingMessage(payloadBytes: Buffer): Buffer {
  return Buffer.concat([SIGNING_CONTEXT, payloadBytes]);
}

/** Render a key for a human: 144 characters in 24 groups of 6. */
export function formatLicenseKey(keyBytes: Buffer): string {
  return groupCode(base32Encode(keyBytes), 6);
}

export type LicenseRejection =
  | "malformed"
  | "unsupported_version"
  | "no_public_key"
  | "bad_signature";

export interface VerifiedLicense {
  ok: true;
  payload: LicensePayload;
  /** The key as it should be stored, normalised. */
  normalised: string;
}

export interface RejectedLicense {
  ok: false;
  reason: LicenseRejection;
  detail: string;
}

let publicKeyCache: ReturnType<typeof createPublicKey> | null | undefined;

function publicKey() {
  if (publicKeyCache !== undefined) return publicKeyCache;
  const b64 = LICENSE_PUBLIC_KEY_SPKI_BASE64.trim();
  if (!b64) {
    publicKeyCache = null;
    return publicKeyCache;
  }
  try {
    publicKeyCache = createPublicKey({
      key: Buffer.from(b64, "base64"),
      format: "der",
      type: "spki",
    });
  } catch {
    publicKeyCache = null;
  }
  return publicKeyCache;
}

/**
 * Parse and cryptographically verify a licence key.
 *
 * This proves the key was issued by whoever holds the XenithPulse private key.
 * It says NOTHING about whether the licence is for THIS machine or still in
 * date - that is status.ts, deliberately, because those two answers need
 * different handling: a bad signature is a forgery, an expired licence is a
 * renewal conversation.
 */
export function verifyLicenseKey(text: string): VerifiedLicense | RejectedLicense {
  const bytes = base32Decode(text, KEY_BYTES);
  if (!bytes) {
    return {
      ok: false,
      reason: "malformed",
      detail:
        "This is not a complete licence key. Check that every group of " +
        "characters was entered, including the last one.",
    };
  }

  const payloadBytes = bytes.subarray(0, PAYLOAD_BYTES);
  const signature = bytes.subarray(PAYLOAD_BYTES);
  const payload = decodePayload(Buffer.from(payloadBytes));
  if (!payload) {
    return { ok: false, reason: "malformed", detail: "The licence key is not readable." };
  }
  if (payload.formatVersion !== FORMAT_VERSION) {
    return {
      ok: false,
      reason: "unsupported_version",
      detail:
        `This licence uses format ${payload.formatVersion} and this POS understands ` +
        `format ${FORMAT_VERSION}. Update the POS, then activate again.`,
    };
  }

  const key = publicKey();
  if (!key) {
    return {
      ok: false,
      reason: "no_public_key",
      detail:
        "This build has no licence verification key compiled into it, so no licence " +
        "can be checked. This is a build fault - report it to XenithPulse.",
    };
  }

  // `null` as the algorithm is how Node asks for Ed25519 - it has one hash and
  // will reject anything else being named here.
  const valid = cryptoVerify(null, signingMessage(Buffer.from(payloadBytes)), key, signature);
  if (!valid) {
    return {
      ok: false,
      reason: "bad_signature",
      detail:
        "This licence was not issued by XenithPulse, or it has been altered since " +
        "it was issued.",
    };
  }

  return { ok: true, payload, normalised: formatLicenseKey(Buffer.from(bytes)) };
}

/** 8 hex characters, the form a licence is referred to by in support. */
export function formatSerial(serial: number): string {
  return (serial >>> 0).toString(16).toUpperCase().padStart(8, "0");
}
