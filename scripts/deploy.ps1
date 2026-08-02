<#
.SYNOPSIS
    One-command deployment of the XP POS LAN appliance onto a client box.

.DESCRIPTION
    Everything a fresh Windows machine needs, in order:

      1. Verifies Docker is installed and actually running.
      2. Creates .env from .env.example on first run, generating a UNIQUE
         random secret per site for every __GENERATE__ marker.
      3. Picks a host port that Windows has not reserved (Hyper-V/WinNAT
         excluded ranges silently break the 8080 bind).
      4. Builds and starts THE WHOLE STACK, including the Caddy proxy that is
         the only thing publishing a port to the LAN, and clears stale orphan
         containers from older compose revisions.
      5. Opens the Windows Firewall for that port (needs Administrator).
      6. Waits for the app to answer, then prints the LAN URL to hand to staff.

    Safe to re-run. On an existing box it keeps .env untouched and performs a
    normal rebuild + restart.

.PARAMETER Port
    Override the host port (default: POS_HTTP_PORT from .env, else 8080).

.PARAMETER SkipBuild
    Restart the existing images without rebuilding. Much faster.

.EXAMPLE
    .\scripts\deploy.ps1
    .\scripts\deploy.ps1 -Port 9090
    .\scripts\deploy.ps1 -SkipBuild
#>
[CmdletBinding()]
param(
    [int]$Port,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

# ── Output helpers ───────────────────────────────────────────────────────────
function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "    OK   $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "    WARN $m" -ForegroundColor Yellow }
function Write-Err  { param($m) Write-Host "    FAIL $m" -ForegroundColor Red }

# Always operate on the repo root, no matter where the script was invoked from.
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host ""
Write-Host "  XP POS - LAN appliance deployment" -ForegroundColor White
Write-Host "  $RepoRoot" -ForegroundColor DarkGray

# ── 1. Docker preflight ──────────────────────────────────────────────────────
Write-Step "Checking Docker"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Err "Docker is not installed, or not on PATH."
    Write-Host "         Install Docker Desktop, then re-run this script." -ForegroundColor DarkGray
    exit 1
}

# `docker info` fails when the engine/VM is not up, which is the usual state
# right after a reboot (Docker Desktop takes ~30s to become usable).
docker info --format '{{.ServerVersion}}' | Out-Null
if (-not $?) {
    Write-Err "Docker is installed but the engine is not running."
    Write-Host "         Start Docker Desktop, wait for the whale icon to settle, re-run." -ForegroundColor DarkGray
    exit 1
}
Write-Ok "Docker engine is running"

# ── 2. .env bootstrap ────────────────────────────────────────────────────────
Write-Step "Checking configuration (.env)"

$EnvPath     = Join-Path $RepoRoot ".env"
$ExamplePath = Join-Path $RepoRoot ".env.example"

function New-RandomSecret {
    param([int]$ByteCount = 24)
    $bytes = New-Object byte[] $ByteCount
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try   { $rng.GetBytes($bytes) }
    finally { $rng.Dispose() }
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

# Write UTF-8 with NO byte-order mark. A BOM would become part of the first
# variable's NAME when docker compose parses .env, so the value silently never
# applies -- an evil bug to chase on a client site.
function Write-TextNoBom {
    param([string]$Path, [string]$Text)
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $Text, $utf8NoBom)
}

