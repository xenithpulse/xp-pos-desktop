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

    # Seconds Windows waits after boot before starting these services.
    #
    # Windows' built-in default for "Automatic (Delayed Start)" is 120s, and
    # with dependency ordering that measured 158s to a serving POS on a real
    # box. For a restaurant coming back from a power cut that is a long time to
    # stare at a dead tablet, so we shorten it.
    #
    # It is NOT set to 0, and the services are NOT plain Automatic: starting
    # during boot means competing with Windows for disk while mongod recovers
    # its journal, and Caddy binding its port before the network stack has
    # settled. 30s keeps the safety and cuts recovery roughly fivefold.
    [ValidateRange(0, 600)]
    [int]$StartDelaySeconds = 30,

    # How long the watchdog stays out of the way after a deliberate Stop.
    #
    # Long enough for real maintenance, short enough that a POS stopped and
    # forgotten on a Friday is serving again well before Saturday lunch. It
    # expires by itself - see Suspend-Watchdog.
    [ValidateRange(1, 1440)]
    [int]$PauseMinutes = 60,

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
            <#
                NEVER return $null for these two.

                Get-Content -Raw on an EMPTY file returns $null, not ''. That is
                easy to miss and it took down a real installation: winsw writes
                some failures to its own wrapper log and nothing to stderr, so a
                caller doing

                    "... returned $($r.ExitCode): $($r.StdErr.Trim())"

                called .Trim() on $null. Under $ErrorActionPreference = 'Stop'
                that is a TERMINATING error, so this script died mid-loop, in a
                branch whose whole purpose was to WARN and carry on. provision.ps1
                saw a non-zero exit and reported "Service registration failed",
                and the box was left with nothing started and no explanation.

                Coalescing here rather than at each call site is deliberate: the
                next person to add an Invoke-Native call should not have to know
                any of the above.
            #>
            if ($null -eq $out) { $out = '' }
            if ($null -eq $err) { $err = '' }
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
            <#
                Upgrade path: re-register so the service definition is taken from
                the NEW XML rather than whatever was recorded when the box was
                first installed.

                This used to call `winsw refresh`, WHICH DOES NOT EXIST IN THE
                VERSION WE SHIP. `refresh` arrived in WinSW v3; deps.json pins
                2.12.0 (v3 is still alpha), and 2.12.0 answers it with:

                    FATAL - Unhandled exception
                    System.Exception: Unknown command: refresh

                It was only a warning, so provisioning carried on and every
                upgrade looked successful - while silently keeping the OLD
                service definition. Anything added to the XML since a box was
                first installed therefore never reached it: the environment
                variables the app reads, <delayedAutoStart/>, the log paths. A
                site could take three upgrades and still be running the
                configuration it shipped with.

                Uninstall + install is how v2 replaces a definition. The service
                is stopped first because Windows will not remove a running one -
                on the installer's path they are already stopped by
                PrepareToInstall, but a technician re-running provision.ps1 by
                hand is the case that matters here. Nothing is lost: all state
                lives in the XML and in ProgramData, and provisioning starts
                everything again a few steps later.
            #>
            $s = Get-Service -Name $svc.Id -ErrorAction SilentlyContinue
            if ($s -and $s.Status -ne 'Stopped') {
                try {
                    Stop-Service -Name $svc.Id -Force -ErrorAction Stop
                } catch {
                    Write-Warn "$($svc.Id) would not stop: $($_.Exception.Message)"
                }
            }

            $r = Invoke-Native -FilePath $exe -Arguments @('uninstall')
            if ($r.ExitCode -ne 0) {
                Write-Warn "$($svc.Id) uninstall returned $($r.ExitCode)"
                if ($r.StdErr) { Write-Host "         $($r.StdErr.Trim())" -ForegroundColor DarkGray }
            }

            # Windows can hold the service entry briefly after a remove (the SCM
            # marks it delete-pending while a handle is open - Services MMC being
            # the usual culprit). Re-installing into that window fails with
            # "service marked for deletion", so wait for it to actually go.
            for ($i = 0; $i -lt 20 -and (Test-ServiceExists $svc.Id); $i++) {
                Start-Sleep -Milliseconds 500
            }

            $r = Invoke-Native -FilePath $exe -Arguments @('install')
            if ($r.ExitCode -ne 0) {
                Write-Err "$($svc.Id) failed to re-register (exit $($r.ExitCode))"
                if ($r.StdErr) { Write-Host "         $($r.StdErr.Trim())" -ForegroundColor DarkGray }
                Write-Host "         Close the Services window if it is open, then re-run." -ForegroundColor DarkGray
                exit 1
            }
            Write-Ok "$($svc.Id) re-registered from the current definition"
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

        <#
            Recovery actions alone are NOT enough, and this flag is why.

            By default Windows fires recovery actions only when a service
            terminates UNEXPECTEDLY - a crash, a non-zero exit. If the service
            process exits cleanly with code 0, the SCM records "Stopped" and
            does absolutely nothing about it. Measured on a live box: all three
            services had FAILURE_ACTIONS_ON_NONCRASH_FAILURES = FALSE, so a
            clean exit meant a POS that stayed down until somebody noticed.

            That matters here more than it would elsewhere because these are
            WinSW-wrapped services. The service process is the WRAPPER, and the
            wrapper exits 0 in several situations where the child died - so the
            case Windows ignores is exactly the case most likely to happen.

            With the flag on, any stop that was not an explicit
            Stop-Service/sc stop triggers the restart ladder above.
        #>
        Invoke-Native -FilePath 'sc.exe' -Arguments @('failureflag', $svc.Id, '1') | Out-Null
    }
    Write-Ok "Recovery actions set (restart after 10s / 30s / 60s, including clean exits)"

    # Shorten the delayed-auto-start wait. WinSW's <delayedAutoStart/> sets the
    # flag but not the delay, and Windows' default is 120s - measured at 158s to
    # a serving POS after a real reboot. This is a per-service override of
    # HKLM\SYSTEM\CurrentControlSet\Control\AutoStartDelay.
    foreach ($svc in $Services) {
        $key = "HKLM:\SYSTEM\CurrentControlSet\Services\$($svc.Id)"
        try {
            New-ItemProperty -Path $key -Name 'AutoStartDelay' -Value $StartDelaySeconds `
                -PropertyType DWord -Force -ErrorAction Stop | Out-Null
        } catch {
            Write-Warn "could not set AutoStartDelay on $($svc.Id): $($_.Exception.Message)"
        }
    }
    Write-Ok "Boot delay set to ${StartDelaySeconds}s (Windows default is 120s)"

    Register-Watchdog
}

# ── Watchdog ─────────────────────────────────────────────────────────────────

$WatchdogTask = 'XPPOS-Watchdog'
$PausePath    = Join-Path $env:ProgramData 'XP POS\watchdog-pause'

<#
    A scheduled task, deliberately NOT a fourth service.

    The thing that repairs the services cannot be one of the services it
    repairs. A watchdog service could be stopped by exactly the dependency
    cascade, recovery exhaustion or feature update it exists to recover from,
    and nothing would notice. Task Scheduler is a separate subsystem with its
    own recovery, it runs as SYSTEM with no session, and it survives the
    reboots that Windows Update forces.

    Two triggers, because they cover different failures: at startup (the box
    came back and something did not), and every few minutes (something stopped
    while it was up).
#>
function Register-Watchdog {
    $script = Join-Path $InstallDir 'scripts\watchdog.ps1'
    if (-not (Test-Path $script)) {
        Write-Warn "watchdog.ps1 is missing - the POS will run, but nothing will repair it if a service stops"
        return
    }

    try {
        $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $action = New-ScheduledTaskAction -Execute $ps -Argument (
            '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $script +
            '" -InstallDir "' + $InstallDir + '"'
        )

        # The startup trigger waits 2 minutes: the services are on a 30s delayed
        # start and mongod may still be recovering its journal. Repairing a POS
        # that is merely still coming up would restart things for no reason.
        $atStartup = New-ScheduledTaskTrigger -AtStartup
        $atStartup.Delay = 'PT2M'

        # Repeating forever from a start time in the past, so the first run is
        # immediate rather than five minutes after provisioning finishes.
        $repeating = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(-1) `
            -RepetitionInterval (New-TimeSpan -Minutes 5)

        $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

        # IgnoreNew: a run that takes longer than the interval (one that ends up
        # re-provisioning) must not have a second copy started on top of it.
        # No idle or battery conditions: a POS on a UPS during a power cut is
        # exactly when this has to run.
        $settings = New-ScheduledTaskSettingsSet `
            -MultipleInstances IgnoreNew `
            -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
            -AllowStartIfOnBatteries `
            -DontStopIfGoingOnBatteries `
            -StartWhenAvailable `
            -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)

        Register-ScheduledTask -TaskName $WatchdogTask -Action $action `
            -Trigger @($atStartup, $repeating) -Principal $principal -Settings $settings `
            -Description 'Restarts the XP POS services if they stop. See C:\ProgramData\XP POS\logs\watchdog.log' `
            -Force -ErrorAction Stop | Out-Null

        Write-Ok "$WatchdogTask registered (checks every 5 minutes and at startup)"
    } catch {
        # Not fatal. A box with a locked-down Task Scheduler still runs the POS;
        # it just has no automatic repair, and it should say so rather than
        # implying a safety net that is not there.
        Write-Warn "Could not register the watchdog task: $($_.Exception.Message)"
        Write-Host "         The POS will run, but a stopped service will stay stopped." -ForegroundColor DarkGray
    }
}

