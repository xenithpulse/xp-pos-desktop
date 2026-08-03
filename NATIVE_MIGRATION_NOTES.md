# XP POS — Docker → native Windows service migration

Handover document. Kept current as each phase lands. If you are picking this up
cold, read "Why" in the project brief first, then Phase 0 below — the three
spikes there are what the rest of the design rests on.

**Status: all phases (0–8) complete.**

`.\installer\build.ps1 -Package` produces **`XP-POS-Setup-0.1.0.exe`, 118 MB** —
a single self-contained installer with Node 24.18.1, MongoDB 7.0.14, Caddy 2.8.4
and WinSW 2.12.0, all sha256-pinned. The payload has been executed; the
installer has been compiled but **not yet run** (see Phase 6).

Decisions taken by the owner: **bundle `mongod.exe`** (not the official MSI),
and ship **stock `caddy.exe` v2.8.4** (LAN-by-IP; `Caddyfile.tls` needs a
plugin build and is documented as such).

`npx tsc --noEmit` passes clean at every phase boundary.

⚠️ **Phase 3 has one unverified item: the boot test.** Registering services needs
Administrator and the real test needs a reboot, neither of which was done on the
dev box. See "What is NOT yet proven" at the end of the Phase 3 section — this
is the single most important thing to check on the first real install, because
it is the entire reason for the project.

---

## Phase 1 — Native config and paths (done)

| Setting | Was | Now |
|---|---|---|
| `MONGODB_URI` | `mongodb://mongo:27017/?replicaSet=rs0` | `mongodb://127.0.0.1:27017/?replicaSet=rs0` |
| `UPLOAD_DIR` | `/data/pos_uploads` | `C:/ProgramData/XP POS/uploads` |

The path layout (program files vs. ProgramData, and why nothing mutable may
live under Program Files) is documented in the `.env.example` header, which is
the file a technician actually reads on a client box.

### NEW hazard — never double-quote a Windows path in `.env`

Next loads `.env` through `@next/env`, and it **expands backslash escapes inside
double-quoted values**. Measured, not assumed:

```
UPLOAD_DIR="C:\ProgramData\nightly\uploads"
  → C:\ProgramData<newline>ightly\uploads     ← \n was treated as an escape
UPLOAD_DIR=C:\ProgramData\nightly\uploads     (unquoted)
  → C:\ProgramData\nightly\uploads            ← fine
UPLOAD_DIR=C:/ProgramData/XP POS/uploads
  → C:/ProgramData/XP POS/uploads             ← fine
```

`\t` and `\r` do the same. `\uploads` is the trap that would actually bite here.
An unquoted backslash path is safe *today*, but one well-meaning edit adding
quotes silently breaks uploads with an error pointing nowhere near `.env`.

**Config therefore uses forward slashes.** Node accepts them on Windows and
normalises through `path.join`. Verified that the traversal guard in
`app/api/uploads/[filename]/route.ts` behaves identically either way, and that
writing to a path containing a space works.

Phase 4's installer must write `UPLOAD_DIR` unquoted with forward slashes.

---

## Phase 2 — Pusher/Soketi → in-process WebSocket (done)

Soketi is gone. The WebSocket server runs inside the Next.js process and shares
the app's own HTTP port at `/ws`. One process, one service, one port.

### What changed

| | |
|---|---|
| Deleted | `lib/realtime/pusher-server.ts`, `clientOptions.ts`, `pusher-client.ts` |
| Created | `lib/realtime/wsServer.ts`, `lib/realtime/wsClient.ts`, `instrumentation.ts` |
| Rewritten internals, identical exports | `lib/realtime/eventBus.ts`, `lib/hooks/useRealtimeSync.ts` |
| Ported | `app/api/daily-sheet/edit-context/route.ts`, `features/sheets/daily/DailySheetContext.tsx` |
| Proxy | both Caddyfiles — the Soketi rule is deleted, not replaced; `/ws` rides the existing catch-all |
| Deps | `-pusher -pusher-js`, `+ws`, `+@types/ws` (dev) |

**Both frozen contracts held.** `app/hub/page.tsx` is byte-identical
(`git diff --quiet` confirms), and none of the 16 route files calling
`broadcastEvent` were touched.

### Verified end-to-end, not just compiled

Against a real standalone build with a live mongod and real next-auth session
cookies — 14 assertions, all passing:

| Check | Result |
|---|---|
| upgrade with no cookie | rejected **401** |
| upgrade with garbage cookie | rejected **401** |
| upgrade with valid session | connects |
| same user, second tab | connects |
| `sendToUser` → both tabs of that user | delivered |
| `sendToUser` → a *different* user | **not** delivered |
| `broadcastEvent` (via real `PUT /api/settings`) → every socket | delivered |
| server ping within ~32s, socket survives | yes |

### Design notes for whoever maintains this

- **`eventBus.ts` imports nothing from `wsServer.ts`.** It reaches the server
  through `globalThis[Symbol.for('xp-pos.realtimeServer')]`. Two reasons: a
  direct import would pull `ws` and `node:http` into every route that
  broadcasts, and it would run wsServer's attach side effect from whichever
  route happened to compile first. The indirection also makes "realtime not
  running" an ordinary state — `broadcastEvent` no-ops and clients poll,
  exactly as they did when Pusher env vars were missing.

- **One socket per browser, not one per hook.** `wsClient.ts` is a ref-counted
  singleton. The hub and DailySheetContext both subscribe to it; the socket
  opens on the first subscriber and closes after the last leaves.

- **Reconnection is ours now.** pusher-js provided it free. Exponential backoff
  from 500ms to 30s with up to 30% jitter subtracted. The jitter is load-bearing
  on an appliance: after a reboot every terminal in the restaurant reconnects at
  once, and un-jittered backoff would keep them in lockstep indefinitely.

- **The reconnect catch-up is preserved.** On transitioning back to `connected`
  after polling, the hook still emits the synthetic
  `{type:'table:updated', entityId:'__poll__', payload:{poll:true}}` event. The
  hub relies on it to resync the floor plan.

- **Payload trimming is gone.** It existed only to stay under Pusher's 10 KB
  cloud limit. The `trimmed?: boolean` fields remain in `types.ts` because
  `app/hub/page.tsx` reads them, but nothing sets them any more; they are
  marked vestigial in place.

### Two security improvements, both deliberate

1. **The socket now requires a valid next-auth session.** Soketi was completely
   unauthenticated — any device that could reach the LAN port received every
   order, table and settings event. The upgrade handler verifies the session
   cookie and rejects with 401 otherwise.

   Implementation note: next-auth's `getToken()` reads `req.cookies` and
   **never** falls back to `req.headers.cookie` (see `SessionStore` in
   `next-auth/core/lib/cookie.js`). A raw `IncomingMessage` from an `upgrade`
   event has no `.cookies`, so `getToken` would return `null` for everyone. We
   parse the cookie header ourselves and hand `getToken` the shape it expects.
   Hand-decoding the JWT was the alternative and is worse — v4 session tokens
   are JWE-encrypted (A256GCM), so it would mean reimplementing next-auth's
   HKDF key derivation.

