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

# Must match LOCAL_NAME in lib/net/localName.ts and MDNS_HOST in
# lib/net/addresses.ts. There is no shared source between PowerShell and the
# app, so these three are kept in step by hand.
$LocalName = 'pos.xenithpulse.local'
$nameUrl = "http://${LocalName}:$Port"

if (-not (Test-Path $DataRoot)) { New-Item -ItemType Directory -Path $DataRoot -Force | Out-Null }

<#
    ── The hosts entry that makes $LocalName work on this machine ────────────

    Written here rather than only in provision.ps1 because this script is the
    one that also runs from watchdog.ps1, so the entry is repaired on the same
    schedule the shortcut and card are - a hosts file cleaned up by an
    antivirus product fixes itself without a site visit. The app repairs it at
    every start too (lib/net/localName.ts); belt and braces, because the one
    address the owner is told to use must not be the one that breaks.

    The block is fenced so it can be replaced without disturbing anything else
    in a file other software also writes to. Rewriting a hosts file wholesale
    is how you delete somebody's licence-server override.

    Loopback, not the LAN IP: it must survive DHCP moving the machine, which is
    the entire reason for having a name.
#>
try {
    $hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
    $begin = '# >>> XP POS (managed - do not edit this block) >>>'
    $end = '# <<< XP POS (managed) <<<'

    $existing = ''
    if (Test-Path $hostsPath) { $existing = Get-Content $hostsPath -Raw -ErrorAction Stop }

    $startIdx = $existing.IndexOf($begin)
    if ($startIdx -ge 0) {
        $endIdx = $existing.IndexOf($end, $startIdx)
        $cut = if ($endIdx -ge 0) { $endIdx + $end.Length } else { $existing.Length }
        $existing = $existing.Substring(0, $startIdx) + $existing.Substring($cut)
    }

    $block = "$begin`r`n127.0.0.1`t$LocalName`r`n$end"
    $desired = ($existing -replace '\s+$', '') + "`r`n`r`n$block`r`n"

    # Only write when it is actually wrong. This runs on every watchdog tick,
    # and needless writes to the hosts file are what make an antivirus product
    # take an interest in the process doing it.
    if ($existing -eq '' -or $desired -ne (Get-Content $hostsPath -Raw -ErrorAction SilentlyContinue)) {
        Set-Content -Path $hostsPath -Value $desired -Encoding ASCII -Force -NoNewline
        & ipconfig /flushdns | Out-Null
        Write-CardOk "Fixed address $nameUrl registered on this computer"
    }
} catch {
    # Not fatal. The POS is reachable on its IP and on 127.0.0.1 regardless;
    # what is lost is the friendly name on this one machine.
    Write-CardWarn "Could not register $LocalName on this computer: $($_.Exception.Message)"
}

# ── The shortcut ─────────────────────────────────────────────────────────────
# Nothing here may fail the caller: a missing shortcut is a nuisance, whereas
# aborting provisioning would discard a POS that is already running.
try {
    # Points at the fixed NAME, not at an IP and not at raw loopback.
    #
    # The name resolves here from the hosts entry written below, so it has every
    # property loopback had - it keeps working when the LAN address changes and
    # when the network is down entirely - while also being something a human can
    # read off the screen and retype. That matters because this is the address
    # the owner sees every day, and "pos.xenithpulse.local" is learnable in a
    # way that "127.0.0.1:8090" is not.
    #
    # Staff devices do NOT get this address. They scan the QR code on Server
    # Management -> Connect Devices, which carries the LAN IP, because a .local
    # name does not cross a router to another floor.
    $urlFile = @(
        '[InternetShortcut]',
        "URL=$nameUrl",
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

   ON THIS COMPUTER
   Use the "XP POS" icon on the desktop, or go to:

       $nameUrl

   That address never changes, whatever your router does.

   ON PHONES AND TABLETS
   Open a web browser on any device on the restaurant's network and go to:

       $staffBlock

   Easier: on this computer open Server Management -> Connect Devices and
   point the device's camera at the QR code. Nobody has to type anything,
   and the code always shows the current address.

   This address CAN change if your router restarts. If devices suddenly
   stop connecting, that is why - check the QR code again.

   NOTE: the $nameUrl address above is for this computer.
   Phones and tablets should use the numeric address or the QR code. On a
   building with a router on each floor, names like that are only found by
   devices near this computer, while the numeric address works everywhere.

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
  - open Server Management -> Connect Devices on this computer. It always
    shows the current address, and a QR code staff can scan. This is the
    fastest fix and it works from any floor.
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
