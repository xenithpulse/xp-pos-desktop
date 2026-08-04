<#
.SYNOPSIS
    Keep the XP POS running. Runs every few minutes as SYSTEM, started by the
    XPPOS-Watchdog scheduled task.

.DESCRIPTION
    Windows' own service recovery covers less than it appears to, and the gaps
    are exactly the cases a restaurant hits. This script exists for those gaps -
    NOT as a replacement for recovery actions, which handle the common crash
    faster than any poll can.

    WHAT RECOVERY ACTIONS DO NOT COVER

      1. A dependency being stopped. Stopping XPPOS-MongoDB makes Windows stop
         XPPOS-App and XPPOS-Caddy with it, because they depend on it. When
         MongoDB comes back the other two DO NOT: the SCM stopped them
         deliberately, so as far as it is concerned nothing failed. This is the
         single most likely way to find "the service says Stopped" on a box
         nobody has touched, and nothing in Windows fixes it.

      2. Recovery exhaustion. The ladder is restart after 10s, 30s, 60s within
         a 3600s reset window. A service that fails four times in an hour - a
         database that needs a minute longer than usual after a power cut, say -
         uses up its three attempts and Windows then leaves it stopped for good.

      3. An in-place Windows feature update. A 23H2 -> 24H2 style upgrade can
         disable third-party services and drop Defender exclusions. The services
         survive as registered entries but come back Disabled or not at all.

      4. An update interrupted by a power cut. apply-update.ps1 puts the
         services back if the INSTALLER fails, but it cannot do anything if the
         box loses power while it is running. Nothing else would ever start them.

    WHAT THIS SCRIPT DELIBERATELY DOES NOT DO

      It does not restart a service that is running. It does not touch anything
      while an update is in progress. It does not fight a technician who has
      stopped the POS on purpose. And it escalates to re-running provisioning
      only when a service has gone MISSING, never merely because one is stopped
      - re-provisioning bounces all three, and doing that on a hair trigger
      would turn a five-second blip into a minute of downtime during service.

.PARAMETER InstallDir
    Program files root. Default: C:\Program Files\XP POS

.PARAMETER WhatIf
    Report what would be repaired and change nothing. Used by qa-check.ps1.

.NOTES
    ENCODING: UTF-8 WITH BOM, ASCII-only string literals. PowerShell 5.1 reads a
    BOM-less .ps1 as CP1252 and a UTF-8 em-dash inside a string silently
    terminates it. See services.ps1 for the measured example.
#>
[CmdletBinding()]
param(
    [string]$InstallDir = "$env:ProgramFiles\XP POS",
    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'

$DataRoot     = Join-Path $env:ProgramData 'XP POS'
$LogDir       = Join-Path $DataRoot 'logs'
$LogFile      = Join-Path $LogDir 'watchdog.log'
$EnvPath      = Join-Path $DataRoot '.env'
$PausePath    = Join-Path $DataRoot 'watchdog-pause'
$StatePath    = Join-Path $DataRoot 'watchdog-state.json'
$UpdateMarker = Join-Path $DataRoot 'updates\install-in-progress.json'
$ScriptDir    = Join-Path $InstallDir 'scripts'

# An installer is a ~118 MB self-extractor that also stops services, runs
# provisioning and waits for the POS to answer. The same 45 minutes lib/updates
# uses to call a marker stale is used here, for the same reason.
$UpdateMarkerStaleMinutes = 45

# Re-running provisioning restarts everything. Once every six hours is a
# repair; more often than that is an outage on a loop.
$ProvisionCooldownHours = 6

# Keep the log readable on a box nobody visits for a year.
$MaxLogBytes = 2MB

$Services = @('XPPOS-MongoDB', 'XPPOS-App', 'XPPOS-Caddy')

# ── Logging ──────────────────────────────────────────────────────────────────
#
# Every line is timestamped and appended. This log is the only account of what
# happened on a box between visits, so a QUIET run still writes nothing - a
# healthy POS must not produce a megabyte of "all fine" that buries the one line
# that mattered.

$script:LoggedThisRun = $false

function Write-Log {
    param([string]$Message, [string]$Level = 'INFO')
    $line = "{0} {1,-5} {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    Write-Host $line
    try {
        if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
        if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt $MaxLogBytes) {
            Move-Item $LogFile "$LogFile.old" -Force -ErrorAction SilentlyContinue
        }
        Add-Content -Path $LogFile -Value $line -Encoding UTF8
    } catch {
        # A watchdog that cannot write its log must still do its job.
    }
    $script:LoggedThisRun = $true
}

