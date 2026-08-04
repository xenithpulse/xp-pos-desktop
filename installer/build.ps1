<#
.SYNOPSIS
    Build the XP POS installer payload. DEVELOPER MACHINE ONLY.

.DESCRIPTION
    Produces a self-contained payload tree that the Inno Setup script packages
    into a single .exe. Nothing here ever runs on a client box - that is the
    point of the migration. The old deploy ran `next build` on the client's
    machine, which is what made installs slow, RAM-hungry, and dependent on
    internet access.

    Steps:
      1. Verify prerequisites (node, npm) on THIS machine.
      2. Fetch and sha256-verify every pinned runtime from deps.json.
      3. next build (from a clean .next - see the note in Step 4).
      4. Stage app/, node/, mongodb/, caddy/, service/, scripts/, config/.
      5. Post-stage safety checks that fail the build rather than ship a
         broken or leaky payload.

.PARAMETER UpdateHashes
    Download each dependency and WRITE its sha256 back into deps.json. Use this
    only when deliberately changing a pinned version, and commit the result.

.PARAMETER SkipBuild
    Reuse the existing .next output. Faster when iterating on packaging only.
    Never use for a release build.

.PARAMETER NoMongosh
    Omit the mongosh shell from the payload.

    mongosh is by far the most expensive thing in the installer: 109 MB for the
    exe plus 26 MB for mongosh_crypt_v1.dll, about 135 MB of a 438 MB payload -
    31% of the download - for a tool nothing in the install actually uses.
    rs.initiate runs through the bundled node.exe and the driver already inside
    the app bundle (scripts/rs-init.mjs), and backups use mongodump.exe.

    It is included by default because an offline appliance is exactly where a
    technician cannot just download a shell when a site has a data problem at
    9pm on a Saturday. Drop it if installer size matters more than that.

.PARAMETER StageOnly
    Stop after staging installer\payload and do NOT compile the installer.
    Only useful when iterating on the payload contents; a normal run produces
    the .exe.

.PARAMETER Package
    Deprecated no-op. Packaging is the default now. Accepted so existing
    commands and notes keep working.

.PARAMETER SignThumbprint
    SHA-1 thumbprint of a code-signing certificate in the Windows certificate
    store. When supplied, the three service wrappers AND the finished installer
    are Authenticode-signed.

    A thumbprint is used rather than a .pfx path on purpose: since June 2023,
    publicly-trusted code-signing keys must live on a hardware token, HSM, or
    cloud signing service, none of which hand you a file. Reading the cert from
    the store is the form that works with all of them.

    Find yours with:
        Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert |
            Select-Object Thumbprint, Subject, NotAfter

    Omit it and the build still works - it just prints the NOT CODE-SIGNED
    warning, which is what developer builds should do.

.PARAMETER TimestampUrl
    RFC 3161 timestamp server. Defaults to DigiCert's.

    Timestamping is NOT optional for a release. Without it every signature -
    including on installers already sitting on customer machines - becomes
    invalid the day the certificate expires.

.PARAMETER IsccPath
    Path to Inno Setup's ISCC.exe. Searched in the usual install locations when
    not given.

.PARAMETER OutDir
    Payload staging directory. Default: installer\payload

.EXAMPLE
    .\installer\build.ps1
    .\installer\build.ps1 -UpdateHashes
    .\installer\build.ps1 -SkipBuild

.NOTES
    ENCODING: UTF-8 WITH BOM, ASCII-only string literals - see services.ps1.
#>
[CmdletBinding()]
param(
    [switch]$UpdateHashes,
    [switch]$SkipBuild,
    [switch]$NoMongosh,
    [switch]$StageOnly,
    # Deprecated: packaging is the default. Kept so older commands still work.
    [switch]$Package,
    [string]$SignThumbprint,
    [string]$TimestampUrl = 'http://timestamp.digicert.com',
    [string]$IsccPath,
    [string]$OutDir
)

$ErrorActionPreference = 'Stop'

function Write-Step { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }
function Write-Ok   { param($m) Write-Host "    OK   $m" -ForegroundColor Green }
function Write-Warn { param($m) Write-Host "    WARN $m" -ForegroundColor Yellow }
function Write-Err  { param($m) Write-Host "    FAIL $m" -ForegroundColor Red }

# See services.ps1 for why every native call is funnelled through this: PS 5.1
# turns a native program's stderr into a TERMINATING error under
# ErrorActionPreference='Stop', even when the program exits 0.
function Invoke-Native {
    param([Parameter(Mandatory = $true)][string]$FilePath, [string[]]$Arguments = @())
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $errFile = [System.IO.Path]::GetTempFileName()
        try {
            $out = & $FilePath @Arguments 2>$errFile | Out-String
            $err = if (Test-Path $errFile) { Get-Content $errFile -Raw } else { '' }
            return [pscustomobject]@{ ExitCode = $LASTEXITCODE; StdOut = $out; StdErr = $err }
        } finally { Remove-Item $errFile -Force -ErrorAction SilentlyContinue }
    } finally { $ErrorActionPreference = $prev }
}

$InstallerDir = $PSScriptRoot
$RepoRoot     = Split-Path -Parent $InstallerDir
$DepsFile     = Join-Path $InstallerDir 'deps.json'
$CacheDir     = Join-Path $InstallerDir '.depcache'
if (-not $OutDir) { $OutDir = Join-Path $InstallerDir 'payload' }

Write-Host ""
Write-Host "  XP POS - installer payload build" -ForegroundColor White
Write-Host "  repo    : $RepoRoot" -ForegroundColor DarkGray
Write-Host "  payload : $OutDir" -ForegroundColor DarkGray

# ── 1. Prerequisites ─────────────────────────────────────────────────────────
Write-Step "Checking build prerequisites"

foreach ($tool in @('node', 'npm')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Err "$tool is not installed or not on PATH."
        exit 1
    }
}
$buildNode = (& node --version).Trim()
Write-Ok "build machine node $buildNode"

if (-not (Test-Path (Join-Path $RepoRoot 'node_modules'))) {
    Write-Err "node_modules is missing. Run 'npm ci' first."
    exit 1
}

# ── 2. Dependencies ──────────────────────────────────────────────────────────
Write-Step "Fetching pinned runtimes"

New-Item -ItemType Directory -Force $CacheDir | Out-Null
$deps = Get-Content $DepsFile -Raw | ConvertFrom-Json

