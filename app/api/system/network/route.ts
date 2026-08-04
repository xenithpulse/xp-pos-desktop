// app/api/system/network/route.ts
//
// Pin this machine's network address so it stops moving.
//
// THE PROBLEM. The POS is reached at http://<ip>:<port>. The router hands that
// IP out by DHCP, so a power cut, a router restart or a replacement router can
// change it - and every tablet with the old address bookmarked breaks, showing
// a browser timeout that explains nothing.
//
// xppos.local (lib/net/mdns.ts) fixes this for devices that speak mDNS. This is
// for the ones that do not, and for anyone who simply wants the number to stop
// changing.
//
// WHAT IT DOES. It converts the address the router has ALREADY given this
// machine from a lease into a static configuration - same IP, same prefix, same
// gateway, same DNS. Keeping the current values is the whole safety argument:
// nothing about how this box is reached changes at the moment it is applied, so
// the request that triggered it survives.
//
// WHAT IT CANNOT DO. It cannot tell the router to stop handing that address to
// something else. If the address sits inside the router's DHCP pool, the router
// may lease it to a different device later and both will fight over it. The
// only complete fix is a DHCP reservation on the router, and the UI says so.
//
// SAFETY. Reconfiguring an adapter through the adapter you are talking over is
// a real way to lose a machine. So:
//   - the address is never changed, only re-declared as static
//   - the whole change is one PowerShell run with a catch that puts DHCP back
//   - the result is verified before it reports success
//   - "Use automatic again" is always available

import { NextRequest, NextResponse } from "next/server";
import { runPowerShellJson } from "@/lib/win/powershell";

export const dynamic = "force-dynamic";

interface AdapterInfo {
  interfaceIndex: number;
  adapterName: string;
  ipAddress: string;
  prefixLength: number;
  gateway: string | null;
  dns: string[];
  dhcp: boolean;
}

// The adapter that owns a default route and is Up - the one a tablet actually
// reaches this box through. Virtual adapters have no gateway and are excluded
// by that alone.
const READ_SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
$c = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
if (-not $c) { '{}'; exit 0 }
$ip = $c.IPv4Address | Select-Object -First 1
$iface = Get-NetIPInterface -InterfaceIndex $c.InterfaceIndex -AddressFamily IPv4
[pscustomobject]@{
  interfaceIndex = [int]$c.InterfaceIndex
  adapterName    = [string]$c.InterfaceAlias
  ipAddress      = [string]$ip.IPAddress
  prefixLength   = [int]$ip.PrefixLength
  gateway        = [string]($c.IPv4DefaultGateway | Select-Object -First 1).NextHop
  dns            = @($c.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses })
  dhcp           = ($iface.Dhcp -eq 'Enabled')
} | ConvertTo-Json -Compress
`;

export async function GET() {
  const info = await runPowerShellJson<AdapterInfo>(READ_SCRIPT);

  if (!info || !info.ipAddress) {
    return NextResponse.json(
      { onNetwork: false, error: "No active network adapter with a gateway was found." },
      { status: 200 },
    );
  }

  return NextResponse.json({
    onNetwork: true,
    ...info,
    // A pinned address inside the router's pool is the one failure mode this
    // cannot prevent, so the UI is told to say so rather than implying the
    // problem is solved outright.
    needsRouterReservation: !info.dhcp,
  });
}

/**
 * Pin the current address, or hand control back to the router.
 *
 * The pin script captures the live values and re-declares them as static in one
 * run. Its catch block restores DHCP: if New-NetIPAddress fails after the old
 * address was removed, the machine would otherwise be left with no address at
 * all and would need somebody standing in front of it.
 */
export async function POST(req: NextRequest) {
  let body: { action?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const action = body.action;
  if (action !== "pin" && action !== "auto") {
    return NextResponse.json({ error: 'action must be "pin" or "auto".' }, { status: 400 });
  }

  const script =
    action === "pin"
      ? `
$ErrorActionPreference = 'Stop'
try {
  $c = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
  if (-not $c) { throw 'No active network adapter with a gateway was found.' }

  $idx  = $c.InterfaceIndex
  $addr = $c.IPv4Address | Select-Object -First 1
  $ipv4 = $addr.IPAddress
  $len  = $addr.PrefixLength
  $gw   = ($c.IPv4DefaultGateway | Select-Object -First 1).NextHop
  $dns  = @($c.DNSServer | Where-Object { $_.AddressFamily -eq 2 } | ForEach-Object { $_.ServerAddresses })

  if (-not $ipv4 -or -not $gw) { throw 'This adapter has no usable address or gateway yet.' }

  # Same address, re-declared as static. Nothing about how this box is reached
  # changes, which is what lets the request that triggered this survive.
  Set-NetIPInterface -InterfaceIndex $idx -Dhcp Disabled
  Remove-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
  Remove-NetRoute -InterfaceIndex $idx -DestinationPrefix '0.0.0.0/0' -Confirm:$false -ErrorAction SilentlyContinue
  New-NetIPAddress -InterfaceIndex $idx -IPAddress $ipv4 -PrefixLength $len -DefaultGateway $gw | Out-Null
  if ($dns.Count -gt 0) { Set-DnsClientServerAddress -InterfaceIndex $idx -ServerAddresses $dns }

  # Verify rather than assume. A silent partial apply here is a box nobody can reach.
  $after = Get-NetIPAddress -InterfaceIndex $idx -AddressFamily IPv4 -ErrorAction Stop |
           Where-Object { $_.IPAddress -eq $ipv4 } | Select-Object -First 1
  if (-not $after) { throw 'The static address did not apply.' }

  [pscustomobject]@{ ok = $true; ipAddress = $ipv4; gateway = $gw } | ConvertTo-Json -Compress
} catch {
  # Put the machine back on DHCP. Being reachable on SOME address beats being
  # reachable on none.
  try {
    $i = (Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1).InterfaceIndex
    if ($i) {
      Set-NetIPInterface -InterfaceIndex $i -Dhcp Enabled -ErrorAction SilentlyContinue
      Set-DnsClientServerAddress -InterfaceIndex $i -ResetServerAddresses -ErrorAction SilentlyContinue
      & ipconfig /renew | Out-Null
    }
  } catch { }
  [pscustomobject]@{ ok = $false; error = $_.Exception.Message; revertedToAutomatic = $true } | ConvertTo-Json -Compress
}
`
      : `
$ErrorActionPreference = 'Stop'
try {
  $c = Get-NetIPConfiguration | Where-Object { $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
  if (-not $c) { throw 'No active network adapter was found.' }
  $idx = $c.InterfaceIndex
  Set-NetIPInterface -InterfaceIndex $idx -Dhcp Enabled
  Set-DnsClientServerAddress -InterfaceIndex $idx -ResetServerAddresses
  & ipconfig /renew | Out-Null
  [pscustomobject]@{ ok = $true } | ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

  // Generous timeout: releasing and renewing a lease is not instant, and a
  // timeout here would report failure on a change that actually worked.
  const result = await runPowerShellJson<{
    ok: boolean;
    error?: string;
    ipAddress?: string;
    gateway?: string;
    revertedToAutomatic?: boolean;
  }>(script, 90_000);

  if (!result) {
    return NextResponse.json(
      {
        error:
          "The network command produced no result. On a development machine this " +
          "usually means the app is not running with administrator rights - the " +
          "installed POS runs as LocalSystem and does have them.",
      },
      { status: 500 },
    );
  }

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error || "The network change failed.",
        revertedToAutomatic: result.revertedToAutomatic === true,
      },
      { status: 500 },
    );
  }

  return NextResponse.json(result);
}
