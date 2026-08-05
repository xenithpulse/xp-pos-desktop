<#
.SYNOPSIS
    Provision the XP POS appliance on a client box: configuration, database,
    services, firewall.

.DESCRIPTION
    Runs after the installer has laid down program files. Safe to re-run - a
    second run is the supported upgrade path and will not touch existing data,
    secrets, or the operator's port choice.

    Order matters here and is not arbitrary:

      1.  Create the ProgramData tree (data, uploads, logs).
      2.  Bootstrap .env on first run, generating a UNIQUE secret per site.
      3.  Pick a host port Windows has not reserved.
      4.  Generate caddy.env with RESOLVED values (see the warning below).
      5.  Select and validate the Caddyfile, asserting the listen address.
      6.  Add Defender exclusions.
      7.  Register the three services.
      8.  Start MongoDB, initiate the replica set, THEN start the app.
          The app cannot run transactions against a mongod that is not yet a
          replica set primary, so this ordering is load-bearing.
      9.  Open the firewall.
     10.  Wait for the POS to answer, then print the URL for staff.

.PARAMETER InstallDir
    Program files root. Default: C:\Program Files\XP POS

.PARAMETER Port
    Override the host port (default: POS_HTTP_PORT from .env, else 8080).

.PARAMETER StartMenuDir
    Start menu program group to put the "XP POS" shortcut in. Passed by
    setup.iss as {group} so the installer and this script cannot disagree about
    where it went. Empty means "do not create one".

.PARAMETER DesktopShortcut
    Also put the shortcut on the all-users desktop. Set by setup.iss when the
    operator ticked the desktop task.

.EXAMPLE
    .\provision.ps1
    .\provision.ps1 -Port 9090

.NOTES
    ENCODING: UTF-8 WITH BOM, ASCII-only string literals. Windows PowerShell
    5.1 reads a BOM-less .ps1 as CP1252, and a UTF-8 em-dash then decodes to a
    byte that PowerShell treats as a smart quote - which silently terminates
    whatever string it lands in. See services.ps1 for the measured example.
#>
[CmdletBinding()]
param(
    [string]$InstallDir = "$env:ProgramFiles\XP POS",
    [int]$Port,
    [string]$StartMenuDir,
    [switch]$DesktopShortcut
)

$ErrorActionPreference = 'Stop'

function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "    OK   $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "    WARN $m" -ForegroundColor Yellow }
function Write-Err  { param($m) Write-Host "    FAIL $m" -ForegroundColor Red }

<#
    Run a native executable and return its stdout, WITHOUT letting its stderr
    abort the script.

    Windows PowerShell 5.1 wraps every stderr line from a native .exe in a
    NativeCommandError record. Under $ErrorActionPreference = 'Stop' that is
    TERMINATING, so a program which merely prints a warning kills the installer.
    caddy.exe does exactly this - it writes advisory "Unnecessary header_up"
    warnings to stderr while exiting 0 - and it aborted provisioning mid-run
    until this helper was introduced.

    Callers check $LASTEXITCODE themselves; stderr is returned separately so it
    can be shown in a diagnostic instead of crashing the run.
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
            # Get-Content -Raw returns $null for an EMPTY file, not ''. A caller
            # writing "$($r.StdErr.Trim())" then dies on a null reference, which
            # under 'Stop' is terminating - it took down a real install through
            # services.ps1. Coalesce here so no call site has to know.
            if ($null -eq $out) { $out = '' }
            if ($null -eq $err) { $err = '' }
            return [pscustomobject]@{
                ExitCode = $LASTEXITCODE
                StdOut   = $out
                StdErr   = $err
            }
        } finally {
            Remove-Item $errFile -Force -ErrorAction SilentlyContinue
        }
    } finally {
        $ErrorActionPreference = $prev
    }
}

$DataRoot   = Join-Path $env:ProgramData 'XP POS'
$EnvPath    = Join-Path $DataRoot '.env'
$CaddyEnv   = Join-Path $DataRoot 'caddy.env'
$CaddyFile  = Join-Path $DataRoot 'Caddyfile'
$MongoCfg   = Join-Path $DataRoot 'mongod.cfg'
$ConfigDir  = Join-Path $InstallDir 'config'
$ScriptDir  = Join-Path $InstallDir 'scripts'
$NodeExe    = Join-Path $InstallDir 'node\node.exe'
$CaddyExe   = Join-Path $InstallDir 'caddy\caddy.exe'
$AppModules = Join-Path $InstallDir 'app\node_modules'

