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

## BUILT 2026-08-05: issuing from the XenithPulse ERP (Model A)

Licences can now be issued from the ERP: paste the machine code, get the key.
`E:\Xenith_Main\erp`, page at `/licenses`.

| Piece | Where |
|---|---|
| Licence minting | `lib/licensing/signer.ts` |
| Wire format | `lib/licensing/codec.mjs` — **verbatim copy**, see below |
| Format vectors | `lib/licensing/vectors.mjs` |
| Issue endpoint | `app/api/licenses/issue/route.ts` — **super_admin only** |
| Ledger | `app/api/licenses/route.ts`, `models/schemas/licenseKey.schema.ts` |
| UI | `features/Licenses/index.tsx` |

**The signing key is on the ERP, and the ERP is public and internet-facing.**
That was chosen deliberately over the alternatives, with the exposure
understood: a compromise there can mint unlimited valid licences for every box
ever shipped, and an offline product cannot revoke them. Rotating the key is
not an escape — it drops the whole fleet into a 14-day grace period.

What limits the damage, and what does not:

- The key is stored **encrypted** (AES-256-GCM, scrypt) in
  `LICENCE_SIGNING_KEY_ENC`. Produce it with `node
  tools/licensing/protect-key.mjs`.
- **The passphrase is never stored on the server** — not in an env var, not in
  the database, not cached between requests. The operator types it on every
  issue. That separation is the entire protection: a leaked environment, a
  database dump, a stale container image or a screenshot of the env panel all
  leak ciphertext and nothing else.
- It does **not** stop an attacker with code execution on the ERP at the moment
  somebody issues a licence. Nothing can, while the server is the thing
  signing. That is the accepted cost.

If anyone ever "helpfully" caches the passphrase to save typing, this design is
gone and the key may as well be stored in plaintext.

### Three copies of the wire format now exist

`lib/licensing/format.ts` (product), `tools/licensing/lib/codec.mjs` (CLI), and
the ERP's `lib/licensing/codec.mjs`. The third is a **byte-identical copy** of
the second, on purpose — `diff` between them is itself the drift check. Do not
tidy it, do not add a header, do not port it to TypeScript. Types live beside it
in `codec.d.ts` precisely so the copy can stay identical.

Drift here does not fail at issue time. The ERP prints a perfect-looking key and
the **customer** discovers it days later, offline, with a technician on site. So:

- `node tools/licensing/vectors.mjs` pins the format against frozen expectations
  (deterministic Ed25519 output for fixed inputs). `signer.ts` calls this
  **before every issue** and refuses to mint if it fails.
- `node tools/licensing/cross-check-erp.mjs` closes the loop across both repos:
  it mints with the ERP's code and verifies with the **product's** compiled
  `format.ts` and real public key. Run it after touching anything in
  `lib/licensing`, `tools/licensing`, or the ERP's `lib/licensing`.
  **Verified passing 2026-08-05**, dated and perpetual, both editions, with the
  wrong-passphrase / mistyped-code / too-few-signals refusals all still
  refusing.

  It runs the real `protect-key.mjs` as a subprocess rather than reimplementing
  the wrapping. That is not incidental: the first version inlined the
  scrypt/AES calls, agreed with itself, and **missed a live bug** —
  `protect-key.mjs` was calling `scryptSync` without `maxmem`, so the tool an
  operator actually runs died with `ERR_CRYPTO_INVALID_SCRYPT_PARAMS` while the
  test passed. If you extend this harness, drive the real entry points.

### Gotchas already paid for in `protect-key.mjs`

Three bugs found by running it rather than reading it, all now fixed and
commented in place. Worth knowing before touching that file:

- **`maxmem` is required.** Node's scrypt default is 32 MB; `N=2^15` needs
  slightly more. Present in `signer.ts`, missing here — the two must agree on
  `N`, `r`, `p` or blobs become undecryptable, and the symptom is the useless
  "that passphrase did not unlock the signing key".
- **One readline interface, read through its async iterator.** A fresh
  interface per prompt, or `rl.question()`, drops the second answer when stdin
  is a pipe — readline emits all buffered lines before the next callback
  registers. That only shows up in a test, which is exactly when you need it to
  work.
- **It verifies its own blob before printing it**, decrypting back and
  comparing to the PEM. Same principle as `issue.mjs` verifying a licence
  before handing it over.

Do not regenerate vectors to clear a failure. Read the note at the top of
`vectors.mjs`.

## Still worth doing later: a pre-signed key pool ("Model B")

**Not built. Superseded for now by the ERP issuing above**, which solves the
immediate problem. Kept because it remains the better answer at volume, and
because it is the only version that lets a key be sold before the machine
exists.

### Why

The flow above needs the machine code *before* a key can exist. That is two
round trips with a restaurant owner, and it makes a licence impossible to
sell in advance — no emailing a key on payment, no card in a box. The ask was
"why can't it work like a Windows product key", and the honest answer is that
it can, once you see what Microsoft actually does: their key is **not** bound
to your PC when it is printed. Their *server* binds it at activation and
remembers it was used.

### The shape

Keys are generated in batches **offline**, signed, and **not machine-bound**:

```
node tools/licensing/mint-pool.mjs --count 100 --days 365 --out pool.csv
```

The ERP stores that CSV as inventory — `unsold → sold → activated` against a
Client. The customer types the key; the box verifies the signature offline
and licenses itself. No machine code, no round trip, works with the internet
unplugged exactly as today.

**The private key never touches the ERP.** That is the whole point of minting
offline in batches, and it is not negotiable now that the ERP is confirmed
public and internet-facing. An ERP that could sign on demand is an ERP whose
compromise mints unlimited valid licences for every box ever shipped — with
no revocation, because the product is offline by design.

### What this gives up, stated plainly

Today a copied `license.dat` is **refused** — the signature is over the
fingerprint, so it simply does not validate elsewhere. An unbound key
**cannot** have that property: anything the box can verify with no network is
something it will verify on any box.

So the anti-copy guarantee weakens from *prevented* to *detected*. When a box
has internet it reports `{serial, siteId, activatedAt}`; the ERP flags a
serial seen under two different siteIds and you handle it commercially. A box
that never connects is never seen — accepted, because this is failure mode 4
and it ranks below every other one in the list at the top of this document.

If that trade ever looks wrong, Model A above is still the stronger scheme and
nothing here deletes it. **Keep both.** An unbound pool key is the retail
path; a machine-bound key stays the right answer for a site that needs the
hard guarantee, and for re-issuing against replaced hardware.

### Wire format — the part to get right

Read "Watch out for" at the end of this document first. The rule stands: change
`lib/licensing/format.ts` **and** `tools/licensing/lib/codec.mjs` in the same
commit, and keep the decoder able to read every value already issued.

Add an **unbound variant**, do not repurpose the machine digest fields:

- A flag in the payload says "this licence is not machine-bound." Decoders
  that predate it must fail closed on an unknown flag rather than ignore it —
  a licence a shipped build cannot understand must not be silently accepted.
- Bump `FORMAT_VERSION` in both files. Existing machine-bound licences keep
  validating; that is what the version is for.
- `status.ts` gains one branch: unbound and signature-valid → licensed, skip
  the fingerprint comparison entirely. It must **not** fall through to the
  3-of-4 check with a zeroed fingerprint, which would compare zeros against
  real hardware and fail.

### ERP side (xp-enterprise / erp)

A `LicenseKey` model: `product`, `serial`, `keyString`, `edition`, expiry,
`status`, `client?`, `soldAt?`, `activatedSiteId?`, `activatedAt?`,
`duplicateSiteIds[]`. Plus a CSV import for a freshly minted batch, assignment
to a Client on sale, and a view listing serials with more than one siteId.

The activation report endpoint must be **advisory only**. The box is already
licensed by the time it calls; a 500 from the ERP, a DNS failure or a
restaurant with no internet must change nothing about whether the POS works.
Same discipline as `GET /api/pos/entitlements` in xp-enterprise, which returns
500 rather than `200 {active:false}` precisely so a server-side fault cannot
read as a confirmed negative.

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

### Two checks fail on any machine that has XP POS actually installed

**This is the test's isolation, not a product bug.** Confirmed 2026-08-05.

```
FAIL  a fresh install starts a 30-day trial  :: trial, 29d
FAIL  trial state survives a process restart
```

Both assert `daysRemaining === 30` on a simulated fresh install. `e2e.mjs`
isolates `POS_DATA_DIR` (line 148) but **not** the registry — and
`HKLM\SOFTWARE\XenithPulse\XP POS\TrialStartedAt` is machine-global. On a box
with a real install, that key holds a trial start from days ago, "oldest wins"
in `trial.ts` picks it over the scratch folder's just-written one, and the
"fresh" trial is correctly reported as already part-used.

Verify rather than assume, if you see this: read the key, then check the
arithmetic lands on the number the test printed.

```powershell
reg query "HKLM\SOFTWARE\XenithPulse\XP POS"
```

Worked example from the day this was found — registry said
`2026-08-03T14:55:06Z`, `now` was `2026-08-04T20:30Z`, so 28.77 days remained
and `Math.ceil` gives **29**, exactly what the test reported. If your numbers
reconcile the same way, the code is fine. If they do not, that IS a
regression — every other check, including all the security-critical ones
(copied licence refused, forged licence refused, clock rollback, grace period
exhaustion), passes regardless of this and should be treated as load-bearing.

The test's own header lists the registry backstop as something it cannot
check because *writes* fail soft without Administrator. That is right as far
as it goes, and it missed that *reads* still succeed and leak in.

Not fixed here, because the obvious fix is worse than the problem: an env var
overriding the key path would be a documented trial-reset bypass sitting in a
world-readable file on the customer's box, which is the exact thing "Do not
add a licensing setting to `.env`" under "Watch out for" forbids. Having the
test delete and restore the real key needs Administrator and risks resetting
a developer's own trial if the restore fails. The honest fix is for `e2e.mjs`
to read the registry itself and either skip those two checks with a loud
message or assert 30 days from the *effective* start — do that when it next
gets in the way, and do not "fix" it by relaxing the assertion to `>= 28`,
which would hide a real off-by-one forever.

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