function Get-Dependency {
    param([string]$Name, $Dep)

    $fileName = Split-Path $Dep.url -Leaf
    $cached   = Join-Path $CacheDir $fileName

    if (-not (Test-Path $cached)) {
        Write-Host "    .... downloading $Name $($Dep.version)" -ForegroundColor DarkGray
        Invoke-WebRequest -Uri $Dep.url -OutFile $cached -UseBasicParsing -TimeoutSec 1800
    }

    $actual = (Get-FileHash $cached -Algorithm SHA256).Hash.ToUpperInvariant()
    $wanted = if ($Dep.sha256) { $Dep.sha256.ToUpperInvariant() } else { '' }

    if ($UpdateHashes) {
        $Dep.sha256 = $actual
        Write-Ok "$Name $($Dep.version) -> $actual"
    } elseif (-not $wanted) {
        Write-Err "$Name has no pinned sha256 in deps.json."
        Write-Host "         Run: .\installer\build.ps1 -UpdateHashes" -ForegroundColor DarkGray
        exit 1
    } elseif ($actual -ne $wanted) {
        # A mismatch means the upstream artifact changed under a version we
        # believed was immutable, or the download was corrupted/tampered with.
        # Either way, do not build.
        Write-Err "$Name checksum MISMATCH - refusing to build."
        Write-Host "         expected $wanted" -ForegroundColor DarkGray
        Write-Host "         actual   $actual" -ForegroundColor DarkGray
        Write-Host "         Delete $cached and retry, or repin deliberately." -ForegroundColor DarkGray
        exit 1
    } else {
        Write-Ok "$Name $($Dep.version) verified"
    }

    return $cached
}

$archives = @{}
$newHashes = @{}
foreach ($name in @('node', 'mongodb', 'mongoTools', 'mongosh', 'caddy', 'winsw')) {
    $archives[$name] = Get-Dependency -Name $name -Dep $deps.$name
    if ($UpdateHashes) { $newHashes[$name] = $deps.$name.sha256 }
}

# Surgical text edit, NOT ConvertTo-Json.
#
# deps.json is mostly prose: every dependency carries a "//" block explaining
# why that version, what gets extracted, and which risks attach to it.
# Round-tripping through ConvertTo-Json reflows the whole file and escapes every
# apostrophe and angle bracket into ' / <, leaving the documentation
# technically valid and practically unreadable. So rewrite only the sha256
# values and leave every other byte alone.
#
# Defined as a function because it is called twice: once for the runtime
# dependencies, and again for Inno Setup, which is fetched later and only when
# packaging. Writing the file once up front would silently discard an Inno
# Setup repin.
function Set-DepHash {
    param([hashtable]$Hashes)
    if ($Hashes.Count -eq 0) { return }

    $raw = [System.IO.File]::ReadAllText($DepsFile, [System.Text.Encoding]::UTF8)
    foreach ($name in $Hashes.Keys) {
        if (-not $Hashes[$name]) { continue }
        # Anchor on the dependency key, then the FIRST sha256 after it. Keys are
        # unique and sha256 always precedes the "//" block within a dependency.
        $pattern = '(?s)("' + [regex]::Escape($name) + '"\s*:\s*\{.*?"sha256"\s*:\s*")[^"]*(")'
        $replacement = '${1}' + $Hashes[$name] + '${2}'
        $updated = [regex]::Replace($raw, $pattern, $replacement, 1)
        if ($updated -eq $raw) {
            Write-Warn "could not locate the sha256 field for '$name' - update it by hand"
        }
        $raw = $updated
    }
    [System.IO.File]::WriteAllText($DepsFile, $raw, (New-Object System.Text.UTF8Encoding $false))

    # Fail loudly rather than silently emitting a file the next build rejects.
    try { $null = Get-Content $DepsFile -Raw | ConvertFrom-Json }
    catch { Write-Err "deps.json is no longer valid JSON after the hash update."; exit 1 }
}

if ($UpdateHashes) {
    Set-DepHash -Hashes $newHashes
    Write-Ok "deps.json hashes updated in place - COMMIT THIS"
}

# ── Code signing ─────────────────────────────────────────────────────────────

<#
    Authenticode-sign a set of files.

    Two things need signing, and they are signed at DIFFERENT points in the
    build:

      1. The three service\XPPOS-*.exe wrappers, signed during STAGING - before
         Inno compresses them into the installer. Signing them afterwards is
         impossible; they are inside the .exe by then. These are renamed copies
         of WinSW, whose own releases ship unsigned, so without this step three
         unsigned executables get registered as Windows services on every
         customer machine - exactly the pattern endpoint protection flags.

      2. The finished installer, signed after ISCC returns.

    Returns $true when everything signed, $false otherwise. A signing failure
    must fail the build: shipping a half-signed installer is worse than shipping
    an unsigned one, because the inconsistency looks like tampering.
#>
function Invoke-SignFiles {
    param(
        [string[]]$Files,
        [string]$What
    )
    if (-not $SignThumbprint) { return $true }

    $signtool = Get-SignToolPath
    if (-not $signtool) { return $false }

    foreach ($file in $Files) {
        if (-not (Test-Path -LiteralPath $file)) {
            Write-Err "cannot sign missing file: $file"
            return $false
        }
        $r = Invoke-Native -FilePath $signtool -Arguments @(
            'sign',
            '/sha1', $SignThumbprint,
            '/fd', 'sha256',          # file digest
            '/tr', $TimestampUrl,     # RFC 3161 timestamp
            '/td', 'sha256',          # timestamp digest
            '/q',
            $file
        )
        if ($r.ExitCode -ne 0) {
            Write-Err "signing failed for $(Split-Path $file -Leaf) (exit $($r.ExitCode))"
            if ($r.StdOut) { Write-Host "         $($r.StdOut.Trim())" -ForegroundColor DarkGray }
            if ($r.StdErr) { Write-Host "         $($r.StdErr.Trim())" -ForegroundColor DarkGray }
            return $false
        }
    }
    Write-Ok "signed $($Files.Count) file(s): $What"
    return $true
}

<#
    Resolve signtool.exe, fetching it only when signing was actually requested.

    Uses the Microsoft.Windows.SDK.BuildTools NuGet package rather than the full
    Windows SDK - a .nupkg is a zip, and only the 538 KB signtool.exe is needed.
    Extracted into .depcache; nothing is installed on the machine.
