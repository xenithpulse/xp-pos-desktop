# XP POS

A restaurant point-of-sale system that runs entirely on a computer in the
restaurant — no cloud, no internet dependency, no monthly per-terminal fee to a
third party. Floor plan and table sessions, order-taking and a kitchen ticket
board, menu and inventory, staff accounts, daily and analytics reporting, and a
30-day trial with offline licence activation.

Built by **XenithPulse**.

## What this actually is

Two things live in this one repository:

1. **The application** — a Next.js app (App Router) backed by MongoDB, in this
   directory. What you'd run with `npm run dev` to work on a feature.
2. **The installer** — everything under `installer/` turns the application
   above into a single `.exe` a restaurant owner downloads and runs. It bundles
   its own Node runtime, its own MongoDB, and its own Caddy reverse proxy — the
   customer installs nothing else, and needs no internet connection once it's
   installed. Windows services keep the POS running through a reboot, with
   nobody logged in.

These are not deployed the same way, and are usually worked on separately. If
you're changing a POS feature, you want #1. If you're touching branding,
first-run setup, updates, or licensing, you want #2 and `docs/handover/`.

## Developing the app

```bash
npm install
npm run dev
```

Needs a MongoDB instance reachable via `MONGODB_URI` and a `TENANT_DB` name set
(see `.env.example` — copy it to `.env.local` for local development). The app
will not start without both; `lib/mongoose.ts` fails loudly rather than
silently connecting to the wrong thing.

```bash
npm run build   # production build (next build)
npm run lint    # eslint
npx tsc --noEmit   # the primary correctness gate — must be clean before anything ships
```

## Building the installer

```powershell
.\installer\build.ps1
```

One command, no tooling to install first — every dependency (Node, MongoDB,
Caddy, WinSW, the Inno Setup compiler) is pinned in `installer/deps.json` and
fetched automatically, hash-verified against that pin. Produces
`installer\dist\XP-POS-Setup-<version>.exe`.

```powershell
.\installer\build.ps1 -SignThumbprint <thumb>              # + Authenticode sign
.\installer\build.ps1 -SignThumbprint <thumb> -Publish `    # + publish to R2
    -PublishDomain updates.xenithpulse.com -PublishNotes "..."
```

See `installer/build.ps1 -?` (or its own doc header) for the full parameter
list, and `docs/handover/PHASE-10-REMOTE-UPDATE.md` → "Publishing a release"
for how the R2 publishing pipeline is set up.

## Where to actually find things

This project is documented as a series of **handover phase docs** — written so
someone with zero prior context (a new engineer, or an AI agent in a fresh
session) can pick up any piece cold. Start here:

- **[`docs/handover/README.md`](docs/handover/README.md)** — project state,
  the full phase list in execution order, and the ground rules every phase
  follows (the primary correctness gate, encoding requirements for PowerShell
  scripts, where mutable state may and may not live). Read this before
  changing anything under `installer/`.
- **[`NATIVE_MIGRATION_NOTES.md`](NATIVE_MIGRATION_NOTES.md)** — the record of
  moving off Docker onto native Windows services: architecture, decisions, and
  the traps that were found along the way. Background for *why* the installer
  works the way it does.
- **[`DEPLOY.md`](DEPLOY.md)** — what actually happens on a client box: where
  files live, the three Windows services, first run, going live.

### The phase docs, in the order they were built

| Phase | Covers |
|---|---|
| 9 — Code signing | Authenticode signing of the installer and service wrappers |
| 10 — Remote update | Checking for, downloading and applying updates from a published manifest |
| 11 — Licensing | 30-day trial, offline licence activation, graduated enforcement |
| Resilience & QA | Self-healing services, the watchdog, the pre-handover QA check |
| 12 — Branding & first-run | Icons and wizard imagery, guided first-run setup, sample data, finding the box on the network |
| 13 — Sell-ready gaps | Delivery order module, standalone kitchen screen, WhatsApp order confirmations |
| 14 — Regional readiness | South Asia / Middle East / Western market scoping — tax, e-invoicing, receipts |

Full detail, current status, and what's still outstanding on each: see the
table in `docs/handover/README.md`, which is kept current as phases land — this
list is a map, not the source of truth.

## Ground rules (the short version)

The full list is in `docs/handover/README.md`; the two that matter most day to
day:

1. **`npx tsc --noEmit` must be clean.** It is the primary gate before anything
   is considered done.
2. **Nothing mutable lives under `C:\Program Files\XP POS`** on an installed
   box — it's ACL-restricted and replaced wholesale on every upgrade. Site data
   lives in `C:\ProgramData\XP POS`, untouched by upgrades.