# Read as UTF-8 explicitly. Windows PowerShell 5.1's Get-Content assumes the
# ANSI codepage for files without a BOM, which turns the box-drawing characters
# in the comments into mojibake -- and re-mangles them on every run.
function Read-TextUtf8 {
    param([string]$Path)
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

if (Test-Path $EnvPath) {
    Write-Ok ".env already exists (left untouched)"
} else {
    if (-not (Test-Path $ExamplePath)) {
        Write-Err ".env.example is missing - cannot bootstrap configuration."
        exit 1
    }
    $content = Read-TextUtf8 $ExamplePath

    # Replace each placeholder with its OWN secret (not one shared value).
    # Anchored to a real KEY=__GENERATE__ assignment so the token can still be
    # mentioned in a comment without being substituted into gibberish.
    $placeholder = [regex]'(?m)^(\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*)__GENERATE__\s*$'
    $generated = 0
    while ($placeholder.IsMatch($content)) {
        $content = $placeholder.Replace($content, { param($m) $m.Groups[1].Value + (New-RandomSecret) }, 1)
        $generated++
    }

    Write-TextNoBom -Path $EnvPath -Text $content
    Write-Ok "Created .env from .env.example ($generated secrets generated)"
    Write-Warn "This box now has unique credentials. Back up .env - losing it"
    Write-Host "         invalidates every existing login session." -ForegroundColor DarkGray
}

# Parse .env into a hashtable so we can read the configured port.
$EnvVars = @{}
foreach ($line in ((Read-TextUtf8 $EnvPath) -split "`r?`n")) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $idx = $trimmed.IndexOf('=')
    if ($idx -lt 1) { continue }
    $key = $trimmed.Substring(0, $idx).Trim()
    $val = $trimmed.Substring($idx + 1).Trim().Trim('"').Trim("'")
    # Strip trailing inline comments (e.g. `VALUE  # note`) but keep '#' inside
    # a quoted value, which we have already unwrapped above.
    if ($val -match '\s+#') { $val = ($val -split '\s+#')[0].Trim() }
    $EnvVars[$key] = $val
}

if ($EnvVars.ContainsKey('APP_DOMAIN') -and $EnvVars['APP_DOMAIN'] -ne '') {
    if ($EnvVars['CADDY_VARIANT'] -ne 'plugin') {
        Write-Err "APP_DOMAIN is set but CADDY_VARIANT is not 'plugin'."
        Write-Host "         HTTPS mode needs the DNS plugin compiled in." -ForegroundColor DarkGray
        Write-Host "         Set CADDY_VARIANT=plugin in .env, or clear APP_DOMAIN." -ForegroundColor DarkGray
        exit 1
    }
}

# ── 3. Port selection ────────────────────────────────────────────────────────
Write-Step "Selecting host port"

if (-not $Port) {
    if ($EnvVars.ContainsKey('POS_HTTP_PORT') -and $EnvVars['POS_HTTP_PORT']) {
        $Port = [int]$EnvVars['POS_HTTP_PORT']
    } else {
        $Port = 8080
    }
}

# Windows (Hyper-V / WinNAT / WSL) reserves TCP ranges. Binding inside one fails
# with "access to a socket in a way forbidden by its access permissions", the
# container dies instantly, and NOTHING ends up listening -- exactly the
# "connection refused with no listener" symptom this script exists to prevent.
function Get-ReservedPortRanges {
    $ranges = @()
    $raw = netsh interface ipv4 show excludedportrange protocol=tcp
    foreach ($line in $raw) {
        if ($line -match '^\s*(\d+)\s+(\d+)\s*$') {
            $ranges += [pscustomobject]@{ Start = [int]$Matches[1]; End = [int]$Matches[2] }
        }
    }
    return $ranges
}

# On a RE-RUN the port is already held by our own Caddy container. That is not
# a conflict -- treating it as one would migrate a working site to a new port
# (and change the URL staff have bookmarked) on every redeploy. So find out
# which port our own stack currently publishes and exempt it.
$OurPort = $null
$existingCaddy = (& docker compose ps -q caddy 2>$null)
if ($existingCaddy) {
    $mapping = (& docker compose port caddy 80 2>$null)
    if ($mapping -and ($mapping -match ':(\d+)\s*$')) { $OurPort = [int]$Matches[1] }
}

function Test-PortUsable {
    param([int]$Candidate, $Reserved, $OwnPort)
    # A Windows-reserved range is always fatal, even if it is "ours".
    foreach ($r in $Reserved) {
        if ($Candidate -ge $r.Start -and $Candidate -le $r.End) { return $false }
    }
    if ($OwnPort -and $Candidate -eq $OwnPort) { return $true }
    # Reject a port some OTHER process already listens on.
    try {
        $listening = Get-NetTCPConnection -State Listen -LocalPort $Candidate -ErrorAction Stop
        if ($listening) { return $false }
    } catch {
        # No listener found -- that is the good case.
    }
    return $true
}

