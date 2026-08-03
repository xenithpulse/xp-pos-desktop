<#
.SYNOPSIS
    Register, start, stop, or remove the three XP POS Windows services.

.DESCRIPTION
    The POS runs as three WinSW-wrapped services:

        XPPOS-MongoDB   the database          (127.0.0.1 only)
        XPPOS-App       the Next.js server    (127.0.0.1:3000, realtime included)
        XPPOS-Caddy     the reverse proxy     (the ONLY LAN-facing component)

    All three are Automatic (Delayed Start) with restart-on-failure, so the POS
    comes back after a power cut with NO ONE LOGGED IN. That is the entire
    reason this project exists: Docker Desktop runs in a user session, so a 2am
    reboot left the POS dead until a human logged in.

    Every action here is idempotent — re-running the installer is a supported
    upgrade path.

.PARAMETER Action
    Install | Start | Stop | Restart | Status | Uninstall

.PARAMETER InstallDir
    Program files root. Default: C:\Program Files\XP POS

.EXAMPLE
    .\services.ps1 -Action Install
    .\services.ps1 -Action Status
    .\services.ps1 -Action Uninstall

.NOTES
    ENCODING: this file is UTF-8 WITH a byte-order mark, and every string
    literal is pure ASCII. Both are deliberate.

    Windows PowerShell 5.1 assumes the ANSI codepage (CP1252) for a .ps1 with
    no BOM. A UTF-8 em-dash then decodes to three characters, one of which is
    byte 0x94 - CP1252's RIGHT DOUBLE QUOTATION MARK. PowerShell honours smart
    quotes as string delimiters, so a stray em-dash INSIDE A STRING silently
    terminates it and the script fails to parse with an error pointing at the
    next word. Measured, not theoretical:

        "The install is incomplete - reinstall the POS."   (em-dash version)
          -> Unexpected token 'reinstall' in expression or statement

    Non-ASCII in # comments is harmless (the tokenizer skips them), which is
    why scripts/deploy.ps1 gets away with box-drawing characters. Do not rely
    on that: keep string literals ASCII and keep the BOM.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Register', 'Install', 'Start', 'Stop', 'Restart', 'Status', 'Uninstall')]
    [string]$Action,

    # Limit Start/Stop to one service. provision.ps1 needs this: the replica set
    # must be initiated after MongoDB is up but BEFORE the app starts, or the
    # app spends its first 30 seconds failing to select a server.
    [ValidateSet('XPPOS-MongoDB', 'XPPOS-App', 'XPPOS-Caddy')]
    [string]$Service,

    [string]$InstallDir = "$env:ProgramFiles\XP POS"
)

$ErrorActionPreference = 'Stop'

function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "    OK   $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "    WARN $m" -ForegroundColor Yellow }
function Write-Err  { param($m) Write-Host "    FAIL $m" -ForegroundColor Red }

<#
    Run a native executable without letting its stderr abort the script.

    Windows PowerShell 5.1 wraps each stderr line from a native .exe in a
    NativeCommandError, which is TERMINATING under $ErrorActionPreference =
    'Stop'. A tool that merely warns would therefore kill the install. Both
    winsw and sc.exe write to stderr in ordinary situations (for example
    "service already exists"), so every native call here goes through this.
#>
function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string[]]$Arguments = @()
    )
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $errFile = [System.IO.Path]::GetTempFileName()
        try {
            $out = & $FilePath @Arguments 2>$errFile | Out-String
            $err = if (Test-Path $errFile) { Get-Content $errFile -Raw } else { '' }
            return [pscustomobject]@{ ExitCode = $LASTEXITCODE; StdOut = $out; StdErr = $err }
        } finally {
            Remove-Item $errFile -Force -ErrorAction SilentlyContinue
        }
    } finally {
        $ErrorActionPreference = $prev
    }
}

# Start order. Stop/uninstall walk this in reverse so dependents go down first —
# Windows refuses to stop a service another running service depends on.
$Services = @(
    @{ Id = 'XPPOS-MongoDB'; Label = 'Database' },
    @{ Id = 'XPPOS-App';     Label = 'Application' },
    @{ Id = 'XPPOS-Caddy';   Label = 'Web proxy' }
)