#>
function Get-SignToolPath {
    $dir = Join-Path $CacheDir 'signtool'
    $cached = Get-ChildItem $dir -Recurse -Filter 'signtool.exe' -ErrorAction SilentlyContinue |
              Where-Object { $_.DirectoryName -match 'x64' } | Select-Object -First 1
    if ($cached) { return $cached.FullName }

    # A system-wide SDK install is fine too, if one happens to be present.
    foreach ($root in @("${env:ProgramFiles(x86)}\Windows Kits\10\bin", "$env:ProgramFiles\Windows Kits\10\bin")) {
        if (Test-Path $root) {
            $sys = Get-ChildItem $root -Recurse -Filter 'signtool.exe' -ErrorAction SilentlyContinue |
                   Where-Object { $_.DirectoryName -match 'x64' } |
                   Sort-Object FullName -Descending | Select-Object -First 1
            if ($sys) { return $sys.FullName }
        }
    }

    Write-Host "    .... fetching signtool (Windows SDK BuildTools)" -ForegroundColor DarkGray
    $pkg = Get-Dependency -Name 'signtool' -Dep $deps.signtool
    if ($UpdateHashes) { Set-DepHash -Hashes @{ signtool = $deps.signtool.sha256 } }

    New-Item -ItemType Directory -Force $dir | Out-Null
    # Expand-Archive refuses a .nupkg extension; copy to .zip first.
    $zip = Join-Path $CacheDir 'signtool.zip'
    Copy-Item $pkg $zip -Force
    Expand-Archive -Path $zip -DestinationPath $dir -Force
    Remove-Item $zip -Force -ErrorAction SilentlyContinue

    $found = Get-ChildItem $dir -Recurse -Filter 'signtool.exe' -ErrorAction SilentlyContinue |
             Where-Object { $_.DirectoryName -match 'x64' } | Select-Object -First 1
    if (-not $found) {
        Write-Err "signtool.exe not found inside the SDK BuildTools package."
        return $null
    }
    Write-Ok "signtool $($deps.signtool.version) ready (nothing installed to the system)"
    return $found.FullName
}

# Validate the certificate up front rather than after a ten-minute build.
if ($SignThumbprint) {
    $SignThumbprint = $SignThumbprint -replace '[^0-9A-Fa-f]', ''
    $cert = $null
    foreach ($store in @('Cert:\CurrentUser\My', 'Cert:\LocalMachine\My')) {
        $c = Get-ChildItem $store -ErrorAction SilentlyContinue |
             Where-Object { $_.Thumbprint -eq $SignThumbprint }
        if ($c) { $cert = $c; break }
    }
    if (-not $cert) {
        Write-Err "No certificate with thumbprint $SignThumbprint in CurrentUser\My or LocalMachine\My."
        Write-Host "         List available certificates with:" -ForegroundColor DarkGray
        Write-Host "         Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Select Thumbprint,Subject" -ForegroundColor DarkGray
        exit 1
    }
    if ($cert.NotAfter -lt (Get-Date)) {
        Write-Err "That certificate EXPIRED on $($cert.NotAfter.ToShortDateString())."
        exit 1
    }
    Write-Step "Code signing enabled"
    Write-Ok "certificate: $($cert.Subject)"
    Write-Ok "expires    : $($cert.NotAfter.ToShortDateString())"
    if ($cert.NotAfter -lt (Get-Date).AddDays(30)) {
        Write-Warn "expires in under 30 days - renew before the next release"
    }
}

# ── 3. Build the app ─────────────────────────────────────────────────────────
Write-Step "Building the application"

Push-Location $RepoRoot
try {
    if ($SkipBuild) {
        Write-Warn "-SkipBuild: reusing existing .next (NOT for release builds)"
        if (-not (Test-Path (Join-Path $RepoRoot '.next\standalone\server.js'))) {
            Write-Err "No existing standalone build to reuse."
            exit 1
        }
    } else {
        # Clearing .next is NOT optional housekeeping.
        #
        # tsconfig.json includes .next/dev/types/**/*.ts, so a stale generated
        # validator from an earlier run gets type-checked. During this migration
        # a build failed on "Cannot find module '../../../app/messenger/page.js'"
        # - a route deleted months earlier, still referenced by a leftover
        # validator.ts. It looks exactly like a source defect and is not one.
        # Docker never hit this because it always built in a clean container.
        # installer\payload goes too, and it must go BEFORE next build, not just
        # before staging.
        #
        # Next's tracer resolves a dynamic path by globbing for the literal
        # filenames around it - scripts\apply-update.ps1, XP-POS-Setup-*.exe -
        # and pulls in every match under the repo. Last build's payload contains
        # both, so leaving it here means this build packages the previous one.
        # Measured at 1,483 MB before this line existed. It is regenerated from
        # scratch during staging, so nothing is lost. installer\dist is left
        # alone: those are finished releases, not scratch space.
        foreach ($stale in @('.next', 'tsconfig.tsbuildinfo', 'installer\payload')) {
            $p = Join-Path $RepoRoot $stale
            if (Test-Path $p) { Remove-Item -Recurse -Force $p }
        }
        Write-Ok "cleared .next, tsconfig.tsbuildinfo and the previous payload"

        # Type check is the primary gate and is cheap relative to a bad release.
        $tsc = Invoke-Native -FilePath 'npx' -Arguments @('tsc', '--noEmit')
        if ($tsc.ExitCode -ne 0) {
            Write-Err "Type check failed - refusing to build."
            Write-Host $tsc.StdOut -ForegroundColor DarkGray
            exit 1
        }
        Write-Ok "tsc --noEmit clean"

        $build = Invoke-Native -FilePath 'npx' -Arguments @('next', 'build')
        if ($build.ExitCode -ne 0) {
            Write-Err "next build failed."
            Write-Host $build.StdOut -ForegroundColor DarkGray
            Write-Host $build.StdErr -ForegroundColor DarkGray
            exit 1
        }
        Write-Ok "next build succeeded"
    }
} finally {
    Pop-Location
}

# ── 4. Stage the payload ─────────────────────────────────────────────────────
Write-Step "Staging the payload"

if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
foreach ($sub in @('app', 'node', 'mongodb\bin', 'caddy', 'service', 'scripts', 'config', 'redist')) {
    New-Item -ItemType Directory -Force (Join-Path $OutDir $sub) | Out-Null
}

# -- app: standalone server + static + public -------------------------------
# `next build` writes .next/static and public/ OUTSIDE the standalone tree; the
# server does not serve them unless they are copied in. This mirrors what the
# Dockerfile did in its runner stage.
Copy-Item (Join-Path $RepoRoot '.next\standalone\*') (Join-Path $OutDir 'app') -Recurse -Force
New-Item -ItemType Directory -Force (Join-Path $OutDir 'app\.next') | Out-Null
Copy-Item (Join-Path $RepoRoot '.next\static') (Join-Path $OutDir 'app\.next\static') -Recurse -Force
if (Test-Path (Join-Path $RepoRoot 'public')) {
    Copy-Item (Join-Path $RepoRoot 'public') (Join-Path $OutDir 'app\public') -Recurse -Force
}

