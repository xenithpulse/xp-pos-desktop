# Phase 12 — XenithPulse branding and first-run experience

**Status:** built. `npx tsc --noEmit` clean, `installer\build.ps1` green,
installer compiled and its icon verified in the `.exe`.
**Not yet verified by execution:** the wizard pages and the finish page have not
been seen on a real install. See "What still needs a real box" at the bottom.
**Depends on:** nothing technical.

> **Code signing is NOT in this document.** It is a security and trust
> prerequisite, not a cosmetic concern, and has its own document,
> `PHASE-9-CODE-SIGNING.md`. A polished wizard behind a SmartScreen warning
> undoes most of the work here, so confirm signing landed before calling this
> done.

Read `docs/handover/README.md` first for project state and ground rules.

---

## What this phase turned out to be

It was scoped as decoration: icons, wizard imagery, in-app naming. Two of those
were real. The third was already done — the login page, sidebar, error pages and
reports already said XenithPulse.

What the audit found instead was that **a stranger could not use this product at
all**, for reasons that had nothing to do with how it looked:

1. **There was no way to log in.** A fresh install has an empty database and no
   account. The only route to a first account was
   `/api/injections/seed-admin`, which created a `reviewer` / `reviewer@123`
   super_admin — on an unauthenticated GET that never called `guardInjections`,
   so `ENABLE_SETUP_ENDPOINTS` did not gate it. `.env.example` shipped that flag
   as `true` anyway.
2. **Nothing told anyone where the POS was.** The Start menu offered service
   status, a config folder and a log folder. The LAN address was printed only by
   `provision.ps1`, into a console `setup.iss` launches with `SW_HIDE`.
3. **The port is not fixed.** Provisioning moves off 8080 when it is taken, so
   even guessing was unreliable.

So this phase is branding *and* the path from double-clicking the installer to
taking a first order.

---

## What was built

### 1. The mark

Emerald `#34D399` pulse waveform on near-black, matching `.xp-trace` on the
login page. There was no XenithPulse logo in the repo; `app/favicon.ico` was a
placeholder black circle with a white triangle, and is now generated from the
same mark.

Everything is produced by **`installer/branding/make-branding.ps1`**, which
needs nothing but Windows — `System.Drawing` plus `public/fonts/LunaObscura.ttf`.
Outputs are checked in; the script is how they are *reproduced*.

| Asset | Notes |
|---|---|
| `XP-POS.ico` | 16/24/32/48/64/128/256, each **rendered natively** at its size |
| `app/favicon.ico` | same mark, 16/32/48/256 |
| `WizardImage.bmp` + `@2x` `@3x` | 164x314 left panel |
| `WizardSmallImage.bmp` + `@2x` `@3x` | 55x58 header badge |
| `XP-POS-mark.png` | 512px, for docs |

Two things in that script are worth not rediscovering:

- **Icons are rendered per size, not downscaled from one master.** Stroke weight
  and the glow are functions of the target size, and the glow is dropped
  entirely below 48px where it only turns to mud.
- **A glow needs many low-alpha passes.** Two or three heavy ones render as
  concentric bands that look like a rendering bug. Fourteen at alpha 7
  approximate a real bloom.

### 2. The installer

`setup.iss`:

- `SetupIconFile` (compile time) and `UninstallDisplayIcon` (run time, resolved
  against the payload copy). **They are different requirements.**
- Wizard imagery with `@2x`/`@3x` variants.
- `LicenseFile=LICENSE.txt` — a plain-English EULA, drafted here, describing what
  Phase 11 actually enforces (trial expiry makes the POS **read-only**; it does
  not stop or delete anything).
- Contact metadata: `AppSupportURL`, `AppContact`, `AppUpdatesURL`,
  `AppPublisherURL`, `AppComments`, `AppVerName`, `AppReadmeFile`.
- `[Messages]` replacing the welcome and finish wording, and
  `StatusInstalling`, because provisioning is silent and takes minutes — the
  wizard looked frozen and people killed it mid-configure.
- A `desktopicon` task.

### 3. The way in

The shortcut that opens the POS is written by **`provision.ps1`**, not by Inno,
because only provisioning knows the port. Re-running provisioning refreshes it,
which makes a port change self-healing instead of a support call.

- `%ProgramData%\XP POS\XP POS.url` — an internet shortcut carrying the product
  icon, pointing at `127.0.0.1` (the loopback keeps working when the machine's
  LAN address changes). Copied to the Start menu group, and to the public
  desktop when the task was ticked.
- `%ProgramData%\XP POS\connect-info.txt` — the customer-facing connection card:
  the LAN address, how to create the owner account, what to check when a tablet
  cannot connect, where the data and logs are. It is also `AppReadmeFile` and a
  Start-menu entry.
  **Line 1 is load-bearing:** it is the bare staff URL, and `setup.iss` reads it
  to put the real address on the finish page. When no LAN address is found,
  line 1 is deliberately *not* a URL, so the wizard shows its "not on the
  network yet" wording rather than advertising a loopback address to tablets.