<#
    Record this run to a file BEFORE anything else can fail.

    WHY. Provisioning is the step most likely to fail on a client site - it is
    the one that touches ports, services, the database and the firewall - and
    until this existed its output went to a console window that Inno Setup
    closes on the way out. The installer then said "the configuration step
    failed (exit code 1). Logs: C:\ProgramData\XP POS\logs", and that directory
    contained the three SERVICE logs and nothing whatever about provisioning.
    The one message that said what actually went wrong was the one nobody could
    read.

    Appended, not overwritten: the interesting case is a technician re-running
    this two or three times, and the first failure is usually the real one.

    Best effort. Some hosts do not support transcription, and provisioning a
    restaurant's POS must not be blocked by not being able to write a log about
    provisioning a restaurant's POS.
#>
$LogDir = Join-Path $DataRoot 'logs'
$ProvisionLog = Join-Path $LogDir 'provision.log'
$script:TranscriptOn = $false
try {
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Force -Path $LogDir | Out-Null }
    Start-Transcript -Path $ProvisionLog -Append -ErrorAction Stop | Out-Null
    $script:TranscriptOn = $true
} catch {
    Write-Host "    WARN Could not start the provisioning log: $($_.Exception.Message)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  XP POS - appliance provisioning" -ForegroundColor White
Write-Host "  program : $InstallDir" -ForegroundColor DarkGray
Write-Host "  data    : $DataRoot" -ForegroundColor DarkGray
Write-Host "  log     : $ProvisionLog" -ForegroundColor DarkGray
Write-Host "  started : $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray

# ── Elevation ────────────────────────────────────────────────────────────────
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Err "This script must run as Administrator."
    exit 1
}

# ── Encoding helpers (lifted from the Docker deploy script) ──────────────────

# Write UTF-8 with NO byte-order mark. A BOM would become part of the first
# variable's NAME for most .env parsers, so that variable silently never
# applies -- an evil bug to chase on a client site. (Node's --env-file happens
# to tolerate a BOM, but the thermal-service backup app and any technician
# running a one-off script do not, so keep the file clean for everyone.)
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

function New-RandomSecret {
    param([int]$ByteCount = 24)
    $bytes = New-Object byte[] $ByteCount
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try   { $rng.GetBytes($bytes) }
    finally { $rng.Dispose() }
    return (($bytes | ForEach-Object { $_.ToString('x2') }) -join '')
}

function ConvertFrom-EnvFile {
    param([string]$Path)
    $map = @{}
    foreach ($line in ((Read-TextUtf8 $Path) -split "`r?`n")) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $idx = $trimmed.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key = $trimmed.Substring(0, $idx).Trim()
        $val = $trimmed.Substring($idx + 1).Trim().Trim('"').Trim("'")
        # Strip trailing inline comments but keep '#' inside a quoted value,
        # which we have already unwrapped above.
        if ($val -match '\s+#') { $val = ($val -split '\s+#')[0].Trim() }
        $map[$key] = $val
    }
    return $map
}

# ── 1. ProgramData tree ──────────────────────────────────────────────────────
Write-Step "Preparing the data directory"

# 'updates' holds the update agent's state, any downloaded installer, and the
# install marker that lets the next boot tell "an update was interrupted" apart
# from "an update finished". It is under ProgramData for the usual reason: an
# upgrade replaces Program Files wholesale, so a marker written there would be
# deleted by the very upgrade it exists to survive.
foreach ($sub in @('', 'mongo', 'uploads', 'updates', 'logs', 'logs\mongodb', 'logs\app', 'logs\caddy', 'logs\update', 'caddy\data', 'caddy\config')) {
    $dir = if ($sub) { Join-Path $DataRoot $sub } else { $DataRoot }
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
}
Write-Ok "$DataRoot is ready"

<#
    Trial marker.

    WHY IT IS HERE AND NOT IN setup.iss. Inno Setup would delete a registry key
    it created when the product is uninstalled, and that is exactly what must
    NOT happen: uninstall/reinstall would then hand out a fresh 30-day trial for
    the price of two minutes. Writing it from provisioning means the uninstaller
    never learns the key exists, so it survives.

    It is one of THREE places the trial start is kept - the others are
    license-state.json in the data root and the first admin account's createdAt
    in the database. The app takes the OLDEST of the three, so this is a
    backstop against someone deleting ProgramData, not the source of truth.

    Written only when absent. On an upgrade of a box that has been in service
    for a year, overwriting this with today's date would restart its trial.