function Unregister-Watchdog {
    try {
        if (Get-ScheduledTask -TaskName $WatchdogTask -ErrorAction SilentlyContinue) {
            Unregister-ScheduledTask -TaskName $WatchdogTask -Confirm:$false -ErrorAction Stop
            Write-Ok "$WatchdogTask removed"
        }
    } catch {
        Write-Warn "Could not remove the watchdog task: $($_.Exception.Message)"
    }
}

<#
    Tell the watchdog to leave the POS alone for a while.

    Written whenever this script stops a service on purpose. Without it, a
    technician stopping the POS for maintenance would watch it restart itself
    within five minutes, and would reasonably conclude the box was possessed.

    An EXPIRY rather than a flag: a pause that has to be cleared by hand is one
    that gets forgotten, and a watchdog that is silently off is worse than no
    watchdog at all, because everyone believes it is working.
#>
function Suspend-Watchdog {
    param([int]$Minutes = 60)
    try {
        $until = (Get-Date).AddMinutes($Minutes)
        $dir = Split-Path $PausePath -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
        Set-Content -Path $PausePath -Value $until.ToString('o') -Encoding UTF8
        Write-Ok "Watchdog paused until $($until.ToString('HH:mm')) - it will resume on its own"
    } catch {
        Write-Warn "Could not pause the watchdog: $($_.Exception.Message)"
    }
}

