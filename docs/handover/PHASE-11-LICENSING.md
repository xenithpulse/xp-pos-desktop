# Phase 11 — Trial period and licensing

**Status:** **engineering DONE** — 30-day trial, offline activation, graduated
enforcement and the vendor-side issuing tools are built, type-clean and covered
by an executable test. What remains is **operational**, not code: back up the
signing key, and run the on-box checklist at the end of this document.

**Depends on:**
- **Phase 9 (code signing)** — the trial is downloaded from your website by
  strangers. An unsigned installer triggers a SmartScreen warning on every
  download, which is a conversion problem, not an aesthetic one.
  *Still outstanding: the certificate has not been purchased.*
- **Phase 10 (remote update)** — done. The escape hatch exists before the thing
  that might need it, which was the point of the ordering.

**Risk:** HIGH. This is the only phase that can lock a paying customer out of
their own restaurant. Read "Failure modes" before changing anything.

> **Why remote update came first.** A licensing bug does not present as a
> cosmetic glitch — it presents as a restaurant unable to take orders. If you
> can push a fix remotely that is a bad afternoon; if you cannot, it is a site
> visit during service.
>
> Phase 10 established a machine identity and a XenithPulse-side endpoint.
> **Both are reused.** `lib/updates/paths.ts` answers "where may this box write"
> and licensing imports that answer rather than deriving its own; the siteId in
> `lib/updates/identity.ts` is untouched and unduplicated.

Read `docs/handover/README.md` first for project state and ground rules.

---

## Goal

Ship a 30-day trial from the XenithPulse website. After 30 days the POS requires
a purchased licence. Unlicensed copies must not keep working indefinitely.

## The constraint that shapes everything

**This is an offline, on-premises appliance.** It runs on a restaurant's LAN,
frequently with no internet at all — that is a selling point, not an accident.
So:

- You **cannot** require a licence server call to start the POS.
- You **cannot** rely on the clock being honest; a user can set it back.
- You **cannot** lock the box to hardware so tightly that replacing a failed
  disk bricks a paying customer.

Licensing therefore works **fully offline after activation**, and degrades
safely rather than catastrophically. Nothing in `lib/licensing` makes a network
call of any kind. There is no code path in it that can.

## Failure modes — what was designed against

Ranked by how much damage they do to the business. Every ambiguous case in
`lib/licensing/status.ts` resolves *towards the customer keeping their POS*, and
that ranking is why.

1. **A paying customer is locked out mid-service.** Unacceptable, and the reason
   for: the 14-day grace period, `resolve()` failing **open** on an internal
   error, a fingerprint that cannot be read never restricting anything, and the
   enforcement split that leaves open orders closeable.
2. **A hardware change invalidates a valid licence.** Four signals are stored,
   three must match. A replaced disk, a new dock or a swapped NIC changes at
   most one.
3. **Clock rollback grants an unlimited trial.** A monotonic high-water mark is
   persisted; time is counted as `max(now, highWater)`.
4. **A licence file copied to a second box runs two restaurants for one fee.**
   The licence is signed against the fingerprint, and a box that never recorded
   a valid licence gets **no** grace period — so a copied `license.dat` buys
   nothing at all, not even two weeks.

---

## What was built

### `lib/licensing/`

| File | What it is |
|---|---|
| `paths.ts` | Where the two files live. Reuses `lib/updates/paths.ts`'s data root — deliberately does not derive its own. |
| `keys.ts` | The Ed25519 **public** key, compiled in. Not a setting; see below. |
| `format.ts` | Wire format: Crockford base32, the 26-byte payload, machine codes, signature verification. |
| `fingerprint.ts` | The four hardware signals, their digests, and the 3-of-4 match rule. |
| `registry.ts` | The `HKLM\SOFTWARE\XenithPulse\XP POS` backstop, via `reg.exe`. |
| `store.ts` | Atomic read/write of `license.dat` and `license-state.json`. |
| `trial.ts` | Trial start from three sources (oldest wins) and the monotonic clock. |
| `status.ts` | The state machine. One place decides what a box is entitled to. |
| `activate.ts` | Key string → activated licence, offline. |
| `enforce.ts` | The 402 gate. |