# Shutdown order. Windows refuses to stop a service that a still-running
# service depends on, so dependents must go first: Caddy, then App, then Mongo.
$ServicesReversed = @($Services[($Services.Count - 1)..0])

$ServiceDir = Join-Path $InstallDir 'service'

# ── Elevation ────────────────────────────────────────────────────────────────
# Registering a service is an admin operation. Failing here with a clear
# message beats a confusing "Access is denied" three steps later.
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Err "This script must run as Administrator."
    Write-Host "         Right-click PowerShell -> Run as administrator, then re-run." -ForegroundColor DarkGray
    exit 1
}

function Get-WrapperPath {
    param([string]$Id)
    $exe = Join-Path $ServiceDir "$Id.exe"
    if (-not (Test-Path $exe)) {
        throw "Service wrapper missing: $exe`n" +
              "         The install is incomplete - reinstall the POS."
    }
    return $exe
}

function Test-ServiceExists {
    param([string]$Id)
    return [bool](Get-Service -Name $Id -ErrorAction SilentlyContinue)
}

# ── Install ──────────────────────────────────────────────────────────────────
function Invoke-Install {
    Write-Step "Registering services"

    # Log directories must exist before first start: WinSW writes its wrapper
    # log immediately and a missing directory is a start failure, which
    # presents as a service that "won't start" with nothing logged anywhere.
    foreach ($sub in @('mongodb', 'app', 'caddy')) {
        $dir = Join-Path $env:ProgramData "XP POS\logs\$sub"
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    }
    Write-Ok "Log directories ready"

    foreach ($svc in $Services) {
        $exe = Get-WrapperPath $svc.Id

        if (Test-ServiceExists $svc.Id) {
            # Upgrade path: the binaries changed underneath us, so refresh the
            # service definition from the (possibly updated) XML rather than
            # leaving the old one in place.
            $r = Invoke-Native -FilePath $exe -Arguments @('refresh')
            if ($r.ExitCode -ne 0) {
                Write-Warn "$($svc.Id) refresh returned $($r.ExitCode): $($r.StdErr.Trim())"
            } else {
                Write-Ok "$($svc.Id) already registered - definition refreshed"
            }
        } else {
            $r = Invoke-Native -FilePath $exe -Arguments @('install')
            if ($r.ExitCode -ne 0) {
                Write-Err "$($svc.Id) failed to register (exit $($r.ExitCode))"
                if ($r.StdErr) { Write-Host "         $($r.StdErr.Trim())" -ForegroundColor DarkGray }
                exit 1
            }
            Write-Ok "$($svc.Id) registered ($($svc.Label))"
        }
    }

    # WinSW writes <onfailure> into the service config at install time, but set
    # the recovery actions explicitly too: `sc failure` is what the Services MMC
    # shows a technician, and matching the two avoids a support call arguing
    # about whether restart-on-failure is actually configured.
    foreach ($svc in $Services) {
        Invoke-Native -FilePath 'sc.exe' -Arguments @(
            'failure', $svc.Id, 'reset= 3600',
            'actions= restart/10000/restart/30000/restart/60000'
        ) | Out-Null
    }
    Write-Ok "Recovery actions set (restart after 10s / 30s / 60s)"
}

# ── Start / Stop ─────────────────────────────────────────────────────────────
function Invoke-Start {
    $targets = if ($Service) { @($Services | Where-Object { $_.Id -eq $Service }) } else { $Services }
    Write-Step "Starting services$(if ($Service) { " ($Service)" })"
    foreach ($svc in $targets) {
        if (-not (Test-ServiceExists $svc.Id)) {
            Write-Warn "$($svc.Id) is not registered — skipping"
            continue
        }
        $s = Get-Service -Name $svc.Id
        if ($s.Status -eq 'Running') { Write-Ok "$($svc.Id) already running"; continue }
        try {
            Start-Service -Name $svc.Id -ErrorAction Stop
            Write-Ok "$($svc.Id) started"
        } catch {
            Write-Err "$($svc.Id) failed to start: $($_.Exception.Message)"
            Write-Host "         Log: $env:ProgramData\XP POS\logs\" -ForegroundColor DarkGray
            exit 1
        }
    }
}

