<#
.SYNOPSIS
    Apply a downloaded XP POS update by running its installer silently.

.DESCRIPTION
    Launched detached by the update agent inside XPPOS-App. It exists as a
    separate process for one reason: the installer's FIRST action is to stop
    XPPOS-App, which kills whatever started it. Anything that has to happen
    after that point - reading the exit code, putting the services back if the
    install failed, recording what happened - has to live out here.

    What it does NOT do is reimplement upgrading. Re-running the installer is
    the supported upgrade path and it already stops the services before
    replacing any file, aborts with an actionable message if they will not
    stop, leaves C:\ProgramData\XP POS untouched, re-runs provisioning and
    restarts everything. A script that started stopping services and copying
    files itself would be a worse copy of code that already works.

    Order of operations, and why:

      1.  Re-verify the installer's sha256. The agent verified it on download,
          possibly days ago. This runs as LocalSystem and is about to execute
          the file as Administrator; re-hashing 118 MB costs seconds.
      2.  Report the Authenticode signature into the log. NOT a gate here - the
          agent already refused an untrusted payload unless the operator turned
          that refusal off. Logging it means the log says what was run.
      3.  Run the installer /VERYSILENT.
      4.  On a non-zero exit, START THE SERVICES AGAIN. A failed update must
          leave the previous version serving, not a dead box.
      5.  Write install-result.json. The app reads it once on the next startup
          and deletes it - it is the only way the exit code survives the app
          being killed by its own installer.

.PARAMETER Installer
    Full path to the verified XP-POS-Setup-<version>.exe.

.PARAMETER ExpectedSha256
    The hash the agent verified on download. Re-checked here before execution.

.PARAMETER Version
    Version being installed. Recorded, and used in the result file.

.PARAMETER DataRoot
    C:\ProgramData\XP POS. Passed in rather than assumed: POS_DATA_DIR can move
    it, and the result file must land where the app will look for it.

.PARAMETER InstallDir
    Program files root, used to find services.ps1 for the failure path.

.EXAMPLE
    .\apply-update.ps1 -Installer "C:\ProgramData\XP POS\updates\XP-POS-Setup-1.2.0.exe" `
                       -ExpectedSha256 abc123... -Version 1.2.0

.NOTES
    ENCODING: UTF-8 WITH BOM, ASCII-only string literals - see services.ps1 for
    the measured reason. Windows PowerShell 5.1 reads a BOM-less .ps1 as CP1252
    and a UTF-8 em-dash inside a string silently terminates it.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Installer,
    [Parameter(Mandatory = $true)][string]$ExpectedSha256,
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$DataRoot = "$env:ProgramData\XP POS",
    [string]$InstallDir = "$env:ProgramFiles\XP POS"
)

$ErrorActionPreference = 'Stop'

$StartedAt   = (Get-Date).ToUniversalTime().ToString('o')
$UpdatesDir  = Join-Path $DataRoot 'updates'
$MarkerPath  = Join-Path $UpdatesDir 'install-in-progress.json'
$ResultPath  = Join-Path $UpdatesDir 'install-result.json'
$LogDir      = Join-Path $DataRoot 'logs\update'
$Stamp       = (Get-Date).ToString('yyyyMMdd-HHmmss')
$LogPath     = Join-Path $LogDir "apply-$Stamp.log"
$SetupLog    = Join-Path $LogDir "setup-$Stamp.log"

foreach ($dir in @($UpdatesDir, $LogDir)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}

function Write-Log {
    param([string]$Message)
    $line = "{0}  {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Host $line
    Add-Content -LiteralPath $LogPath -Value $line -Encoding UTF8
}

# Write UTF-8 with NO byte-order mark. Node's JSON.parse rejects a leading BOM,
# and the app is the only reader of this file. Set-Content -Encoding utf8 in
# PowerShell 5.1 writes one, so go through .NET instead.
function Write-JsonNoBom {
    param([string]$Path, $Object)
    $json = $Object | ConvertTo-Json -Depth 5
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Complete-Run {
    param(
        [string]$Outcome,
        [int]$ExitCode,
        [string]$Detail
    )
    Write-JsonNoBom -Path $ResultPath -Object ([pscustomobject]@{
        version    = $Version
        startedAt  = $StartedAt
        finishedAt = (Get-Date).ToUniversalTime().ToString('o')
        outcome    = $Outcome
        exitCode   = $ExitCode
        detail     = $Detail
        log        = $LogPath
    })
    # The marker only ever means "an install is running right now". Clearing it
    # here is what stops a finished install from looking interrupted forever.
    Remove-Item -LiteralPath $MarkerPath -Force -ErrorAction SilentlyContinue
    Write-Log "result: $Outcome (exit $ExitCode) - $Detail"
}

Write-Log "apply-update starting for version $Version"
Write-Log "installer: $Installer"

# ---- 1. Re-verify the payload ----------------------------------------------
# The agent verified this on download. It has been sitting on disk since, this
# process runs as LocalSystem, and the next step executes the file with full
# privileges. Re-hashing is cheap insurance against the file having been
# swapped in the meantime.
if (-not (Test-Path -LiteralPath $Installer)) {
    Complete-Run -Outcome 'failed' -ExitCode -1 -Detail "The downloaded installer is missing: $Installer"
    exit 1
}

$actual = (Get-FileHash -LiteralPath $Installer -Algorithm SHA256).Hash
if ($actual -ne $ExpectedSha256.ToUpperInvariant()) {
    # Do not run it, and do not leave it lying around to be run by hand later.
    Remove-Item -LiteralPath $Installer -Force -ErrorAction SilentlyContinue
    Complete-Run -Outcome 'failed' -ExitCode -1 -Detail `
        "CHECKSUM MISMATCH - refusing to run the installer. Expected $($ExpectedSha256.ToUpperInvariant()), got $actual. The file has been deleted."
    exit 1
}
Write-Log "sha256 verified: $actual"