#>
$TrialKey = 'HKLM:\SOFTWARE\XenithPulse\XP POS'
try {
    if (-not (Test-Path $TrialKey)) { New-Item -Path $TrialKey -Force | Out-Null }
    $existing = (Get-ItemProperty -Path $TrialKey -Name 'TrialStartedAt' -ErrorAction SilentlyContinue).TrialStartedAt
    if (-not $existing) {
        $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        New-ItemProperty -Path $TrialKey -Name 'TrialStartedAt' -Value $stamp -PropertyType String -Force | Out-Null
        Write-Ok "Trial marker written (first install)"
    } else {
        Write-Ok "Trial marker already present (left untouched)"
    }
} catch {
    # A managed box can have HKLM locked down by group policy. Not fatal: the
    # data root and the database still carry the trial start.
    Write-Warn "Could not write the trial marker: $($_.Exception.Message)"
}

# The licence itself lives at $DataRoot\license.dat and is NEVER written or
# removed here. Provisioning is re-run on every upgrade, and a paid licence
# disappearing during an upgrade would be the worst bug this product could have.

# ── 2. .env bootstrap ────────────────────────────────────────────────────────
Write-Step "Checking configuration"

<#
    Add settings that exist in the template but not yet in this site's .env.

    WHY THIS EXISTS. An existing .env is never overwritten - that rule protects
    the per-site secret, the operator's port choice and any hand-tuning, and it
    is not negotiable. But it also means a site that installed before a setting
    existed NEVER receives it, no matter how many upgrades it takes. Every new
    configurable in a future release would silently be absent on exactly the
    boxes that have been in service longest.

    So: existing keys are never touched, including ones deliberately left blank
    (a blank value is still a key, so it is not "missing" and is not re-added).
    Only genuinely absent keys are appended, with their template default, and a
    __GENERATE__ default gets its own fresh secret exactly as on a first run.

    Values are appended without their surrounding template comments. The comment
    block belongs to the documentation; duplicating pages of it into a live
    config on every upgrade would bury the settings an operator actually edits.
#>
function Add-MissingEnvKeys {
    param([string]$EnvFile, [string]$TemplateFile)

    $existing = ConvertFrom-EnvFile $EnvFile
    $assignment = [regex]'(?m)^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$'

    $additions = @()
    foreach ($m in $assignment.Matches((Read-TextUtf8 $TemplateFile))) {
        $key = $m.Groups[1].Value
        if ($existing.ContainsKey($key)) { continue }
        $value = $m.Groups[2].Value.Trim()
        # Drop a trailing inline comment, the same rule ConvertFrom-EnvFile
        # applies when reading, so the appended line means what the template
        # meant rather than carrying prose into a live value.
        if ($value -match '\s+#') { $value = ($value -split '\s+#')[0].Trim() }
        if ($value -eq '__GENERATE__') { $value = New-RandomSecret }
        $additions += "$key=$value"
    }

    if ($additions.Count -eq 0) { return 0 }

    $text = (Read-TextUtf8 $EnvFile).TrimEnd()
    $stamp = (Get-Date -Format 'yyyy-MM-dd')
    $block = @(
        '',
        '',
        "# ---- Added by an upgrade on $stamp ----",
        '# New settings from this release, at their default values. See',
        '# config\env.template in the install directory for what each one does.'
    ) + $additions + ''
    Write-TextNoBom -Path $EnvFile -Text ($text + "`n" + ($block -join "`n"))
    return $additions.Count
}

$Template = Join-Path $ConfigDir 'env.template'
if (Test-Path $EnvPath) {
    Write-Ok ".env already exists (existing values left untouched)"
    if (Test-Path $Template) {
        $added = Add-MissingEnvKeys -EnvFile $EnvPath -TemplateFile $Template
        if ($added -gt 0) {
            Write-Ok "Added $added new setting(s) introduced since this site was installed"
        }
    }
} else {
    if (-not (Test-Path $Template)) {
        Write-Err "Configuration template missing: $Template"
        Write-Host "         The install is incomplete - reinstall the POS." -ForegroundColor DarkGray
        exit 1
    }
    $content = Read-TextUtf8 $Template

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
    Write-Ok "Created .env ($generated secrets generated)"
    Write-Warn "This box now has unique credentials. Back up .env - losing it"
    Write-Host "         invalidates every existing login session." -ForegroundColor DarkGray
}

