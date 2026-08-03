# Phase 11 — Updating and supporting a running client box

**Status:** not started
**Depends on:** Phase 10 is helpful — licensing establishes a machine identity
and a XenithPulse-side service, both of which this phase also needs. Doing 10
first avoids building that twice.
**Risk:** HIGH. This phase deliberately creates a path for XenithPulse to change
software on a customer's machine. Done carelessly it is both an outage risk and
a security hole.

Read `docs/handover/README.md` first for project state and ground rules.

---

## Goal

Change things on a live client box without a site visit: ship a fix, adjust a
setting, read a log, see whether a site is healthy.

## What already works — do not rebuild it

The upgrade mechanism **exists and is sound**. Re-running the installer is the
supported upgrade path:

- `PrepareToInstall` stops the three services before any file is replaced, and
  **aborts with an actionable message if they will not stop** — a running
  service holds `node.exe` open, and Windows would otherwise silently fail to
  replace it, leaving a half-updated install with no error shown
- program files are replaced wholesale
- `C:\ProgramData\XP POS` is never touched, so database, uploads and the
  per-site secret survive
- provisioning re-runs and restarts the services
- a failed provisioning step now surfaces a dialog rather than reporting success

So the hard part — safely swapping binaries under running services — is done and
**is not what this phase is about.** This phase is about *delivery and control*:
getting a new installer onto the box, and doing smaller things without a full
reinstall.

## Scope — decide this before writing code

These are separate products dressed as one request. Pick deliberately.

### A. Update delivery (lowest risk, highest value)

The POS checks a XenithPulse URL for a newer version, downloads it, verifies a
signature, and either notifies or installs.

Decisions:
- **Notify vs. auto-install.** A POS that restarts itself mid-service is a
  disaster. Strong recommendation: **notify, and let the site choose a time.**
  If auto-install is wanted, gate it behind a configured maintenance window
  (e.g. 04:00) *and* a "no orders open" check.
- **Verify what you download.** Signature or SHA-256 against a signed manifest.
  An update channel that installs an unverified binary as Administrator is a
  remote code execution path into every restaurant you supply.
- The existing `deps.json` pattern (pinned version + sha256, mismatch fails) is
  the right model.

### B. Remote configuration (medium risk)

Change `.env` values without a visit — the port, device allow-list, backup
paths.

`provision.ps1` already does the work and is idempotent: edit
`C:\ProgramData\XP POS\.env`, re-run it, and it regenerates `caddy.env`,
re-validates the proxy config, asserts the listen port, and restarts services.
A remote path just needs to invoke that safely.

**Danger:** `POS_ALLOWED_CIDRS` and `POS_HTTP_PORT` can lock you *and* the
restaurant out of the POS. Both already have footguns documented in
`NATIVE_MIGRATION_NOTES.md` (a blank CIDR list 403s the entire LAN; a blank port
makes Caddy bind :443 while `caddy validate` still reports success). Any remote
config change to those must validate **and** have an automatic rollback if the
POS stops answering afterwards.

### C. Remote diagnostics (low risk, do this early)

Pull health and logs without touching anything. Cheapest thing here and the one
that most reduces support calls.

The data already exists: `services.ps1 -Action Status`, the logs under
`C:\ProgramData\XP POS\logs`, and the existing Server Management dashboard and
health endpoint (`app/api/admin/server-config/health/`).

### D. Remote access / support session (highest risk)

Interactive control of the box. Consider carefully whether to build this at all
versus using an existing tool (the site already has AnyDesk on at least one
machine). **Building your own remote-control channel into every customer's
payment system is a serious undertaking with a serious liability profile.**

---

## Architectural cautions

**Direction of connection.** The box is behind a restaurant's NAT with no port
forwarding. So it must **poll outward**; you cannot connect inward. Note there
is precedent in the codebase: the XP Thermal Service already polls the POS for
backup config and manual run requests (`backup.pollIntervalMs`). Follow that
pattern rather than inventing a second one.

**Do not weaken the network posture.** Today only Caddy is LAN-facing and
everything else binds `127.0.0.1`. An update agent should make **outbound**
connections only. Do not open an inbound port, and do not bind a management
endpoint to `0.0.0.0`.

**Offline sites must keep working.** Many of these boxes have no internet. Every
feature here must degrade to "no updates available" silently, never to a warning
banner in a restaurant that will never see the internet.

**Where should the agent live?** Options:
1. Inside `XPPOS-App` (via `instrumentation.ts`, as the realtime server does)
2. A fourth Windows service
3. Inside the existing XP Thermal Service, which already polls and already has
   a Windows service and a config surface

Option 3 is worth serious consideration — it avoids a fourth service and reuses
an existing polling loop. But note it creates a dependency between two products
that currently ship separately.

**An update agent that can replace binaries and runs as LocalSystem is the most
security-sensitive component in the product.** Treat its download-verification
code as such.

---

## Acceptance criteria

Scope-dependent; at minimum:

- [ ] `npx tsc --noEmit` clean; `.\installer\build.ps1` green
- [ ] A box with no internet behaves normally, with no user-visible errors
- [ ] Update check does not block app startup or slow the POS
- [ ] Downloaded updates are signature/hash verified; a tampered payload is
      rejected and reported
- [ ] No new inbound listener; `Get-NetTCPConnection` shows only the existing
      Caddy port reachable off-box
- [ ] An update never begins while orders are open (or only in a configured
      maintenance window)
- [ ] A failed update leaves the previous version running, not a broken box
- [ ] Remote config changes validate before applying and roll back if the POS
      stops answering
- [ ] Everything works with the services running as LocalSystem

## Test scenarios

Run these on a VM with a snapshot:

1. Update available, site online, orders open → must not install
2. Update available, site offline → silent no-op
3. Update download corrupted/tampered → rejected, previous version still serving
4. Update applied → database, uploads, `.env` and licence all survive
5. Power cut *during* an update → box must come back serving something
6. Remote config change that would break access → rejected or auto-rolled-back

Scenario 5 is the one people skip and the one that destroys trust.

## Watch out for

- The installer is **not currently code-signed** (Phase 9). An auto-update that
  runs an unsigned installer as Administrator, over the internet, is exactly the
  supply-chain shape attackers look for. Sign first.
- `installer/setup.iss` `AppId` must never change, or an "upgrade" installs
  alongside the old copy instead of replacing it.
- The installed port varies per site (provisioning moves off a busy 8080 and
  persists the choice). Never hardcode 8080 in an agent; read `.env`.
- Upgrades already work by re-running the installer. If a remote update ends up
  reimplementing service-stop/file-replace logic itself, that is a strong sign it
  should just be invoking the installer silently (`/VERYSILENT`) instead.
