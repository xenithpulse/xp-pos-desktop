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

if ($UpdateHashes) {
    # Surgical text edit, NOT ConvertTo-Json.
    #
    # deps.json is mostly prose: every dependency carries a "//" block
    # explaining why that version, what gets extracted, and which risks attach
    # to it. Round-tripping through ConvertTo-Json reflows the whole file and
    # escapes every apostrophe and angle bracket into ' / <, which
    # leaves the documentation technically valid and practically unreadable.
    # So rewrite only the sha256 values and leave every other byte alone.
    $raw = [System.IO.File]::ReadAllText($DepsFile, [System.Text.Encoding]::UTF8)
    foreach ($name in $newHashes.Keys) {
        # Anchor on the dependency key, then the FIRST sha256 after it. Keys are
        # unique and sha256 always precedes the "//" block within a dependency.
        $pattern = '(?s)("' + [regex]::Escape($name) + '"\s*:\s*\{.*?"sha256"\s*:\s*")[^"]*(")'
        $replacement = '${1}' + $newHashes[$name] + '${2}'
        $updated = [regex]::Replace($raw, $pattern, $replacement, 1)
        if ($updated -eq $raw -and $newHashes[$name]) {
            Write-Warn "could not locate the sha256 field for '$name' - update it by hand"
        }
        $raw = $updated
    }
    [System.IO.File]::WriteAllText($DepsFile, $raw, (New-Object System.Text.UTF8Encoding $false))

    # Fail loudly rather than silently emitting a file the next build rejects.
    try { $null = Get-Content $DepsFile -Raw | ConvertFrom-Json }
    catch { Write-Err "deps.json is no longer valid JSON after the hash update."; exit 1 }
    Write-Ok "deps.json hashes updated in place - COMMIT THIS"
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
        foreach ($stale in @('.next', 'tsconfig.tsbuildinfo')) {
            $p = Join-Path $RepoRoot $stale
            if (Test-Path $p) { Remove-Item -Recurse -Force $p }
        }
        Write-Ok "cleared .next and tsconfig.tsbuildinfo"

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
foreach ($svc in @('XPPOS-MongoDB', 'XPPOS-App', 'XPPOS-Caddy')) {
    Copy-Item $archives['winsw'] (Join-Path $OutDir "service\$svc.exe") -Force
    Copy-Item (Join-Path $InstallerDir "service\$svc.xml") (Join-Path $OutDir "service\$svc.xml") -Force
}
Write-Ok "3 WinSW wrappers $($deps.winsw.version)"

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
    'config\env.template', 'config\mongod.cfg', 'config\Caddyfile.http'
)) {
    Assert-Payload "present: $rel" (Test-Path (Join-Path $OutDir $rel))
}

# No .env anywhere in the payload. This is the check that stops a build-machine
# secret reaching a client site.
$stray = Get-ChildItem $OutDir -Recurse -Force -Filter '.env*' -ErrorAction SilentlyContinue |
         Where-Object { $_.Name -ne 'env.template' }
Assert-Payload "no .env leaked into the payload" ($stray.Count -eq 0) ($stray.FullName -join ', ')

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
Write-Host "   Next: package with Inno Setup (Phase 6)." -ForegroundColor DarkGray
Write-Host ""
