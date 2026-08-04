<#
.SYNOPSIS
    Write the connection card and the "XP POS" shortcut for this site.

.DESCRIPTION
    Produces the two artefacts that tell a human where the POS is:

      <DataRoot>\connect-info.txt   the customer-facing connection card
      <DataRoot>\XP POS.url         an internet shortcut carrying the icon,
                                    copied to the Start menu and optionally the
                                    desktop

    WHY THIS IS ITS OWN SCRIPT. Both of these carry an ADDRESS, and the address
    moves. The port is chosen at install time, and the IP is handed out by the
    router over DHCP - so a power cut or a router swap can change it, and a card
    printed last month then sends staff to a dead address.

    So two things write these files: provision.ps1 at install time, and
    watchdog.ps1 whenever it notices the machine's address has changed. Having
    one script do it is what keeps those two from drifting apart. Duplicating
    this logic is how the printed card ends up saying something different from
    the shortcut.

    LINE 1 OF THE CARD IS LOAD-BEARING. It is the bare staff URL, and setup.iss
    reads it to put the real address on the installer's finish page. When there
    is no LAN address the marker written instead deliberately fails setup.iss's
    "starts with http" test, so the wizard says "not on the network yet" rather
    than advertising a loopback address to tablets that cannot reach it.

.PARAMETER InstallDir
    Program files root. Used to point the shortcut at the branded icon.

.PARAMETER DataRoot
    Site data root. Default: C:\ProgramData\XP POS

.PARAMETER Port
    The LAN-facing port. Read from .env when not supplied.

.PARAMETER StartMenuDir
    Start menu program group to copy the shortcut into. Empty means "skip".

.PARAMETER DesktopShortcut
    Also copy it to the all-users desktop.

.PARAMETER Quiet
    Suppress progress output. Used by the watchdog, which has its own log.

.NOTES
    ENCODING: UTF-8 WITH BOM, ASCII-only string literals. Windows PowerShell
    5.1 reads a BOM-less .ps1 as CP1252, and a UTF-8 em-dash then decodes to a
    byte that PowerShell treats as a smart quote - which silently terminates
    whatever string it lands in.