### Machine fingerprint

Four weak signals rather than one strong one, **three of which must still
match**:

| Slot | Source | Behaviour |
|---|---|---|
| `machine` | `HKLM\SOFTWARE\Microsoft\Cryptography` MachineGuid | survives hardware changes, resets on OS reinstall |
| `board` | `Win32_BaseBoard.SerialNumber` | survives an OS reinstall |
| `cpu` | `Win32_Processor.ProcessorId` | as above |
| `net` | primary physical NIC MAC, PCI-attached preferred | weak on purpose — it is allowed to be the one that disagrees |

Only a **4-byte digest** of each is stored or transmitted; a machine code is not
a hardware inventory of the customer's box. BIOS junk (`To be filled by O.E.M.`,
`Default string`, all-one-character values) is treated as **absent**, because
otherwise every cheap small-form-factor box would share a fingerprint and one
licence would validate on all of them.

The required-match count scales with how many signals the *issuing* box could
read (4→3, 3→2), so a machine that only ever had three is not held to a standard
it cannot meet. `issue.mjs` refuses to issue against fewer than three without
`--allow-weak`.

### Licence file and key string

`C:\ProgramData\XP POS\license.dat` — JSON wrapping one field, `key`. A bare key
string saved into that file also works, because a technician who pasted it into
Notepad has done something entirely reasonable.

The key is **the same bytes either way**, so "emailed the file" and "read it
down the phone" are one code path with one failure mode. It is 144 characters in
24 groups of six:

```
0400JS-GATF0A-QP5X4R-EEPGRX-MBRETG-9PRJ27
F4DAR3-6C73HR-9GH4S3-QY7JM7-GP9AZH-EVK9CR
…
```

Payload (26 bytes) + Ed25519 signature (64 bytes), Crockford base32. Crockford
because it has no `I`, `L`, `O` or `U` and its decoder absorbs the substitutions
a human makes anyway — `0`/`O` and `1`/`l` are accepted either way round, as are
lower case, spaces, dashes and line breaks.

**Signed asymmetrically.** Only the public key ships. The private key is at
`~/.xenithpulse/licence-signing-key.pem` on the issuing machine and **nowhere
else** — see "Operational" below.

`lib/licensing/format.ts` and `tools/licensing/lib/codec.mjs` are two
implementations of the same format and both carry a warning saying so. They are
separate because one is compiled into the customer's bundle by Next and one runs
under bare `node` on the issuing laptop with no build step.

### Trial

Started on first run, cross-checked against three places, **oldest wins**:

1. `license-state.json` in the data root
2. `HKLM\SOFTWARE\XenithPulse\XP POS`, written by `provision.ps1` — deliberately
   **not** by `setup.iss`, because Inno Setup would delete a key it created when
   the product is uninstalled, and uninstall/reinstall would then be a free
   trial reset
3. the first admin account's `createdAt`

Whichever source is missing is written back, so the answer converges. Deleting
`ProgramData` restores from the registry; clearing the registry restores from
the file; doing both restores from the database.

Clock handling: the highest timestamp ever seen is persisted, and licensing
counts with `max(now, highWater)`. Winding the clock back does not extend
anything — it freezes the count. A box with a dead CMOS battery that boots
thinking it is 1980 therefore **warns and keeps working**, which is the honest
failure this had to be told apart from the two attacks.

### Enforcement — graduated, never abrupt

| State | Behaviour | Implemented as |
|---|---|---|
| Trial, > 7 days left | Normal. Small pill in the corner. | `LicenseNotice` |
| Trial, ≤ 7 days | Persistent, non-dismissible banner. | `LicenseNotice` |
| Trial expired | **POS does not stop.** Read-only: open orders still closeable, payable and printable. Blocking dialog on management screens only. | `enforce.ts` + `LicenseNotice` |
| Licensed | Silent. | — |
| Licence invalid on a previously licensed box | 14-day grace, loud warnings, *then* restrict. | `status.ts` |

