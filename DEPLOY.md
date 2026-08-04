# Deploying XP POS to a client box

XP POS ships as a **single installer**. The client runs it and the POS is
installed and running as Windows services that start at boot — **before anyone
logs in**. There is no Docker, no Node, no MongoDB to install, and no
prerequisites of any kind.

---

## Prerequisites on the client machine

- **Windows 10 or 11, 64-bit.** Windows 7 is not supported (the app requires
  Node 20+, which does not run there).
- **An AVX-capable CPU.** The installer checks this and refuses to install
  without it — see [Hardware requirements](#hardware-requirements).
- **XP Thermal Service** — only if the site prints receipts or takes backups.

Everything else is inside the installer.

---

## Install

Run **`XP-POS-Setup-<version>.exe`** as Administrator.

That is the whole procedure. It finishes by printing the LAN URL to hand to
staff, e.g. `http://192.168.1.50:8080`.

### What the installer does

1. **Checks the CPU supports AVX** and refuses to continue otherwise.
2. Installs the program files to `C:\Program Files\XP POS`.
3. Chains the Microsoft Visual C++ runtime if it is missing (MongoDB needs it).
4. Creates `C:\ProgramData\XP POS\.env`, generating a **unique secret per site**
   for every `__GENERATE__` marker.
5. Picks a host port Windows has not reserved and saves the choice.
6. Generates the proxy configuration and **verifies it will actually listen on
   that port** before continuing.
7. Adds Windows Defender exclusions for the database and program files.
8. Registers three services, starts MongoDB, initialises the replica set, then
   starts the app and the proxy — in that order, because the app cannot run
   transactions against a database that is not yet a replica-set primary.
9. Adds the inbound firewall rule.
10. Waits for the POS to answer, then prints the LAN URL.

**Re-running the installer is the supported upgrade path.** It stops the
services, replaces the program files, and restarts them — and it never touches
`C:\ProgramData\XP POS`, so the database, uploads and the site's secret all
survive.

---

## ⚠️ Verify unattended start before leaving site

This is the single most important check, and the reason the product moved off
Docker: Docker Desktop ran inside a logged-in user session, so a power cut at
2am left the POS dead until somebody physically logged into the box.

```
1. Reboot the machine.
2. Do NOT log in. Leave it sitting at the Windows login screen.
3. From a staff device, open the URL the installer printed.
```

It must serve the login page. If it does not, run the status check below.

---

## First run

Nothing to configure. Open the address the installer showed on its last page —
it is also saved in `C:\ProgramData\XP POS\connect-info.txt` and on the Start
menu under **XP POS → Getting Started**.

Sign in with **`admin` / `admin`**. The login screen shows those credentials and
offers a one-click sign-in button while they are still in use.

The box arrives already loaded with a sample menu, ingredients and a floor plan
(14 tables across two sections), so the POS is usable and explorable from the
first minute rather than an empty shell.

### Going live — this is the step that matters

**Server Management → Sample Data → Remove sample data and go live.**

That one action does two things together, deliberately:

1. Sets a real owner password. It is **required** — the removal is refused while
   the account is still on `admin`.
2. Removes the sample menu, ingredients, categories and tables.

Removing the sample data is the moment a demo becomes a real restaurant, and it
is the only moment where demanding a password is obviously reasonable rather
than an interruption. Earlier gets clicked past; later never happens.

Only the seeded records are removed — matched by the exact names in the bundled
JSON and the exact table numbers in `lib/demo-data/tables.ts`. Anything the
owner created is untouched, and a sample table with an open session is kept
until that session closes.

> **Until that step is done, anyone on the network can sign in as the owner.**
> The login screen, the connection card and a banner in Server Management all
> say so. Do it before real trade.

Staff accounts are created in-app afterwards: **Admin → Users**.

## When the address changes

The port is fixed at install time, but the IP comes from the router by DHCP — so
a power cut or a router swap moves it, and every bookmarked tablet breaks with a
timeout that explains nothing. Three things address this:

- **`http://xppos.local:<port>`** — the app answers mDNS queries for that name
  with its current address, re-read per query, so the name follows the machine.
  Works on iOS, iPadOS, macOS, Windows 11 and Android 12+. Not universal, so it
  is an *extra* address, never the only one.
- **Server Management → Connect Devices** — the live address as a big QR code,
  re-checked every 30 seconds, and printable for the wall by the pass.
- **The watchdog** notices when the machine's address has changed and rewrites
  `connect-info.txt` and the shortcut within one cycle.

The permanent fix is still a DHCP reservation on the router; the Connect Devices
screen says so, in those words.

### `/api/injections/*` is not part of this

Those endpoints reset order status, wipe and re-seed menu data, and create admin
accounts. They ship **off** (`ENABLE_SETUP_ENDPOINTS=false`) and provisioning
turns them off on any older box that still has them on.

The sample data a customer sees does **not** come from these. First-run
bootstrap loads it directly (`lib/firstRun.ts` → `lib/demo-data/`), and the
Sample Data screen removes it. The injection routes are thin support-tool
wrappers over the same module, so the two cannot disagree about what counts as
sample data.

They used to be required — `/api/injections/seed-admin` created a
`reviewer` / `reviewer@123` super_admin, on an unauthenticated GET, and it did
not check the flag at all. That is fixed: the route is now POST-only, actually
guarded, and takes the password from the caller. Nothing a customer does needs
these endpoints any more.

---

## Where everything lives

```
C:\Program Files\XP POS\        program files - REPLACED on every upgrade
  app\                            the application
  node\  mongodb\  caddy\         bundled runtimes
  service\                        the Windows service wrappers
  scripts\                        provision.ps1, services.ps1

C:\ProgramData\XP POS\          site data - NEVER touched by an upgrade
  .env                            this site's configuration and secret
  mongod.cfg                      database settings
  mongo\                          the database itself
  uploads\                        menu images
  logs\                           one folder per service
```

Nothing that must survive an upgrade may live under Program Files: it is
ACL-restricted and the installer replaces it wholesale.

**Back up `.env`.** Losing it invalidates every existing login session.

---

## The three services

| Service | Role | Reachable from the LAN? |
|---|---|---|
| `XPPOS-MongoDB` | Database | No — 127.0.0.1 only |
| `XPPOS-App` | Application + realtime | No — 127.0.0.1 only |
| `XPPOS-Caddy` | Reverse proxy | **Yes — this is the only one** |

All three are **Automatic (Delayed Start)** and restart themselves on failure
(after 10s, 30s, then 60s). `XPPOS-App` depends on `XPPOS-MongoDB`, and
`XPPOS-Caddy` on `XPPOS-App`.

The database has no authentication; the 127.0.0.1 bind is what keeps it off the
network. Never change `bindIp` in `mongod.cfg`.

---

## Day-to-day operations

All commands run from an **elevated** PowerShell.

```powershell
$svc = "C:\Program Files\XP POS\scripts\services.ps1"

& $svc -Action Status      # are all three running, and set to start at boot?
& $svc -Action Restart     # restart everything
& $svc -Action Stop
& $svc -Action Start

# just one service
& $svc -Action Restart -Service XPPOS-App
```

`-Action Status` explicitly reports whether every service is
**Automatic (Delayed Start)**, because that flag is what determines survival of
a power cut.

### Logs

```powershell
$logs = "C:\ProgramData\XP POS\logs"

Get-Content "$logs\app\XPPOS-App.out.log" -Tail 50 -Wait
Get-Content "$logs\mongodb\XPPOS-MongoDB.out.log" -Tail 50
Get-Content "$logs\caddy\XPPOS-Caddy.out.log" -Tail 50
```

Logs roll at 10 MB and keep 5 files per service, so they cannot fill the disk.

### Changing configuration

Edit `C:\ProgramData\XP POS\.env`, then re-run provisioning as Administrator:

```powershell
& "C:\Program Files\XP POS\scripts\provision.ps1"
```

Re-running is safe. It regenerates the proxy configuration from `.env`,
re-validates it, and restarts the services. **Do not hand-edit `caddy.env` or
`Caddyfile`** — both are regenerated from `.env` on every run and your edits
will be lost.

Provisioning also **adds settings introduced by a newer release** that this
site's `.env` does not have yet, at their defaults. Values already in the file
are never touched — including ones deliberately left blank, since a blank value
is still a key. Anything it adds goes in a dated block at the end of the file.

### Software updates

Off unless configured. With `POS_UPDATE_URL` blank — the default — the box makes
no outbound requests at all, which is the right setting for a site with no
internet.

To turn it on, set `POS_UPDATE_URL` to the release manifest and re-run
provisioning. The box then checks every few hours, downloads a new release,
verifies its SHA-256 **and** its Authenticode signature, and shows it in
**Server Management → Updates** for someone at the restaurant to install when it
suits them. An update never starts while orders are open.

`POS_UPDATE_AUTO_INSTALL=true` lets it install unattended, but only inside
`POS_UPDATE_WINDOW` and only with no orders open. Leave it off unless a site has
specifically asked for it — a POS that restarts itself mid-service is a bad
afternoon for everyone.

If an update is interrupted (a power cut is the realistic case) the box comes
back on its previous version and says so on the Updates tab. Nothing is lost.

Update logs are under `C:\ProgramData\XP POS\logs\update`.

### Diagnosing a box over the phone

**Server Management → Diagnostics** shows, without anyone running PowerShell on
site: the version, the site ID, the three services and their start types, what
is reachable from the network (only Caddy should be), the configured port, and
the log files. Reading a log's contents needs an admin sign-in; everything else
does not, because the dashboard has to work when the thing that is broken is the
part you would sign in to.

### Inspecting the database

```powershell
& "C:\Program Files\XP POS\mongodb\bin\mongosh.exe" "mongodb://127.0.0.1:27017/POS_PROD"
```

---

## Hardware requirements

**The CPU must support AVX.** MongoDB 5.0 and later require it. Low-power
Celeron and Pentium N-series chips — N3350, N4000, N4020, N5030 and similar —
do not have it, and MongoDB dies with `Illegal instruction` on those.

The installer checks this up front and refuses to install, rather than letting
you discover it when the restaurant takes its first order. If you hit this,
either use a machine with a newer processor or ask XenithPulse for a build that
uses MongoDB 4.4.

---

## Troubleshooting

### Staff devices cannot reach the POS

1. `& $svc -Action Status` — is `XPPOS-Caddy` running?
2. Is the box's network profile set to **Public**? That blocks LAN discovery
   even with the firewall rule present, and is the most common cause of
   "works on the box, unreachable from the tablet":
   ```powershell
   Get-NetConnectionProfile
   Set-NetConnectionProfile -Name "<name>" -NetworkCategory Private
   ```
3. Check `POS_ALLOWED_CIDRS` in `.env`. **Leave it empty to allow every LAN
   device.** If it is set and does not cover the tablet's subnet, the proxy
   returns 403.

### A 403 saying access is restricted

`POS_ALLOWED_CIDRS` does not cover that device. Clear it (allow all) or widen
the range, then re-run `provision.ps1`. Ranges are **space-separated**, not
comma-separated.

### The POS does not come back after a reboot

Run `& $svc -Action Status`. If any service is not **Automatic (Delayed
Start)**, re-run the installer — that is what registers the start type.

### The database will not start

Check `C:\ProgramData\XP POS\logs\mongodb\`. `Illegal instruction` means the CPU
has no AVX (see [Hardware requirements](#hardware-requirements)).

### The port is already in use

Windows reserves TCP ranges for Hyper-V/WSL, and a bind inside one fails
silently, leaving nothing listening at all. Provisioning detects this and moves
to a free port automatically. To force a specific one:

```powershell
& "C:\Program Files\XP POS\scripts\provision.ps1" -Port 9090
```

---

## Uninstall

Uninstall from **Settings → Apps**, or the Start-menu entry.

It stops and removes the three services and deletes the firewall rules, then
asks — twice — whether to delete the database. **It defaults to keeping it.**
Declining leaves everything in `C:\ProgramData\XP POS`, and reinstalling later
picks up exactly where the site left off, with existing logins intact.

---

## Backups

Backups are owned by the **XP Thermal Service**, which runs natively on Windows
and can therefore write to real drives, USB disks and UNC shares. It calls the
`mongodump.exe` bundled with this install.

Configure destinations and retention in the POS dashboard under
**Server Management → Backups**.

If a backup reports a path error, note that the services run as **LocalSystem**:
a mapped drive letter belonging to a logged-in user is not visible to them. Use
a full path or a UNC share.

---

## For developers: building the installer

The build happens on the **developer machine**, never on a client box.

```powershell
npm ci
.\installer\build.ps1
  # -> installer\dist\XP-POS-Setup-<version>.exe
```

That is the whole command. It fetches and verifies every pinned runtime, type
checks, builds the app, stages the payload, runs 26 safety assertions, and
compiles the installer.

**No tooling needs installing first** — not even the Inno Setup compiler. Every
dependency is pinned by version and sha256 in `installer/deps.json` and fetched
automatically; a checksum mismatch fails the build. Inno Setup is extracted
*portably* into `installer\.depcache\`, so nothing is registered on the build
machine. A system-wide Inno Setup 6 is used instead when present, and
`-IsccPath <path to ISCC.exe>` overrides both.

The installer version comes from `package.json`.

Optional flags:

```powershell
.\installer\build.ps1 -SkipBuild     # reuse the last `next build` (iterating only)
.\installer\build.ps1 -NoMongosh     # drop mongosh, ~135 MB smaller installer
.\installer\build.ps1 -StageOnly     # stage the payload, skip the installer
.\installer\build.ps1 -UpdateHashes  # repin after deliberately changing a version
```

### Signed release builds

```powershell
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Select Thumbprint,Subject,NotAfter
.\installer\build.ps1 -SignThumbprint <thumbprint>
```

This Authenticode-signs the installer, the uninstaller, and the three
`XPPOS-*.exe` service wrappers (WinSW ships unsigned), all SHA-256 and RFC 3161
timestamped. `signtool.exe` is fetched automatically — no Windows SDK install.

Without a certificate the build still succeeds and warns. **Release builds
distributed to customers should always be signed**: an unsigned installer
downloaded from the web triggers a SmartScreen warning, and unsigned executables
registered as Windows services are what endpoint protection flags.

See `NATIVE_MIGRATION_NOTES.md` for the architecture, the decisions behind it,
and the traps found along the way.