2. **The compiled artifact is now site-independent.** All four
   `NEXT_PUBLIC_PUSHER_*` build args are gone from `.env.example` and the
   `Dockerfile`. `NEXT_PUBLIC_*` values are inlined into the browser bundle at
   build time, so their presence tied every build to one site's config. The
   browser now derives the socket address from `window.location`. **This is
   what lets one signed installer ship to every client instead of a per-site
   build**, and it is why `wsClient.ts` must never gain a configurable host.

### A latent bug fixed on the way

`features/sheets/daily/DailySheetContext.tsx` had a Pusher block that **had
never executed in production**. It returned early unless
`NEXT_PUBLIC_PUSHER_CLUSTER` was set, and that variable is deliberately empty on
every appliance; it also pointed at `authEndpoint: '/api/pusher/auth'`, a route
that does not exist anywhere in the repo. Backdating the daily sheet has
therefore never synced across a user's tabs. It does now — verified by the
`sendToUser` assertions above. This is a behaviour change, but from "silently
broken" to "works as its comments always claimed".

### Consequence: the Docker stack no longer runs

Soketi is gone and the `PUSHER_*` variables it needed are deleted, so
`docker compose up` will not bring up a working stack from this commit onward.
The compose files, `Dockerfile` and `Caddyfile`s remain on disk as reference
until Phase 8 deletes them. This is intended, but it means **there is no Docker
fallback during the remainder of the migration.**

---

## Phase 0 — Spike results

All three questions were answered by execution on Windows 11 x64, Node v25.6.1,
against this repo at commit `142eac9`. Nothing below is inferred.

### Q1 — Does `instrumentation.ts` `register()` run under `output: "standalone"`? **YES**

And better than required: the WebSocket server can share **the app's own HTTP
port**. No sidecar, no second listener, no shared secret.

Observed from a real `.next/standalone/server.js` run:

```
[spike:instrumentation] register() ran — pid=7172 runtime=nodejs
    foundServer=true upgradeListenersBefore=1 wsAttached=true

GET /api/spike-check →
{"seen":true,"routePid":7172,"samePid":true,
 "instrumentation":{"pid":7172,"runtime":"nodejs","wsAttached":true}}

ws://127.0.0.1:3999/ws → open
    message = {"hello":"from in-process ws","pid":7172}
```

`samePid: true` and the identical pid in the socket payload prove the
instrumentation hook, the API routes, and the WebSocket server are one process
sharing one `globalThis`. **Phase 2 takes the in-process design.**

Four findings that constrain how Phase 2 must be written:

1. **`register()` runs AFTER Next has created and bound its HTTP server.**
   `next/dist/server/lib/start-server.js` calls `http.createServer()` itself and
   is already listening by the time the hook fires. Monkeypatching
   `http.createServer` from instrumentation is therefore too late and will
   silently never fire. The spike instead locates the server through
   `process._getActiveHandles()`, picking the listening handle that has a
   `'request'` listener. Undocumented but stable across Node 18–25, and it is
   the only way to reach a server we did not create.

2. **Everything Node-specific must sit behind a dynamic `import()`.** Next
   compiles `instrumentation.ts` for *every* runtime including edge, and the
   compile-time module trace does not respect the `NEXT_RUNTIME` runtime guard.
   A first attempt with the body inline produced three edge-runtime errors for
   `process.pid` and `process.cwd()` alone — `ws` and `node:http` would be worse.
   The working shape is:

   ```ts
   export async function register() {
     if (process.env.NEXT_RUNTIME !== 'nodejs') return;
     await import('./lib/realtime/wsServer');   // Node-only code lives in here
   }
   ```

3. **Next owns the first `upgrade` listener (`upgradeListenersBefore=1`) and
   ours is additive.** Both fire for `/ws`. Taking the socket with
   `wss.handleUpgrade()` in `noServer` mode was clean — no error, no warning
   from Next's handler on a hijacked socket. Our listener must `return` early
   for any non-`/ws` path so Next keeps its own (dev HMR uses it).

4. **Unmatched upgrade paths hang rather than being refused.** A control probe
   to `/not-ours` neither opened nor errored — it timed out. That is Next's
   production behaviour, not something Phase 2 introduces, but it means a
   client typo in the socket path presents as a hang, not a clean failure.
   Worth knowing when debugging on a client site.

5. **A route folder must not start with `_`.** The spike route was first placed
   at `app/api/_spike/` and 404'd — Next treats `_`-prefixed folders as private
   and excludes them from routing entirely. It does not warn.

### Q2 — Does `next build` produce a working standalone bundle on Windows? **YES**

`✓ Compiled successfully in ~22s`, all 98 API routes present, and
`node .next/standalone/server.js` serves real traffic. Both native modules are
carried into `.next/standalone/node_modules` automatically:

- `bcrypt/prebuilds/win32-x64/bcrypt.node` — and executed, not just inspected:
  `bcrypt.hashSync` + `compareSync` round-trip returns `true`.
- `@img/sharp-win32-x64`

Two hazards this surfaced, both of which Phase 5 must handle:

- **`next build` copies `.env` into `.next/standalone/.env`.** The shipped
  bundle would otherwise carry the *developer's* `NEXTAUTH_SECRET` to every
  client site — every box sharing one secret means a token minted on one
  authenticates on all of them. **The build pipeline must delete
  `.next/standalone/.env` after building.** Config comes from ProgramData at
  runtime (Phase 1).

- **A stale `.next` fails the build with an error that looks like a code
  defect.** The first build died on
  `Cannot find module '../../../app/messenger/page.js'` from
  `.next/dev/types/validator.ts` — a generated file dated Jul 11 referencing a
  route deleted since. `tsconfig.json` includes `.next/dev/types/**/*.ts`, so
  the stale artifact gets type-checked. Docker never hit this because it builds
  in a clean container. **The build pipeline must remove `.next` first.**
  Nothing was wrong with the source.

### Q3 — Can `mongod.exe` run a single-node replica set on 127.0.0.1 with transactions? **YES**

Tested with MongoDB **7.0.14** Windows x64, `--replSet rs0 --bind_ip 127.0.0.1`,
driven through the *same* `mongodb` driver the app uses (via mongoose) rather
than mongosh, so this exercises the real code path:

```
rs.initiate ok = 1
reached PRIMARY = true
connected via ?replicaSet=rs0     (the app's URI shape)
commit  → orders = 1  tables = 1
abort   → threw as expected: deliberate abort
rollback verified = true (orders still 1)
```

Both halves matter: a committed multi-collection transaction, and an aborted one
that rolled *both* writes back. That is the pattern
`app/api/pos/fire-order/route.ts` depends on.