**What "read-only" blocks, exactly:** creating a **new** order, and changes to
the menu, staff accounts and settings. Nothing else. `PATCH`/`PUT` on an
existing order is deliberately **not** gated — a restaurant whose trial ends at
20:00 on a Friday still has fifteen tables mid-meal.

### Where enforcement lives

Server-side, in the app process:

- `lib/auth.ts` — `isAdminRequest({ license: "write" })`, opted into per route.
  It runs **after** authentication, so an unauthenticated caller still gets 401
  and learns nothing about the licence state.
- `instrumentation.ts` — a startup warm-up so the first till operation after a
  power cut reads a cached answer instead of waiting on WMI. Wrapped and not
  awaited, exactly like the update agent.

Gated routes: `POST /api/orders`, `POST/PUT/DELETE` on `/api/menu/items`,
`/api/menu/categories`, `/api/admin`, and `PUT /api/settings`.

Status is cached in memory for five minutes and invalidated on activation.
`getLicenseStatus()` never throws; on an internal error it **fails open** with a
logged line, because restricting a restaurant because of a bug in the code that
decides whether to restrict it is failure mode 1 with extra steps.

Nothing in the browser decides anything. `components/layout/LicenseNotice.tsx`
renders what the server already decided; deleting it with DevTools removes the
message and changes nothing about what the POS will do.

### Activation flow

1. POS shows the machine code: **Server Management → Licence**, 32 characters in
   8 groups, with a copy button.
2. Technician reads or pastes it to XenithPulse.
3. XenithPulse runs
   `node tools/licensing/issue.mjs --machine "<code>" --days 365 --to "Name"`
   (or `--perpetual`, and `--out license.dat` to produce a file).
4. Technician pastes the key into the same screen and presses Activate — **or**
   drops `license.dat` into `C:\ProgramData\XP POS` and restarts `XPPOS-App`.

No internet at any step. The issuing side has no database and no lookup: the
machine code *is* the fingerprint.

Activation **refuses** a key it cannot fully accept rather than writing a broken
licence file for the technician to discover after they have driven away.

## What you are actually protecting

Unchanged from the original brief, and worth re-reading before anybody proposes
hardening this further.

The shipped app is **minified JavaScript**, not compiled machine code. A
determined person with a debugger can patch out the server-side check. That is
fine. This stops casual copying between restaurants and makes the honest path
easy; it does not defeat a skilled attacker, and no amount of further work in
this repo would change that without bytecode compilation or a native addon —
both of which would violate the project's "pure JS, no native deps" constraint
and are a separate decision.

Two deliberate holes, both documented where they are:

- **A box that can read no hardware signals at all** validates a
  signature-correct licence without a machine check. Blocking WMI is therefore a
  bypass — but only for somebody who already has a genuinely signed licence.
  Failure mode 1 outranks failure mode 4, and a POS restricted because Windows
  would not answer a question is not acceptable.
- **The public key is a compiled-in constant with no `.env` override.** That is
  the hole *not* taken: a `POS_LICENSE_PUBLIC_KEY` setting would put a documented
  bypass in a world-readable file on the customer's own box.

---

## Operational — do these before selling anything

- [ ] **Back up the signing key.** It is at
      `~/.xenithpulse/licence-signing-key.pem` on the machine that generated it
      and nowhere else. Losing it means **no licence can ever be issued again**
      for any installation already in the field, because the matching public key
      is compiled into shipped builds. Put it somewhere offline. Do not commit
      it — `.gitignore` covers `*.pem`, and `build.ps1` asserts no private key
      material reaches a payload, but neither helps if it is renamed.
