# Phase 9 — Code signing

**Status:** not started
**Depends on:** nothing technical. Blocked only on **buying a certificate**,
which has a lead time — start that before anything else.
**Risk:** low to implement. High cost of *not* doing it.
**Size:** small. A day of engineering once the certificate exists.

Read `docs/handover/README.md` first for project state and ground rules.

---

## Why this is its own phase, and why it is first

This was originally filed under branding, which was a mistake. Signing is not
cosmetic — it is a hard prerequisite for the two phases after it:

- **Phase 10 (remote update):** an updater that downloads and runs an installer
  as Administrator, over the internet, is the classic supply-chain attack shape.
  Unsigned, you have no way for the client box to know the payload came from
  XenithPulse. SmartScreen may also block a silent install outright.
- **Phase 11 (licensing/trial):** the trial is downloaded from your website by
  strangers. An unsigned 118 MB `.exe` triggers a SmartScreen warning
  ("Windows protected your PC") on every download. **That is a conversion
  problem, not an aesthetics one** — a meaningful share of trial users will not
  click through a red security warning on software they have never heard of.

Everything else in this project is finished and verified. This is the cheapest
remaining thing that materially changes how the product is received.

## Current state

**Nothing is signed.** `build.ps1` already prints this on every run:

```
WARN NOT CODE-SIGNED. SmartScreen will warn on every download until it is.
     Sign the installer AND the three service\XPPOS-*.exe wrappers
     (WinSW ships unsigned) before distributing to clients.
```

## Two things need signing, not one

1. **`installer\dist\XP-POS-Setup-<version>.exe`** — the obvious one.
2. **The three `service\XPPOS-*.exe` WinSW wrappers.** These are renamed copies
   of `WinSW.NET461.exe`, and **WinSW's own releases are unsigned** — verified
   during the migration: `Get-AuthenticodeSignature` reports `NotSigned` for
   both the net461 and x64 assets of v2.12.0. Three unsigned executables getting
   registered as Windows services is exactly the pattern endpoint-protection
   software flags.

Optional but worth considering: `mongod.exe`, `node.exe` and `caddy.exe` are
signed by their own vendors already — leave them alone. Re-signing third-party
binaries is unnecessary and loses their original signature.

## Certificate choice

| | OV (Organisation Validation) | EV (Extended Validation) |
|---|---|---|
| Cost | lower | higher |
| SmartScreen | reputation must be **earned** — early downloads still warn | **immediate** reputation, no warning |
| Storage | file or token, depending on issuer | hardware token / HSM required |
| CI automation | easier | harder (token must be present) |

Since June 2023 all publicly-trusted code-signing keys must be on hardware
(HSM/token) or a cloud signing service, so an OV certificate is no longer a
simple `.pfx` file from most issuers. Check what your CA actually delivers
before designing the build integration.

**Recommendation: EV if the budget allows.** The entire point is that a stranger
downloading a trial does not see a warning; OV reputation-building means your
first weeks of trial downloads — exactly the ones that matter — still get
flagged.

## Implementation

Add an optional signing step to `installer/build.ps1`:

- New parameters: `-SignThumbprint <hash>` (cert from the machine/user store —
  works with tokens and HSMs) and optionally `-TimestampUrl`.
- **Sign the three wrappers during staging**, after they are copied into
  `payload\service\` and *before* Inno packages them. Signing them afterwards is
  impossible — they are compressed inside the installer.
- **Sign the finished installer** after ISCC returns.
- Skip cleanly and keep the existing warning when no thumbprint is supplied, so
  a developer build still works with no certificate.

```powershell
signtool sign /sha1 <thumbprint> /fd sha256 /tr <timestamp-url> /td sha256 <file>
```

**Timestamping is not optional.** Without `/tr`, every signature becomes invalid
the day the certificate expires — including on installers already deployed to
customers.

`signtool.exe` ships with the Windows SDK. Follow the `deps.json` pattern if you
want it fetched automatically; otherwise document it as a build prerequisite and
fail with a clear message when missing.

Inno Setup also supports `SignTool=` directives in `setup.iss`, which can sign
the uninstaller too. Worth using — an unsigned `unins000.exe` sitting in Program
Files is the kind of thing security software notices.

---

## Acceptance criteria

- [ ] `npx tsc --noEmit` clean; `.\installer\build.ps1` green
- [ ] Build works **without** a certificate (developer path unchanged, warning
      still printed)
- [ ] With a thumbprint supplied, all four binaries report
      `Get-AuthenticodeSignature` = `Valid`:
      the installer and the three `XPPOS-*.exe` wrappers
- [ ] Every signature is timestamped (`SignerCertificate` plus a valid
      `TimeStamperCertificate`)
- [ ] Downloading the installer on a clean Windows box shows no SmartScreen
      warning (EV), or a reduced one (OV)
- [ ] Installing still works end to end after signing — signed wrappers register
      and start as services normally
- [ ] The private key / token is **not** in the repo, and not in CI logs

## Watch out for

- Sign the wrappers **before** Inno compresses them. This is the single easiest
  thing to get wrong.
- Do not sign inside `[Files]` — Inno packages whatever it is handed.
- Verify the *installed* wrappers on a real box, not just the staged copies.
- If signing is added to CI, a hardware token needs a machine that physically
  has it, or a cloud signing service. Plan for this before promising automation.
- Keep the "NOT CODE-SIGNED" warning path working. Developer builds must not
  require a certificate.