function Get-State {
    try {
        if (Test-Path $StatePath) { return Get-Content $StatePath -Raw | ConvertFrom-Json }
    } catch { }
    return $null
}

function Set-State {
    param([string]$Name, [datetime]$When)
    try {
        $state = @{}
        $existing = Get-State
        if ($existing) {
            foreach ($p in $existing.PSObject.Properties) { $state[$p.Name] = $p.Value }
        }
        $state[$Name] = $When.ToString('o')
        $state | ConvertTo-Json | Set-Content -Path $StatePath -Encoding UTF8
    } catch { }
}

# ── Guards: when to do nothing at all ────────────────────────────────────────

<#
    An update in progress owns the box.

    apply-update.ps1 stops the services, runs the installer and starts them
    again. A watchdog that started XPPOS-App back up in the middle of that would
    be racing an installer for the same files - the one failure mode worse than
    a stopped service is a half-installed one.
#>
function Test-UpdateInProgress {
    if (-not (Test-Path $UpdateMarker)) { return $false }
    try {
        $marker = Get-Content $UpdateMarker -Raw | ConvertFrom-Json
        $started = [datetime]::Parse($marker.startedAt).ToUniversalTime()
        $age = ((Get-Date).ToUniversalTime() - $started).TotalMinutes
        if ($age -lt $UpdateMarkerStaleMinutes) { return $true }

        # Stale marker: the update did not finish, and the box was left with its
        # services down. That is precisely what this script is for, so carry on
        # and repair - but say so, because it is the difference between "a
        # service stopped" and "an update was interrupted".
        Write-Log ("An update started {0:N0} minutes ago and never finished. Repairing." -f $age) 'WARN'
        return $false
    } catch {
        return $false
    }
}

<#
    A technician stopping the POS on purpose must stay stopped.

    services.ps1 -Action Stop writes this file with an expiry. Without it, a
    maintenance window would turn into a fight: stop the service, watch it come
    back four minutes later, stop it again. The expiry is what stops a forgotten
    pause file from silently disabling the watchdog forever - the worst outcome
    here is protection that is off and looks on.
#>
function Test-Paused {
    if (-not (Test-Path $PausePath)) { return $false }
    try {
        $until = [datetime]::Parse((Get-Content $PausePath -Raw).Trim())
        if ((Get-Date) -lt $until) {
            return $true
        }
        Write-Log "The maintenance pause expired at $until - resuming." 'INFO'
        Remove-Item $PausePath -Force -ErrorAction SilentlyContinue
        return $false
    } catch {
        # Unreadable pause file: treat as expired and remove it. Failing the
        # other way would disable the watchdog because of a typo.
        Remove-Item $PausePath -Force -ErrorAction SilentlyContinue
        return $false
    }
}

# ── Repairs ──────────────────────────────────────────────────────────────────

function Get-PosPort {
    try {
        if (Test-Path $EnvPath) {
            $m = Select-String -Path $EnvPath -Pattern '^\s*POS_HTTP_PORT\s*=\s*(\d+)' | Select-Object -First 1
            if ($m) { return [int]$m.Matches[0].Groups[1].Value }
        }
    } catch { }
    return 8080
}

<#
    Is the POS actually serving?

    A service reporting Running is not the same as a POS a waiter can use: node
    can be alive with its event loop wedged, and Caddy can be up in front of an
    app that is not. /login is the same endpoint provision.ps1 waits on, through
    the same proxy a staff tablet uses, so a pass here means the whole chain
    works.
#>
function Test-PosResponding {
    param([int]$Port, [int]$TimeoutSec = 15)
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec $TimeoutSec
        return ($resp.StatusCode -eq 200)
    } catch {
        # A 403 means Caddy is up and enforcing the device allow-list against
        # this request. The POS is serving; that is a configuration question,
        # not something to restart anything over.
        $r = $_.Exception.Response
        if ($r -and $r.StatusCode) { return $true }
        return $false
    }
}

function Repair-Services {
    $repaired = @()
    $missing  = @()

    # Dependency order. Starting the app before mongod is a service that fails
    # its first transactions and may exhaust its own recovery ladder doing it.
    foreach ($name in $Services) {
        $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
        if (-not $svc) {
            $missing += $name
            continue
        }

        # Disabled is what an in-place Windows feature update leaves behind.
        # Starting it would fail with "the service cannot be started because it
        # is disabled", so put the start type back first.
        $cfg = Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue
        if ($cfg -and $cfg.StartMode -eq 'Disabled') {
            Write-Log "$name is DISABLED - something outside the POS changed it. Re-enabling." 'WARN'
            if (-not $WhatIf) {
                & sc.exe config $name start= delayed-auto | Out-Null
            }
            $repaired += "$name re-enabled"
        }

        if ($svc.Status -eq 'Running') { continue }

        Write-Log "$name is $($svc.Status) - starting it." 'WARN'
        if ($WhatIf) { $repaired += "$name would be started"; continue }
        try {
            Start-Service -Name $name -ErrorAction Stop
            $svc.WaitForStatus('Running', [timespan]::FromSeconds(60))
            Write-Log "$name started." 'INFO'
            $repaired += "$name started"
        } catch {
            Write-Log "$name would not start: $($_.Exception.Message)" 'ERROR'
            $repaired += "$name FAILED to start"
        }
    }

    return [pscustomobject]@{ Repaired = $repaired; Missing = $missing }
}