Notes for Phases 4–6:

- `--bind_ip 127.0.0.1` verified by `Get-NetTCPConnection`: the listener is on
  `127.0.0.1` only, never `0.0.0.0`. This is the fix for the `--bind_ip_all`
  exposure the compose file gets away with only because Docker never publishes
  the port.
- `replSetInitiate` must be tolerant on re-run — it throws `AlreadyInitialized`.
  The installer must catch that specific code and continue.
- **`rs.initiate` returns before the node is actually PRIMARY.** The spike had
  to poll `hello.isWritablePrimary` for up to 30s. An installer that initiates
  and immediately starts the app will race.

---

## Phase 8 — Docker artifacts removed (done)

All deleted via `git rm`, so every file is recoverable from history:

```
docker-compose.yml   Dockerfile   Caddy.Dockerfile   .dockerignore
caddy/               (Caddyfile.http, Caddyfile.tls, entrypoint.sh)
dns/                 (Linux-only dnsmasq, never used on Windows)
deploy.cmd           scripts/deploy.ps1
lib/backup/backup.sh
```

Two beyond the brief's explicit list, both unambiguous Docker artifacts:
`.dockerignore`, and `caddy/` — its Caddyfiles are superseded by
`installer/config/` and it contained a Docker `entrypoint.sh`. Keeping them
would have left two competing sets of Caddyfiles.

### `proxy.ts` was NOT deleted — do not delete it

It sits in the repo root alongside the Docker files and looks like one. It is
**Next 16's renamed `middleware.ts`**: the Edge-runtime rate limiter that caps
credential sign-in attempts at 5 per 15 minutes per IP. Deleting it silently
removes the only credential-stuffing protection on the login endpoint.

(It is also why Phase 2's edge-runtime constraint is real — this app genuinely
compiles for the edge runtime, so `instrumentation.ts` must keep its Node-only
code behind a dynamic import.)

### Stale instructions were the bigger problem

Deleting files was trivial. The real risk was **documentation and UI that would
send a technician down a dead end on a native box.** Everything below told
someone to run a `docker compose` command that no longer exists:

| Location | Was |
|---|---|
| `features/server-management/components/NetworkSettings.tsx` | "run `docker compose up -d caddy`" — **shown in the POS UI** |
| `features/server-management/components/SystemHealth.tsx` | "Keep OS and Docker updated" — shown in the UI |
| `.env.example` (ships as `config/env.template`) | two `docker compose` instructions |
| `SERVER_MANAGEMENT_COMPLETE.md` | 12 commands |
| `SETUP_SERVER_MANAGEMENT.md` | 13 commands |
| `features/server-management/README.md` | 2 commands |
| `next.config.ts`, both upload routes | comments describing a Docker volume |

All rewritten to native equivalents (`services.ps1`, `provision.ps1`, the
ProgramData log paths, bundled `mongosh.exe`/`mongodump.exe`). Historical
mentions that explain *why* something is the way it is were deliberately kept —
for example the `.env.example` note about `--bind_ip_all` only being survivable
under Docker.

Two genuinely useful facts surfaced while rewriting the runbooks, and are now
documented where a technician will hit them:

- The services run as **LocalSystem**, so a mapped drive letter belonging to a
  logged-in user is invisible to them. Backup paths must be full paths or UNC
  shares. This will otherwise present as "backups succeed but no files appear".
- MongoDB sizes its WiredTiger cache at 50% of RAM minus 1 GB. On a shared box
  that is worth capping in `mongod.cfg`.

### `DEPLOY.md` rewritten

Now documents the native install end to end: prerequisites, what the installer
does, the ProgramData/Program Files split, the three services, day-to-day
`services.ps1` operations, log locations, configuration changes, the AVX
requirement, troubleshooting, uninstall, backups, and how a developer builds the
installer.

The unattended-start verification is called out near the top with the reasoning
attached, because it is the reason this project exists and it is the one step a
technician is most likely to skip.

---

## Risks confirmed or revised by the spikes

### Installer size is far smaller than feared — but the payload needs three downloads

The brief estimated 300–500 MB dominated by MongoDB. The 591 MB server zip is
**almost entirely debug symbols**:

| File in `mongodb-windows-x86_64-7.0.14.zip` | Size | Ship it? |
|---|---:|---|
| `mongod.exe` | 60.7 MB | **yes** |
| `mongod.pdb` | 986.8 MB | no — debug symbols |
| `mongos.exe` | 35.6 MB | no — sharding router, single node here |
| `mongos.pdb` | 554.6 MB | no |
| `vc_redist.x64.exe` | 24.1 MB | see below |

So the real MongoDB payload is **~61 MB**, not ~500 MB.

**But the server zip contains no `mongosh`, no `mongodump`, no `mongorestore`.**
Those have been separate downloads since MongoDB 4.4/5.0. Phase 5 needs three
pinned artifacts, not one:

1. MongoDB Server zip → `mongod.exe`
2. MongoDB Database Tools zip → `mongodump.exe`, `mongorestore.exe` (Phase 7
   backups depend on these)
3. `mongosh` zip → `mongosh.exe`

Phase 4 can avoid needing `mongosh` for `rs.initiate` entirely by doing it
through the bundled `node.exe` and the `mongodb` driver already in the bundle —
that is exactly what the Q3 spike did. `mongosh` is then only a support tool.

### NEW — MongoDB needs the VC++ runtime, which is a prerequisite

`mongod.exe` imports `msvcp140.dll` and `vcruntime140.dll` (VC++ 2015–2022
redistributable). Present on this dev box, **not guaranteed on a clean Windows
10 install** — which is why MongoDB ships `vc_redist.x64.exe` inside the zip.

This directly threatens the "no prerequisites of any kind" constraint. Phase 6
must either chain `vc_redist.x64.exe /install /quiet /norestart`, or place the
two DLLs beside `mongod.exe` (side-by-side loading). Chaining the official
redist is the safer of the two. **Not yet decided — flagging for Phase 6.**

### Unchanged risks, still open

- **MongoDB is SSPL-licensed.** Redistributing `mongod.exe` in a commercial
  installer needs a legal opinion. The alternative — chaining the official MSI —
  is more defensible but adds an install step and a reboot risk. Not a technical
  blocker; needs a decision before go-live.
- **MongoDB 5.0+ requires AVX.** Celeron/Pentium N-series (N3350, N4000/N4020,
  N5030) lack it and `mongod` dies with `Illegal instruction`. Either pin 4.4
  for that hardware or detect AVX at install and fail loudly with a clear
  message. Detection is the better default — a silent `Illegal instruction` on a
  client site is the worst possible failure mode.
- **Code signing.** Without a certificate SmartScreen warns on every install.

---

## Phase 3 — Service layer (done, except the boot test)