- The finish page now shows that address, and offers "Open XP POS now" —
  guarded by `PosIsReachable`, so a failed provisioning offers the log instead
  of a browser error.

### 4. First run, and the security fixes that came with it

- **`/setup`** (`app/(auth)/setup/`) creates the owner account when the admins
  collection is empty. It is self-closing: once an account exists it redirects
  to login forever. Not behind `ENABLE_SETUP_ENDPOINTS` — that flag guards
  things which stay dangerous while switched on; this disarms itself, and making
  a customer edit a `.env` before they can log in is the problem being solved.
- **`login/page.tsx` is now a server component** that redirects a
  never-configured box to `/setup`. The form moved to `LoginForm.tsx`.
  `hasAnyAdmin()` caches only the *positive* answer — caching a "no" would
  reopen account creation whenever Mongo hiccuped.
- **`seed-admin` no longer invents credentials.** POST only, actually guarded,
  caller supplies the password, and it will not overwrite an existing account
  (the old version used `upsert:true`, so calling it silently reset a real
  owner's password).
- **All 11 `/api/injections/*` routes now call `guardInjections`.** Nine did
  not. `reset-status`, `pos-data` and `normalize-orders` were unauthenticated
  and destructive, reachable from any device on the restaurant's LAN.
- **`ENABLE_SETUP_ENDPOINTS` ships `false`,** and provisioning **forces it off**
  on existing boxes. That is the one deliberate exception to "never touch an
  existing `.env` value": the merge only adds absent keys, so every site
  provisioned under the old template would have kept it on forever.

### 5. Build assertions

`build.ps1` stages `branding\XP-POS.ico` into the payload and asserts:

- the icon is present, multi-resolution, and covers 16px and 256px
- all six wizard BMPs exist **and begin with `BM`** — Inno silently refuses a
  PNG renamed to `.bmp`, leaving a blank panel and no error
- `LICENSE.txt` exists

Plus two **warnings** that fire until the real values go in — placeholder
contact details, and the EULA's `[REVIEW BEFORE SHIPPING]` markers. Warnings,
not assertions, so a developer build stays green.

---

## What is deliberately still open

**Contact details are placeholders.** `support@xenithpulse.com`,
`xenithpulse.com`. They live in exactly three places, all marked
`TODO(XenithPulse)`:

- `installer/setup.iss` — four `#define`s at the top
- `config/brand.ts`
- `installer/scripts/provision.ps1` — `$SupportEmail`

**The EULA needs a lawyer.** It was drafted here, in plain English, and it
describes the product accurately. It is not legal advice. Two
`[REVIEW BEFORE SHIPPING]` blocks — governing law, and the legal entity name and
address — must be filled in. The build warns until they are.

**No in-app connect card.** Staff devices are onboarded by typing the address
from `connect-info.txt`. A QR code on a page in `server-management` would be
better and needs no new dependency if drawn as SVG. Not built; not required for
the flow to work.

---

## Acceptance criteria

- [x] `npx tsc --noEmit` clean
- [x] `.\installer\build.ps1` green, all assertions passing
- [x] Installer `.exe` shows the XP POS icon — verified by extracting the icon
      resource from the compiled `.exe`
- [ ] Wizard shows XenithPulse imagery and wording — **needs a real install**
- [ ] Add/Remove Programs shows the icon and XenithPulse as publisher
- [ ] Start-menu and desktop shortcuts show the product icon and open the POS
- [ ] `/setup` creates the owner account on a genuinely empty database
- [ ] Signing (Phase 9) confirmed still in place after the `setup.iss` changes

## What still needs a real box

Ground rule 6 says verify by execution. Everything above the line was verified
that way; the list below could not be, because it needs an actual install:

1. Run the installer. Check the licence page, the left panel on welcome and
   finish, and the badge top-right on the middle pages.
2. Check the finish page shows a real `http://<lan-ip>:<port>` address, and that
   "Open XP POS now" opens it.
3. Open that address from a *different* device. It must land on `/setup`.
4. Create the owner account. Confirm `/setup` then redirects to login, and that
   the credentials work.
5. Check Add/Remove Programs: icon, publisher, and that the Readme link opens
   `connect-info.txt`.
6. Uninstall. Confirm the desktop and Start-menu shortcuts are gone.

## Watch out for

- **BMP, not PNG,** for wizard images. Inno silently refuses PNGs. The build now
  checks the two magic bytes.
- Inno needs the `.ico` at **compile** time and a copy in the payload at **run**
  time. Different requirements; supplying one leaves a broken icon somewhere.
- If you add files to `installer/branding/`, add them to the payload staging in
  `build.ps1` **and** to the assertions, or a future build can drop them
  silently.
- `redirect()` in a Next server component works by **throwing**. Calling it
  inside a `try` whose `catch` swallows errors silently disables the redirect.
  Both first-run redirects call it outside the `try` for this reason.
- Do not sign inside `[Files]`; Inno compresses whatever it is given. Sign the
  wrappers in the staging step.