# -- CRITICAL: never ship the developer's .env ------------------------------
# `next build` copies the repo .env into .next/standalone/.env. Shipping it
# would put the DEVELOPER'S NEXTAUTH_SECRET on every client site, so a session
# token minted on one box would authenticate on all of them. The live config is
# written per-site into C:\ProgramData\XP POS\.env by provision.ps1 and reached
# via node's env-file flag; nothing should sit beside server.js.
$leaked = Get-ChildItem (Join-Path $OutDir 'app') -Filter '.env*' -Force -ErrorAction SilentlyContinue
foreach ($f in $leaked) {
    Remove-Item $f.FullName -Force
    Write-Ok "removed $($f.Name) from the payload (would have leaked build-machine config)"
}

# -- CRITICAL: never ship original TypeScript source ------------------------
# The shipped app is compiled JS. Next's file tracer nonetheless drags the odd
# .ts/.tsx file into the standalone output - measured: it copied
# app/api/uploads/[filename]/route.ts verbatim, comments and all. This is a
# commercial product installed on customer machines, so the source has no
# business being there. Strip it, then assert below that none survived.
#
# node_modules is excluded: third-party packages ship their own .ts typings and
# removing those can break module resolution at runtime.
$sourceLeaks = Get-ChildItem (Join-Path $OutDir 'app') -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.Extension -in '.ts', '.tsx', '.jsx' }
foreach ($f in $sourceLeaks) {
    # -LiteralPath: route folders contain [brackets], which PowerShell would
    # otherwise treat as wildcards and silently fail to match.
    Remove-Item -LiteralPath $f.FullName -Force
    Write-Ok "removed source file $($f.Name) from the payload"
}

# -- runtimes ---------------------------------------------------------------
function Expand-Into {
    param([string]$Archive, [string]$Dest)
    $tmp = Join-Path $CacheDir ("x_" + [System.IO.Path]::GetFileNameWithoutExtension($Archive))
    if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
    Expand-Archive -Path $Archive -DestinationPath $tmp -Force
    return $tmp
}

$x = Expand-Into $archives['node']
Copy-Item (Get-ChildItem $x -Recurse -Filter 'node.exe' | Select-Object -First 1).FullName (Join-Path $OutDir 'node\node.exe') -Force
Write-Ok "node.exe $($deps.node.version)"

# MongoDB: mongod.exe only. The .pdb symbol files are ~1.5 GB and mongos.exe is
# the sharding router, which a single-node replica set never uses.
$x = Expand-Into $archives['mongodb']
Copy-Item (Get-ChildItem $x -Recurse -Filter 'mongod.exe' | Select-Object -First 1).FullName (Join-Path $OutDir 'mongodb\bin\mongod.exe') -Force
$vc = Get-ChildItem $x -Recurse -Filter 'vc_redist.x64.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($vc) {
    Copy-Item $vc.FullName (Join-Path $OutDir 'redist\vc_redist.x64.exe') -Force
    Write-Ok "vc_redist.x64.exe staged (mongod needs msvcp140/vcruntime140)"
} else {
    Write-Warn "vc_redist.x64.exe not found in the MongoDB archive"
}
Write-Ok "mongod.exe $($deps.mongodb.version)"

$x = Expand-Into $archives['mongoTools']
foreach ($tool in @('mongodump.exe', 'mongorestore.exe')) {
    $src = Get-ChildItem $x -Recurse -Filter $tool | Select-Object -First 1
    if (-not $src) { Write-Err "$tool missing from the database-tools archive"; exit 1 }
    Copy-Item $src.FullName (Join-Path $OutDir "mongodb\bin\$tool") -Force
}
Write-Ok "mongodump.exe + mongorestore.exe $($deps.mongoTools.version)"

# mongosh ships as a directory (the exe is paired with mongosh_crypt_v1.dll), so
# take the whole bin/ rather than cherry-picking the executable. Together they
# are ~135 MB, the single largest item in the payload - see -NoMongosh.
if ($NoMongosh) {
    Write-Warn "mongosh omitted (-NoMongosh) - saves about 135 MB"
    Write-Host "         On-site database inspection will need a separate download." -ForegroundColor DarkGray
} else {
    $x = Expand-Into $archives['mongosh']
    $shBin = Get-ChildItem $x -Recurse -Directory -Filter 'bin' | Select-Object -First 1
    if ($shBin) {
        Copy-Item (Join-Path $shBin.FullName '*') (Join-Path $OutDir 'mongodb\bin') -Recurse -Force
        Write-Ok "mongosh $($deps.mongosh.version)"
    } else {
        Write-Warn "mongosh bin/ not found - support tooling will be missing"
    }
}

$x = Expand-Into $archives['caddy']
Copy-Item (Get-ChildItem $x -Recurse -Filter 'caddy.exe' | Select-Object -First 1).FullName (Join-Path $OutDir 'caddy\caddy.exe') -Force
Write-Ok "caddy.exe $($deps.caddy.version)"

# WinSW resolves its config as <own-exe-name>.xml, so each service needs its own
# renamed copy of the same wrapper binary.
$wrapperExes = @()
foreach ($svc in @('XPPOS-MongoDB', 'XPPOS-App', 'XPPOS-Caddy')) {
    $dest = Join-Path $OutDir "service\$svc.exe"
    Copy-Item $archives['winsw'] $dest -Force
    Copy-Item (Join-Path $InstallerDir "service\$svc.xml") (Join-Path $OutDir "service\$svc.xml") -Force
    $wrapperExes += $dest
}
Write-Ok "3 WinSW wrappers $($deps.winsw.version)"

# Sign the wrappers HERE - this is the last moment it is possible. Once Inno
# packages them they are compressed inside the installer and out of reach.
if (-not (Invoke-SignFiles -Files $wrapperExes -What 'service wrappers')) {
    Write-Err "Could not sign the service wrappers - aborting."
    Write-Host "         A half-signed installer is worse than an unsigned one." -ForegroundColor DarkGray
    exit 1
}

# -- scripts and config -----------------------------------------------------
Copy-Item (Join-Path $InstallerDir 'scripts\*') (Join-Path $OutDir 'scripts') -Recurse -Force
Copy-Item (Join-Path $InstallerDir 'config\*')  (Join-Path $OutDir 'config')  -Recurse -Force

# provision.ps1 reads config\env.template to bootstrap a site's .env. It is the
# repo's .env.example under a name that cannot be confused with a live config.
Copy-Item (Join-Path $RepoRoot '.env.example') (Join-Path $OutDir 'config\env.template') -Force
Write-Ok "scripts + config staged (env.template from .env.example)"

# ── 5. Safety checks ─────────────────────────────────────────────────────────
Write-Step "Verifying the payload"

$fail = $false
function Assert-Payload {
    param([string]$What, [bool]$Condition, [string]$Detail = '')
    if ($Condition) { Write-Ok $What }
    else { Write-Err "$What $Detail"; $script:fail = $true }
}