function Resume-Watchdog {
    try {
        if (Test-Path $PausePath) {
            Remove-Item $PausePath -Force -ErrorAction Stop
            Write-Ok "Watchdog resumed"
        }
    } catch {
        Write-Warn "Could not resume the watchdog: $($_.Exception.Message)"
    }
}

# ── Start / Stop ─────────────────────────────────────────────────────────────
function Invoke-Start {
    $targets = if ($Service) { @($Services | Where-Object { $_.Id -eq $Service }) } else { $Services }
    Write-Step "Starting services$(if ($Service) { " ($Service)" })"
    foreach ($svc in $targets) {
        if (-not (Test-ServiceExists $svc.Id)) {
            Write-Warn "$($svc.Id) is not registered - skipping"
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

    # Stopping through this script is always deliberate, so hold the watchdog
    # off. Restart re-arms it at the end; a bare Stop leaves the pause to expire
    # on its own, which is what brings the POS back if somebody stops it for
    # maintenance and then goes home.
    Suspend-Watchdog -Minutes $PauseMinutes
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
        Write-Ok "All services are Automatic (Delayed Start) - they start at boot with no user logged in"
        $delay = (Get-ItemProperty "HKLM:\SYSTEM\CurrentControlSet\Services\XPPOS-MongoDB" -Name AutoStartDelay -ErrorAction SilentlyContinue).AutoStartDelay
        if ($null -eq $delay) { $delay = 120 }
        Write-Host "         Expect the POS to answer about ${delay}s after a reboot." -ForegroundColor DarkGray
        Write-Host "         Checking sooner than that will show them Stopped - that is normal." -ForegroundColor DarkGray
    }

    # The watchdog is the thing that makes "Stopped" temporary rather than
    # permanent, so its state belongs in the status a technician actually reads.
    $task = Get-ScheduledTask -TaskName $WatchdogTask -ErrorAction SilentlyContinue
    if (-not $task) {
        Write-Warn "The watchdog is NOT registered - a stopped service will stay stopped."
        Write-Host "         Fix: re-run provision.ps1 as Administrator." -ForegroundColor DarkGray
    } elseif ($task.State -eq 'Disabled') {
        Write-Warn "The watchdog task exists but is DISABLED."
        Write-Host "         Fix: Enable-ScheduledTask -TaskName $WatchdogTask" -ForegroundColor DarkGray
    } else {
        $info = Get-ScheduledTaskInfo -TaskName $WatchdogTask -ErrorAction SilentlyContinue
        $last = if ($info -and $info.LastRunTime -gt [datetime]'2000-01-01') { $info.LastRunTime } else { 'not yet' }
        Write-Ok "Watchdog active (last run: $last)"
        if (Test-Path $PausePath) {
            try {
                $until = [datetime]::Parse((Get-Content $PausePath -Raw).Trim())
                if ((Get-Date) -lt $until) {
                    Write-Warn "Watchdog is PAUSED until $($until.ToString('HH:mm')) - the POS will not be repaired until then."
                    Write-Host "         Resume now: `"$PSCommandPath`" -Action Start" -ForegroundColor DarkGray
                }
            } catch { }
        }
    }
}

# ── Uninstall ────────────────────────────────────────────────────────────────
function Invoke-Uninstall {
    Write-Step "Removing services"
    # Before stopping anything: a watchdog left registered after an uninstall
    # would keep trying to start services that no longer exist, and would
    # eventually re-run a provision.ps1 that has been deleted.
    Unregister-Watchdog
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
    # Start and Restart clear the pause: whatever maintenance it was covering
    # has finished, and leaving an hour of unwatched runtime behind would be a
    # gap nobody remembers opening.
    'Start'     { Resume-Watchdog; Invoke-Start }
    'Stop'      { Invoke-Stop }
    'Restart'   { Invoke-Stop; Invoke-Start; Resume-Watchdog }
    'Status'    { Invoke-Status }
    'Uninstall' { Invoke-Uninstall }
}

<#
    Say so explicitly.

    Without this, a successful run leaves $LASTEXITCODE holding whatever the
    last NATIVE command inside this script happened to return - sc.exe, or a
    winsw call several steps earlier. provision.ps1 gates on exactly that value:

        & $Services -Action Register -InstallDir $InstallDir
        if ($LASTEXITCODE -ne 0) { Write-Err "Service registration failed."; exit 1 }

    So a tool that warned on stderr and returned non-zero, in a step this script
    deliberately treats as non-fatal, could abort the whole installation with a
    message pointing at the wrong thing. Every failure path above calls exit 1
    of its own accord; reaching here means success, and it should report success.
#>
exit 0