$reserved = Get-ReservedPortRanges
if (-not (Test-PortUsable -Candidate $Port -Reserved $reserved -OwnPort $OurPort)) {
    Write-Warn "Port $Port is reserved by Windows or already in use."
    $picked = $null
    foreach ($candidate in @(8080, 8090, 8081, 9080, 9090, 8888, 18080)) {
        if (Test-PortUsable -Candidate $candidate -Reserved $reserved -OwnPort $OurPort) { $picked = $candidate; break }
    }
    if (-not $picked) {
        Write-Err "Could not find a free port. Pass one explicitly: -Port <n>"
        exit 1
    }
    $Port = $picked
    Write-Ok "Switched to port $Port"

    # Persist the choice so plain `docker compose up -d` keeps using it.
    $envText = Read-TextUtf8 $EnvPath
    if ($envText -match '(?m)^\s*POS_HTTP_PORT\s*=.*$') {
        $envText = [regex]::Replace($envText, '(?m)^\s*POS_HTTP_PORT\s*=.*$', "POS_HTTP_PORT=$Port")
    } else {
        $envText = $envText.TrimEnd() + "`nPOS_HTTP_PORT=$Port`n"
    }
    Write-TextNoBom -Path $EnvPath -Text $envText
    Write-Ok "Saved POS_HTTP_PORT=$Port to .env"
} else {
    Write-Ok "Port $Port is available"
}

$env:POS_HTTP_PORT = "$Port"

# ── 4. Build and start the FULL stack ────────────────────────────────────────
# The critical line. `docker compose up -d --build app` starts only app + its
# dependencies; caddy depends on app, not the reverse, so it is never created
# and nothing publishes a port. Always bring up every service.
# --remove-orphans clears containers from retired service definitions (e.g. the
# old `backup` service, which restart-loops on exit 127 forever).
Write-Step "Building and starting all services"
Write-Host "    First run compiles the Next.js app - allow several minutes." -ForegroundColor DarkGray

$composeArgs = @('compose', 'up', '-d', '--remove-orphans')
if (-not $SkipBuild) { $composeArgs += '--build' }

& docker @composeArgs
if (-not $?) {
    Write-Err "docker compose failed. Full logs:  docker compose logs --tail 100"
    exit 1
}
Write-Ok "Containers started"

# Verify Caddy specifically -- it is the only service that reaches the LAN.
$caddyId = (& docker compose ps -q caddy)
if (-not $caddyId) {
    Write-Err "The caddy container was not created. Nothing is published to the LAN."
    Write-Host "         Check:  docker compose logs caddy" -ForegroundColor DarkGray
    exit 1
}
Write-Ok "Caddy proxy is present"

# ── 5. Windows Firewall ──────────────────────────────────────────────────────
Write-Step "Configuring Windows Firewall"

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin   = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