Three WinSW-wrapped services. Files live in `installer/`:

```
installer/service/   XPPOS-MongoDB.xml  XPPOS-App.xml  XPPOS-Caddy.xml
installer/config/    mongod.cfg  Caddyfile.http  Caddyfile.tls
installer/scripts/   services.ps1     (Install|Start|Stop|Restart|Status|Uninstall)
```

| Service | Runs | Start | Depends on |
|---|---|---|---|
| `XPPOS-MongoDB` | `mongod.exe --config …\mongod.cfg` | Auto (Delayed) | — |
| `XPPOS-App` | `node.exe --env-file=…\.env server.js` | Auto (Delayed) | XPPOS-MongoDB |
| `XPPOS-Caddy` | `caddy.exe run --config …\Caddyfile --envfile …\caddy.env` | Auto (Delayed) | XPPOS-App |

All three: restart on failure at 10s / 30s / 60s, `resetfailure` 1 hour, logs
rolled at 10 MB × 5 files into `C:\ProgramData\XP POS\logs\<service>\` —
mirroring the cap the compose file applied per container. This replaces
`autoheal`, and improves on it: Windows restarts the process itself instead of
a sidecar polling a healthcheck.

**WinSW pinned to v2.12.0, `WinSW.NET461.exe`** (640 KB). The `WinSW-x64.exe`
asset in the same release is a self-contained .NET Core build at 17.8 MB; the
net461 one is the right choice because .NET Framework 4.8 ships with Windows
10/11 (measured on the dev box: `NDP\v4\Full` Release = 533509), so it adds no
prerequisite. WinSW finds its config by looking for `<own-exe-name>.xml`, so
each service gets its own renamed copy of the wrapper — hence three ~640 KB
copies rather than one shared binary.

### Correction to the brief: WinSW releases are NOT signed

The brief chose WinSW over NSSM partly because it has "signed releases". That is
not true of the actual v2.12.0 binaries — `Get-AuthenticodeSignature` reports
`NotSigned` for both `WinSW-x64.exe` and `WinSW.NET461.exe`.

Also worth knowing: **v2.12.0 (Jan 2023) is the latest stable release; v3 is
still alpha** (`v3.0.0-alpha.11`, also Jan 2023). WinSW is more current than
NSSM and better suited to this job — XML config, native recovery and log
rotation, no registry poking — so the *decision* stands. But the stated
justification does not, and the code-signing risk is unchanged rather than
solved: the bundled wrappers are unsigned files that we should sign with our own
certificate at packaging time (Phase 6), alongside the installer itself.

SHA-256 of the pinned wrapper, for the build pipeline to verify:
`B5066B7BBDFBA1293E5D15CDA3CAAEA88FBEAB35BD5B38C41C913D492AADFC4F`

### NEW — Caddy silently listens on :443 if the port variable is empty

The Docker Caddyfile always bound `:80` inside the container and compose mapped
`${POS_HTTP_PORT}:80`. There is no mapping layer natively, so Caddy must bind
the real host port. That exposed a trap, measured with Caddy 2.8.4:

| `POS_HTTP_PORT` | adapted `listen` | `caddy validate` says |
|---|---|---|
| `8080` | `:8080` | Valid configuration |
| empty | **`:443`** | **Valid configuration** |
| unset | **`:443`** | **Valid configuration** |

`:{$POS_HTTP_PORT}` collapses to `:`, which Caddy reads as the default HTTPS
port. It does not warn and it does not fail validation. The POS simply vanishes
from :8080, reappears on :443 behind an untrusted auto-HTTPS certificate, and
every staff device gets a connection error with nothing useful in any log.

Mitigations, both needed: the Caddyfiles now carry `{$POS_HTTP_PORT:8080}`
defaults (which cover only the UNSET case), and Phase 4's provisioning must
**assert the adapted listen address** rather than trusting `caddy validate`.

### NEW — `caddy.env` is a required layer, not tidiness

Confirmed by adapting the Caddyfile with `POS_ALLOWED_CIDRS=""`:

```json
"match": [ { "not": [ { "remote_ip": {} } ] } ]
```

An empty `remote_ip` means `not (nothing)`, which matches **every** request, so
the 403 route fires for all traffic and the entire LAN is locked out. Caddy
substitutes a `{$VAR:default}` default only when the variable is UNSET, and
`POS_ALLOWED_CIDRS=` (blank = allow all devices) is the documented default in
`.env`.

Under Docker this never bit because compose resolved the allow-all value itself
before Caddy saw it. **`caddy.env` is the native replacement for that compose
layer**: Phase 4 generates it from `.env` with `POS_ALLOWED_CIDRS` and the ports
resolved to concrete values. Never point `--envfile` at `.env` directly.

### NEW — PowerShell 5.1 breaks on non-ASCII inside string literals

A UTF-8 `.ps1` with no BOM is read by Windows PowerShell 5.1 as CP1252. A UTF-8
em-dash (`E2 80 94`) then decodes to three characters, one of which is byte
`0x94` — CP1252's RIGHT DOUBLE QUOTATION MARK. **PowerShell honours smart quotes
as string delimiters**, so an em-dash inside a string silently terminates it:

```
"The install is incomplete — reinstall the POS."
  → Unexpected token 'reinstall' in expression or statement
  → The string is missing the terminator: '
```

Non-ASCII in `#` comments is harmless, which is why `scripts/deploy.ps1` gets
away with box-drawing characters throughout — it never puts one inside a string.
That is luck, not design.

**Convention for all new installer scripts: UTF-8 WITH BOM, and ASCII-only
string literals.** Belt and braces — the BOM protects future edits, the ASCII
rule protects if the BOM is ever stripped by a tool. Documented in the
`.NOTES` block of `services.ps1`.

### What WAS verified

- All three XMLs are well-formed, and **the real `WinSW.NET461.exe` parses each
  one without error** (reports `NonExistent`, i.e. valid config for a service
  that is not yet registered).
- Each declares `Automatic` + `<delayedAutoStart/>`, the correct `<depend>`
  chain, 3 `<onfailure>` actions and `roll` log mode.
- `services.ps1` parses clean, and its shutdown order resolves to
  Caddy → App → MongoDB (dependents first, which is what Windows requires).
- `Caddyfile.http` adapts to `Valid configuration` with resolved values and
  binds `:8080`.
- `node --env-file` handles the ProgramData path correctly: spaces in the path,
  forward slashes, CRLF line endings, `#` comments and blank values all survive,
  and it tolerates a BOM. A **missing** env file exits **9**, so a
  mis-provisioned box fails loudly instead of starting half-configured.

### What is NOT yet proven — read before the first real install

