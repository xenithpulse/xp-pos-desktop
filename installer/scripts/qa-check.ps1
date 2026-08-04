<#
.SYNOPSIS
    Verify an installed XP POS appliance. Run this on every box before it is
    left with a customer.

.DESCRIPTION
    Checks what phases 9, 10 and 11 actually delivered, on the box, by looking
    at the box - not by reading code. Every check is one line of PASS, FAIL or
    WARN, and the run ends with a report file that can be emailed.

    Three modes, increasingly invasive:

      (default)     Read-only. Safe on a live restaurant during service.
      -Destructive  Kills services and proves they come back. Takes the POS
                    down for a minute or two. NEVER run during service.
      -Reboot       Prints the manual steps that need a human and a power
                    button, and records what to look for afterwards.

    WHY A SCRIPT AND NOT A CHECKLIST. Everything here is a question with a
    factual answer that a human reading a checklist gets wrong: is
    FAILURE_ACTIONS_ON_NONCRASH_FAILURES set, is mongod actually PRIMARY, does
    the licence resolve, is the watchdog registered AND enabled AND not paused.
    A technician on a customer site at 6pm will tick "services running" and
    leave. This asks the questions that matter and does not let them be skipped.

.PARAMETER InstallDir
    Program files root. Default: C:\Program Files\XP POS

.PARAMETER Destructive
    Also stop services and verify automatic recovery. Takes the POS down.

.PARAMETER Reboot
    Print the manual reboot/power-cut procedure and the post-reboot checks.

.PARAMETER ReportPath
    Where to write the report. Default: C:\ProgramData\XP POS\logs\qa-report-<stamp>.txt

.EXAMPLE
    .\qa-check.ps1
    .\qa-check.ps1 -Destructive
    .\qa-check.ps1 -Reboot

.NOTES
    ENCODING: UTF-8 WITH BOM, ASCII-only string literals. See services.ps1.
#>
[CmdletBinding()]
param(
    [string]$InstallDir = "$env:ProgramFiles\XP POS",
    [switch]$Destructive,
    [switch]$Reboot,
    [string]$ReportPath
)

$ErrorActionPreference = 'Stop'

$DataRoot  = Join-Path $env:ProgramData 'XP POS'
$EnvPath   = Join-Path $DataRoot '.env'
$LogDir    = Join-Path $DataRoot 'logs'
$ScriptDir = Join-Path $InstallDir 'scripts'
$Services  = @('XPPOS-MongoDB', 'XPPOS-App', 'XPPOS-Caddy')
$WatchdogTask = 'XPPOS-Watchdog'

if (-not $ReportPath) {
    $ReportPath = Join-Path $LogDir ("qa-report-{0}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
}

$script:Lines = @()
$script:Pass = 0
$script:Fail = 0
$script:Warn = 0

function Add-Line { param([string]$Text) $script:Lines += $Text }

function Write-Section {
    param([string]$Name)
    Write-Host ""
    Write-Host "== $Name" -ForegroundColor Cyan
    Add-Line ""
    Add-Line "== $Name"
}

<#
    One result.

    A WARN is for something a site can legitimately be shipped with (no update
    URL on a permanently offline box, an unsigned build before the certificate
    is bought). A FAIL is something that WILL become a support call. Keeping
    those apart is the whole value of the report - a run full of yellow that
    still says 0 failed is a box that can be left with a customer.
#>
function Test-Result {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][ValidateSet('PASS', 'FAIL', 'WARN')][string]$Status,
        [string]$Detail = ''
    )
    $colour = switch ($Status) { 'PASS' { 'Green' } 'FAIL' { 'Red' } 'WARN' { 'Yellow' } }
    $text = "  {0,-4} {1}" -f $Status, $Name
    if ($Detail) { $text += "`n         $Detail" }
    Write-Host $text -ForegroundColor $colour
    Add-Line ("  {0,-4} {1}" -f $Status, $Name)
    if ($Detail) { Add-Line ("         " + $Detail) }
    switch ($Status) {
        'PASS' { $script:Pass++ }
        'FAIL' { $script:Fail++ }
        'WARN' { $script:Warn++ }
    }
}