$ruleName = "XP POS (TCP $Port)"
if (-not $isAdmin) {
    Write-Warn "Not running as Administrator - firewall rule NOT added."
    Write-Host "         Other devices may be blocked. In an elevated PowerShell run:" -ForegroundColor DarkGray
    Write-Host "         New-NetFirewallRule -DisplayName '$ruleName' -Direction Inbound ``" -ForegroundColor DarkGray
    Write-Host "           -Protocol TCP -LocalPort $Port -Action Allow -Profile Any" -ForegroundColor DarkGray
} else {
    $existing = $null
    try { $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction Stop } catch { }
    if ($existing) {
        Write-Ok "Firewall rule already present"
    } else {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound `
            -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
        Write-Ok "Added inbound rule for TCP $Port"
    }

    # A "Public" profile blocks LAN discovery even with the rule in place on
    # some setups, and is the single most common cause of "works locally,
    # unreachable from the tablet".
    $publicNets = Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' }
    if ($publicNets) {
        Write-Warn "These networks are set to 'Public':"
        foreach ($n in $publicNets) { Write-Host "           - $($n.Name)" -ForegroundColor DarkGray }
        Write-Host "         Consider: Set-NetConnectionProfile -Name '<name>' -NetworkCategory Private" -ForegroundColor DarkGray
    }
}

# ── 6. Wait for the app, then report the URL ──────────────────────────────────
Write-Step "Waiting for the app to respond"

$ready = $false
$httpStatus = $null
for ($i = 1; $i -le 60; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 5
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch {
        # An HTTP error response means the proxy IS up and deliberately
        # refusing us -- retrying for five minutes will not change that, so
        # stop and report the status instead of masking it as a timeout.
        $r = $_.Exception.Response
        if ($r -and $r.StatusCode) {
            $httpStatus = [int]$r.StatusCode
            break
        }
        Start-Sleep -Seconds 5
    }
}

if (-not $ready) {
    if ($httpStatus -eq 403) {
        Write-Err "Caddy answered 403 - device access control is blocking this request."
        Write-Host "         POS_ALLOWED_CIDRS in .env does not cover the client." -ForegroundColor DarkGray
        Write-Host "         Clear it to allow all LAN devices, or widen the range, then:" -ForegroundColor DarkGray
        Write-Host "         docker compose up -d caddy" -ForegroundColor DarkGray
    } elseif ($httpStatus) {
        Write-Err "The app answered HTTP $httpStatus on port $Port (expected 200)."
        Write-Host "         docker compose logs --tail 100 app caddy" -ForegroundColor DarkGray
    } else {
        Write-Err "The app did not answer on port $Port within ~5 minutes."
        Write-Host "         docker compose ps" -ForegroundColor DarkGray
        Write-Host "         docker compose logs --tail 100 app caddy" -ForegroundColor DarkGray
    }
    exit 1
}
Write-Ok "App responded on 127.0.0.1:$Port"

# The LAN address is the one on an adapter that owns a default route, which
# neatly excludes Docker/WSL/Hyper-V virtual adapters (they have no gateway).
# Ordered by interface metric so that when a VPN/Tailscale adapter is also
# present, Windows' own preferred (lowest-metric) interface is listed first.
$lanIps = @()
$configs = Get-NetIPConfiguration | Where-Object {
    $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up'
}
$ranked = $configs | Sort-Object -Property @{ Expression = {
    try { (Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction Stop).InterfaceMetric }
    catch { 9999 }
} }
foreach ($c in $ranked) {
    foreach ($addr in $c.IPv4Address) {
        if ($addr.IPAddress -notmatch '^(127\.|169\.254\.)') { $lanIps += $addr.IPAddress }
    }
}

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   DEPLOYMENT COMPLETE" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
if ($lanIps.Count -gt 0) {
    Write-Host "   Staff devices open:" -ForegroundColor White
    foreach ($ip in $lanIps) { Write-Host "      http://${ip}:$Port" -ForegroundColor Cyan }
} else {
    Write-Warn "No LAN IP detected - is this box on the network?"
}
Write-Host ""
Write-Host "   On this box:  http://127.0.0.1:$Port" -ForegroundColor DarkGray
Write-Host ""

if ($EnvVars['ENABLE_SETUP_ENDPOINTS'] -eq 'true') {
    Write-Warn "ENABLE_SETUP_ENDPOINTS=true - seeding endpoints are OPEN."
    Write-Host "         After seeding the admin user, set it to false in .env and run:" -ForegroundColor DarkGray
    Write-Host "         docker compose up -d app" -ForegroundColor DarkGray
    Write-Host ""
}

Write-Host "   Logs:    docker compose logs -f app" -ForegroundColor DarkGray
Write-Host "   Status:  docker compose ps" -ForegroundColor DarkGray
Write-Host "   Stop:    docker compose down        (data is preserved)" -ForegroundColor DarkGray
Write-Host ""