function Invoke-Stop {
    $targets = if ($Service) { @($ServicesReversed | Where-Object { $_.Id -eq $Service }) } else { $ServicesReversed }
    Write-Step "Stopping services$(if ($Service) { " ($Service)" })"
    # Reverse order: Caddy depends on App, App on MongoDB.
    foreach ($svc in $targets) {
        if (-not (Test-ServiceExists $svc.Id)) { continue }
        $s = Get-Service -Name $svc.Id
        if ($s.Status -eq 'Stopped') { Write-Ok "$($svc.Id) already stopped"; continue }
        try {
            Stop-Service -Name $svc.Id -Force -ErrorAction Stop
            Write-Ok "$($svc.Id) stopped"
        } catch {
            Write-Warn "$($svc.Id) did not stop cleanly: $($_.Exception.Message)"
        }
    }
}

# ── Status ───────────────────────────────────────────────────────────────────
function Invoke-Status {
    Write-Step "Service status"
    $rows = foreach ($svc in $Services) {
        if (Test-ServiceExists $svc.Id) {
            $s   = Get-Service -Name $svc.Id
            $wmi = Get-CimInstance Win32_Service -Filter "Name='$($svc.Id)'"
            [pscustomobject]@{
                Service   = $svc.Id
                Role      = $svc.Label
                Status    = $s.Status
                StartType = if ($wmi.DelayedAutoStart) { 'Auto (Delayed)' } else { $wmi.StartMode }
            }
        } else {
            [pscustomobject]@{ Service = $svc.Id; Role = $svc.Label; Status = 'NOT INSTALLED'; StartType = '-' }
        }
    }
    $rows | Format-Table -AutoSize

    # The delayed-auto check is the one that actually matters for the "survives
    # a power cut with nobody logged in" requirement, so call it out rather than
    # leaving it buried in a table.
    $bad = $rows | Where-Object { $_.StartType -ne 'Auto (Delayed)' -and $_.Status -ne 'NOT INSTALLED' }
    if ($bad) {
        Write-Warn "These services are NOT set to Automatic (Delayed Start):"
        foreach ($b in $bad) { Write-Host "           - $($b.Service) [$($b.StartType)]" -ForegroundColor DarkGray }
        Write-Host "         They will not come back on their own after a reboot." -ForegroundColor DarkGray
    } else {
        Write-Ok "All services are Automatic (Delayed Start) — they start at boot with no user logged in"
    }
}

# ── Uninstall ────────────────────────────────────────────────────────────────
function Invoke-Uninstall {
    Write-Step "Removing services"
    Invoke-Stop
    foreach ($svc in $ServicesReversed) {
        if (-not (Test-ServiceExists $svc.Id)) {
            Write-Ok "$($svc.Id) not registered"
            continue
        }
        try {
            $exe = Get-WrapperPath $svc.Id
            Invoke-Native -FilePath $exe -Arguments @('uninstall') | Out-Null
        } catch {
            # The wrapper may already be gone (files deleted before this ran).
            # Fall back to sc.exe so we never leave an orphaned service entry.
            Invoke-Native -FilePath 'sc.exe' -Arguments @('delete', $svc.Id) | Out-Null
        }
        Write-Ok "$($svc.Id) removed"
    }
    Write-Host ""
    Write-Warn "Data in C:\ProgramData\XP POS was NOT touched (database, uploads, .env)."
}

switch ($Action) {
    # Register without starting. provision.ps1 uses this so it can bring up
    # MongoDB, initiate the replica set, and only then start the app.
    'Register'  { Invoke-Install }
    'Install'   { Invoke-Install; Invoke-Start; Invoke-Status }
    'Start'     { Invoke-Start }
    'Stop'      { Invoke-Stop }
    'Restart'   { Invoke-Stop; Invoke-Start }
    'Status'    { Invoke-Status }
    'Uninstall' { Invoke-Uninstall }
}