function Get-EnvValue {
    param([string]$Key)
    try {
        if (-not (Test-Path $EnvPath)) { return $null }
        $m = Select-String -Path $EnvPath -Pattern ("^\s*" + [regex]::Escape($Key) + "\s*=\s*(.*)$") | Select-Object -First 1
        if ($m) { return $m.Matches[0].Groups[1].Value.Trim() }
    } catch { }
    return $null
}

$Port = 8080
$p = Get-EnvValue 'POS_HTTP_PORT'
if ($p -and [int]::TryParse($p, [ref]$null)) { $Port = [int]$p }

function Invoke-Pos {
    param([string]$Path = '/login', [int]$TimeoutSec = 20)
    try {
        return Invoke-WebRequest -Uri "http://127.0.0.1:$Port$Path" -UseBasicParsing -TimeoutSec $TimeoutSec
    } catch {
        return $null
    }
}

# ── Header ───────────────────────────────────────────────────────────────────

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin   = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host ""
Write-Host "  XP POS - appliance QA check" -ForegroundColor White
Write-Host "  machine : $env:COMPUTERNAME" -ForegroundColor DarkGray
Write-Host "  when    : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
Write-Host "  port    : $Port" -ForegroundColor DarkGray

Add-Line "XP POS - appliance QA check"
Add-Line ("machine : {0}" -f $env:COMPUTERNAME)
Add-Line ("windows : {0}" -f (Get-CimInstance Win32_OperatingSystem).Caption)
Add-Line ("when    : {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
Add-Line ("mode    : {0}" -f $(if ($Destructive) { 'DESTRUCTIVE' } else { 'read-only' }))

if (-not $isAdmin) {
    Write-Host ""
    Write-Host "  Not running as Administrator - service configuration and recovery" -ForegroundColor Yellow
    Write-Host "  checks will be skipped. Re-run elevated for a complete report." -ForegroundColor Yellow
    Add-Line "NOTE: not elevated - some checks skipped"
}

if ($Reboot) {
    Write-Host ""
    Write-Host "  MANUAL RESILIENCE TESTS - these need a human" -ForegroundColor White
    Write-Host ""
    Write-Host "  1. UNATTENDED RESTART (the one that proves a power cut is survivable)" -ForegroundColor Cyan
    Write-Host "     a. Reboot this box."
    Write-Host "     b. Do NOT log in. Leave it sitting at the login screen."
    Write-Host "     c. From a staff tablet, open http://<box-ip>:$Port"
    Write-Host "     Expect: serving within about 60s. Windows' own default"
    Write-Host "     delay is 120s; provisioning shortens it to 30s."
    Write-Host ""
    Write-Host "     Note: Fast Startup is enabled on most Windows installs, so"
    Write-Host "     'Shut down' then power on is NOT a real boot. Use Restart,"
    Write-Host "     or pull the power, or the test proves less than you think."
    Write-Host ""
    Write-Host "  2. POWER CUT DURING SERVICE" -ForegroundColor Cyan
    Write-Host "     a. Open an order on a tablet, leave it open."
    Write-Host "     b. Pull the power cable. Wait 30 seconds. Plug it back in."
    Write-Host "     Expect: the POS returns, the order is still open, mongod"
    Write-Host "     recovers its journal. Check logs\mongodb for recovery lines."
    Write-Host ""
    Write-Host "  3. WINDOWS UPDATE" -ForegroundColor Cyan
    Write-Host "     Install pending updates and let it reboot on its own."
    Write-Host "     Expect: the POS comes back with nobody logged in. Then"
    Write-Host "     re-run this script - a feature update can disable services,"
    Write-Host "     and the watchdog check below is what catches that."
    Write-Host ""
    Write-Host "  4. INTERRUPTED UPDATE" -ForegroundColor Cyan
    Write-Host "     Start an update from Server Management, then pull the power"
    Write-Host "     while the installer is running."
    Write-Host "     Expect: the box comes back on its PREVIOUS working version,"
    Write-Host "     and Server Management reports the update as interrupted"
    Write-Host "     rather than leaving a marker on disk forever."
    Write-Host ""
    Write-Host "  After each: re-run this script and confirm 0 failed." -ForegroundColor White
    Write-Host ""
    exit 0
}

# ── 1. Install integrity ─────────────────────────────────────────────────────
Write-Section "Install"

foreach ($rel in @('app\server.js', 'node\node.exe', 'mongodb\bin\mongod.exe', 'caddy\caddy.exe',
                   'scripts\provision.ps1', 'scripts\services.ps1', 'scripts\watchdog.ps1',
                   'scripts\apply-update.ps1')) {
    $full = Join-Path $InstallDir $rel
    if (Test-Path $full) {
        Test-Result "present: $rel" 'PASS'
    } else {
        Test-Result "present: $rel" 'FAIL' "Missing from $InstallDir - the install is incomplete."
    }
}

if (Test-Path $EnvPath) {
    Test-Result "site config exists" 'PASS' $EnvPath
} else {
    Test-Result "site config exists" 'FAIL' "$EnvPath is missing - provisioning never completed."
}

# Nothing mutable may live under Program Files: it is replaced wholesale on
# upgrade, so anything here is data that will be silently destroyed one day.
foreach ($stray in @('license.dat', 'license-state.json', 'site-id.json', '.env')) {
    if (Test-Path (Join-Path $InstallDir $stray)) {
        Test-Result "no mutable state in Program Files ($stray)" 'FAIL' `
            "An upgrade replaces Program Files wholesale and would delete this."
    }
}

# ── 2. Services ──────────────────────────────────────────────────────────────
Write-Section "Services"

foreach ($name in $Services) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if (-not $svc) {
        Test-Result "$name registered" 'FAIL' "Not registered. Re-run provision.ps1 as Administrator."
        continue
    }
    if ($svc.Status -eq 'Running') {
        Test-Result "$name running" 'PASS'
    } else {
        Test-Result "$name running" 'FAIL' "Status is $($svc.Status)."
    }

    $cfg = Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue
    if ($cfg -and $cfg.DelayedAutoStart) {
        Test-Result "$name is Automatic (Delayed Start)" 'PASS'
    } else {
        Test-Result "$name is Automatic (Delayed Start)" 'FAIL' `
            "StartMode is $($cfg.StartMode) - it will not come back after a power cut with nobody logged in."
    }

    if ($cfg -and $cfg.StartName -eq 'LocalSystem') {
        Test-Result "$name runs as LocalSystem" 'PASS'
    } else {
        Test-Result "$name runs as LocalSystem" 'WARN' "Runs as $($cfg.StartName)."
    }
}

if ($isAdmin) {
    foreach ($name in $Services) {
        $flag = & sc.exe qfailureflag $name 2>&1 | Out-String
        if ($flag -match 'FAILURE_ACTIONS_ON_NONCRASH_FAILURES:\s+TRUE') {
            Test-Result "$name restarts after a CLEAN exit" 'PASS'
        } else {
            # This is the difference between a POS that heals and one that only
            # appears to. Windows fires recovery actions on a crash; a clean
            # exit is ignored unless this flag is set.
            Test-Result "$name restarts after a CLEAN exit" 'FAIL' `
                "FAILURE_ACTIONS_ON_NONCRASH_FAILURES is FALSE - a clean exit leaves it stopped forever. Re-run provision.ps1."
        }

        $fail = & sc.exe qfailure $name 2>&1 | Out-String
        if ($fail -match 'RESTART') {
            Test-Result "$name has restart-on-failure actions" 'PASS'
        } else {
            Test-Result "$name has restart-on-failure actions" 'FAIL' "No restart actions configured."
        }
    }
}

# Dependency chain. Without it the app can start before mongod is a primary and
# spends its first requests failing to select a server.
$appDeps = (Get-CimInstance Win32_Service -Filter "Name='XPPOS-App'" -ErrorAction SilentlyContinue)
if ($appDeps) {
    $deps = (& sc.exe qc XPPOS-App 2>&1 | Out-String)
    if ($deps -match 'XPPOS-MongoDB') {
        Test-Result "XPPOS-App depends on XPPOS-MongoDB" 'PASS'
    } else {
        Test-Result "XPPOS-App depends on XPPOS-MongoDB" 'WARN' "The app may start before the database is ready."
    }
}

# ── 3. Watchdog ──────────────────────────────────────────────────────────────
Write-Section "Self-healing"

$task = Get-ScheduledTask -TaskName $WatchdogTask -ErrorAction SilentlyContinue
if (-not $task) {
    Test-Result "watchdog registered" 'FAIL' `
        "No $WatchdogTask task. A service stopped by a dependency cascade or a feature update would stay stopped. Re-run provision.ps1."
} elseif ($task.State -eq 'Disabled') {
    Test-Result "watchdog registered" 'FAIL' "The task exists but is Disabled. Enable-ScheduledTask -TaskName $WatchdogTask"
} else {
    Test-Result "watchdog registered and enabled" 'PASS' "State: $($task.State)"

    $info = Get-ScheduledTaskInfo -TaskName $WatchdogTask -ErrorAction SilentlyContinue
    if ($info -and $info.LastRunTime -gt [datetime]'2000-01-01') {
        $age = (Get-Date) - $info.LastRunTime
        if ($age.TotalMinutes -lt 20) {
            Test-Result "watchdog has run recently" 'PASS' ("Last run {0:N0} minutes ago, result {1}." -f $age.TotalMinutes, $info.LastTaskResult)
        } else {
            Test-Result "watchdog has run recently" 'WARN' ("Last run {0:N0} minutes ago - expected every 5." -f $age.TotalMinutes)
        }
    } else {
        Test-Result "watchdog has run" 'WARN' "It has never run yet. It will within 5 minutes of provisioning."
    }
}

$pause = Join-Path $DataRoot 'watchdog-pause'
if (Test-Path $pause) {
    try {
        $until = [datetime]::Parse((Get-Content $pause -Raw).Trim())
        if ((Get-Date) -lt $until) {
            Test-Result "watchdog is not paused" 'WARN' `
                "Paused until $until. Nothing will be repaired before then. Resume: services.ps1 -Action Start"
        } else {
            Test-Result "watchdog is not paused" 'PASS' "An expired pause file is here; it clears itself on the next run."
        }
    } catch {
        Test-Result "watchdog is not paused" 'WARN' "The pause file is unreadable; it will be cleared automatically."
    }
} else {
    Test-Result "watchdog is not paused" 'PASS'
}

# ── 4. The POS itself ────────────────────────────────────────────────────────
Write-Section "Serving"

$resp = Invoke-Pos '/login'
if ($resp -and $resp.StatusCode -eq 200) {
    Test-Result "POS answers on 127.0.0.1:$Port" 'PASS'
} else {
    Test-Result "POS answers on 127.0.0.1:$Port" 'FAIL' `
        "No 200 from /login. The services may be up with the app wedged behind them. Check logs\app."
}

# The LAN address is what staff tablets actually use, and a POS that answers on
# loopback but not on the LAN is a firewall or Caddy binding problem - which is
# invisible from the box itself and obvious from a tablet.
$lanIps = @()
try {
    $configs = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' }
    foreach ($c in $configs) {
        foreach ($addr in $c.IPv4Address) {
            if ($addr.IPAddress -notmatch '^(127\.|169\.254\.)') { $lanIps += $addr.IPAddress }
        }
    }
} catch { }

if ($lanIps.Count -eq 0) {
    Test-Result "box has a LAN address" 'FAIL' "No LAN IP with a default gateway - staff devices cannot reach it."
} else {
    Test-Result "box has a LAN address" 'PASS' ($lanIps -join ', ')
    Add-Line ("         staff URL: http://{0}:{1}" -f $lanIps[0], $Port)
}

$rule = Get-NetFirewallRule -DisplayName "XP POS (TCP $Port)" -ErrorAction SilentlyContinue
if ($rule) {
    Test-Result "firewall allows TCP $Port" 'PASS'
} else {
    Test-Result "firewall allows TCP $Port" 'WARN' "No rule named 'XP POS (TCP $Port)'. Staff devices may be blocked."
}

# ── 5. Database ──────────────────────────────────────────────────────────────
Write-Section "Database"

# Transactions - which the POS uses for fire-order, order edits, table sessions
# and cash slips - are refused by a standalone mongod. A single-node replica set
# that is not PRIMARY is the same problem wearing a different hat.
$mongosh = Join-Path $InstallDir 'mongodb\bin\mongosh.exe'
if (Test-Path $mongosh) {
    try {
        <#
            No spaces and no quotes inside the expression, deliberately.

            An earlier version passed a readable one-liner with string literals
            in it and mongosh answered "SyntaxError: Unexpected token" - the
            quotes do not survive PowerShell's native argument handling intact.
            mongosh prints the value of the last expression, so a bare numeric
            state needs no print() and no literals: 1 is PRIMARY, -1 means
            rs.status() threw, which is what a standalone mongod does.
        #>
        $out = (& $mongosh --quiet --eval 'try{rs.status().myState}catch(e){-1}' 2>&1 | Out-String).Trim()
        if ($out -match '(?m)^\s*1\s*$') {
            Test-Result "MongoDB is a replica set PRIMARY" 'PASS' "Transactions will work."
        } elseif ($out -match '(?m)^\s*-1\s*$') {
            Test-Result "MongoDB is a replica set PRIMARY" 'FAIL' `
                "rs.status() threw - this mongod is not a replica set, so every POS transaction (fire-order, order edits, table sessions, cash slips) will fail."
        } else {
            Test-Result "MongoDB is a replica set PRIMARY" 'FAIL' `
                ("myState was '" + $out + "' (1 = PRIMARY) - the POS cannot run transactions.")
        }
    } catch {
        Test-Result "MongoDB is a replica set PRIMARY" 'WARN' "Could not query it: $($_.Exception.Message)"
    }
} else {
    Test-Result "MongoDB is a replica set PRIMARY" 'WARN' "mongosh.exe is not in the payload - skipped."
}

# ── 6. Phase 11: licensing ───────────────────────────────────────────────────
Write-Section "Licence"

$lic = Invoke-Pos '/api/admin/server-config/license'
if (-not $lic) {
    Test-Result "licence status resolves" 'FAIL' "The licence endpoint did not answer."
} else {
    try {
        $l = $lic.Content | ConvertFrom-Json
        Test-Result "licence status resolves" 'PASS' ("{0} - {1}" -f $l.state, $l.headline)
        Add-Line ("         machine code: {0}" -f $l.machineCode)

        if ($l.signalsAvailable -ge 3) {
            Test-Result "hardware fingerprint is strong enough" 'PASS' "$($l.signalsAvailable) of 4 signals readable."
        } else {
            Test-Result "hardware fingerprint is strong enough" 'WARN' `
                "Only $($l.signalsAvailable) of 4 signals readable. A licence issued here has little tolerance for hardware changes."
        }

        if ($l.restricted) {
            Test-Result "POS is not licence-restricted" 'FAIL' `
                "The POS is read-only: $($l.detail)"
        } else {
            Test-Result "POS is not licence-restricted" 'PASS'
        }

        if ($l.clockWarning) {
            Test-Result "clock is sane" 'WARN' $l.clockWarning
        } else {
            Test-Result "clock is sane" 'PASS'
        }
    } catch {
        Test-Result "licence status resolves" 'FAIL' "The endpoint answered but the response was not readable."
    }
}

# ── 7. Phase 10: updates ─────────────────────────────────────────────────────
Write-Section "Updates"

$upd = Invoke-Pos '/api/admin/server-config/updates'
if (-not $upd) {
    Test-Result "update status resolves" 'WARN' "The update endpoint did not answer."
} else {
    try {
        $u = $upd.Content | ConvertFrom-Json
        Test-Result "update status resolves" 'PASS' ("installed {0}" -f $u.installedVersion)
        if (-not $u.enabled) {
            # Correct and common: most of these boxes never see the internet.
            Test-Result "update channel" 'WARN' "Not configured (POS_UPDATE_URL is blank). Normal for an offline site."
        } elseif ($u.reachable -eq $false) {
            Test-Result "update channel" 'WARN' "Configured but the manifest host is unreachable. Normal for an offline site."
        } else {
            Test-Result "update channel" 'PASS' ("channel {0}" -f $u.channel)
        }
        if ($u.allowUnsigned) {
            Test-Result "unsigned installers are refused" 'FAIL' `
                "POS_UPDATE_ALLOW_UNSIGNED is true - this box will run an installer Windows could not verify, as Administrator."
        } else {
            Test-Result "unsigned installers are refused" 'PASS'
        }
        if ($u.lastInstall -and $u.lastInstall.outcome -notin @('success')) {
            Test-Result "last update completed" 'WARN' ("{0}: {1}" -f $u.lastInstall.outcome, $u.lastInstall.detail)
        }
    } catch {
        Test-Result "update status resolves" 'WARN' "Unreadable response."
    }
}

$marker = Join-Path $DataRoot 'updates\install-in-progress.json'
if (Test-Path $marker) {
    Test-Result "no update stuck in progress" 'WARN' `
        "An install marker is present. If it is older than 45 minutes the watchdog will repair the services."
} else {
    Test-Result "no update stuck in progress" 'PASS'
}

# ── 8. Phase 9: signing ──────────────────────────────────────────────────────
Write-Section "Code signing"

$unsigned = @()
foreach ($exe in @('service\XPPOS-App.exe', 'service\XPPOS-MongoDB.exe', 'service\XPPOS-Caddy.exe')) {
    $full = Join-Path $InstallDir $exe
    if (-not (Test-Path $full)) { continue }
    $sig = Get-AuthenticodeSignature -LiteralPath $full
    if ($sig.Status -ne 'Valid') { $unsigned += (Split-Path $exe -Leaf) }
}
if ($unsigned.Count -eq 0) {
    Test-Result "service wrappers are signed" 'PASS'
} else {
    # Expected until the certificate is bought. A WARN, not a FAIL: the box
    # works, and this is a purchasing decision, not a defect on this machine.
    Test-Result "service wrappers are signed" 'WARN' `
        ("Not signed: " + ($unsigned -join ', ') + ". Expected until the Phase 9 certificate is purchased.")
}

# ── 9. Backups ───────────────────────────────────────────────────────────────
Write-Section "Backups"

$cfg = Invoke-Pos '/api/admin/server-config'
if ($cfg) {
    try {
        $c = $cfg.Content | ConvertFrom-Json
        if ($c.backupEnabled) {
            $when = if ($c.lastBackupAt) { ([datetime]$c.lastBackupAt).ToString('yyyy-MM-dd HH:mm') } else { 'never' }
            if ($c.lastBackupStatus -eq 'success') {
                Test-Result "backups are running" 'PASS' "Last: $when"
            } else {
                Test-Result "backups are running" 'WARN' "Enabled, last status '$($c.lastBackupStatus)', last run $when."
            }
        } else {
            Test-Result "backups are enabled" 'FAIL' "Backups are switched off. A disk failure would lose the restaurant's data."
        }
    } catch {
        Test-Result "backup status readable" 'WARN' "Unreadable response."
    }
}

# ── 10. Destructive: prove recovery actually works ───────────────────────────
if ($Destructive) {
    Write-Section "Recovery (DESTRUCTIVE)"

    if (-not $isAdmin) {
        Test-Result "recovery test" 'WARN' "Skipped - needs Administrator."
    } else {
        <#
            Kill the app process rather than stopping the service.

            Stop-Service is an ORDERLY stop and Windows deliberately does not
            fire recovery actions for it - testing that way would prove nothing
            and look like a pass. Killing the process is what a crash actually
            looks like, and it is the only way to find out whether the recovery
            ladder is real on this box.
        #>
        Write-Host "  Killing the XPPOS-App service process to test automatic recovery..." -ForegroundColor Yellow
        Write-Host "  The POS will be briefly unavailable." -ForegroundColor Yellow

        $svcProc = Get-CimInstance Win32_Service -Filter "Name='XPPOS-App'"
        $pidToKill = $svcProc.ProcessId
        if (-not $pidToKill -or $pidToKill -eq 0) {
            Test-Result "recovery from a crash" 'WARN' "XPPOS-App has no process to kill - is it running?"
        } else {
            Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue

            # The first rung of the ladder is 10s; give it generous room to also
            # boot node and answer HTTP.
            $recovered = $false
            for ($i = 0; $i -lt 30; $i++) {
                Start-Sleep -Seconds 5
                $s = Get-Service -Name 'XPPOS-App' -ErrorAction SilentlyContinue
                if ($s -and $s.Status -eq 'Running') { $recovered = $true; break }
            }

            if ($recovered) {
                Test-Result "XPPOS-App restarts itself after a crash" 'PASS' ("Back within {0}s." -f (($i + 1) * 5))
                $back = $false
                for ($j = 0; $j -lt 24; $j++) {
                    Start-Sleep -Seconds 5
                    if (Invoke-Pos '/login' 10) { $back = $true; break }
                }
                if ($back) {
                    Test-Result "POS serves again after a crash" 'PASS' ("Serving within {0}s of the restart." -f (($j + 1) * 5))
                } else {
                    Test-Result "POS serves again after a crash" 'FAIL' "The service is Running but nothing answers."
                }
            } else {
                Test-Result "XPPOS-App restarts itself after a crash" 'FAIL' `
                    "Still not Running after 150s. Recovery actions are not working - check the failure flag above."
            }
        }

        <#
            The dependency cascade. This is the failure the watchdog exists for
            and the one Windows will never fix on its own: stopping MongoDB
            takes App and Caddy down with it, and starting MongoDB again brings
            back only MongoDB.
        #>
        Write-Host "  Stopping XPPOS-MongoDB to test the dependency cascade..." -ForegroundColor Yellow
        & sc.exe stop XPPOS-MongoDB | Out-Null
        Start-Sleep -Seconds 10
        & sc.exe start XPPOS-MongoDB | Out-Null
        Start-Sleep -Seconds 10

        $downstream = @('XPPOS-App', 'XPPOS-Caddy') | ForEach-Object {
            (Get-Service -Name $_ -ErrorAction SilentlyContinue).Status
        }
        Add-Line ("         after the cascade, App/Caddy were: " + ($downstream -join ', '))

        $watchdog = Join-Path $ScriptDir 'watchdog.ps1'
        if (Test-Path $watchdog) {
            Write-Host "  Running the watchdog to repair the cascade..." -ForegroundColor Yellow
            & $watchdog -InstallDir $InstallDir | Out-Null

            $allUp = $true
            foreach ($name in $Services) {
                $s = Get-Service -Name $name -ErrorAction SilentlyContinue
                if (-not $s -or $s.Status -ne 'Running') { $allUp = $false }
            }
            if ($allUp) {
                Test-Result "watchdog repairs a dependency cascade" 'PASS' "All three services are Running again."
            } else {
                Test-Result "watchdog repairs a dependency cascade" 'FAIL' "Services are still down after the watchdog ran."
            }
        } else {
            Test-Result "watchdog repairs a dependency cascade" 'FAIL' "watchdog.ps1 is missing."
        }

        $back = $false
        for ($k = 0; $k -lt 24; $k++) {
            Start-Sleep -Seconds 5
            if (Invoke-Pos '/login' 10) { $back = $true; break }
        }
        if ($back) {
            Test-Result "POS serves again after the cascade" 'PASS'
        } else {
            Test-Result "POS serves again after the cascade" 'FAIL' "The POS is still not answering - investigate before leaving site."
        }
    }
}

# ── Summary ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor White
if ($script:Fail -eq 0) {
    Write-Host ("   {0} passed, {1} warnings, 0 FAILED" -f $script:Pass, $script:Warn) -ForegroundColor Green
    Write-Host "   This box is fit to leave with a customer." -ForegroundColor Green
} else {
    Write-Host ("   {0} passed, {1} warnings, {2} FAILED" -f $script:Pass, $script:Warn, $script:Fail) -ForegroundColor Red
    Write-Host "   Do NOT leave this box with a customer until the failures are fixed." -ForegroundColor Red
}
Write-Host "  ============================================================" -ForegroundColor White

Add-Line ""
Add-Line ("SUMMARY: {0} passed, {1} warnings, {2} failed" -f $script:Pass, $script:Warn, $script:Fail)

if (-not $Destructive) {
    Write-Host ""
    Write-Host "   Not yet tested: automatic recovery, and anything needing a reboot." -ForegroundColor DarkGray
    Write-Host "     .\qa-check.ps1 -Destructive    proves crash + cascade recovery" -ForegroundColor DarkGray
    Write-Host "     .\qa-check.ps1 -Reboot         the manual power-cut procedure" -ForegroundColor DarkGray
}

try {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
    Set-Content -Path $ReportPath -Value ($script:Lines -join "`r`n") -Encoding UTF8
    Write-Host ""
    Write-Host "   Report: $ReportPath" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "   Could not write the report: $($_.Exception.Message)" -ForegroundColor Yellow
}

if ($script:Fail -gt 0) { exit 1 }
exit 0
