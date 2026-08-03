# Phase 9 — Code signing

**Status: ENGINEERING COMPLETE AND VERIFIED. Blocked only on buying a
certificate.**

Everything below is built, wired into `installer/build.ps1`, and proven end to
end with a self-signed test certificate. The day a real certificate arrives,
one command produces a fully signed release:

```powershell
.\installer\build.ps1 -SignThumbprint <thumbprint>
```

Nothing else needs writing. **Go buy the certificate.**

**Risk:** low to implement (done). High cost of *not* doing it.

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

## Implementation — DONE

### How to use it

```powershell
# find your certificate
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Select Thumbprint,Subject,NotAfter

# build a signed release
.\installer\build.ps1 -SignThumbprint 1A2B3C...

# override the timestamp server if needed (defaults to DigiCert)
.\installer\build.ps1 -SignThumbprint 1A2B3C... -TimestampUrl http://timestamp.sectigo.com
```

Omit `-SignThumbprint` and the build works exactly as before, printing the
NOT CODE-SIGNED warning. Developer builds need no certificate.

### What it signs, and when

| Artifact | Signed at | Why there |
|---|---|---|
| `service\XPPOS-MongoDB.exe` | **staging** | must be signed *before* Inno compresses them into the installer — afterwards is impossible |
| `service\XPPOS-App.exe` | staging | " |
| `service\XPPOS-Caddy.exe` | staging | " |
| `unins000.exe` | ISCC compile | via Inno's `SignTool=` + `SignedUninstaller=yes` |
| `XP-POS-Setup-<ver>.exe` | after ISCC | the file the customer downloads; what SmartScreen judges |

All signatures use `/fd sha256` and are **RFC 3161 timestamped** (`/tr … /td
sha256`).

### Design notes

- **Thumbprint, not `.pfx`.** Since June 2023 publicly-trusted code-signing keys
  must live on a hardware token, HSM, or cloud signing service — none of which
  give you a file. Reading the certificate from the Windows store is the only
  form that works with all of them.
- **The certificate is validated before the build starts**, not after ten
  minutes of compilation. A missing thumbprint or an expired certificate fails
  immediately, and a certificate expiring within 30 days prints a warning.
- **A signing failure aborts the build.** Shipping a half-signed installer is
  worse than shipping an unsigned one — the inconsistency looks like tampering.
- **`signtool.exe` is auto-fetched**, pinned and sha256-verified in `deps.json`,
  from the `Microsoft.Windows.SDK.BuildTools` NuGet package (a `.nupkg` is a
  zip; only the 538 KB `signtool.exe` is used). No multi-gigabyte Windows SDK
  install, nothing written to the system, and it downloads *only* when signing
  is actually requested.
- **Uninstaller signing is conditional** (`#ifdef SignUninstaller` in
  `setup.iss`). ISCC fails if `SignTool=` names a tool that was not defined on
  the command line, which would break every unsigned developer build.
- The final report calls `Get-AuthenticodeSignature` on the result and prints
  what **Windows** thinks, not what signtool claimed.

### Verified with a self-signed test certificate

| Check | Result |
|---|---|
| 3 wrappers signed during staging | yes |
| installer signed after compile | yes |
| all 4 timestamped | yes — DigiCert SHA256 RSA4096 Timestamp Responder |
| signature validity | `UnknownError` (self-signed root untrusted) → **`Valid`** once the test root was trusted, proving the signatures themselves are correct |
| build with no certificate | still succeeds, prints NOT CODE-SIGNED |
| all 27 payload assertions | pass in both modes |

The test certificate was deleted afterwards; the machine has no code-signing
certificates.

**With a purchased certificate these read `Valid` immediately** — Windows
already trusts the CA root, which is the entire difference.

---

## Acceptance criteria

Done with a test certificate:

- [x] `.\installer\build.ps1` green in both signed and unsigned modes
- [x] Build works **without** a certificate (developer path unchanged, warning
      still printed)
- [x] With a thumbprint supplied, all four binaries are signed: the installer
      and the three `XPPOS-*.exe` wrappers
- [x] Every signature is timestamped (`TimeStamperCertificate` present)
- [x] Signatures verify as `Valid` when the signing root is trusted

Still to confirm once a **real certificate** is purchased:

- [ ] All four binaries report `Get-AuthenticodeSignature` = `Valid` with no
      manual trust step
- [ ] Downloading the installer on a clean Windows box shows no SmartScreen
      warning (EV), or a reduced one (OV)
- [ ] Installing still works end to end — signed wrappers register and start as
      services normally, and antivirus does not quarantine them
- [ ] `unins000.exe` on the installed box is signed
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