<#
    The heavy repair, used only when a service is GONE.

    provision.ps1 is idempotent and is the supported way to re-apply everything:
    it re-registers the services, re-applies recovery actions, regenerates
    caddy.env and reopens the firewall. It also restarts the POS, which is why
    it is reached only when a service is missing entirely - a case that means
    something outside the POS removed it, and no amount of Start-Service will
    help.
#>
function Invoke-Reprovision {
    param([string[]]$Missing)

    $state = Get-State
    if ($state -and $state.lastProvisionAt) {
        try {
            $since = (Get-Date) - [datetime]::Parse($state.lastProvisionAt)
            if ($since.TotalHours -lt $ProvisionCooldownHours) {
                Write-Log ("Services missing ({0}) but provisioning ran {1:N1}h ago - waiting out the {2}h cooldown." -f ($Missing -join ', '), $since.TotalHours, $ProvisionCooldownHours) 'WARN'
                return
            }
        } catch { }
    }

    $provision = Join-Path $ScriptDir 'provision.ps1'
    if (-not (Test-Path $provision)) {
        Write-Log "Cannot repair: $provision is missing. The install is damaged - reinstall the POS." 'ERROR'
        return
    }

    Write-Log ("Services are not registered ({0}). Re-running provisioning." -f ($Missing -join ', ')) 'WARN'
    if ($WhatIf) { return }

    Set-State -Name 'lastProvisionAt' -When (Get-Date)
    try {
        & $provision -InstallDir $InstallDir
        Write-Log "Provisioning finished with exit code $LASTEXITCODE." 'INFO'
    } catch {
        Write-Log "Provisioning threw: $($_.Exception.Message)" 'ERROR'
    }
}

# ── Main ─────────────────────────────────────────────────────────────────────

if (Test-UpdateInProgress) {
    # Silent on purpose. This is the normal state for the few minutes an update
    # takes, and logging it every run would fill the log with non-events.
    exit 0
}

if (Test-Paused) {
    exit 0
}

$result = Repair-Services

if ($result.Missing.Count -gt 0) {
    Invoke-Reprovision -Missing $result.Missing
    exit 0
}

# Services are up. Are they actually serving?
$port = Get-PosPort
if (-not (Test-PosResponding -Port $port)) {
    <#
        Everything reports Running and nothing answers.

        Give it one restart of the app - a wedged node process is the realistic
        cause and a restart is the realistic fix. Rate-limited to once an hour
        so a POS that is broken for a reason a restart cannot fix does not get
        bounced every five minutes forever, which would take a degraded service
        and make it a completely unusable one.
    #>
    $state = Get-State
    $recentlyBounced = $false
    if ($state -and $state.lastAppBounceAt) {
        try {
            $recentlyBounced = ((Get-Date) - [datetime]::Parse($state.lastAppBounceAt)).TotalHours -lt 1
        } catch { }
    }

    if ($recentlyBounced) {
        Write-Log "The POS is still not answering on port $port, and the app was already restarted within the hour. Leaving it alone - this needs a human. Logs: $LogDir" 'ERROR'
    } else {
        Write-Log "All three services are Running but the POS does not answer on port $port. Restarting XPPOS-App." 'WARN'
        if (-not $WhatIf) {
            Set-State -Name 'lastAppBounceAt' -When (Get-Date)
            try {
                Restart-Service -Name 'XPPOS-App' -Force -ErrorAction Stop
                Start-Sleep -Seconds 20
                if (Test-PosResponding -Port $port -TimeoutSec 30) {
                    Write-Log "The POS is answering again." 'INFO'
                } else {
                    Write-Log "The POS still does not answer after restarting XPPOS-App." 'ERROR'
                }
            } catch {
                Write-Log "Could not restart XPPOS-App: $($_.Exception.Message)" 'ERROR'
            }
        }
    }
}

# A healthy run writes nothing. Silence in watchdog.log means the POS has been
# up every time it was checked, which is the report worth having.
exit 0
