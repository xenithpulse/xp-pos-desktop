# Phase 11 — Trial period and licensing

**Status:** not started
**Depends on:**
- **Phase 9 (code signing)** — the trial is downloaded from your website by
  strangers. An unsigned installer triggers a SmartScreen warning on every
  download, which is a conversion problem, not an aesthetic one.
- **Phase 10 (remote update)** — strongly recommended first. See below.

**Risk:** HIGH. This is the only phase that can lock a paying customer out of
their own restaurant. Read "Failure modes" before designing anything.

> **Why remote update comes first.** A licensing bug does not present as a
> cosmetic glitch — it presents as a restaurant unable to take orders. If you
> can push a fix remotely that is a bad afternoon; if you cannot, it is a site
> visit during service. Ship the escape hatch before the thing that might need
> it.
>
> Phase 10 will already have established a machine identity and a
> XenithPulse-side endpoint. **Reuse both.** A second, parallel identity scheme
> is how two subsystems end up disagreeing about which machine they are on.

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

Licensing must therefore work **fully offline after activation**, and degrade
safely rather than catastrophically.

## Failure modes — design against these first

Ranked by how much damage they do to the business:

1. **A paying customer is locked out mid-service.** Unacceptable. A restaurant
   that cannot take orders on a Friday night will not renew, and will tell
   people. Expiry must never hard-stop a running POS without warning.
2. **A hardware change invalidates a valid licence.** Disks fail and get
   replaced; that is normal. If your machine fingerprint is a disk serial, you
   have created a support incident out of routine maintenance.
3. **Clock rollback grants an unlimited trial.** The obvious attack, and easy to
   blunt: persist the highest timestamp ever seen and treat time moving
   backwards as tampering.
4. **A licence file copied to a second box runs two restaurants for one fee.**
   The main revenue leak.

## Suggested design

Not prescriptive — but this shape fits the constraints.

### Machine fingerprint

Derive a stable ID from **several** weak signals rather than one strong one, and
accept a partial match. Candidates, in rough order of stability:

- Windows `MachineGuid` (`HKLM\SOFTWARE\Microsoft\Cryptography`) — survives
  hardware changes, resets on OS reinstall
- Motherboard serial (`Win32_BaseBoard`)
- CPU ID (`Win32_Processor`)
- Primary NIC MAC — **weak**, changes with a USB dongle or docking station

Store a fingerprint of, say, 4 signals and revalidate if 3 still match. This
tolerates a replaced disk or a new dock without tolerating wholesale copying to
a different machine.

### Licence file

A signed blob at `C:\ProgramData\XP POS\license.dat`, containing at minimum:
customer name, issue date, expiry (or perpetual), edition, and the machine
fingerprint it was issued for.

**Sign it asymmetrically.** Ship only the *public* key in the product; keep the
private key on the XenithPulse side. A symmetric secret in the installer is
extractable — the app is minified JavaScript, not compiled machine code, and
`node --env-file` config is plain text on disk. See "What you are actually
protecting" below.

### Trial

On first provision, write a trial start marker. Do not rely on the file alone —
deleting `ProgramData` would reset the trial. Cross-check at least two of:

- the licence/trial file in ProgramData
- a registry value outside the install tree
- the earliest record in the database (`createdAt` on the first admin, say)

Take the **oldest** of them as the true start. Also persist a monotonic
"highest timestamp seen" and treat a large backwards jump as tampering.

### Enforcement — graduated, never abrupt

| State | Behaviour |
|---|---|
| Trial, > 7 days left | Normal. Small unobtrusive badge. |
| Trial, <= 7 days | Persistent banner with days remaining and how to buy. |
| Trial expired | **Do not stop the POS.** Read-only or a prominent blocking modal on admin screens, with existing orders still closeable. |
| Licensed | Silent. |
| Licence invalid on a previously licensed box | Grace period (14 days suggested) with loud warnings, *then* restrict. Never same-day. |

Rationale for the grace period: if your validation has a bug, it will surface as
a paying customer being restricted. A grace window turns that from an emergency
into a support ticket.

### Where enforcement lives

**Server-side, in the app process.** Not in the browser — client-side checks in
a React bundle are trivially removed. Natural options:

- a check in `instrumentation.ts` at startup (see how the realtime server boots
  there for the pattern), plus
- a guard in `lib/auth.ts` / `isAdminRequest` so API routes enforce it

Cache the result in memory; do not hit the disk on every request.

## What you are actually protecting

Be realistic about this so you spend effort proportionately.

The shipped app is **minified JavaScript**, not compiled machine code. A
determined person with a debugger can patch out any client-side check, and a
sufficiently determined one can patch the server-side check too. The build now
strips original TypeScript from the payload (`build.ps1` asserts zero `.ts`
files ship, after it was found copying `app/api/uploads/[filename]/route.ts`
verbatim), and source maps are empty stubs — so casual reading of your source is
prevented. Full reverse-engineering is not.

**That is fine.** Licensing here should stop casual copying between restaurants
and make the honest path easy, not defeat a skilled attacker. Do not spend weeks
on obfuscation; spend it on making activation painless.

If you later want real tamper resistance, the options are bytecode compilation
(`bytenode` on the V8 snapshot) or a native addon — both add significant build
complexity and would violate the project's current "pure JS, no native deps"
constraint. Treat that as a separate decision.

## Activation flow

Design for a technician standing in a restaurant with a phone hotspot:

1. Installer or POS shows the machine fingerprint as a short readable code.
2. Technician enters it on the XenithPulse site (or emails it).
3. Site returns a signed licence file / key string.
4. Technician pastes it into the POS admin screen, or drops the file into
   ProgramData and restarts the app service.

**Provide an offline path.** A site with no internet at all must still be
activatable by a key string read over the phone.

---

## Acceptance criteria

- [ ] `npx tsc --noEmit` clean; `.\installer\build.ps1` green
- [ ] Fresh install starts a 30-day trial with no internet connection
- [ ] Trial state survives a reboot and an app-service restart
- [ ] Deleting `license.dat` does **not** reset the trial
- [ ] Setting the clock back does **not** extend the trial
- [ ] A valid licence activates fully offline from a key string
- [ ] An activated licence survives a reboot, an upgrade install, and a
      `provision.ps1` re-run
- [ ] Copying `license.dat` to a different machine fails validation
- [ ] Replacing a disk (or changing one fingerprint signal) does **not**
      invalidate a valid licence
- [ ] Expired trial does not prevent closing an order that is already open
- [ ] Enforcement cannot be bypassed by editing browser JS or DevTools

## Watch out for

- **Upgrades must not wipe the licence.** It lives in `C:\ProgramData\XP POS`,
  which the installer never touches — keep it that way, and confirm after an
  upgrade test.
- **Uninstall already prompts before deleting ProgramData** and defaults to
  keeping it. Decide deliberately whether an uninstall should surrender the
  licence.
- The clock on an appliance can legitimately be wrong (dead CMOS battery,
  no NTP on an offline LAN). Distinguish "wrong" from "tampered" — a box that
  boots thinking it is 1980 should warn, not brick.
- Do not put a licence secret in `.env`. It is plain text, world-readable on the
  box, and `--env-file` is how the app already reads config.
- `NEXT_PUBLIC_*` is inlined into the browser bundle. Never put licensing
  material there.
