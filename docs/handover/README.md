# XP POS — handover documents

One document per work package. Each is written so an engineer (or an AI agent in
a fresh session with no memory of earlier work) can pick it up cold and start.

Read this file first, then the document for your phase.

---

## Where the project stands

The Docker → native Windows migration (Phases 0–8) is **complete and running on
a real machine**. `NATIVE_MIGRATION_NOTES.md` in the repo root is the record of
that work: architecture, decisions, and the traps found along the way. Read it
before touching anything, especially the "traps" sections — several are the kind
that only appear on a customer's box.

**Current state, verified on a live install:**

- One installer: `installer\dist\XP-POS-Setup-<version>.exe`, ~118 MB
- Three Windows services (`XPPOS-MongoDB`, `XPPOS-App`, `XPPOS-Caddy`),
  Automatic (Delayed Start), restart-on-failure
- Starts unattended after a reboot with nobody logged in — **verified**:
  services came up 158s after boot with no login. The delay is now tuned to 30s
- MongoDB single-node replica set, PRIMARY, transactions committing
- Realtime WebSocket in-process, authenticated, working through Caddy
- Backups run natively via bundled `mongodump.exe` (xp-thermal-service)
- Zero Docker

**Build command (the only one):**

```powershell
.\installer\build.ps1
```

No tooling needs installing first — every dependency including the Inno Setup
compiler is pinned in `installer/deps.json` and fetched automatically.

---

## The work packages

Do them in numbered order. The numbering **is** the execution order.

| Doc | Phase | Size | Status |
|---|---|---|---|
| [`PHASE-9-CODE-SIGNING.md`](PHASE-9-CODE-SIGNING.md) | Authenticode signing of the installer and service wrappers | small | **engineering DONE — awaiting certificate purchase** |
| [`PHASE-10-REMOTE-UPDATE.md`](PHASE-10-REMOTE-UPDATE.md) | Updating and supporting a running client box | large | **update delivery + diagnostics DONE — awaiting a published manifest; scopes B and D deliberately not built** |
| [`PHASE-11-LICENSING.md`](PHASE-11-LICENSING.md) | 30-day trial, licence activation, enforcement | large | **engineering DONE — back up the signing key, then run the on-box checklist** |
| [`RESILIENCE-AND-QA.md`](RESILIENCE-AND-QA.md) | Self-healing services, watchdog, and the per-device QA check | medium | **built — `-Destructive` and reboot tests still to run on a real box** |
| [`PHASE-12-BRANDING.md`](PHASE-12-BRANDING.md) | XenithPulse icons and wizard imagery, plus the whole first-run path: bootstrap, sample data, and finding the box on the network | large | **built — needs the on-box walkthrough; contact details and the EULA still placeholders** |
| [`PHASE-13-SELL-READY-GAPS.md`](PHASE-13-SELL-READY-GAPS.md) | Delivery order module, a standalone kitchen screen, wiring up the unused WhatsApp sender — found by a persona audit (owner, cashier, kitchen), not by brainstorming | medium | **engineering DONE (`tsc`/`next build` clean) — needs `installer\build.ps1`, a real WhatsApp send test, and a decision on the `chef` role's missing `manage_orders` permission (found while building `/kitchen`)** |
| [`PHASE-14-REGIONAL-READINESS.md`](PHASE-14-REGIONAL-READINESS.md) | South Asia (excl. India) / Middle East / Western market readiness: Saudi e-invoicing scoping, allergen UI, optional bilingual receipts | medium | not started |

**Why this order:**

- **9 first** because it is a *prerequisite*, not a polish item. An updater that
  runs an unsigned installer as Administrator over the internet is a
  supply-chain hole (Phase 10), and an unsigned trial download triggers a
  SmartScreen warning that costs you trial conversions (Phase 11). It is also
  gated on *buying a certificate*, which has lead time — start that now even if
  the engineering waits.
