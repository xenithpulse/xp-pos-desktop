# Phase 10 — Updating and supporting a running client box

**Status: SCOPE A + C BUILT AND VERIFIED. Blocked only on infrastructure —
publishing a manifest, and the Phase 9 certificate before auto-install is used.**

**Scope built:** update delivery (A, notify-first) and remote diagnostics (C).
**Scope deliberately NOT built:** remote configuration (B) and remote
access/support sessions (D). See "What was not built, and why" below.

**Risk:** HIGH, and unchanged by the fact that it now exists. This phase created
a path for XenithPulse to change software on a customer's machine. Every gate
described here is load-bearing.

Read `docs/handover/README.md` first for project state and ground rules.

---

## What exists now

```
lib/updates/
  paths.ts          where state may live (ProgramData, never Program Files)
  identity.ts       siteId + machineId - PHASE 11 REUSES THIS, do not duplicate
  version.ts        strict N.N.N comparison, no dependency
  config.ts         .env settings, maintenance window
  manifest.ts       fetch + validate the release manifest
  download.ts       streaming download, streaming sha256, tamper rejection
  verify.ts         Authenticode verification via Windows
  service-state.ts  are orders open?
  install.ts        the gates, the launcher, interrupted-install reconciliation
  state.ts          atomic on-disk agent state
  agent.ts          the polling loop
lib/win/powershell.ts   -EncodedCommand helper shared by verify + diagnostics
lib/diagnostics/        services, listeners, paths, log index, log tail

app/api/admin/server-config/
  updates/                GET  status                          public
  updates/check/          POST check now (rate-limited 1/min)   public
  updates/install/        POST install now                      ADMIN ONLY
  diagnostics/            GET  services, listeners, log index    public
  diagnostics/logs/       GET  tail one log                     ADMIN ONLY

features/server-management/components/
  UpdateManager.tsx   the Updates tab
  Diagnostics.tsx     the Diagnostics tab

installer/scripts/apply-update.ps1   runs the installer, outliving the app
```

Wired in at `instrumentation.ts`, beside the realtime server.

## How it works

**Direction.** The box is behind a restaurant's NAT. It polls **outward** over
HTTPS to a static JSON manifest and downloads a payload. There is no new
listener, nothing binds `0.0.0.0`, and Caddy remains the only LAN-facing
component. This follows the XP Thermal Service's existing polling pattern rather
than inventing a second one.

**No XenithPulse server to run.** The manifest is a static file on any host you
control (S3, GitHub Releases, a plain web server). An update channel with no
server has no server to compromise. The check is an anonymous `GET` — it sends
no siteId, no hostname, no version. It is not telemetry.

**Manifest format** (`schema: 1`):

```json
{
  "schema": 1,
  "channels": {
    "stable": {
      "version":   "1.2.0",
      "url":       "https://updates.example.com/XP-POS-Setup-1.2.0.exe",
      "sha256":    "<64 hex chars>",
      "sizeBytes": 123718033,
      "releasedAt": "2026-01-15T00:00:00Z",
      "notes":     "Shown on the dashboard."
    }
  }
}
```

Every field is validated before use. A payload URL must be HTTPS (the sole
exception is a loopback host, which exists so the path can be tested on a VM and
is unreachable from anywhere else). `"latest"`, `"v1.2"` and any non-`N.N.N`
version are rejected outright rather than coerced.

**Two independent proofs before anything runs as Administrator:**

1. **sha256**, computed *while streaming*, never by re-reading the file. The
   download lands on a `.part` file and is only renamed after the hash matches;
   a mismatch deletes it. The size cap is enforced against bytes actually
   received, not against `Content-Length`.
2. **Authenticode**, asked of Windows (`Get-AuthenticodeSignature`) rather than
   reimplemented, and required to be both `Valid` *and* issued to
   `POS_UPDATE_PUBLISHER`. A valid signature from someone else is not our
   installer.

The hash alone is not enough: whoever can serve the manifest can name their own
hash. The signature is what ties the payload to a certificate.

**It does not reimplement upgrading.** Re-running the installer is the supported
upgrade path and already stops the services before replacing any file, aborts
with an actionable message if they will not stop, leaves `C:\ProgramData\XP POS`
untouched, and re-runs provisioning. The agent invokes it `/VERYSILENT`.

**Gates before an install starts** (`assessReadiness`, re-run immediately before
launch, never taken from what the dashboard showed a minute ago):