1. **The boot test has not been run.** This session had no Administrator rights,
   so no service was ever registered, and rebooting the dev box was not mine to
   do. Everything above is static validation plus WinSW's own config parse.

   **The one test that matters** — and it is the entire justification for this
   project — is:

   ```
   1. Install, then reboot the box.
   2. Do NOT log in. Leave it sitting at the Windows login screen.
   3. From a SECOND machine on the LAN, open http://<box-ip>:8080
   4. It must serve the login page.
   ```

   Then `installer\scripts\services.ps1 -Action Status` on the box: it prints an
   explicit pass/fail on whether all three are `Auto (Delayed)`, because that
   flag is what actually determines survival of a power cut.

2. **`%BASE%\..\` path expansion is untested.** The XMLs reference the runtimes
   as `%BASE%\..\node\node.exe` etc. WinSW expands `%BASE%` to the wrapper's own
   directory; the `..` traversal is expected to resolve but has not been
   exercised against a real install tree.

3. **Service account is LocalSystem** (the WinSW default). It works and is what
   most bundled appliances do, but it is more privilege than any of the three
   needs. Running them as a dedicated low-privilege account with ACLs on
   `C:\ProgramData\XP POS` is a worthwhile hardening pass — deliberately not
   done now, because it would need its own testing round.

4. **`Caddyfile.tls` requires a plugin-enabled `caddy.exe`.** The DNS-01
   challenge needs the `caddy-dns` provider compiled in; stock `caddy.exe` will
   fail to load that file. Docker solved this with a Go build at deploy time
   (`CADDY_VARIANT=plugin`), which is exactly what a native install cannot do.
   The binary must come from the build machine via
   `xcaddy build v2.8.4 --with github.com/caddy-dns/cloudflare`.
   **Open Phase 5 decision** — see below. LAN-by-IP deployments (the
   overwhelming majority) use `Caddyfile.http` and need none of it.

---

## Phase 4 — Install-time provisioning (done, except a live install run)

`installer/scripts/provision.ps1` — one script, idempotent, safe to re-run as
the upgrade path. `installer/scripts/rs-init.mjs` handles the replica set.

Roughly 60% is lifted from `scripts/deploy.ps1` as the brief intended: the
`.env` bootstrap with per-site secret generation, the UTF-8-no-BOM writer and
UTF-8 reader, `netsh` reserved-port-range detection, firewall rule creation,
and LAN IP discovery ranked by interface metric.

### Order is load-bearing

```
ProgramData tree -> .env bootstrap -> port selection -> caddy.env
  -> Caddyfile select + ASSERT -> mongod.cfg -> Defender exclusions
  -> register all 3 services
  -> start MongoDB  ->  rs.initiate + wait for PRIMARY  ->  start App -> start Caddy
  -> firewall -> wait for /login -> print staff URL
```

The database must be a replica-set PRIMARY *before* the app starts. Hence the
new `Register` action and `-Service` targeting on `services.ps1`: provisioning
registers all three but starts them individually around the `rs.initiate` step.

### rs-init.mjs — verified against a real mongod

Uses the `mongodb` driver already inside the app bundle (confirmed traced into
`.next/standalone/node_modules/mongodb`), driven by the bundled `node.exe`. That
keeps `mongosh` off the critical install path entirely.

```
RUN 1 (fresh)  -> replica set rs0 initiated
                  database is PRIMARY and ready (first-time setup)      exit 0
RUN 2 (re-run) -> replica set rs0 already initialised - nothing to do
                  database is PRIMARY and ready                          exit 0