# ---- 2. Record what Windows thinks of the signature -------------------------
# Not a gate at this point: the agent already refused an untrusted payload
# unless POS_UPDATE_ALLOW_UNSIGNED was deliberately turned on. Logging it means
# the log can always answer "was the thing we ran signed, and by whom".
try {
    $sig = Get-AuthenticodeSignature -LiteralPath $Installer
    $subject = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject } else { '(none)' }
    Write-Log "signature: $($sig.Status) / $subject"
    if ($sig.Status -ne 'Valid') {
        Write-Log "WARNING running an installer Windows does not report as Valid"
    }
} catch {
    Write-Log "signature check could not run: $($_.Exception.Message)"
}

# ---- 3. Run the installer ---------------------------------------------------
# /VERYSILENT       no wizard at all
# /SUPPRESSMSGBOXES answer the setup script's dialogs with their defaults; the
#                   provisioning-failure dialog would otherwise block forever
#                   on a box with nobody logged in
# /NORESTART        setup.iss never needs one, and a surprise reboot of a till
#                   is the worst possible way to finish an update
# /LOG              Inno's own install log, kept next to ours
Write-Log "running the installer (this stops the POS services)"

$exitCode = -1
try {
    $proc = Start-Process -FilePath $Installer -ArgumentList @(
        '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/LOG=`"$SetupLog`""
    ) -Wait -PassThru
    $exitCode = $proc.ExitCode
} catch {
    Complete-Run -Outcome 'failed' -ExitCode -1 -Detail "Could not start the installer: $($_.Exception.Message)"
    exit 1
}

Write-Log "installer exited with $exitCode"

# Inno's Setup.exe can hand off to a second process and return before the
# install has finished, in which case the exit code above is the FIRST stage's
# and means nothing. Wait for any surviving setup process before judging the
# result, or the checks below run against a half-finished install.
$stragglers = Get-Process -Name 'XP-POS-Setup*' -ErrorAction SilentlyContinue
if ($stragglers) {
    Write-Log "waiting for $($stragglers.Count) setup process(es) still running"
    try { $stragglers | Wait-Process -Timeout 1800 -ErrorAction Stop }
    catch { Write-Log "setup process did not exit within 30 minutes" }
}

<#
    Wait for the POS to actually come back.

    The exit code alone is not proof. Provisioning runs inside the installer and
    already waits for the POS to answer, but if the handoff above meant we read
    the wrong exit code, this is what catches it - and "the services are running
    again" is the thing the restaurant actually cares about. A success reported
    here that leaves a dead till is worse than an honest failure.
#>
function Wait-ForServices {
    param([int]$TimeoutSeconds = 300)
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $running = @('XPPOS-MongoDB', 'XPPOS-App', 'XPPOS-Caddy') | ForEach-Object {
            $s = Get-Service -Name $_ -ErrorAction SilentlyContinue
            if ($s -and $s.Status -eq 'Running') { $_ }
        }
        if ($running.Count -eq 3) { return $true }
        Start-Sleep -Seconds 5
    }
    return $false
}

# ---- 4. Failure path: put the site back on the previous version -------------
# An aborted install has already stopped the services. Leaving them stopped
# turns "the update failed" into "the restaurant has no POS", which is a far
# worse outcome than the update simply not happening.
if ($exitCode -ne 0) {
    $services = Join-Path $InstallDir 'scripts\services.ps1'
    $recovery = ''
    if (Test-Path -LiteralPath $services) {
        Write-Log "install failed - restarting the services on the previous version"
        try {
            & $services -Action Start -InstallDir $InstallDir | Out-Null
            $recovery = ' The previous version has been restarted.'
        } catch {
            $recovery = " The services could NOT be restarted automatically: $($_.Exception.Message)"
        }
    } else {
        $recovery = " services.ps1 was not found at $services - start the XPPOS services by hand."
    }

    Complete-Run -Outcome 'failed' -ExitCode $exitCode -Detail `
        ("The installer failed (exit $exitCode). Setup log: $SetupLog." + $recovery)
    exit $exitCode
}

# ---- 5. The installer reported success. Confirm the POS is actually back. ---
if (Wait-ForServices) {
    Complete-Run -Outcome 'success' -ExitCode 0 -Detail "Updated to $Version. Setup log: $SetupLog"
    exit 0
}

# Installed, but not serving. Report it as a failure rather than as a success,
# and make one attempt to bring the site up before giving up: an update that
# silently leaves a restaurant with no till is the worst outcome available.
Write-Log "the services did not all come back within 5 minutes - attempting to start them"
$services = Join-Path $InstallDir 'scripts\services.ps1'
$recovery = ''
if (Test-Path -LiteralPath $services) {
    try {
        & $services -Action Start -InstallDir $InstallDir | Out-Null
        $recovery = if (Wait-ForServices -TimeoutSeconds 120) {
            ' They started on a second attempt and the POS is serving.'
        } else {
            ' They are STILL not running. The site has no POS - attend to this now.'
        }
    } catch {
        $recovery = " They could not be started: $($_.Exception.Message)"
    }
} else {
    $recovery = " services.ps1 was not found at $services."
}

Complete-Run -Outcome 'failed' -ExitCode 0 -Detail `
    ("The installer reported success but the POS services did not come back." + $recovery +
     " Setup log: $SetupLog")
exit 1