<#
    Force ENABLE_SETUP_ENDPOINTS off. The ONE exception to "never touch an
    existing value", and it is deliberate.

    /api/injections/* resets order status, wipes and re-seeds menu data, and
    creates admin accounts. Those endpoints have no authentication of their own
    - this flag is the authentication - and they sit on a box every phone and
    tablet in the restaurant can reach.

    The template used to ship this as TRUE, because seeding the first admin
    through it was the only way to get an account onto a fresh install. Every
    site provisioned under that template therefore has it on, permanently, since
    the merge above only ADDS absent keys and would never correct it.

    It is no longer needed for anything a customer does: the first person to
    open the POS creates the owner account at /setup. So this closes it on every
    box that runs an upgrade, and says so rather than doing it quietly.
#>
if (Test-Path $EnvPath) {
    $envText = Read-TextUtf8 $EnvPath
    if ($envText -match '(?m)^\s*ENABLE_SETUP_ENDPOINTS\s*=\s*true\s*$') {
        $envText = [regex]::Replace($envText,
            '(?m)^\s*ENABLE_SETUP_ENDPOINTS\s*=\s*true\s*$', 'ENABLE_SETUP_ENDPOINTS=false')
        Write-TextNoBom -Path $EnvPath -Text $envText
        Write-Warn "ENABLE_SETUP_ENDPOINTS was ON - turned OFF."
        Write-Host "         Those endpoints can wipe menu data and create admin accounts," -ForegroundColor DarkGray
        Write-Host "         and anything on the LAN could reach them. Owner accounts are" -ForegroundColor DarkGray
        Write-Host "         now created at /setup instead, so nothing needs this on." -ForegroundColor DarkGray
    }
}

$EnvVars = ConvertFrom-EnvFile $EnvPath

# ── 3. Port selection ────────────────────────────────────────────────────────
Write-Step "Selecting the host port"

if (-not $Port) {
    if ($EnvVars.ContainsKey('POS_HTTP_PORT') -and $EnvVars['POS_HTTP_PORT']) {
        $Port = [int]$EnvVars['POS_HTTP_PORT']
    } else {
        $Port = 8080
    }
}

# Windows (Hyper-V / WinNAT / WSL) reserves TCP ranges. Binding inside one fails
# with "access to a socket in a way forbidden by its access permissions", the
# service dies instantly, and NOTHING ends up listening -- exactly the
# "connection refused with no listener" symptom this check exists to prevent.
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

function Test-PortUsable {
    param([int]$Candidate, $Reserved)
    foreach ($r in $Reserved) {
        if ($Candidate -ge $r.Start -and $Candidate -le $r.End) { return $false }
    }
    # On a RE-RUN our own Caddy already holds the port. That is not a conflict:
    # treating it as one would migrate a working site to a new port and change
    # the URL staff have bookmarked on every upgrade.
    #
    # The [int] cast is guarded: on a first run POS_HTTP_PORT can be absent or
    # blank, and [int]'' throws, which under ErrorActionPreference='Stop' would
    # abort provisioning at the port check.
    $ours = Get-Service -Name 'XPPOS-Caddy' -ErrorAction SilentlyContinue
    $configured = 0
    if ($EnvVars['POS_HTTP_PORT']) { [void][int]::TryParse($EnvVars['POS_HTTP_PORT'], [ref]$configured) }
    if ($ours -and $ours.Status -eq 'Running' -and $configured -eq $Candidate) {
        return $true
    }
    try {
        if (Get-NetTCPConnection -State Listen -LocalPort $Candidate -ErrorAction Stop) { return $false }
    } catch {
        # No listener found -- that is the good case.
    }
    return $true
}

$reserved = Get-ReservedPortRanges
if (-not (Test-PortUsable -Candidate $Port -Reserved $reserved)) {
    Write-Warn "Port $Port is reserved by Windows or already in use."
    $picked = $null
    foreach ($candidate in @(8080, 8090, 8081, 9080, 9090, 8888, 18080)) {
        if (Test-PortUsable -Candidate $candidate -Reserved $reserved) { $picked = $candidate; break }
    }
    if (-not $picked) {
        Write-Err "Could not find a free port. Pass one explicitly: -Port <n>"
        exit 1
    }
    $Port = $picked
    Write-Ok "Switched to port $Port"
} else {
    Write-Ok "Port $Port is available"
}

# Persist the choice so later runs and the services agree on it.
$envText = Read-TextUtf8 $EnvPath
if ($envText -match '(?m)^\s*POS_HTTP_PORT\s*=.*$') {
    $envText = [regex]::Replace($envText, '(?m)^\s*POS_HTTP_PORT\s*=.*$', "POS_HTTP_PORT=$Port")
} else {
    $envText = $envText.TrimEnd() + "`nPOS_HTTP_PORT=$Port`n"
}
Write-TextNoBom -Path $EnvPath -Text $envText
$EnvVars = ConvertFrom-EnvFile $EnvPath

# ── 4. caddy.env ─────────────────────────────────────────────────────────────
Write-Step "Generating the proxy environment"

# ── WHY THIS FILE EXISTS - DO NOT REPLACE IT WITH .env ──────────────────────
# Caddy substitutes a {$VAR:default} default ONLY when the variable is UNSET. A
# set-but-EMPTY value wins. Two settings in .env are documented as "leave blank
# for the default", so pointing Caddy at .env directly breaks both:
#
#   POS_ALLOWED_CIDRS=   ->  matcher collapses to `not remote_ip` with no
#                            ranges, which matches EVERY request and returns
#                            403 to the entire LAN.
#   POS_HTTP_PORT=       ->  site address becomes ":", which Caddy binds as
#                            :443. `caddy validate` reports this as VALID, so
#                            nothing catches it and the POS just disappears.
#
# Under Docker, compose resolved these before Caddy ever saw them
# (${POS_ALLOWED_CIDRS:-0.0.0.0/0 ::/0}). This file is the native equivalent of
# that layer. It is REGENERATED on every run - edit .env, never this.
$allowed = $EnvVars['POS_ALLOWED_CIDRS']
if ([string]::IsNullOrWhiteSpace($allowed)) {
    $allowed = '0.0.0.0/0 ::/0'
    $allowedNote = 'all LAN devices (POS_ALLOWED_CIDRS blank)'
} else {
    $allowedNote = $allowed
}

$httpsPort = if ($EnvVars['POS_HTTPS_PORT']) { $EnvVars['POS_HTTPS_PORT'] } else { '8443' }

$caddyEnvText = @(
    '# GENERATED FILE - DO NOT EDIT.',
    '# Regenerated by provision.ps1 on every install and upgrade.',
    '# Edit C:\ProgramData\XP POS\.env instead; the values here are resolved',
    '# from it so that a blank setting becomes a concrete default rather than',
    '# an empty string (which Caddy would treat as a real, and broken, value).',
    "POS_HTTP_PORT=$Port",
    "POS_HTTPS_PORT=$httpsPort",
    "POS_ALLOWED_CIDRS=$allowed",
    "APP_DOMAIN=$($EnvVars['APP_DOMAIN'])",
    "ACME_EMAIL=$($EnvVars['ACME_EMAIL'])",
    "CADDY_DNS_TOKEN=$($EnvVars['CADDY_DNS_TOKEN'])",
    ''
) -join "`n"
Write-TextNoBom -Path $CaddyEnv -Text $caddyEnvText
Write-Ok "caddy.env written (device access: $allowedNote)"

# ── 5. Caddyfile selection and validation ────────────────────────────────────
Write-Step "Configuring the proxy"

$useTls = -not [string]::IsNullOrWhiteSpace($EnvVars['APP_DOMAIN'])
$source = if ($useTls) { Join-Path $ConfigDir 'Caddyfile.tls' } else { Join-Path $ConfigDir 'Caddyfile.http' }
if (-not (Test-Path $source)) {
    Write-Err "Proxy template missing: $source"
    exit 1
}
Copy-Item $source $CaddyFile -Force
Write-Ok "Using $(Split-Path $source -Leaf)"

if ($useTls) {
    Write-Warn "APP_DOMAIN is set - this needs a caddy.exe with the DNS plugin"
    Write-Host "         compiled in. Stock caddy.exe cannot serve Caddyfile.tls." -ForegroundColor DarkGray
}

if (Test-Path $CaddyExe) {
    # `caddy validate` alone is NOT enough - it happily accepts an empty port
    # and silently yields :443 (see the caddy.env note above). Adapt the config
    # and assert the listen address we actually expect.
    $r = Invoke-Native -FilePath $CaddyExe -Arguments @(
        'adapt', '--config', $CaddyFile, '--adapter', 'caddyfile', '--envfile', $CaddyEnv
    )
    if ($r.ExitCode -ne 0 -or -not $r.StdOut) {
        Write-Err "The Caddy configuration is invalid. The POS would not be reachable."
        if ($r.StdErr) { Write-Host "         $($r.StdErr.Trim())" -ForegroundColor DarkGray }
        exit 1
    }
    $listeners = ([regex]::Matches($r.StdOut, '"listen":\[[^\]]*\]') | ForEach-Object { $_.Value }) -join ' '
    if ($r.StdOut -notmatch [regex]::Escape("`":$Port`"")) {
        Write-Err "Caddy would not listen on port $Port."
        Write-Host "         This usually means a blank value in caddy.env." -ForegroundColor DarkGray
        Write-Host "         Adapted listeners: $listeners" -ForegroundColor DarkGray
        exit 1
    }
    # An empty remote_ip matcher means `not (nothing)`, which matches every
    # request and 403s the whole LAN. The generator above is supposed to make
    # this impossible; assert it rather than trust it.
    if ($r.StdOut -match '"remote_ip"\s*:\s*\{\s*\}') {
        Write-Err "The device allow-list resolved to an EMPTY range."
        Write-Host "         Every device on the LAN would be blocked with a 403." -ForegroundColor DarkGray
        Write-Host "         Check POS_ALLOWED_CIDRS in $CaddyEnv" -ForegroundColor DarkGray
        exit 1
    }
    Write-Ok "Proxy configuration validated (listening on :$Port)"
} else {
    Write-Warn "caddy.exe not found at $CaddyExe - skipping validation"
}

# ── 6. mongod.cfg ────────────────────────────────────────────────────────────
# Copied only if absent: a technician may have tuned cacheSizeGB on this box and
# an upgrade must not silently revert that.
if (-not (Test-Path $MongoCfg)) {
    Copy-Item (Join-Path $ConfigDir 'mongod.cfg') $MongoCfg -Force
    Write-Ok "mongod.cfg installed"
} else {
    Write-Ok "mongod.cfg already present (left untouched)"
}

# ── 7. Defender exclusions ───────────────────────────────────────────────────
Write-Step "Adding Windows Defender exclusions"

# Real-time scanning of the WiredTiger data directory is a large, measurable
# throughput hit and can hold file handles open long enough to look like disk
# corruption to mongod. Best-effort: Defender may be disabled, replaced by
# another AV, or locked down by group policy on a managed box.
$exclusions = @(
    (Join-Path $DataRoot 'mongo'),
    (Join-Path $DataRoot 'uploads'),
    $InstallDir
)
try {
    foreach ($path in $exclusions) {
        Add-MpPreference -ExclusionPath $path -ErrorAction Stop
    }
    foreach ($proc in @($NodeExe, $CaddyExe, (Join-Path $InstallDir 'mongodb\bin\mongod.exe'))) {
        Add-MpPreference -ExclusionProcess $proc -ErrorAction Stop
    }
    Write-Ok "Defender exclusions added"
} catch {
    Write-Warn "Could not add Defender exclusions: $($_.Exception.Message)"
    Write-Host "         Not fatal. Expect slower database performance." -ForegroundColor DarkGray
}

# ── 8. Services, in dependency order ─────────────────────────────────────────
$Services = Join-Path $ScriptDir 'services.ps1'
if (-not (Test-Path $Services)) {
    Write-Err "services.ps1 missing: $Services"
    exit 1
}

& $Services -Action Register -InstallDir $InstallDir
if ($LASTEXITCODE -ne 0) { Write-Err "Service registration failed."; exit 1 }

# Database first, on its own. The replica set must exist before the app opens a
# connection, or the app's first transactions fail against a non-primary node.
& $Services -Action Start -Service 'XPPOS-MongoDB' -InstallDir $InstallDir
if ($LASTEXITCODE -ne 0) { Write-Err "The database service failed to start."; exit 1 }

Write-Step "Initialising the database replica set"
if (-not (Test-Path $NodeExe)) {
    Write-Err "Bundled node.exe missing: $NodeExe"
    exit 1
}
& $NodeExe (Join-Path $ScriptDir 'rs-init.mjs') $AppModules
if ($LASTEXITCODE -ne 0) {
    Write-Err "Replica set initialisation failed (exit $LASTEXITCODE)."
    Write-Host "         The POS cannot run without it - transactions require a replica set." -ForegroundColor DarkGray
    Write-Host "         Log: $DataRoot\logs\mongodb" -ForegroundColor DarkGray
    exit 1
}
Write-Ok "Replica set ready"

& $Services -Action Start -Service 'XPPOS-App' -InstallDir $InstallDir
if ($LASTEXITCODE -ne 0) { Write-Err "The application service failed to start."; exit 1 }
& $Services -Action Start -Service 'XPPOS-Caddy' -InstallDir $InstallDir
if ($LASTEXITCODE -ne 0) { Write-Err "The proxy service failed to start."; exit 1 }

# ── 9. Firewall ──────────────────────────────────────────────────────────────
Write-Step "Configuring Windows Firewall"

$ruleName = "XP POS (TCP $Port)"
$existing = $null
try { $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction Stop } catch { }
if ($existing) {
    Write-Ok "Firewall rule already present"
} else {
    # Remove rules from a previous port so re-running on a new port does not
    # leave the old hole open.
    Get-NetFirewallRule -DisplayName 'XP POS (TCP *' -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -ne $ruleName } |
        Remove-NetFirewallRule -ErrorAction SilentlyContinue
    New-NetFirewallRule -DisplayName $ruleName -Direction Inbound `
        -Protocol TCP -LocalPort $Port -Action Allow -Profile Any | Out-Null
    Write-Ok "Added inbound rule for TCP $Port"
}

# mDNS, so http://xppos.local:PORT resolves on the LAN.
#
# The POS is reached by IP, and the router hands that IP out by DHCP - so a
# power cut or a router swap can move it, and every tablet with the old address
# bookmarked stops working with a timeout that explains nothing. A NAME does not
# move. The app answers mDNS queries for xppos.local with its current address
# (see lib/net/mdns.ts); this rule is what lets those queries arrive.
#
# 5353/UDP is multicast to 224.0.0.251, which is not routable off the subnet, so
# this opens nothing to the internet. Failure is not fatal: the numeric address
# still works, and it is the one on the connection card.
$mdnsRule = 'XP POS (mDNS UDP 5353)'
try {
    $existingMdns = $null
    try { $existingMdns = Get-NetFirewallRule -DisplayName $mdnsRule -ErrorAction Stop } catch { }
    if ($existingMdns) {
        Write-Ok "mDNS firewall rule already present"
    } else {
        New-NetFirewallRule -DisplayName $mdnsRule -Direction Inbound `
            -Protocol UDP -LocalPort 5353 -Action Allow -Profile Any | Out-Null
        Write-Ok "Added inbound rule for UDP 5353 (xppos.local)"
    }
} catch {
    Write-Warn "Could not add the mDNS rule: $($_.Exception.Message)"
    Write-Host "         xppos.local may not resolve. The numeric address still works." -ForegroundColor DarkGray
}

# A "Public" profile blocks LAN discovery even with the rule in place on some
# setups, and is the single most common cause of "works locally, unreachable
# from the tablet".
$publicNets = Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' }
if ($publicNets) {
    Write-Warn "These networks are set to 'Public':"
    foreach ($n in $publicNets) { Write-Host "           - $($n.Name)" -ForegroundColor DarkGray }
    Write-Host "         Consider: Set-NetConnectionProfile -Name '<name>' -NetworkCategory Private" -ForegroundColor DarkGray
}

# ── 10. Wait, then report ────────────────────────────────────────────────────
Write-Step "Waiting for the POS to respond"

$ready = $false
$httpStatus = $null
for ($i = 1; $i -le 60; $i++) {
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 5
        if ($resp.StatusCode -eq 200) { $ready = $true; break }
    } catch {
        # An HTTP error response means the proxy IS up and deliberately
        # refusing us -- retrying will not change that, so stop and report.
        $r = $_.Exception.Response
        if ($r -and $r.StatusCode) { $httpStatus = [int]$r.StatusCode; break }
        Start-Sleep -Seconds 5
    }
}

if (-not $ready) {
    if ($httpStatus -eq 403) {
        Write-Err "Caddy answered 403 - device access control is blocking this request."
        Write-Host "         POS_ALLOWED_CIDRS in .env does not cover this machine." -ForegroundColor DarkGray
    } elseif ($httpStatus) {
        Write-Err "The POS answered HTTP $httpStatus on port $Port (expected 200)."
    } else {
        Write-Err "The POS did not answer on port $Port within ~5 minutes."
    }
    Write-Host "         Logs: $DataRoot\logs" -ForegroundColor DarkGray
    Write-Host "         Status: `"$Services`" -Action Status" -ForegroundColor DarkGray
    exit 1
}
Write-Ok "POS responded on 127.0.0.1:$Port"

# The LAN address is the one on an adapter that owns a default route, which
# excludes virtual adapters (they have no gateway). Ordered by interface metric
# so Windows' own preferred interface is listed first.
$lanIps = @()
$configs = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' }
$ranked = $configs | Sort-Object -Property @{ Expression = {
    try { (Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction Stop).InterfaceMetric }
    catch { 9999 }
} }
foreach ($c in $ranked) {
    foreach ($addr in $c.IPv4Address) {
        if ($addr.IPAddress -notmatch '^(127\.|169\.254\.)') { $lanIps += $addr.IPAddress }
    }
}

# ── 11. The way in: shortcut and connection card ─────────────────────────────
#
# Both artefacts carry an ADDRESS, and the address moves - the port is chosen
# here, and the IP comes from the router by DHCP. connect-card.ps1 is therefore
# a separate script called from two places: here at install time, and from
# watchdog.ps1 whenever it notices the machine's address has changed. One
# implementation is what stops the printed card and the shortcut disagreeing.
Write-Step "Writing the connection card and shortcuts"

$ConnectCard = Join-Path $ScriptDir 'connect-card.ps1'
if (Test-Path $ConnectCard) {
    $cardArgs = @{
        InstallDir = $InstallDir
        DataRoot   = $DataRoot
        Port       = $Port
    }
    if ($StartMenuDir) { $cardArgs['StartMenuDir'] = $StartMenuDir }
    if ($DesktopShortcut) { $cardArgs['DesktopShortcut'] = $true }
    # Not allowed to fail the install: a missing shortcut is a nuisance,
    # aborting here would discard a POS that is already running.
    try { & $ConnectCard @cardArgs }
    catch { Write-Warn "Could not write the connection card: $($_.Exception.Message)" }
} else {
    Write-Warn "connect-card.ps1 is missing - no connection card was written."
}
& $Services -Action Status -InstallDir $InstallDir

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   XP POS IS RUNNING" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   On this computer (never changes):" -ForegroundColor White
Write-Host "      http://pos.xenithpulse.local:$Port" -ForegroundColor Cyan
Write-Host "      Also on the desktop as the 'XP POS' icon." -ForegroundColor DarkGray
Write-Host ""
if ($lanIps.Count -gt 0) {
    Write-Host "   Phones and tablets:" -ForegroundColor White
    foreach ($ip in $lanIps) { Write-Host "      http://${ip}:$Port" -ForegroundColor Cyan }
    Write-Host "      Easier: Server Management -> Connect Devices, scan the QR code." -ForegroundColor DarkGray
    Write-Host "      Use this numeric address on other floors - the .local name" -ForegroundColor DarkGray
    Write-Host "      above does not cross a router." -ForegroundColor DarkGray
} else {
    Write-Warn "No LAN IP detected - is this box on the network?"
}
Write-Host ""
Write-Host "   Fallback on this box:  http://127.0.0.1:$Port" -ForegroundColor DarkGray
Write-Host ""

# NOTE: the old "ENABLE_SETUP_ENDPOINTS is open" warning that used to sit here
# is gone because it can no longer fire - step 2 turns the flag off before
# $EnvVars is read.

Write-Host "   Sign in with:  admin / admin" -ForegroundColor White
Write-Host "   The POS is preloaded with a sample menu and floor plan." -ForegroundColor DarkGray
Write-Host "   Removing that sample data is what sets a real password -" -ForegroundColor DarkGray
Write-Host "   Server Management -> Sample Data. Do it before real trade." -ForegroundColor DarkGray
Write-Host ""

Write-Host "   IMPORTANT - verify unattended start before leaving site:" -ForegroundColor Yellow
Write-Host "     1. Reboot this box." -ForegroundColor DarkGray
Write-Host "     2. Do NOT log in. Leave it at the login screen." -ForegroundColor DarkGray
Write-Host "     3. From a staff device, open the URL above." -ForegroundColor DarkGray
Write-Host "   That is what proves the POS survives a power cut." -ForegroundColor DarkGray
Write-Host ""
Write-Host "   Config:  $EnvPath" -ForegroundColor DarkGray
Write-Host "   Logs:    $DataRoot\logs" -ForegroundColor DarkGray
Write-Host "   Status:  `"$Services`" -Action Status" -ForegroundColor DarkGray
Write-Host ""

# Only the success path reaches here. The failure paths call exit directly and
# do NOT stop the transcript - deliberately: this script runs as its own
# powershell.exe, the transcript is written progressively rather than buffered,
# and the process ending flushes it. A failed run therefore still leaves a
# complete provision.log, which is the entire point of having one.
if ($script:TranscriptOn) { try { Stop-Transcript | Out-Null } catch { } }