- [ ] Decide the retail expiry policy: `--perpetual` or `--days N`. A dated
      licence gets a "expires in N days" warning in the last 30 days and then a
      14-day grace period, so an annual model degrades gently.
- [ ] Decide what an **uninstall** should do. Today: the uninstaller already
      prompts before deleting `ProgramData` and defaults to keeping it, so a
      licence survives uninstall/reinstall. The trial marker in HKLM survives
      **regardless**, on purpose.

## Verifying it

`node tools/licensing/e2e.mjs` compiles `lib/licensing` and drives the real
modules against a throwaway data root. 26 checks, covering every acceptance
criterion that does not need a client box. Run it after any change in here.

`node tools/licensing/issue.mjs --selftest` round-trips a key through the
issuing codec.

## Acceptance criteria

- [x] `npx tsc --noEmit` clean; `.\installer\build.ps1` green
- [x] Fresh install starts a 30-day trial with no internet connection
- [x] Trial state survives a reboot and an app-service restart *(state file +
      registry + database; the process-restart half is covered by `e2e.mjs`, the
      service-restart half is on the on-box list below)*
- [x] Deleting `license.dat` does **not** reset the trial
- [x] Setting the clock back does **not** extend the trial
- [x] A valid licence activates fully offline from a key string
- [x] An activated licence survives losing `license-state.json`; it lives in
      `ProgramData`, which the installer never touches *(upgrade + re-provision
      is on the on-box list)*
- [x] Copying `license.dat` to a different machine fails validation — and gets
      no grace period
- [x] Replacing a disk (or changing one fingerprint signal) does **not**
      invalidate a valid licence
- [x] Expired trial does not prevent closing an order that is already open
      *(order `PATCH`/`PUT` is not gated; only `POST` is)*
- [x] Enforcement cannot be bypassed by editing browser JS or DevTools
      *(every decision is server-side; the client renders only)*

### Still to confirm on a real box

These four need an actual install and are the only things `e2e.mjs` cannot
reach. None of them is expected to fail; they are the ones that would be
embarrassing to have assumed.

1. **Registry backstop.** Install, confirm
   `HKLM\SOFTWARE\XenithPulse\XP POS\TrialStartedAt` exists, delete
   `C:\ProgramData\XP POS\license-state.json`, restart `XPPOS-App`, confirm the
   trial did **not** reset to 30 days.
2. **Upgrade.** Activate a licence, run an upgrade install over the top, confirm
   the POS is still licensed and `license.dat` is untouched.
3. **`provision.ps1` re-run.** Same, after re-running provisioning as
   Administrator.
4. **HTTP enforcement.** With the trial forced expired, confirm `POST
   /api/orders` returns **402** and `PATCH /api/orders/<id>` still returns 200.

## Watch out for

- **Upgrades must not wipe the licence.** It lives in `C:\ProgramData\XP POS`,
  which the installer never touches — keep it that way. `provision.ps1` writes
  the trial marker but never reads, writes or removes `license.dat`, and there
  is a comment there saying so.
- The clock on an appliance can legitimately be wrong (dead CMOS battery, no NTP
  on an offline LAN). `trial.ts` distinguishes "wrong" from "tampered": a box
  that boots thinking it is 1980 warns and keeps working.
- **Do not add a licensing setting to `.env`.** It is plain text on the
  customer's box. There is a section in `.env.example` explaining that the
  absence of settings there is the design.
- `NEXT_PUBLIC_*` is inlined into the browser bundle. No licensing material goes
  near it, and none does today.
- **Do not rotate the signing key** casually. Every licence in the field was
  signed by the current one, and a new key drops the whole fleet into a 14-day
  grace period on their next upgrade. If it is ever compromised that is a
  planned migration with a build that trusts both keys during the overlap.
- If you change the wire format, change **both** `lib/licensing/format.ts` and
  `tools/licensing/lib/codec.mjs` in the same commit, bump `FORMAT_VERSION` in
  both, and keep the decoder able to read the old value — or every licence
  already issued stops working.