- a verified download exists, and still matches its hash on disk
- the signature is trusted (unless `POS_UPDATE_ALLOW_UNSIGNED`, which is
  reported as the hole it is)
- **no open orders.** Confirmed through out-for-delivery always block. Drafts
  block only if touched in the last 30 minutes — drafts are never cleaned up, so
  counting every one would wedge the channel permanently on any site that has
  ever abandoned one
- a database that cannot be reached is treated as "not idle", never as "closed"
- no install already running
- for *unattended* installs only: inside `POS_UPDATE_WINDOW`

**Why the launcher is a separate process.** The installer's first act is to stop
`XPPOS-App`, which kills whatever started it. `apply-update.ps1` is spawned
detached so it can re-verify the payload, read the exit code, **restart the
services on the previous version if the install fails**, and record the outcome.

**Power cut mid-update** (test scenario 5, the one people skip): a marker file is
written *before* the installer is launched. On the next startup the app
reconciles it. If `apply-update.ps1` got far enough to write
`install-result.json`, that is authoritative. Otherwise: version moved →
success; version unchanged → **interrupted**, reported plainly, and the box is
on its previous working version, which is the right place to be.

## Configuration

New keys in `.env` (documented in full in `.env.example`):

| Key | Default | Notes |
|---|---|---|
| `POS_UPDATE_URL` | *blank* | **Blank = the whole feature is off.** No requests, no timers, no messages |
| `POS_UPDATE_CHANNEL` | `stable` | |
| `POS_UPDATE_CHECK_HOURS` | `6` | |
| `POS_UPDATE_AUTO_INSTALL` | `false` | Even when true, needs the window *and* no open orders |
| `POS_UPDATE_WINDOW` | `04:00-05:00` | Wraps past midnight if you want. Unparseable = never |
| `POS_UPDATE_PUBLISHER` | `XenithPulse` | Required signer subject |
| `POS_UPDATE_ALLOW_UNSIGNED` | `false` | Pre-certificate escape hatch. Turn off once signing is live |
| `POS_UPDATE_MAX_MB` | `512` | Download ceiling |
| `POS_DATA_DIR` | `C:/ProgramData/XP POS` | |
| `POS_SITE_ID` | *blank* | Pin a site to an existing id; otherwise generated |

### `provision.ps1` now merges NEW keys into an existing `.env`

This is the change most likely to matter later, so it is called out.

An existing `.env` is still never overwritten — that rule protects the per-site
secret, the operator's port choice and any hand-tuning. But it also meant a site
installed before a setting existed would **never** receive it, no matter how many
upgrades it took. So provisioning now appends keys that are in the template and
absent from `.env`, at their template defaults, with `__GENERATE__` producing a
fresh per-site secret exactly as on a first run.

Existing keys are never touched, **including ones deliberately left blank** — a
blank value is still a key, so it is not "missing" and is not re-added. Verified
idempotent, and verified to leave the file BOM-less.

Phase 11 gets this for free.

## Acceptance criteria

- [x] `npx tsc --noEmit` clean
- [x] `.\installer\build.ps1` green (assertions increased, none weakened)
- [x] A box with no internet behaves normally, with no user-visible errors —
      blank `POS_UPDATE_URL` starts no timer at all; an unreachable host is
      reported as "no internet", is not an error state, and logs **once** on
      transition rather than every six hours
- [x] Update check does not block app startup — first check is 5 minutes after
      boot plus up to 10 minutes of jitter, on an unref'd timer
- [x] Downloaded updates are signature/hash verified; a tampered payload is
      rejected, deleted and reported
- [x] No new inbound listener; the Diagnostics tab shows what is reachable
      off-box so this is checkable without a PowerShell prompt
- [x] An update never begins while orders are open
- [x] A failed update leaves the previous version running — `apply-update.ps1`
      restarts the services on a non-zero exit
- [ ] Remote config changes validate and roll back — **not built (scope B)**
- [x] Works with the services running as LocalSystem — the agent runs inside
      `XPPOS-App`, which already does

## What was verified, and how

Not by reading it. `docs/handover/README.md` ground rule 6.