foreach ($rel in @(
    'app\server.js', 'app\.next\static', 'node\node.exe',
    'mongodb\bin\mongod.exe', 'mongodb\bin\mongodump.exe', 'mongodb\bin\mongorestore.exe',
    'caddy\caddy.exe',
    'service\XPPOS-App.exe', 'service\XPPOS-App.xml',
    'service\XPPOS-MongoDB.exe', 'service\XPPOS-MongoDB.xml',
    'service\XPPOS-Caddy.exe', 'service\XPPOS-Caddy.xml',
    'scripts\provision.ps1', 'scripts\services.ps1', 'scripts\rs-init.mjs',
    'scripts\apply-update.ps1',
    'config\env.template', 'config\mongod.cfg', 'config\Caddyfile.http'
)) {
    Assert-Payload "present: $rel" (Test-Path (Join-Path $OutDir $rel))
}

# Every shipped PowerShell script must be UTF-8 WITH a byte-order mark and pure
# ASCII in its string literals.
#
# This is not pedantry. Windows PowerShell 5.1 reads a BOM-less .ps1 as CP1252,
# and a UTF-8 em-dash then decodes to a byte PowerShell treats as a smart quote,
# which silently terminates whatever string it lands in - the script fails to
# parse with an error pointing at the next word. It has bitten this project once
# already (see the note at the top of services.ps1). A build machine with a
# different editor default is all it takes to reintroduce it, and the failure
# only shows up on a client box during provisioning.
#
# Non-ASCII inside a comment is harmless - the tokenizer skips comments - which
# is why the help headers here are allowed their box-drawing characters and
# em-dashes. So the check TOKENISES the script with PowerShell's own parser and
# looks at everything that is not a comment, rather than guessing at comment
# syntax with a regex. A line-based check cannot see inside a <# #> block and
# reports every documentation header as a violation.
#
# This found a real one when it was added: an em-dash inside a string literal in
# services.ps1, which would have gone off the moment that file lost its BOM.
foreach ($ps1 in Get-ChildItem (Join-Path $OutDir 'scripts') -Filter '*.ps1' -File) {
    $bytes = [System.IO.File]::ReadAllBytes($ps1.FullName)
    $hasBom = $bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF
    Assert-Payload "$($ps1.Name) is UTF-8 with a BOM" $hasBom `
        "PowerShell 5.1 would read it as CP1252"

    $text = [System.IO.File]::ReadAllText($ps1.FullName, [System.Text.Encoding]::UTF8)
    $parseErrors = $null
    $tokens = [System.Management.Automation.PSParser]::Tokenize($text, [ref]$parseErrors)
    Assert-Payload "$($ps1.Name) parses as PowerShell" ($parseErrors.Count -eq 0) `
        ($parseErrors | Select-Object -First 1 | ForEach-Object { $_.Message })

    $bad = @($tokens | Where-Object {
        $_.Type -ne 'Comment' -and $_.Content -match '[^\x00-\x7F]'
    })
    Assert-Payload "$($ps1.Name) has ASCII-only code" ($bad.Count -eq 0) `
        (($bad | ForEach-Object { "line $($_.StartLine)" }) -join ', ')
}

# No .env anywhere in the payload. This is the check that stops a build-machine
# secret reaching a client site.
$stray = Get-ChildItem $OutDir -Recurse -Force -Filter '.env*' -ErrorAction SilentlyContinue |
         Where-Object { $_.Name -ne 'env.template' }
Assert-Payload "no .env leaked into the payload" ($stray.Count -eq 0) ($stray.FullName -join ', ')

# No original TypeScript source outside node_modules. The strip above should
# have handled it; this catches a future Next version tracing in something new.
$straySrc = Get-ChildItem $OutDir -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' -and $_.Extension -in '.ts', '.tsx', '.jsx' }
Assert-Payload "no TypeScript source shipped to customers" ($straySrc.Count -eq 0) `
    (($straySrc | ForEach-Object { $_.Name }) -join ', ')

# The template must still contain its placeholders: provision.ps1 replaces each
# __GENERATE__ with a per-site secret. If a real .env were copied here by
# mistake the placeholders would be gone - and every site would share secrets.
$tpl = Get-Content (Join-Path $OutDir 'config\env.template') -Raw
Assert-Payload "env.template still has __GENERATE__ placeholders" ($tpl -match '__GENERATE__')

# No NEXT_PUBLIC_* realtime variable may be DEFINED. These are inlined into the
# browser bundle at build time, so even one of them would re-tie the compiled
# artifact to a single site and undo what makes one installer shippable
# everywhere.
#
# Matches an assignment only, not a mention. The template deliberately explains
# in prose why these variables were removed, and that comment must not trip the
# check - an earlier version of this assertion failed the build on its own
# documentation.
Assert-Payload "no NEXT_PUBLIC_PUSHER_* variable is defined in env.template" `
    ($tpl -notmatch '(?m)^\s*NEXT_PUBLIC_PUSHER\w*\s*=')

# The update channel must ship OFF and SAFE.
#
# These two defaults are the difference between "an update channel" and "a
# supply-chain hole shipped to every restaurant we supply". POS_UPDATE_AUTO_
# INSTALL=true would let a box restart itself mid-service on a template nobody
# reviewed; POS_UPDATE_ALLOW_UNSIGNED=true would let it run an installer whose
# signature Windows could not verify, as Administrator. Both are legitimate
# things for one operator to switch on for one site, and neither has any
# business being the shipped default - so this asserts what leaves the building,
# not what a site may later choose.
Assert-Payload "env.template ships with auto-install OFF" `
    ($tpl -notmatch '(?mi)^\s*POS_UPDATE_AUTO_INSTALL\s*=\s*true\s*$')
Assert-Payload "env.template ships requiring a verified signature" `
    ($tpl -notmatch '(?mi)^\s*POS_UPDATE_ALLOW_UNSIGNED\s*=\s*true\s*$')
# A URL baked into the template would point every new install at whatever host
# happened to be in the developer's working copy.
Assert-Payload "env.template ships with no update URL set" `
    ($tpl -match '(?m)^\s*POS_UPDATE_URL\s*=\s*$')

# ── Licensing (Phase 11) ─────────────────────────────────────────────────────
#
# The licence verification key must be COMPILED INTO the shipped bundle.
#
# It is a public key, so there is nothing to protect about it - the assertion
# exists because of what its ABSENCE would mean. lib/licensing/keys.ts holds it
# as a constant precisely so it cannot be swapped in a .env on the customer's
# own box; if a future refactor turned it into a setting, or a build dropped the
# constant, every licence in the field would stop verifying and every paying
# restaurant would fall into a 14-day grace period at once. Better to fail here.
#
# The key is searched for in the server bundle rather than in the source: what
# matters is that it survived minification into the artifact that ships, not
# that it exists in a file the customer never receives.
$licenceKeyPrefix = 'MCowBQYDK2VwAyEA'
$serverChunks = Join-Path $OutDir 'app\.next\server'
$keyFound = $false
if (Test-Path $serverChunks) {
    $keyFound = [bool](Get-ChildItem $serverChunks -Recurse -File -Include '*.js' -ErrorAction SilentlyContinue |
        Select-String -SimpleMatch -Pattern $licenceKeyPrefix -List -ErrorAction SilentlyContinue |
        Select-Object -First 1)
}
Assert-Payload "the licence verification key is compiled into the app bundle" $keyFound `
    "lib\licensing\keys.ts did not reach app\.next\server - licences would not verify on a client box"

# No PRIVATE key material anywhere in the payload.
#
# The signing key lives outside this repository (see tools\licensing\keygen.mjs)
# and nothing in the build should ever go looking for it. This is the assertion
# that catches somebody dropping a .pem next to the tools "just for testing" and
# shipping the ability to mint licences to every customer.
$strayKeys = @(Get-ChildItem $OutDir -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in '.pem', '.pfx', '.key', '.p12' -and $_.FullName -notmatch '\\node_modules\\' })
Assert-Payload "no private key material in the payload" ($strayKeys.Count -eq 0) `
    (($strayKeys | ForEach-Object { $_.FullName }) -join ', ')

# The licence itself must NOT be in the payload. license.dat belongs to one
# machine and lives in ProgramData; one shipped in the installer would be handed
# to every customer, and would fail its fingerprint check on all of them.
$strayLicence = @(Get-ChildItem $OutDir -Recurse -File -Force -Filter 'license.dat' -ErrorAction SilentlyContinue)
Assert-Payload "no licence file in the payload" ($strayLicence.Count -eq 0) `
    (($strayLicence | ForEach-Object { $_.FullName }) -join ', ')

# The vendor-side issuing tools must never reach a customer. They are harmless
# without the private key, but shipping the issuer alongside the product tells
# anybody who looks exactly how the format works and where the key would go.
$strayTools = @(Get-ChildItem $OutDir -Recurse -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in 'issue.mjs', 'keygen.mjs' })
Assert-Payload "no licence issuing tools in the payload" ($strayTools.Count -eq 0) `
    (($strayTools | ForEach-Object { $_.FullName }) -join ', ')

# The bundled runtime must actually run the native addons. bcrypt and sharp
# ship N-API prebuilds which should be ABI-stable across Node majors - verify
# that rather than trusting it, because a broken bcrypt means nobody can log in.
$bundledNode = Join-Path $OutDir 'node\node.exe'
# Run from inside app/ so require() resolves against the BUNDLED node_modules,
# which is the tree that will actually be there at runtime.
Push-Location (Join-Path $OutDir 'app')
try {
    $probe = Invoke-Native -FilePath $bundledNode -Arguments @(
        '-e',
        "const b=require('bcrypt');const h=b.hashSync('x',10);if(!b.compareSync('x',h))process.exit(1);require('mongodb');console.log('ok')"
    )
} finally { Pop-Location }
Assert-Payload "bundled node runs bcrypt + mongodb from the app bundle" ($probe.ExitCode -eq 0) $probe.StdErr

# mongod must at least execute. This is the cheapest possible early warning for
# a missing VC++ runtime on the BUILD machine, though the real AVX/redist risk
# is on the client box and is handled by the installer.
$mongodProbe = Invoke-Native -FilePath (Join-Path $OutDir 'mongodb\bin\mongod.exe') -Arguments @('--version')
Assert-Payload "mongod.exe executes" ($mongodProbe.ExitCode -eq 0) $mongodProbe.StdErr

$caddyProbe = Invoke-Native -FilePath (Join-Path $OutDir 'caddy\caddy.exe') -Arguments @('version')
Assert-Payload "caddy.exe executes" ($caddyProbe.ExitCode -eq 0) $caddyProbe.StdErr

# The build must not package its own output.
#
# Next's file tracer decides what each route needs and copies it into
# .next/standalone. Its static evaluator resolves process.cwd(), so code that
# builds a runtime path from it can make the tracer conclude the route might
# read anything under the repo root - and copy the whole thing, installer\payload
# and the previous installer\dist\*.exe included.
#
# That is not hypothetical. It happened when the update agent was added: the
# payload went from 438 MB to 1,483 MB because it contained the PREVIOUS build's
# payload and installer. Left unchecked, every release roughly doubles, and the
# only symptom is a download that got bigger.
#
# next.config.ts excludes these directories. This asserts the result, because an
# exclude list is only as good as the next person's memory to update it, and the
# failure is silent.
#
# Note what this does NOT ban: app\installer\scripts\apply-update.ps1. The app
# genuinely references that script by name, so Next traces a 12 KB copy of it
# into the bundle. That copy is unused - services.ps1 runs the one under
# scripts\ - but it is normal tracing of a real reference, not the build eating
# its own output, and banning it would mean failing the build over 12 KB. The
# directories named below are the ones that carried a gigabyte.
# Matched on the PATH, not on a directory name, and node_modules is skipped.
# "dist" is an ordinary npm package directory - @mongodb-js/saslprep ships one -
# so banning the bare name fails the build on a legitimate dependency. What must
# never appear is this project's own build output.
$appRoot = Join-Path $OutDir 'app'
$nested = @(
    Get-ChildItem $appRoot -Recurse -Directory -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\node_modules\\' } |
    Where-Object {
        $rel = $_.FullName.Substring($appRoot.Length)
        $rel -match '\\installer\\(payload|dist)(\\|$)' -or $rel -match '\\\.(depcache|git)(\\|$)'
    }
)
Assert-Payload "the app bundle does not contain the build's own output" ($nested.Count -eq 0) `
    (($nested | ForEach-Object { $_.FullName.Replace($OutDir, '') } | Select-Object -First 3) -join ', ')

# A blunt ceiling as the second net: the check above names the directories seen
# so far, and this catches whatever nobody predicted next. The Next standalone
# bundle measures about 44 MB; the runtimes (node, mongodb, caddy) are staged
# separately and are not counted here. 250 MB leaves years of honest growth and
# still catches the regression that prompted this, which reached 1,087 MB.
$appMB = [math]::Round(((Get-ChildItem (Join-Path $OutDir 'app') -Recurse -File -Force |
          Measure-Object -Property Length -Sum).Sum / 1MB), 1)
Assert-Payload "the app bundle is a plausible size ($appMB MB)" ($appMB -lt 250) `
    "expected well under 250 MB - something large was traced into it"

# MAX_PATH. Windows still limits paths to 260 characters unless long paths are
# explicitly enabled, and they are OFF by default on Windows 10/11. A client box
# is a default box. If a future dependency adds a deeply nested node_modules
# tree, extraction there would fail on the customer's machine and NOT here -
# so measure it at build time instead of finding out on site.
$installRootLen = 'C:\Program Files\XP POS'.Length
$longest = Get-ChildItem $OutDir -Recurse -File |
    ForEach-Object { $_.FullName.Length - $OutDir.Length } |
    Measure-Object -Maximum
$worstCase = $installRootLen + $longest.Maximum
Assert-Payload "longest installed path stays under MAX_PATH" ($worstCase -lt 260) `
    "worst case $worstCase chars (limit 260)"

if ($fail) {
    Write-Host ""
    Write-Err "Payload verification FAILED - do not ship this build."
    exit 1
}

$size = (Get-ChildItem $OutDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   PAYLOAD READY" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host ("   location : {0}" -f $OutDir) -ForegroundColor DarkGray
Write-Host ("   size     : {0:N0} MB across {1:N0} files" -f ($size/1MB), (Get-ChildItem $OutDir -Recurse -File).Count) -ForegroundColor DarkGray
Write-Host ("   node     : {0}   mongodb : {1}" -f $deps.node.version, $deps.mongodb.version) -ForegroundColor DarkGray
Write-Host ("   caddy    : {0}    winsw   : {1}" -f $deps.caddy.version, $deps.winsw.version) -ForegroundColor DarkGray
Write-Host ""

# ── 6. Package (optional) ────────────────────────────────────────────────────
# Packaging is the DEFAULT. This script is the single entry point: run it, get
# an installer. It previously required an explicit -Package and exited quietly
# after staging, which reads as "the build silently did nothing" - the payload
# is invisible unless you go looking for it.
if ($StageOnly) {
    Write-Warn "-StageOnly: stopping before the installer is built."
    Write-Host "         Run without -StageOnly to produce the .exe." -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

Write-Step "Packaging the installer"

# Resolve the compiler, in order of preference:
#   1. -IsccPath, if given
#   2. a system-wide Inno Setup 6 install
#   3. a PORTABLE copy fetched into .depcache
#
# Step 3 exists so a clean checkout can build a release without anyone
# hand-installing tooling first - the same reason every runtime in deps.json is
# pinned and auto-fetched. The portable extraction touches no registry keys, no
# Program Files, and no PATH.
if (-not $IsccPath) {
    foreach ($candidate in @(
        "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
        "$env:ProgramFiles\Inno Setup 6\ISCC.exe"
    )) {
        if (Test-Path $candidate) { $IsccPath = $candidate; break }
    }
}

if (-not $IsccPath) {
    $isccDir = Join-Path $CacheDir 'innosetup'
    $portableIscc = Join-Path $isccDir 'ISCC.exe'

    if (Test-Path $portableIscc) {
        $IsccPath = $portableIscc
        Write-Ok "using the portable Inno Setup in .depcache"
    } else {
        Write-Host "    .... Inno Setup not installed - fetching a portable copy" -ForegroundColor DarkGray
        $isccInstaller = Get-Dependency -Name 'innosetup' -Dep $deps.innosetup
        New-Item -ItemType Directory -Force $isccDir | Out-Null

        # /PORTABLE=1 unpacks without registering anything on the machine.
        $p = Start-Process -FilePath $isccInstaller -ArgumentList @(
            '/VERYSILENT', '/PORTABLE=1', '/SUPPRESSMSGBOXES', "/DIR=$isccDir"
        ) -Wait -PassThru
        if ($p.ExitCode -ne 0 -or -not (Test-Path $portableIscc)) {
            Write-Err "Could not extract a portable Inno Setup (exit $($p.ExitCode))."
            Write-Host "         Install Inno Setup 6 from https://jrsoftware.org/isdl.php" -ForegroundColor DarkGray
            Write-Host "         or pass -IsccPath <path to ISCC.exe>." -ForegroundColor DarkGray
            exit 1
        }
        $IsccPath = $portableIscc
        Write-Ok "portable Inno Setup $($deps.innosetup.version) ready (nothing installed to the system)"

        # Inno Setup is fetched after the deps.json write above, so persist its
        # hash separately or a repin here would be silently lost.
        if ($UpdateHashes) {
            Set-DepHash -Hashes @{ innosetup = $deps.innosetup.sha256 }
            Write-Ok "deps.json innosetup hash updated - COMMIT THIS"
        }
    }
}

if (-not (Test-Path $IsccPath)) {
    Write-Err "ISCC.exe not found at $IsccPath"
    exit 1
}
Write-Ok "using $IsccPath"

# Version comes from package.json so the installer, the Add/Remove Programs
# entry and the application can never disagree about what is installed.
$pkg = Get-Content (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json
$appVersion = $pkg.version
if (-not $appVersion) { Write-Err "package.json has no version field."; exit 1 }
Write-Ok "version $appVersion (from package.json)"

$iss = Join-Path $InstallerDir 'setup.iss'
$setupExe = Join-Path $InstallerDir "dist\XP-POS-Setup-$appVersion.exe"

<#
    Delete any previous installer BEFORE compiling.

    WHY THIS EXISTS. ISCC writes the setup .exe incrementally: it lays down the
    ~3.5 MB stub first and appends the compressed payload over the following
    minutes. A compile that dies partway - a locked source file, an antivirus
    holding a handle, the machine going to sleep - therefore leaves a file with
    the right NAME, the right timestamp and about 3 % of the right size sitting
    in dist\.

    That file looks finished to a human. Running it gets "the setup files are
    corrupted, please obtain a new copy of the program", which sends everybody
    hunting for a corrupted DOWNLOAD rather than a failed BUILD. It has already
    cost one debugging session, and it would have shipped to a customer the
    first time somebody copied the file off this machine without watching the
    build finish.

    Removing it first means a failed compile leaves NO installer at all, which
    is unambiguous. The size assertion after the compile is the other half.
#>
if (Test-Path $setupExe) {
    Remove-Item $setupExe -Force -ErrorAction SilentlyContinue
    if (Test-Path $setupExe) {
        Write-Err "Could not remove the previous installer: $setupExe"
        Write-Host "         Something is holding it open - a running setup, an" -ForegroundColor DarkGray
        Write-Host "         antivirus scan, or Explorer's preview pane." -ForegroundColor DarkGray
        exit 1
    }
}

$isccArgs = @("/DAppVersion=$appVersion", '/Qp')

# Have Inno sign the uninstaller it generates. Both arguments are required
# together: /Ssigntool defines the tool, /DSignUninstaller switches on the
# matching directives in setup.iss. $f is Inno's placeholder for the file.
if ($SignThumbprint) {
    $signtoolPath = Get-SignToolPath
    if (-not $signtoolPath) {
        Write-Err "signtool unavailable - cannot sign the uninstaller."
        exit 1
    }
    $isccArgs += '/DSignUninstaller'
    $isccArgs += ('/Ssigntool=' + '"' + $signtoolPath + '" sign /sha1 ' + $SignThumbprint +
                  ' /fd sha256 /tr ' + $TimestampUrl + ' /td sha256 /q $f')
}
$isccArgs += $iss

# Compiling 439 MB takes minutes. Say so, or the silence reads as a hang.
Write-Host "         compressing ~$([int]($size/1MB)) MB - this takes a few minutes..." -ForegroundColor DarkGray

$isccResult = Invoke-Native -FilePath $IsccPath -Arguments $isccArgs
if ($isccResult.ExitCode -ne 0) {
    Write-Err "Inno Setup compilation failed (exit $($isccResult.ExitCode))."
    if ($isccResult.StdOut) { Write-Host $isccResult.StdOut -ForegroundColor DarkGray }
    if ($isccResult.StdErr) { Write-Host $isccResult.StdErr -ForegroundColor DarkGray }
    # The partial .exe must not survive a failed compile - see the note above.
    Remove-Item $setupExe -Force -ErrorAction SilentlyContinue
    Write-Host ""
    Write-Host "   The half-written installer has been deleted, so there is no" -ForegroundColor DarkGray
    Write-Host "   corrupt file to run by mistake. Re-run the build." -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "   If this keeps happening with a different message each time," -ForegroundColor DarkGray
    Write-Host "   real-time antivirus on the BUILD machine is the usual cause -" -ForegroundColor DarkGray
    Write-Host "   it holds handles on files ISCC is reading and on the .exe it is" -ForegroundColor DarkGray
    Write-Host "   writing. Exclude the build tree (as Administrator):" -ForegroundColor DarkGray
    Write-Host "     Add-MpPreference -ExclusionPath '$RepoRoot\installer'" -ForegroundColor DarkGray
    Write-Host ""
    exit 1
}

if (-not (Test-Path $setupExe)) {
    Write-Err "ISCC reported success but $setupExe is missing."
    exit 1
}
$setupSize = (Get-Item $setupExe).Length

<#
    The installer must be a plausible size.

    ISCC has been observed exiting 0 having written little more than its own
    stub. A 118 MB payload cannot compress to single-digit megabytes, so
    anything that small is a truncated file that WILL fail its own CRC check on
    a customer's machine with "the setup files are corrupted".

    The floor is deliberately generous - it is catching a 3.5 MB stub, not
    policing compression ratios - and it deletes the bad file rather than
    leaving it for somebody to find later and trust.
#>
$MinSetupBytes = 40MB
if ($setupSize -lt $MinSetupBytes) {
    Write-Err ("The installer is only {0:N1} MB - it is truncated, not finished." -f ($setupSize/1MB))
    Write-Host "         A $([int]($size/1MB)) MB payload cannot compress to that." -ForegroundColor DarkGray
    Write-Host "         Running it would say 'the setup files are corrupted'." -ForegroundColor DarkGray
    Remove-Item $setupExe -Force -ErrorAction SilentlyContinue
    Write-Host "         Deleted. Re-run the build." -ForegroundColor DarkGray
    exit 1
}

# Sign the finished installer. The wrappers inside it were already signed during
# staging; this covers the outer .exe that the customer actually downloads and
# that SmartScreen judges.
if (-not (Invoke-SignFiles -Files @($setupExe) -What 'installer')) {
    Write-Err "Could not sign the installer - aborting."
    exit 1
}

Write-Host ""
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host "   INSTALLER READY" -ForegroundColor Green
Write-Host "  ============================================================" -ForegroundColor Green
Write-Host ""
Write-Host ("   file     : {0}" -f $setupExe) -ForegroundColor Cyan
Write-Host ("   size     : {0:N1} MB ({1} bytes, from a {2:N0} MB payload)" -f ($setupSize/1MB), $setupSize, ($size/1MB)) -ForegroundColor DarkGray
Write-Host ("   version  : {0}" -f $appVersion) -ForegroundColor DarkGray

# The digest earns its place twice: it is the value POS_UPDATE_URL's manifest
# needs for this release (see PHASE-10), and it is how you prove the copy that
# reached a test laptop or a customer is byte-identical to what was built. A
# truncated copy is indistinguishable from a corrupt one by eye, and both report
# themselves as "the setup files are corrupted".
$setupHash = (Get-FileHash $setupExe -Algorithm SHA256).Hash
Write-Host ("   sha256   : {0}" -f $setupHash) -ForegroundColor DarkGray
Write-Host "              Verify a copy with:" -ForegroundColor DarkGray
Write-Host "                Get-FileHash .\XP-POS-Setup-$appVersion.exe -Algorithm SHA256" -ForegroundColor DarkGray
Write-Host ""
if ($SignThumbprint) {
    # Report what Windows actually thinks, not what signtool claimed. A signature
    # that does not verify here will not verify on a customer's machine either.
    $sig = Get-AuthenticodeSignature -LiteralPath $setupExe
    $stamped = if ($sig.TimeStamperCertificate) { 'timestamped' } else { 'NOT TIMESTAMPED' }
    if ($sig.Status -eq 'Valid') {
        Write-Host ("   signed   : {0} ({1})" -f $sig.SignerCertificate.Subject, $stamped) -ForegroundColor Green
    } else {
        Write-Warn "signature status is '$($sig.Status)', not 'Valid'."
        Write-Host "         With a self-signed test certificate that is expected -" -ForegroundColor DarkGray
        Write-Host "         Windows does not trust the root. With a purchased" -ForegroundColor DarkGray
        Write-Host "         certificate it means something is wrong." -ForegroundColor DarkGray
        Write-Host ("         signer: {0} ({1})" -f $sig.SignerCertificate.Subject, $stamped) -ForegroundColor DarkGray
    }
    if (-not $sig.TimeStamperCertificate) {
        Write-Warn "NOT timestamped - every signature dies with the certificate."
    }
    Write-Host ""
} else {
    Write-Warn "NOT CODE-SIGNED. SmartScreen will warn on every download until it is."
    Write-Host "         Sign with:  .\installer\build.ps1 -SignThumbprint <thumbprint>" -ForegroundColor DarkGray
    Write-Host "         This signs the installer AND the three service\XPPOS-*.exe" -ForegroundColor DarkGray
    Write-Host "         wrappers (WinSW ships unsigned)." -ForegroundColor DarkGray
    Write-Host ""
}
