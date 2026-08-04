# Resilience and QA

**Status:** built and verified on a live install. `-Destructive` recovery
testing and the reboot procedure still need a run on a real box — see
"Sign-off" at the end.

Not a numbered phase. It hardens what phases 9–11 already delivered rather than
adding a feature, and it is the answer to one question:

> **When something stops the POS, what brings it back without a human?**

Read `docs/handover/README.md` first for project state and ground rules.

---

## The premise, corrected

It is widely believed that Windows stops services that have been idle for a
while. **It does not.** A Win32 service that is running stays running until
something stops it. Chasing that non-existent behaviour would have produced a
keep-alive that solved nothing.

What *does* leave an XP POS service stopped, in rough order of how often it will
actually happen on a customer site:

| # | Cause | Does Windows fix it? |
|---|---|---|
| 1 | **A dependency is stopped.** Stopping `XPPOS-MongoDB` makes Windows stop `XPPOS-App` and `XPPOS-Caddy` too. Starting MongoDB again brings back **only MongoDB.** | **No.** The SCM stopped them deliberately, so nothing failed as far as it is concerned. |
| 2 | **A clean exit.** The process ends with code 0. | **No** — not unless `FAILURE_ACTIONS_ON_NONCRASH_FAILURES` is set. It was FALSE on the live box. |
| 3 | **A crash.** | Yes — recovery actions restart after 10s / 30s / 60s. |
| 4 | **Recovery exhaustion.** More than three failures inside the 3600s reset window. | **No.** Windows gives up and leaves it stopped. |
| 5 | **An in-place Windows feature update** (23H2 → 24H2 and similar). Can leave third-party services Disabled. | **No.** |
| 6 | **An update interrupted by a power cut.** `apply-update.ps1` restores the services if the *installer* fails, but it cannot do anything if the box loses power while it is running. | **No.** |
| 7 | **A reboot** (including Windows Update's). | Yes — Automatic (Delayed Start), shortened to 30s. |

Only rows 3 and 7 were covered before this work. **Rows 1, 2, 4, 5 and 6 were
not covered by anything**, and row 1 is the most likely of the lot.

## What was built

### 1. Recovery on clean exits

`sc failureflag <service> 1`, applied to all three in `services.ps1`.

Without it Windows fires recovery actions only on an *unexpected* termination.
This matters more here than it would elsewhere: these are WinSW-wrapped
services, so the service process is the **wrapper**, and the wrapper exits 0 in
several situations where the child died — the exact case Windows was ignoring.

Verified as FALSE on the live box before the fix. `qa-check.ps1` asserts it.

### 2. `XPPOS-Watchdog` — a scheduled task, not a fourth service

`installer/scripts/watchdog.ps1`, run as SYSTEM at startup (2-minute delay) and
every 5 minutes.

**It is a scheduled task on purpose.** The thing that repairs the services
cannot be one of the services it repairs — a watchdog service could be taken
down by the very dependency cascade, recovery exhaustion or feature update it
exists to recover from, and nothing would notice. Task Scheduler is a separate
subsystem with its own recovery, runs with no session, and survives the reboots
Windows Update forces.

Escalation, deliberately conservative:

1. **An update is in progress** (fresh install marker) → do nothing at all.
   Racing an installer for the same files is worse than a stopped service.
2. **A service is Disabled** → re-enable it (`delayed-auto`) and start it. This
   is what a feature update leaves behind.
3. **A service is stopped** → start it, in dependency order.
4. **A service is missing entirely** → re-run `provision.ps1`, rate-limited to
   once every 6 hours. Only for *missing*, never for merely stopped:
   re-provisioning bounces all three services, and doing that on a hair trigger
   would turn a five-second blip into a minute of downtime during service.
5. **All Running but nothing answers `/login`** → restart `XPPOS-App` once, then
   leave it alone for an hour. A wedged node process is the realistic cause and
   a restart is the realistic fix; bouncing it every five minutes forever would
   take a degraded POS and make it an unusable one.

A stale install marker (>45 min) is treated as an interrupted update: the
watchdog repairs the services and says so in the log, and the app's own
`reconcileInterruptedInstall` reports it in Server Management once it is up.

**A healthy run writes nothing.** Silence in `logs\watchdog.log` means the POS
was up every time it was checked, which is the report worth having.

### 3. The maintenance pause

`services.ps1 -Action Stop` writes `watchdog-pause` with an **expiry** (default
60 minutes). Without it, a technician stopping the POS for maintenance would
watch it restart itself four minutes later and reasonably conclude the box was
possessed.

The expiry rather than a flag is the point: a pause that must be cleared by hand
is one that gets forgotten, and **a watchdog that is silently off is worse than
no watchdog at all**, because everyone believes it is working. `-Action Start`
and `-Action Restart` clear it immediately; `-Action Status` reports it in red.

### 4. `qa-check.ps1` — the device test

`installer/scripts/qa-check.ps1`. Three modes:

```powershell
.\qa-check.ps1               # read-only, safe during service
.\qa-check.ps1 -Destructive  # kills services, proves recovery. NOT during service
.\qa-check.ps1 -Reboot       # prints the manual power-cut procedure
```

It checks the install tree, all three services (running, delayed-auto,
LocalSystem, recovery actions, the non-crash flag, the dependency chain), the
watchdog (registered, enabled, ran recently, not paused), HTTP on the real port,
the LAN address and firewall rule, MongoDB actually being a replica set
**PRIMARY**, the Phase 11 licence state and fingerprint strength, the Phase 10
update channel and `POS_UPDATE_ALLOW_UNSIGNED`, the Phase 9 signature state, and
backups. Every result is PASS / WARN / FAIL, and it writes a report to
`logs\qa-report-<stamp>.txt` that can be emailed.

`WARN` is something a site can legitimately ship with (no update URL on an
offline box, unsigned builds before the certificate is bought). `FAIL` is
something that will become a support call. **A run full of yellow that still
says 0 failed is a box that can be left with a customer.**

`-Destructive` does two things a checklist cannot:

- **Kills the `XPPOS-App` process** — not `Stop-Service`. An orderly stop
  deliberately does not trigger recovery actions, so testing that way proves
  nothing and looks like a pass. Killing the process is what a crash actually
  is.
- **Stops `XPPOS-MongoDB`** to trigger the dependency cascade, restarts only
  MongoDB, then runs the watchdog and confirms all three come back.

## Live results on the build machine

Read-only run against the current install:

```
29 passed, 4 warnings, 2 FAILED
```

The two failures were correct and expected — that box was installed from a build
that predates `watchdog.ps1`. Everything else passed, including the Phase 11
checks that were the point of asking:

```
PASS  licence status resolves      trial - Trial - 30 days left
PASS  hardware fingerprint is strong enough    4 of 4 signals readable
PASS  POS is not licence-restricted
PASS  clock is sane
PASS  MongoDB is a replica set PRIMARY
```

The QA script also found a bug in itself on its first run — the `mongosh --eval`
one-liner did not survive PowerShell's native argument handling and returned a
JavaScript `SyntaxError`. It now passes a quote-free expression.

## Sign-off — what still needs a real box

`qa-check.ps1` covers everything that can be checked from inside a running
Windows session. These four need a human and a power button, and
`.\qa-check.ps1 -Reboot` prints them:

1. **Unattended restart.** Reboot, do **not** log in, open the POS from a
   tablet. Expect service within ~60s.
   *Fast Startup is enabled on most Windows installs, so "Shut down" then power
   on is **not** a real boot — use Restart, or pull the power.*
2. **Power cut during service.** Order open on a tablet, pull the cable, wait
   30s, restore. Expect the order intact and mongod recovering its journal.
3. **Windows Update.** Let it install and reboot on its own, then re-run
   `qa-check.ps1` — a feature update is the case that disables services, and the
   watchdog check is what catches it.
4. **Interrupted update.** Start an update from Server Management, pull the
   power mid-install. Expect the box back on its **previous working version**,
   reported as interrupted rather than leaving a marker on disk forever.

After each: re-run `qa-check.ps1` and confirm **0 failed**.

## Watch out for

- **Do not turn the watchdog into a service.** The entire argument for it is
  that it is not one.
- **Do not widen the re-provision trigger** from "a service is missing" to "a
  service is stopped". Provisioning restarts all three; on a stopped-service
  trigger it would amplify a blip into an outage, repeatedly.
- The watchdog runs as SYSTEM. Anything it invokes runs elevated — treat
  `watchdog.ps1` and everything it calls as trusted code, and never have it
  execute something from `ProgramData`, which is writable by ordinary users.
- `qa-check.ps1 -Destructive` takes the POS down for a minute or two. It says so
  and it is not the default; keep it that way.
- If the watchdog task is missing after an upgrade, `provision.ps1` re-registers
  it — that is the fix for every "self-healing is not working" report, and
  `services.ps1 -Action Status` will say so in one line.