**39 checks against the real modules** (loopback HTTP server serving a real
manifest and payload): version comparison including prerelease ordering and
rejection of `latest`/`v1.2.0`/`1.2`; channel-off default; auto-install and
signature-required defaults; maintenance windows including one that wraps past
midnight and one that is unparseable (fails closed); rejection of a plain-HTTP
payload URL, a short sha256, an oversized payload and an unknown schema;
acceptance of a matching payload; **rejection and deletion of a tampered
payload**; detection of a payload modified *after* download; a mid-stream size
abort; an unreachable host classified as offline rather than as a fault; and log
tailing refusing `..`, `..\` and absolute paths.

**13 checks against `Add-MissingEnvKeys`**, extracted from the real
`provision.ps1` with the PowerShell AST and run under **Windows PowerShell 5.1**:
port choice and existing secret untouched, a deliberately blank value not
re-added, new keys arriving at their defaults, trailing template comments
stripped, commented example keys ignored, a second run adding nothing, the file
still BOM-less, and `__GENERATE__` producing a distinct per-site secret.

**New build assertions** (`build.ps1`), none of which weaken an existing one —
the payload check went from 27 assertions to **42, all passing**:

- the app bundle contains none of the build's own output, and stays under a
  size ceiling (the two that catch the tracer problem above)
- `apply-update.ps1` is present in the payload
- **every shipped `.ps1` is UTF-8 with a BOM, parses, and is ASCII-only outside
  comments** — ground rule 4, previously documented but unenforced
- `env.template` ships with auto-install off, signature verification required,
  and no update URL baked in

The encoding assertion **found a real pre-existing bug the moment it was added**:
an em-dash inside a string literal in `services.ps1` line 226
(`"$($svc.Id) is not registered — skipping"`). Harmless today because the file
has its BOM, and a parse failure on a client box the day it loses one. Fixed.

Note the assertion tokenises with PowerShell's own parser rather than matching
comment syntax with a regex — a line-based version cannot see inside a `<# #>`
block and reports every help header in the project as a violation.

### Still to test on a VM with a snapshot

The scenarios that need a real install, not a unit test:

1. Update available, orders open → must not install *(gate unit-tested; the
   end-to-end path is not)*
2. Power cut *during* an install → box comes back serving something
3. A real `/VERYSILENT` install end to end: database, uploads, `.env` and the
   `site-id` all survive
4. `provision.ps1` key merge against a **real** pre-Phase-10 `.env` on a live box

### The trap worth knowing about: Next traced the build's own output into it

**This is the one to read.** Adding the update agent made the installer payload
grow from **438 MB to 1,483 MB**, and the only symptom was a bigger download.

Next's file tracer works out which files each entry needs by evaluating the code
statically. Two patterns in the new code defeated it:

1. **Paths derived from `process.cwd()`.** The tracer *can* evaluate
   `process.cwd()` at build time. `paths.ts` used
   `path.resolve(process.cwd(), "..")` to find the install directory at runtime,
   and `identity.ts` read `package.json` from it — so the tracer concluded those
   routes might read anything under the repo root and copied the repo in.
2. **Literal filenames next to an unresolvable directory.** Given
   `path.join(installDir(), "scripts", "apply-update.ps1")` the tracer cannot
   resolve `installDir()`, so it *globs* for the literal part —
   `**/scripts/apply-update.ps1`, and `**/XP-POS-Setup-*.exe` for the download
   path — and includes every match. `installer\dist` and `installer\payload`
   matched, so **every build packaged the build before it**, compounding.

Fixed four ways, because any one alone leaves a hole:

- `paths.ts` no longer touches `process.cwd()`. `POS_INSTALL_DIR` is set from
  WinSW's `%BASE%` in `XPPOS-App.xml` — exact even when the operator picked a
  different install directory — and the fallbacks are literal constants.
- The version is baked in at build time (`next.config.ts` → `POS_APP_VERSION`)
  instead of read from `package.json` at runtime. Also simply more correct: one
  build, one artifact, one version, unable to disagree with itself.
- The downloaded payload is named `XP-POS-Update-<version>.exe`, not
  `XP-POS-Setup-…`, so the tracer's glob matches nothing in the repo.
- `build.ps1` deletes `installer\payload` **before** `next build`, not just
  before staging. `installer\dist` is left alone — those are finished releases.

`outputFileTracingExcludes` in `next.config.ts` is kept as a backstop, but note
what testing showed: **its `"**/*"` key covers route handlers and does NOT cover
`instrumentation`.** Excluding by key alone did not fix this; naming the
instrumentation entry explicitly did not either. The exclude is a second line of
defence, not the fix.