```

Both halves matter: `AlreadyInitialized` (code 23) is treated as success, and
the script polls `hello.isWritablePrimary` because **`replSetInitiate` returns
before the node is actually primary** — starting the app on that boundary is a
race the installer would lose intermittently.

### NEW — PowerShell 5.1 aborts on a native program's stderr

Found by the test harness, and it would have broken every install:

```powershell
$ErrorActionPreference = 'Stop'
& caddy.exe adapt --config ... 2>$null     # caddy writes advisory warnings
# -> NativeCommandError -> TERMINATING -> provisioning dies mid-run
```

PowerShell 5.1 wraps every stderr line from a native `.exe` in a
`NativeCommandError` record, and under `-ErrorAction Stop` that is terminating —
**even when the program exits 0.** `caddy.exe` triggers it merely by printing
"Unnecessary header_up" warnings.

Both scripts now route every native call through an `Invoke-Native` helper that
drops to `ErrorActionPreference = 'Continue'`, captures stderr to a temp file,
and returns `{ExitCode, StdOut, StdErr}` for the caller to judge. This affects
`caddy.exe`, `winsw`, `sc.exe` and `node.exe` alike — `winsw` and `sc.exe` write
to stderr in perfectly ordinary situations such as "service already exists".

### Verified

A harness exercising the real generator logic against the real `caddy.exe`
(with `$ErrorActionPreference='Stop'`, mirroring provisioning) — 6/6:

| Check | Result |
|---|---|
| blank `POS_ALLOWED_CIDRS` resolves to `0.0.0.0/0 ::/0` | pass |
| adapts and listens on `:8080` | pass |
| `remote_ip` matcher is non-empty (LAN not locked out) | pass |
| honours a custom port + CIDR (`:9090`, `192.168.1.0/24`) | pass |
| assertion **rejects** the empty-port config (caught `:443`) | pass |
| survives caddy's stderr without terminating | pass |

Plus: both scripts parse clean under PS 5.1, `rs-init.mjs` verified above, and
`[int]::TryParse` guards the port cast (`[int]''` throws, which would have
aborted provisioning at the port check on a first run).

### Still to do here

- `config/env.template` is read by provisioning but not yet produced — Phase 5
  must copy `.env.example` to it as part of the build.
- **Nothing has been run end-to-end as a real install.** No elevation this
  session, so service registration, Defender exclusions, firewall rules and the
  full ordering have never executed together on a real box.

---

## Phase 5 — Build pipeline (done and exercised)

`installer/build.ps1` + `installer/deps.json`. **Developer machine only** — a
client box gets no toolchain and no internet, which is the whole point.

```
installer/build.ps1        fetch -> verify -> build -> stage -> assert
installer/deps.json        pinned versions + sha256 (COMMITTED)
installer/.depcache/       upstream archives            (gitignored, ~740 MB)
installer/payload/         staged output                (gitignored)
```

A full release-mode run passes end to end.

### Pinned runtimes

| Component | Version | sha256 verified |
|---|---|---|
| Node | 24.18.1 (Krypton LTS) | yes — **cross-checked against nodejs.org SHASUMS256.txt**, matched |
| MongoDB server | 7.0.14 | yes |
| MongoDB Database Tools | 100.10.0 | yes |
| mongosh | 2.3.8 | yes |
| Caddy | 2.8.4 (stock) | yes |
| WinSW | 2.12.0 net461 | yes |

A checksum mismatch **fails the build** rather than warning. Re-pinning is
deliberate: `build.ps1 -UpdateHashes`, then commit version and hash together.

### Payload: 438 MB, 3,346 files

| | MB | |
|---|---:|---|
| `mongodb/` | 241 | mongod 61 + **mongosh 110 + crypt dll 26** + dump/restore 45 |
| `node/` | 88 | node.exe 24.18.1 |
| `app/` | 43 | standalone + static + public, 3,325 files |
| `caddy/` | 40 | |
| `redist/` | 24 | vc_redist.x64.exe, extracted from the MongoDB zip |
| `service/` | 2 | 3 WinSW wrappers + 3 XMLs |

**`mongosh` is 31% of the installer** (~135 MB) for a tool nothing in the
install uses — `rs.initiate` goes through the bundled node and the driver in
the app bundle, backups use `mongodump.exe`. It is still included by default,
because an offline appliance is exactly where a technician cannot download a
shell mid-incident. `build.ps1 -NoMongosh` drops it and takes the payload to
roughly 300 MB. That is a judgement call, not a technical one.

### The build refuses to ship a broken payload

Assertions run after staging; any failure exits non-zero:

- every expected file present (19 paths)
- **no `.env` anywhere in the payload** — `next build` copies the repo `.env`
  into `.next/standalone/`, and shipping it would put the developer's
  `NEXTAUTH_SECRET` on every client site, so a token minted on one box would
  authenticate on all of them. The build removes it and then asserts it is gone.
- `env.template` still has its `__GENERATE__` placeholders (their absence would
  mean a real `.env` got copied in and every site would share secrets)
- no `NEXT_PUBLIC_PUSHER_*` variable is **defined**
- **the bundled `node.exe` actually executes `bcrypt` and loads `mongodb` from
  the bundled `node_modules`** — not an assumption about N-API ABI stability, a
  per-build execution. A broken bcrypt means nobody can log in.
- `mongod.exe` and `caddy.exe` execute

Two of these earned their place immediately. The `.env` check fired on the
first run (`removed .env from the payload`). The `NEXT_PUBLIC_PUSHER_*` check
**failed the build on its own documentation** — the original pattern matched any
occurrence, including the comment in `.env.example` that explains why those
variables were removed. It now matches an assignment only. Worth remembering:
an over-broad safety check that fires on prose trains people to ignore it.

### Verified: the payload actually runs

Not just staged — executed. Bundled `mongod.exe` on 127.0.0.1:27017, then the
app under the **bundled Node 24.18.1** (the build machine runs 25.6.1, so this
also confirms the shipped runtime differs safely from the build runtime):

```
[realtime] websocket server attached at /ws (pid 20356)
GET /login                        -> 200, 13,079 bytes
GET /_next/static/chunks/*.css    -> 200, 196,474 bytes   (static copy step works)
ws://127.0.0.1:3998/ws  no cookie -> 401                  (auth works on Node 24)
```

### Two gotchas worth keeping

- **`-UpdateHashes` must not round-trip the JSON.** `ConvertTo-Json` reflowed
  `deps.json` and escaped every apostrophe and angle bracket to `'` /
  `<`, leaving the file valid but unreadable — and it is mostly prose
  explaining why each version was chosen. It now does a targeted regex
  replacement of the sha256 values and re-validates the JSON afterwards.
- **`next build` must run from a clean `.next`.** Already documented in Phase 0;
  the pipeline now enforces it, along with `tsc --noEmit` as a hard gate before
  the build.

---

## Phase 6 — Installer (built and compiling; runtime behaviour untested)

`installer/setup.iss`, Inno Setup 6.7.3. One command produces the whole thing:

```powershell
.\installer\build.ps1 -Package
  -> installer\dist\XP-POS-Setup-0.1.0.exe
```

**`build.ps1` is the single entry point.** Run it with no arguments and it
produces the installer. `-StageOnly` opts out of the packaging step for
iteration.

This was originally the other way round — packaging required an explicit
`-Package` and a plain run exited 0 after staging. That reads as "the build ran
for two minutes and did nothing": the payload is invisible unless you know to
look for it, and the exit code says success. The default now matches what
someone running a build script actually wants.

`-Package` is still accepted as a no-op so older commands and notes keep
working.

**118 MB installer from the 438 MB payload** (3.7x, lzma2/max + solid
compression) — comfortably under the brief's 300–500 MB estimate. Verified as a
real Inno installer with correct embedded metadata (`ProductName` XP POS,
`ProductVersion` 0.1.0, `CompanyName` XenithPulse).

### The compiler is auto-fetched — no manual tooling install

Inno Setup 6.7.3 is pinned in `deps.json` like every runtime, and `-Package`
resolves the compiler in this order:

1. `-IsccPath`, if supplied
2. a system-wide Inno Setup 6 install
3. **a portable copy fetched and extracted into `installer\.depcache\`**

Step 3 uses `/PORTABLE=1`, so nothing is written to the registry, Program Files
or PATH, and the copy is cached for later builds.

This was added after the first packaging run was verified with a portable copy
living in a throwaway temp directory — which meant the documented command
failed on a machine that had never had Inno Setup. Verified from a genuinely
clean state (no system install, no cached copy):

```
.... Inno Setup not installed - fetching a portable copy
.... downloading innosetup 6.7.3
OK   innosetup 6.7.3 verified
OK   portable Inno Setup 6.7.3 ready (nothing installed to the system)
OK   using ...\installer\.depcache\innosetup\ISCC.exe
-> XP-POS-Setup-0.1.0.exe, 118 MB
```

The hash write is factored into `Set-DepHash` and called twice, because Inno
Setup is fetched *after* the main `deps.json` write — updating it in one pass
would have silently discarded an Inno Setup repin under `-UpdateHashes`.

The version is read from `package.json` and passed as `/DAppVersion`, so the
installer filename, the Add/Remove Programs entry and the app can never
disagree. `AppId` is a fixed GUID and must never change — it is what makes
Windows treat a new build as an upgrade instead of a second parallel install.

### AVX gate — the hardware risk, closed

`InitializeSetup` calls `IsProcessorFeaturePresent(39)`
(`PF_AVX_INSTRUCTIONS_AVAILABLE`) and **refuses to install** without it, naming
the affected chips and offering the MongoDB 4.4 route.

The API was validated independently before being written into Pascal:

| Feature id | Result on the dev CPU (Xeon W-10855M) | Correct? |
|---|---|---|
| 17 `PF_XSAVE_ENABLED` | True | yes |
| **39 `PF_AVX`** | **True** | yes |
| 40 `PF_AVX2` | True | yes |
| 41 `PF_AVX512F` | False | yes — Comet Lake has no AVX-512 |
| 250 (bogus) | False | yes — it is not just answering True |

Refusing is the right call: the failure it prevents is an install that looks
completely successful, after which `mongod` dies with `Illegal instruction` the
first time the restaurant takes an order — by which point the technician has
left.

### Upgrade safety

`PrepareToInstall` runs `services.ps1 -Action Stop` before any file is written,
and **aborts the install with an actionable message if the services will not
stop**. This is not defensive padding: a running service holds `node.exe`,
`mongod.exe` and `caddy.exe` open, Windows will not replace an open file, and
Inno's `ignoreversion` copy would leave the site on a mixture of old and new
binaries *without reporting an error*. A 3 second settle follows the stop,
because Windows reports a service Stopped slightly before the process has
released its handles.

`C:\ProgramData\XP POS` is never touched by an upgrade. Only `caddy.env` and
`Caddyfile` are removed on uninstall, and only because provisioning regenerates
them — they are not user data.

### Uninstall

`usUninstall` unregisters the services while the wrapper executables still
exist (Inno has not deleted files yet at that point), then removes the firewall
rules — leaving an open inbound port behind after an uninstall would be sloppy.

The database prompt is **opt-in and double-confirmed**, defaulting to KEEP both
times. It names what is actually at stake — every order, table, menu item and
daily sheet, the uploaded images, and the site's login secret — rather than
saying "user data", because the person clicking it is often a technician who did
not set the site up. Declining shows where the data was kept and that
reinstalling resumes from it.

### VC++ runtime

`vc_redist.x64.exe` (staged from the MongoDB archive by `build.ps1`) is chained
`/install /quiet /norestart`, gated on a `Check:` that looks for
`vcruntime140.dll` and `msvcp140.dll` in `{sys}` so it is skipped when already
present. This closes the "no prerequisites" gap found in Phase 0.

### One detail that would have silently broken installs

Every PowerShell invocation passes `-ExecutionPolicy Bypass`. Without it, a box
with a restricted execution policy — group policy on a managed machine, or just
the Windows Server default — refuses to run the provisioning script, and the
install **reports success with nothing configured**.

### Hardening for install on an unknown machine

Three things were changed after asking what happens on a client box rather than
this one:

1. **A failed provisioning step is no longer silent.** Provisioning used to run
   from `[Run]`, and **Inno discards a `[Run]` program's exit code** — so if
   `provision.ps1` failed on site, Setup would still report "completed
   successfully" while the POS was not running at all. It now runs from
   `CurStepChanged(ssPostInstall)` where the exit code is checked, and a failure
   shows what likely went wrong (port blocked, database refused to start,
   antivirus), where the logs are, and the exact command to retry **without
   reinstalling**.

2. **PowerShell is invoked by full path** (`{sys}\WindowsPowerShell\v1.0\
   powershell.exe`, falling back to PATH). A managed or damaged box should not
   be able to break the one step that configures the whole product through a
   PATH problem.

3. **MAX_PATH is asserted at build time.** Windows still caps paths at 260
   characters unless long paths are enabled, and they are **off by default** on
   Windows 10/11 — a client box is a default box. Current worst case is
   `C:\Program Files\XP POS` + 118 = **141 characters, 119 to spare**, but a
   future dependency with a deeply nested `node_modules` could cross it, and
   that would fail on the customer's machine and not on the developer's. The
   build now fails instead.

### FIRST REAL INSTALL — verified on a live box (2026-08-03)

The installer was run for real. Health check on the installed machine:

| Check | Result |
|---|---|
| Three services registered | `XPPOS-MongoDB`, `XPPOS-App`, `XPPOS-Caddy` all **Running** |
| Start type | all three `Auto` with **`DelayedAutoStart = True`** |
| `%BASE%\..\` path expansion in the WinSW XMLs | works — each service found its bundled binary |
| Database | `setName rs0`, **`isWritablePrimary: true`**, member `PRIMARY` |
| Multi-document transaction | **committed across 2 collections** on the installed DB |
| App config via `node --env-file` from ProgramData | works — app started fully configured |
| Realtime | `[realtime] websocket server attached at /ws` |
| WebSocket upgrade **through real Caddy** | reached the app → **401** (auth enforced) |
| `GET /login` through Caddy | **200**, 13,079 bytes |
| Static asset through Caddy | **200**, 196,474 bytes (staging of `.next/static` correct) |
| Firewall | `XP POS (TCP 8090)`, enabled, all profiles |
| Errors across every service log | **none** |
| Bindings | node `127.0.0.1:3000`, mongod `127.0.0.1:27017`, caddy `:8090` |

Only Caddy is reachable off-box, exactly as designed.

**Two designed behaviours fired in production on the first run:**

1. **Port fallback.** 8080 was already in use, so provisioning moved to **8090**
   and persisted it to `.env`. The choice is sticky by design — a later run must
   not migrate a site to a different port and invalidate the URL staff have
   bookmarked. (8080 was free again afterwards; the install correctly stayed on
   8090.)

2. **The lockout footgun was neutralised.** `.env` carries the documented
   default `POS_ALLOWED_CIDRS=` (blank), and the generated `caddy.env` contains
   the resolved `POS_ALLOWED_CIDRS=0.0.0.0/0 ::/0`. Had Caddy been pointed at
   `.env` directly, the matcher would have collapsed to `not remote_ip` with no
   ranges and returned 403 to **every device on the LAN**. This is the single
   most valuable thing the `caddy.env` layer does, and it did it.

### BOOT TEST — PASSED (the whole point of the project)

Measured from the WinSW wrapper logs after a real reboot:

```
boot             19:49:54
services started 19:52:32 / 19:52:33 / 19:52:33   (MongoDB, App, Caddy)
delta            158 seconds
```

The services started **on a timer, with nobody logged in**. Docker Desktop could
never do this — that failure is now closed.

**It was initially reported as a failure**, because checking `services.msc`
right after the reboot showed all three `Stopped`, and they appeared to start
only when Chrome was opened. Neither is what happened: opening a browser cannot
start a Windows service, and 158s is exactly Windows' "Automatic (Delayed
Start)" behaviour (a 120s default plus dependency ordering). The check simply
happened inside the delay window.

**But 158 seconds is too slow for a POS.** A restaurant coming back from a power
cut should not wait two and a half minutes. `services.ps1` now writes a
per-service `AutoStartDelay` of **30 seconds** (registry, overriding the Windows
default of 120), tunable via `-StartDelaySeconds`.

It is deliberately **not** 0 and the services are deliberately **not** plain
`Automatic`: starting during boot means competing with Windows for disk while
mongod recovers its journal, and Caddy binding before the network stack has
settled. 30s keeps the safety margin and cuts recovery roughly fivefold.

`services.ps1 -Action Status` now prints the expected delay and states plainly
that services showing `Stopped` sooner than that is normal — so the next person
does not report the same non-bug.

A diagnostic note for whoever checks a box next: **"Service Running" proves only
that the WinSW wrapper started.** During this check Caddy looked dead because a
port filter did not include 8090. Always resolve the wrapper's child process and
list *its* sockets:

```powershell
$p = (Get-CimInstance Win32_Service -Filter "Name='XPPOS-Caddy'").ProcessId
$kids = Get-CimInstance Win32_Process -Filter "ParentProcessId=$p" | % ProcessId
Get-NetTCPConnection -State Listen | ? OwningProcess -in $kids
```

### NOT verified — needs a test box

The script compiles and the Pascal parses, but **no install, upgrade, or
uninstall has actually been run.** This session had no elevation, and installing
on the dev box would register three services, create `C:\ProgramData\XP POS` and
add firewall rules — not an appropriate side effect of a build check.

Fresh install is now **done** (above). Remaining, in priority order:

1. ~~**THE BOOT TEST**~~ — **PASSED.** See below.
2. **Seed the first admin**, take an order from a second device, print a
   receipt, and run a backup end to end.
3. **Upgrade**: bump `version` in package.json, rebuild, install over the top.
   Confirm the database, uploads and `.env` survive and that all three services
   come back on the new binaries.
4. **Uninstall declining data deletion**, then reinstall — the site should come
   back with its data and existing logins intact.
5. **Uninstall accepting data deletion** — only on a throwaway box.
6. If any non-AVX hardware is available, confirm the gate actually fires.

### Code signing — now slightly wider than the brief assumed

The installer is `NotSigned`, so SmartScreen will warn on every download. Two
things need signing, not one: the installer itself **and** the three
`service\XPPOS-*.exe` wrappers, because WinSW's own releases are unsigned (see
Phase 3). `build.ps1 -Package` prints this warning on every run.

---

## Phase 7 — Backups, cross-repo (done)

**Backups gate go-live**, and the repo was present at `E:\xp-thermal-service`,
so this was done rather than documented. Changes are committed to that repo's
working tree on `main` (clean before this work started).

### What changed

| Location | Was | Now |
|---|---|---|
| `dockerText()` | `spawn('docker', …)` helper | **deleted** |
| `resolveContainer()` | `docker ps --filter label=com.docker.compose.service=<svc>` | **deleted** — there is no container |
| — | — | **`toolPath()`** — resolves + existence-checks `mongodump.exe` / `mongorestore.exe` |
| — | — | **`connectionArgs()`** — shared `--host/--port` |
| `dumpToTempFile(container)` | `docker exec <c> mongodump --archive --db=<db>` | `mongodump.exe --host 127.0.0.1 --port 27017 --archive --db=<db> [--gzip]` |
| `restore()` | `docker exec -i <c> mongorestore …` | `mongorestore.exe --host … --archive --drop --nsInclude=<db>.*` (stdin unchanged) |

Config: `mongo.dockerComposeService` and `mongo.containerName` are gone,
replaced by `mongo.binDir`, `mongo.host`, `mongo.port`.

The streaming, timeout, retention, pruning and multi-destination logic is
untouched — only the spawned process changed. `--archive` with no value means
stdout for dump and stdin for restore, which is the same contract the
`docker exec` form relied on, so the piping did not need to change.

Error strings no longer say "is Docker Desktop running?" — on a native box that
sends a technician down entirely the wrong path. A missing tool now reports the
resolved path and names the `backup.mongo.binDir` setting to fix.

### Verified — full round trip against a live database

Not a compile check. The exact argv the rewritten manager builds, run against
the bundled binaries and a real replica set — 7/7:

```
$ mongodump --host 127.0.0.1 --port 27017 --archive --db=POS_BACKUP_TEST --gzip
  archive produced (506 bytes), gzip magic 1f 8b confirmed
  [wipe orders, insert a bogus table row]
$ mongorestore --host 127.0.0.1 --port 27017 --archive --drop --nsInclude=POS_BACKUP_TEST.* --gzip
  both orders restored with values intact
  --drop removed the row added after the backup
```

The `--drop` assertion matters: it proves restore genuinely replaces the
collection rather than merging into it, which is what makes a restore
trustworthy after a bad day.

`npm run build` succeeds; the compiled `dist/backup/backup-manager.js` contains
two `spawn` sites, both using the resolved tool path, and zero `'docker'`
literals.

### Upgrade path for an existing site

`config.json` is gitignored (it is the live per-site config); the tracked
template is `config.example.json`. An existing `config.json` still carrying
`dockerComposeService` / `containerName` **parses fine** — zod strips unknown
keys and applies the new defaults — so a site upgrading from the Docker build
keeps working without a hand-edited config.

One caveat: `binDir` defaults to `C:\Program Files\XP POS\mongodb\bin`. A site
that installed the POS somewhere else must set it explicitly, and will get a
clear error naming the setting if they do not.

### Still open

`mongodump.exe` and `mongorestore.exe` reach the database over loopback with no
authentication, exactly as the app does. That is consistent with the current
security model (the 127.0.0.1 bind is the control), but it does mean any local
process can dump the database. Worth revisiting if MongoDB auth is ever added.

---

## Decisions taken

| Decision | Rationale |
|---|---|
| WS server in-process, sharing the app's HTTP port at `/ws` | Q1 proved it works. One service, one process, no IPC, no shared secret, and `broadcastEvent` reaches sockets by direct function call. |
| Locate Next's server via `process._getActiveHandles()` | `register()` runs after the server is bound, so patching `http.createServer` cannot work. |
| `rs.initiate` via bundled `node.exe` + `mongodb` driver, not `mongosh` | Removes `mongosh` from the critical install path; the driver is already in the bundle. Proven by the Q3 spike. |
| Pin MongoDB 7.0.14 | Tested here. Revisit only for the AVX-limited hardware case. |

## Open questions

Ordered by when they block work.

1. **MongoDB distribution — needed BEFORE Phase 5.** Bundle `mongod.exe`, or
   chain the official MSI? This is not only the SSPL licensing call; it changes
   what the build pipeline packages (Phase 5) *and* how provisioning brings up
   the replica set (Phase 4). Deciding late means building Phase 5 twice.
2. **Caddy variant — needed for Phase 5.** Ship stock `caddy.exe` (LAN-by-IP
   only, `Caddyfile.tls` unusable), or build once with `xcaddy` to include the
   DNS plugin so the optional `APP_DOMAIN` HTTPS mode keeps working? Stock is
   the smaller, simpler default and covers essentially every site.
3. **VC++ redistributable — Phase 6.** `mongod.exe` needs `msvcp140.dll` /
   `vcruntime140.dll`. Chain `vc_redist.x64.exe /install /quiet /norestart`, or
   ship the DLLs side-by-side? Chaining the official redist is safer.
4. **AVX — Phase 6.** Detect and fail loudly at install, or ship a MongoDB 4.4
   fallback for N-series hardware? Detection is the better default; a silent
   `Illegal instruction` on a client site is the worst possible failure mode.
5. **Code signing.** Unchanged, and now slightly larger in scope: the bundled
   WinSW wrappers are unsigned too, so they should be signed alongside the
   installer rather than shipped as-is.