#>
[CmdletBinding()]
param(
    [string]$InstallDir = "$env:ProgramFiles\XP POS",
    [string]$DataRoot = "$env:ProgramData\XP POS",
    [int]$Port,
    [string]$StartMenuDir,
    [switch]$DesktopShortcut,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

function Write-CardOk { param($m) if (-not $Quiet) { Write-Host "    OK   $m" -ForegroundColor Green } }
function Write-CardWarn { param($m) if (-not $Quiet) { Write-Host "    WARN $m" -ForegroundColor Yellow } }

# TODO(XenithPulse): keep in step with setup.iss and config/brand.ts.
$SupportEmail = 'support@xenithpulse.com'

# ── Resolve the port ─────────────────────────────────────────────────────────
if (-not $Port) {
    $envPath = Join-Path $DataRoot '.env'
    if (Test-Path $envPath) {
        $m = [regex]::Match((Get-Content $envPath -Raw), '(?m)^\s*POS_HTTP_PORT\s*=\s*(\d+)\s*$')
        if ($m.Success) { $Port = [int]$m.Groups[1].Value }
    }
    if (-not $Port) { $Port = 8080 }
}

<#
    The LAN address is the one on an adapter that owns a default route, which
    excludes virtual adapters (they have no gateway). Ordered by interface
    metric so Windows' own preferred interface is listed first - a box with
    Wi-Fi and a Hyper-V switch has several addresses and only one is reachable
    from a tablet.
#>
function Get-LanIps {
    $ips = @()
    try {
        $configs = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' }
        $ranked = $configs | Sort-Object -Property @{ Expression = {
            try { (Get-NetIPInterface -InterfaceIndex $_.InterfaceIndex -AddressFamily IPv4 -ErrorAction Stop).InterfaceMetric }
            catch { 9999 }
        } }
        foreach ($c in $ranked) {
            foreach ($addr in $c.IPv4Address) {
                if ($addr.IPAddress -notmatch '^(127\.|169\.254\.)') { $ips += $addr.IPAddress }
            }
        }
    } catch { }
    return $ips
}

$lanIps = Get-LanIps
$localUrl = "http://127.0.0.1:$Port"
$staffUrl = if ($lanIps.Count -gt 0) { "http://$($lanIps[0]):$Port" } else { '' }

if (-not (Test-Path $DataRoot)) { New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null }

# ── The shortcut ─────────────────────────────────────────────────────────────
# Nothing here may fail the caller: a missing shortcut is a nuisance, whereas
# aborting provisioning would discard a POS that is already running.
try {
    # Points at 127.0.0.1 deliberately: this shortcut lives on the server box,
    # and the loopback address keeps working when the machine's LAN address
    # changes or the network is down. Staff devices get the LAN address from the
    # card instead.
    $urlFile = @(
        '[InternetShortcut]',
        "URL=$localUrl",
        "IconFile=$InstallDir\branding\XP-POS.ico",
        'IconIndex=0'
    ) -join "`r`n"

    $urlPath = Join-Path $DataRoot 'XP POS.url'
    Set-Content -Path $urlPath -Value $urlFile -Encoding ASCII -Force

    # Copies, not links: each location has to survive the others being deleted,
    # and a 150-byte file is not worth being clever about.
    $targets = @()
    if ($StartMenuDir) { $targets += (Join-Path $StartMenuDir 'XP POS.url') }
    if ($DesktopShortcut) {
        $publicDesktop = Join-Path $env:PUBLIC 'Desktop'
        if (Test-Path $publicDesktop) { $targets += (Join-Path $publicDesktop 'XP POS.url') }
    }
    foreach ($t in $targets) {
        $dir = Split-Path -Parent $t
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Copy-Item $urlPath $t -Force
    }
    Write-CardOk "Shortcut created ($($targets.Count + 1) locations)"
} catch {
    Write-CardWarn "Could not create the POS shortcut: $($_.Exception.Message)"
}

# ── The card ─────────────────────────────────────────────────────────────────
try {
    $firstLine = if ($staffUrl) { $staffUrl } else { '(no network address found yet)' }
    $staffBlock = if ($staffUrl) { $staffUrl } else { 'not available - this computer is not on a network yet' }

    $card = @"
$firstLine

XP POS - HOW TO GET STARTED
===========================

1. OPEN THE POS
   On any phone, tablet or computer on the same network as this one, open
   a web browser and go to:

       $staffBlock

   This address can change if your router restarts. On iPhones, iPads,
   Windows 11 and newer Android devices you can use this instead, which
   never changes:

       http://xppos.local:$Port

   On this computer you can also use:

       $localUrl

2. SIGN IN
   Username:  admin
   Password:  admin

   The POS is already set up and loaded with a sample menu and floor plan
   so you can try everything straight away.

   CHANGE THIS PASSWORD. Until you do, anyone on your network can sign in
   as the owner. The POS asks you to set a real one when you remove the
   sample data, which is the point at which it becomes your real
   restaurant.

3. MAKE IT YOURS
   Sign in, then open Server Management -> Sample Data. Removing the
   sample data sets a real password at the same time.

   Staff accounts are created under Admin -> Users.

KEEPING IT RUNNING
------------------
The POS runs as three Windows services. It starts by itself when this
computer is switched on, with nobody logged in, and restarts by itself
after a power cut. Leave this computer on and connected to the network.

If staff devices cannot reach the POS:
  - check this computer is switched on and on the same network
  - try the xppos.local address above
  - open Server Management -> Connect Devices on this computer. It always
    shows the current address, and a QR code staff can scan.
  - to stop the address changing at all, open Server Management ->
    Connect Devices and press "Keep this address permanently". Then ask
    whoever set up your network to add a DHCP reservation for this
    computer as well - that is the complete fix.

WHERE THINGS ARE
----------------
Your business data:  $DataRoot
Logs:                $DataRoot\logs
Service status:      Start menu -> XP POS -> Service Status

SUPPORT
-------
$SupportEmail

Written on $(Get-Date -Format 'yyyy-MM-dd HH:mm'). This file is rewritten
automatically whenever this computer's network address changes.
"@

    Set-Content -Path (Join-Path $DataRoot 'connect-info.txt') -Value $card -Encoding ASCII -Force
    Write-CardOk "Connection card written to $DataRoot\connect-info.txt"
} catch {
    Write-CardWarn "Could not write the connection card: $($_.Exception.Message)"
}