**Result: the payload is back to 439 MB** (it was 438 MB before Phase 10) and
the app bundle inside it is 43.7 MB. Two new build assertions fail the build if
this regresses: one matching the offending paths, one a blunt 250 MB ceiling on
the app bundle for whatever nobody predicts next.

Both assertions were themselves wrong on their first run, which is worth
recording because the same mistakes are easy to repeat:

- Banning any directory *named* `dist` fails on `@mongodb-js/saslprep/dist`, an
  ordinary npm package layout. Match the path, and skip `node_modules`.
- Banning any directory named `installer` fails on
  `app\installer\scripts\apply-update.ps1` — a 12 KB copy Next traces because
  the code genuinely references that script by name. It is unused (the real one
  is under `scripts\`) but it is normal tracing of a real reference, not the
  build eating its own output, and failing a release over 12 KB helps nobody.

### Two more problems found by building it

**The agent must not pull the database into the startup import graph.**
`lib/mongoose.ts` throws *at import time* when `TENANT_DB` or `MONGODB_URI` is
missing. The open-orders check needs it, and the agent is started from
`instrumentation.ts` — so a static import would have turned a typo in `.env`
from "the POS starts and reports a database error" into "the POS does not start
at all, drive to the site". `service-state.ts` therefore imports mongoose
*inside* the function, and `instrumentation.ts` wraps `startUpdateAgent()` in a
try/catch. Nothing about checking for updates is worth a till that will not boot.

**The status endpoint must not re-hash the payload.** The dashboard polls it
every 30 seconds; hashing a 118 MB installer that often would sit on a client
box's disk forever. `assessReadiness` takes a `rehashPayload` flag — off for
display, on for anything that leads to an install. The file is still hashed
three times before it runs: on download, in the install route, and again in
`apply-update.ps1`.

## What was not built, and why

**B — remote configuration.** `POS_ALLOWED_CIDRS` and `POS_HTTP_PORT` can lock
out both XenithPulse and the restaurant, and doing this safely needs validation
*plus* an automatic rollback when the POS stops answering afterwards. That is its
own piece of work and it now has an escape hatch it did not have before: a
config change that breaks a site can be followed by a shipped fix. Building it
before the update channel existed would have been the wrong order.

**D — remote access.** Deliberately not built. Building our own remote-control
channel into every customer's payment system carries a liability profile that is
not worth it while the sites already have AnyDesk.

## Before the first real update ships

1. **Buy the Phase 9 certificate.** `POS_UPDATE_ALLOW_UNSIGNED` exists only to
   exercise this path before then. Verify on a client box, not in the build
   output:
   `Get-AuthenticodeSignature "C:\Program Files\XP POS\service\XPPOS-App.exe"`
2. Publish a manifest and set `POS_UPDATE_URL` on one pilot site.
3. Leave `POS_UPDATE_AUTO_INSTALL=false`. Notify-first is the recommendation and
   the default; turn it on per-site only after the notify path has been watched
   through a real release.
4. Bump `version` in `package.json` — the installer, Add/Remove Programs and the
   update check all read it, and a release that does not bump it will never be
   offered.

## Watch out for

- `installer/setup.iss` `AppId` must never change, or an "upgrade" installs
  alongside the old copy instead of replacing it.
- The installed port varies per site. Diagnostics reads it from `.env`; nothing
  hardcodes 8080.
- The install endpoint is the one part of Server Management that requires an
  admin session. The dashboard is public by design as a recovery surface, but an
  endpoint that restarts the till mid-service is not covered by that argument.
- If a future change makes the agent stop, replace or copy files itself, that is
  the signal it should be invoking the installer instead.
- `identity.ts` is shared with Phase 11 by design. Do not build a second
  identity scheme there.
- **Service definitions now really are re-applied on upgrade.** They were not.
  `services.ps1` called `winsw refresh`, which is a **v3** command; `deps.json`
  pins WinSW 2.12.0 (v3 is alpha), so it answered `Unknown command: refresh` on
  every upgrade. The result was only a warning, so upgrades looked clean while
  silently keeping the service definition a box was FIRST installed with —
  meaning anything added to `XPPOS-App.xml` since then (environment variables
  the app reads, `<delayedAutoStart/>`, log paths) never reached a site that had
  been in service longest. It is now stop + uninstall + install. If an update
  ever needs a changed service definition to take effect, this is the code path
  it depends on.
