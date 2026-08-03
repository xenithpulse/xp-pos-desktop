# Phase 12 — XenithPulse branding

**Status:** not started
**Depends on:** nothing technical. Deliberately scheduled last: it is the only
remaining phase that changes nothing functional.
**Risk:** low. Almost entirely additive; nothing here changes behaviour.

> **Code signing is NOT in this document.** It was originally filed here, which
> was wrong — it is a security and trust prerequisite for remote update and for
> the trial download funnel, not a cosmetic concern. It has its own document,
> `PHASE-9-CODE-SIGNING.md`, and should already be done by the time you read
> this. If it is not, do that first.

Read `docs/handover/README.md` first for project state and ground rules.

---

## Goal

XP POS must present as a finished XenithPulse commercial product from the first
thing a customer sees (the download) to the last (Add/Remove Programs). Today it
works but looks like an engineering artifact: no icon, no logo in the wizard,
generic Windows dialogs.

## What is already correct

Do not redo these:

- `AppPublisher` is `XenithPulse` and `AppName` is `XP POS` in
  `installer/setup.iss`
- The compiled installer already reports `ProductName: XP POS`,
  `CompanyName: XenithPulse`, `ProductVersion` from `package.json`
- Service display names are human-readable: "XP POS Application", "XP POS
  Database (MongoDB)", "XP POS Web Proxy (Caddy)"

## What is missing

### 1. Icons — the most visible gap

There is **no `.ico` anywhere in the repo.** Consequences today:

- the installer `.exe` shows the generic Inno Setup icon
- `UninstallDisplayIcon` is deliberately **unset** in `setup.iss` with a comment
  explaining why: pointing it at a bundled runtime would show Node's or Caddy's
  icon in Add/Remove Programs, which is worse than the Windows default
- Start-menu shortcuts inherit `powershell.exe`'s icon

**Work:**
- Produce `installer/branding/XP-POS.ico` — a real multi-resolution icon
  (16/32/48/64/128/256 px). A single-size `.ico` looks blurry in Explorer.
- `setup.iss`: set `SetupIconFile=branding\XP-POS.ico` and re-enable
  `UninstallDisplayIcon` pointing at an installed copy of it. Remove the comment
  explaining its absence.
- Ship the `.ico` into the payload (`installer/build.ps1`, staging step) so
  `UninstallDisplayIcon={app}\branding\XP-POS.ico` resolves after install.

### 2. Installer wizard imagery

Inno supports two bitmaps. Both must be **BMP**, not PNG.

| Directive | Size | Where it shows |
|---|---|---|
| `WizardImageFile` | 164x314 (or 2x/3x variants) | left panel, welcome + finish pages |
| `WizardSmallImageFile` | 55x58 (or 2x/3x) | top-right on every other page |

Inno 6 supports high-DPI variants (`@2x`, `@3x` suffixes) — supply them or the
wizard looks soft on modern laptops.

### 3. Wizard text

Currently entirely default Inno wording. Worth customising:

- `AppVerName`, `AppComments`, `AppContact`, `AppSupportURL`,
  `AppUpdatesURL`, `AppReadmeFile`
- A `[Messages]` section to override `WelcomeLabel2` and `FinishedLabel` with
  XenithPulse wording. The finish page is the natural place to show the LAN URL
  for staff devices, which currently only appears in the provisioning console
  output that runs hidden.
- A licence page (`LicenseFile=`) — needed anyway for Phase 10, and it is the
  conventional place for the EULA.

### 4. In-app branding

Check what the POS itself shows. `features/server-management/` and the login
page are the obvious surfaces. Search for hardcoded product naming:

```powershell
Select-String -Path app,features,components -Include *.tsx -Pattern 'XP POS|XenithPulse' -Recurse
```

`NEXT_PUBLIC_*` values are inlined at build time, so **do not** introduce a
`NEXT_PUBLIC_BRAND_NAME` — that would re-tie the compiled artifact to a
configuration and undo what makes one installer shippable to every site.
Hardcode it or read it server-side.

### 5. Signed installer — see Phase 9

Handled separately in `PHASE-9-CODE-SIGNING.md`. A polished wizard behind a
SmartScreen warning undoes most of the work in this document, so confirm signing
landed before calling branding done.

---

## Acceptance criteria

- [ ] `npx tsc --noEmit` clean
- [ ] `.\installer\build.ps1` green, all assertions passing
- [ ] Installer `.exe` shows the XP POS icon in Explorer
- [ ] Wizard shows XenithPulse imagery and wording
- [ ] Add/Remove Programs shows the XP POS icon and XenithPulse as publisher
- [ ] Start-menu shortcuts show the product icon
- [ ] Signing (Phase 9) confirmed still in place after any `setup.iss` changes

## Watch out for

- **BMP, not PNG,** for wizard images. Inno silently refuses PNGs.
- Inno needs the `.ico` at **compile** time (`SetupIconFile`) *and* a copy in
  the payload at **run** time (`UninstallDisplayIcon`). They are different
  requirements; supplying only one leaves a broken icon somewhere.
- If you add files to `installer/branding/`, add them to the payload staging in
  `build.ps1` **and** to the `Assert-Payload` list, or a future build can drop
  them silently.
- Do not sign inside `[Files]`; Inno compresses whatever it is given. Sign the
  wrappers in the staging step.
