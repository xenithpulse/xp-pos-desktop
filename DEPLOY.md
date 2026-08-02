# Deploying XP POS to a client box

## Prerequisites on the client machine

- **Docker Desktop** — installed and running (whale icon settled in the tray)
- **XP Thermal Service** — installed, if the site prints receipts or uses backups
- Node.js is **not** required. The app is compiled inside the Docker image.

## Deploy

Right-click **`deploy.cmd`** → **Run as administrator**.

That is the whole procedure. Running elevated matters only so the firewall rule
can be added automatically; without it the script still deploys and prints the
manual command to run.

Equivalent from an elevated PowerShell:

```powershell
.\scripts\deploy.ps1
```

The script prints the LAN URL to hand to staff, e.g. `http://192.168.1.50:8080`.

### What it does

1. Verifies Docker is installed **and the engine is running**.
2. Creates `.env` from `.env.example`, generating a **unique secret per site**
   for every `__GENERATE__` marker.
3. Picks a host port Windows has not reserved, and saves the choice to `.env`.
4. Builds and starts **every** service, and clears stale orphan containers.
5. Adds the inbound firewall rule for that port.
6. Waits for the app to answer, then prints the LAN URL.

Re-running is safe: an existing `.env` is never overwritten.

### Useful flags

```powershell
.\scripts\deploy.ps1 -Port 9090    # force a specific host port
.\scripts\deploy.ps1 -SkipBuild    # restart without rebuilding (fast)
```

## First run: seed the admin user

`.env.example` ships with `ENABLE_SETUP_ENDPOINTS=true` so `/api/injections/*`
is reachable to create the first admin. **Once seeded**, close it:

1. Set `ENABLE_SETUP_ENDPOINTS=false` in `.env`
2. `docker compose up -d app`

## Never run this

```powershell
docker compose up -d --build app     # ← WRONG
```

`app` does not depend on `caddy` — `caddy` depends on `app`. Compose therefore
never creates the proxy, and **`caddy` is the only service that publishes a
port to the LAN**. You get a healthy, happily-logging app that no other device
can reach, and `docker compose ps -a` shows no `caddy` row at all.

Always bring up the full stack:

```powershell
docker compose up -d --build --remove-orphans
```

## Day-to-day

```powershell
docker compose ps                       # status (add -a to see stopped ones)
docker compose logs -f app              # tail the app
docker compose logs --tail 50 caddy     # proxy / LAN issues
docker compose down                     # stop; named volumes keep the data
```

## Troubleshooting

Work down this list — it is ordered by how often each one is the cause.

### Other devices get "connection refused"

Nothing is listening. Check the proxy exists and is published:

```powershell
docker compose ps -a
```

You want a `caddy` row reading `Up (healthy)` with `0.0.0.0:8080->80/tcp`.

- **No `caddy` row at all** → the stack was started with `up -d app`. Fix with
  `docker compose up -d --build --remove-orphans`.
- **`caddy` exited or restarting** → `docker compose logs caddy`.
- **`bind: ... forbidden by its access permissions`** → Windows reserved the
  port. `netsh interface ipv4 show excludedportrange protocol=tcp` to confirm;
  re-run `.\scripts\deploy.ps1` and it picks a free port automatically.

### Other devices time out (no response at all)

The port is published but the host is blocking or the network is segmented.

```powershell
Get-NetConnectionProfile | Select-Object Name, NetworkCategory
```

If the adapter is `Public`, either switch it to `Private` or confirm the rule
covers it:

```powershell
Set-NetConnectionProfile -Name '<network name>' -NetworkCategory Private
```

Also verify basic reachability from the client with `ping <box-ip>`. Guest WiFi
and AP client isolation block this before it ever reaches Docker.

### "Access to this POS is restricted to authorized devices"

`POS_ALLOWED_CIDRS` in `.env` does not include the client's subnet. Either widen
it (e.g. `192.168.1.0/24`) or clear it to allow all LAN devices, then:

```powershell
docker compose up -d caddy
```

### Use the box's IP, not the router's

The URL must contain the **box's own** LAN IP, from `ipconfig` on the machine
running Docker. The router/gateway address does not forward to it.

## Optional: trusted HTTPS on a custom domain

Only if the site has a real domain and a DNS-provider API token. In `.env`:

```ini
APP_DOMAIN=erp.example.com
ACME_EMAIL=admin@example.com
CADDY_DNS_TOKEN=<provider api token>
CADDY_VARIANT=plugin
```

`CADDY_VARIANT=plugin` is mandatory here — it compiles the DNS-01 plugin into
the Caddy image, which requires internet at build time. The default `plain`
variant skips that build entirely, which is why normal LAN deploys are fast and
work on a box with no internet access. Then:

```powershell
docker compose up -d --build caddy
```

If you set `APP_DOMAIN` while leaving `CADDY_VARIANT=plain`, the container
refuses to start and tells you exactly this.

## Backing up `.env`

Each box generates its own `NEXTAUTH_SECRET`. Losing `.env` invalidates every
active login session on that site, so keep a copy with the site's records. It
is gitignored and never leaves the box on its own.
