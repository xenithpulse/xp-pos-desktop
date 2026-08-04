# Phase 10 — brutal test plan for a real laptop (no snapshots)

Written for whoever is at the keyboard for this: a second laptop, no VM, no
snapshot to roll back to. That changes the *order* of testing — each test's
end-state is the next test's start-state — but not the scenarios. These are
the four PHASE-10-REMOTE-UPDATE.md lists under "Still to test on a VM with a
snapshot." Read that doc's "How it works" first if any gate below seems
arbitrary.

**One channel: `stable`.** There is deliberately no beta channel. A second
channel is a second thing to publish to, reason about and get wrong, and the
install base does not justify it. The trade is that this test runs against
the same channel real sites read — so read the safety note next, it is what
makes that acceptable.

## Why this is safe to run against `stable`

Nothing in the field is listening yet. Every existing `.env` has
`POS_UPDATE_URL` **blank**, which turns the feature off entirely — no
requests, no timers. The only box that will fetch `stable` is the test laptop,
because you are about to set that key on it by hand.

That stops being true the moment a build ships with the URL defaulted (it now
is, from the next build onward — see `.env.example`). **From then on, publishing
to `stable` reaches every new install automatically.** Which is the whole
point, and the reason the signing rule below is not negotiable.

## The signing problem — read before starting

`0.2.0` is **unsigned**. The Phase 9 certificate has not been purchased.

`env.template` ships `POS_UPDATE_ALLOW_UNSIGNED=false`, so a box refuses to
install a payload Windows cannot verify. On the test laptop you will set it to
`true` to exercise the path — **that setting is for this laptop and nothing
else.** It is the documented escape hatch for exactly this situation and it
is a real hole while it is open: it means the box will run an installer
downloaded off the internet as Administrator without checking who made it.

The corollary, which is the single most important operational rule to come
out of this phase:

> **Never publish an unsigned build to `stable` once boxes point at it.**
> They will fetch it, refuse it, and show their owner a warning about an
> update they cannot install — with no way for them to fix it.

`0.2.0` went to `stable` while the install base was still zero. The next
release should be signed, and if the certificate has not arrived by then, the
right move is to not publish rather than to publish unsigned.

## What you need

- A Windows laptop, admin rights, internet.
- **`XP-POS-Setup-0.1.0.exe`** — the previous release, as the "old version"
  baseline. It is no longer the one `stable` points at, so take it directly:
  `https://updates.xenithpulse.com/releases/XP-POS-Setup-0.1.0.exe`
- Nothing else to download. `0.2.0` is what the laptop will fetch *through the
  update channel* — that is the thing under test.

## Step 0 — baseline install

1. Install `XP-POS-Setup-0.1.0.exe`. Complete first-run setup with sample data
   (a few menu items, a floor plan) so there is real data to prove survives.
2. `Get-Service XPPOS-App, XPPOS-MongoDB, XPPOS-Caddy` → all `Running`.
3. Edit `C:\ProgramData\XP POS\.env`:
   ```
   POS_UPDATE_URL=https://updates.xenithpulse.com/manifest.json
   POS_UPDATE_ALLOW_UNSIGNED=true
   POS_UPDATE_AUTO_INSTALL=false
   ```
   Leave `POS_UPDATE_CHANNEL=stable` alone. `AUTO_INSTALL=false` keeps every
   install in this plan a deliberate button press.
4. `Restart-Service XPPOS-App` so the agent re-reads `.env`.
5. Open **Server Management → Updates**. It should report `0.2.0` available
   within a few seconds — the tab now fires a check when it opens rather than
   waiting on the six-hourly timer. If it says "up to date", the `.env` edit
   did not take: check for a BOM and that the service actually restarted.

**Record the starting state**, since there is no snapshot to return to:
laptop on `0.1.0`, `0.2.0` offered, nothing installed.

## Scenario 1 — orders open must block an install

1. Open an order that counts: send one **out for delivery** (always blocks),
   or touch a draft so it falls inside the 30-minute window.
2. Updates tab → **Install now** (signed in as admin — this endpoint is the
   one part of Server Management that requires it).
3. **Expected:** refused, with the open order named as the reason.
   `XPPOS-App` still on `0.1.0` afterwards.
4. Complete or deliver the order, re-check. **Expected:** the blocker clears.

Do not carry an open order into Scenario 2.

## Scenario 2 — power cut mid-install

A laptop cannot have its plug pulled meaningfully, so hold the power button
(~5s) instead. The point is the process vanishing mid-write, not the power
source.

1. From an idle, order-free state, press **Install now**.
2. Watch `C:\ProgramData\XP POS\updates\`. `install-in-progress.json` is
   written immediately *before* the installer launches. The moment it appears
   — or the silent installer shows up in Task Manager — hard-power-off.
3. Boot. Let the services come up on their own (they are Automatic/Delayed
   Start; give it a couple of minutes with nobody logged in, which is also
   worth confirming).
4. **Two outcomes are both correct**, per the reconciliation logic: version
   moved → success; version unchanged → reported as **interrupted**, box
   still on `0.1.0`. Either is a pass.
   **Failures:** services do not start; the box is half-upgraded (new files,
   old service registration or vice versa); or the outcome is reported as
   success when the version did not actually move.
5. Confirm the Updates tab states which happened, in plain language, without
   needing a PowerShell prompt.

If it landed on "interrupted", press Install now again to reach Scenario 3's
starting state.

## Scenario 3 — a real end-to-end install, and what must survive

1. **Before installing**, record: an order number and its total; an uploaded
   menu image filename; the full `.env`; and
   `C:\ProgramData\XP POS\site-id.json`.
2. Install and let it finish undisturbed.
3. After services restart, verify **all** of:
   - the order still exists, same total
   - the uploaded image still present and still served
   - `.env` unchanged (bar keys provisioning legitimately added)
   - `site-id.json` **byte-identical** — a changed site id would read as a new
     install to anything keyed off it, licensing included
   - the dashboard reports `0.2.0`
4. Also confirm the three services are Running and the POS takes a new order.

## Scenario 4 — provision.ps1 key merge on a pre-Phase-10 `.env`

Standalone; no reinstall needed.

1. Copy the laptop's `.env` somewhere safe.
2. Make a "pre-Phase-10" copy: delete every `POS_UPDATE_*` key, plus
   `POS_DATA_DIR` and `POS_SITE_ID`.
3. Note the site's chosen `POS_HTTP_PORT` and its `NEXTAUTH_SECRET` — these
   are what must survive untouched. Note any key deliberately left blank
   (e.g. `POS_ALLOWED_CIDRS=`).
4. Run `provision.ps1` as Administrator against it.
5. **Expected:** absent keys arrive at template defaults; port and secret
   byte-identical; deliberately-blank keys **not** re-added; file still
   BOM-less; a second run changes nothing.
   **Note the one that matters most now:** `POS_UPDATE_URL` in the template
   is no longer blank, so this merge is what would switch updates on for a
   site that never had the key. Confirm that is what you want before running
   it against a real customer's box.
6. Restore the real `.env`.

## After all four

- Update the "Still to test on a VM with a snapshot" section in
  `PHASE-10-REMOTE-UPDATE.md` with what actually happened — not just ticks.
- Set `POS_UPDATE_ALLOW_UNSIGNED` back to `false` on the laptop.
- The next release to `stable` should be signed. See the signing rule above.