- **10 before 11** because licensing is the one thing that can lock a paying
  restaurant out mid-service. With an update channel already in place, a
  licensing bug is a remote fix instead of a site visit during dinner service.
  Phase 10 also establishes the machine identity and XenithPulse-side endpoint
  that Phase 11 needs — build them once. **Those now exist**: `lib/updates/`
  `identity.ts` is the one siteId/machineId, and `provision.ps1` merges new
  `.env` keys into an existing site's config, so Phase 11 can add settings that
  actually reach boxes already in service. Reuse both rather than building a
  second, parallel scheme. **Phase 11 did**: `lib/licensing/paths.ts` imports
  the data root from `lib/updates/paths.ts` rather than deriving its own, and
  the siteId is untouched.
- **Resilience and QA before 12**, because branding is the only phase that
  changes nothing functional and there is no point making a box look right
  before proving it stays up. It is not numbered: it hardens 9-11 rather than
  adding a feature. `installer\scripts\qa-check.ps1` is now the thing to run on
  every box before it is left with a customer.
- **12 last** because it was believed to be the only phase that changes nothing
  functional. That turned out to be wrong. Auditing it found that a fresh box
  had no way to create a first account except an unauthenticated endpoint that
  seeded a known `reviewer` / `reviewer@123` super_admin, that nine of the
  eleven `/api/injections/*` routes never called their own guard, and that the
  address a customer needs was printed only into a hidden console. Phase 12 now
  also covers the path from double-clicking the installer to taking an order.
- **13 before 14** because 13 is gaps that cost a sale to *any* single
  restaurant owner, anywhere — most notably that delivery orders cannot be
  created at all despite the data model already supporting them end to end.
  14 is market-specific hardening (Saudi e-invoicing, GCC receipt
  conventions) that only matters once you're selling into those specific
  places. Chain/multi-location support ("online data flush" — each site
  queues locally, flushes to a central database when internet returns) is
  deliberately sketched in Phase 14 but not started: this product sells to
  single restaurant owners right now, and there is no paying multi-location
  customer to build it for yet.

**One thing from Phase 11 is not a code task and has no deadline but the first
sale:** the licence signing key exists only at
`~/.xenithpulse/licence-signing-key.pem` on the machine that generated it.
Losing it means no licence can ever be issued for any installation already in
the field. Back it up offline before shipping a trial to anybody.

Signing was originally written into the branding document. That was a filing
error: it is a security and trust prerequisite, not decoration, and it now has
its own phase at the front.

---

## Ground rules for all phases

These are carried forward from the migration and still apply.

1. **`npx tsc --noEmit` is the primary gate.** It must pass clean before you
   consider anything done.
2. **`.\installer\build.ps1` must stay green.** It runs 42 assertions on the
   payload; do not weaken one to make a build pass. Two of them exist because
   the update agent silently tripled the payload — Next's file tracer copied
   `installer\payload` and `installer\dist` into the app bundle, so every build
   packaged the one before it. See PHASE-10 for the four patterns that cause it;
   if either assertion fires, that is what happened.
3. **Never put mutable state under `C:\Program Files\XP POS`.** It is
   ACL-restricted and replaced wholesale on upgrade. Site data lives in
   `C:\ProgramData\XP POS`.
4. **PowerShell scripts: UTF-8 WITH BOM, ASCII-only string literals.** PS 5.1
   reads a BOM-less file as CP1252, and a UTF-8 em-dash inside a string decodes
   to a byte PowerShell treats as a smart quote, silently terminating the
   string. This has already bitten once.
5. **Match the existing comment style.** This codebase explains *why*,
   especially around deployment footguns. That is how it gets supported on
   client sites.
6. **Verify by execution, not by reading.** Nearly every real bug in this
   project was found by running something, not by inspecting it.

## Useful facts you will otherwise rediscover the hard way

- The app binds `127.0.0.1:3000`; **Caddy is the only LAN-facing component**.
  `HOSTNAME=127.0.0.1` in `XPPOS-App.xml` is load-bearing — unset, Next binds
  `0.0.0.0` and bypasses the device allow-list.
- Caddy reads `caddy.env`, **not** `.env`. `caddy.env` is generated with values
  *resolved*, because Caddy's `{$VAR:default}` only applies when a variable is
  UNSET — a blank one collapses the device allow-list and 403s the whole LAN.
- Services run as **LocalSystem**. Mapped drive letters are invisible to them.
- `provision.ps1` is idempotent and is the supported way to re-apply config.
- The installed port may not be 8080. Provisioning moves to a free port and
  persists the choice in `.env`; read it rather than assuming.
