# Phase 15 — How anyone finds the POS

## The two questions, which are not the same question

They were being answered as if they were, and that is what made this confusing.

1. **"How does the owner open the POS on the till itself?"** — one machine, every
   day, forever. Needs an address a human can learn.
2. **"How does a waiter open the POS on a tablet, on the second floor?"** — many
   devices, many subnets. Needs an address that *routes*.

One address cannot be good at both. So there are two, and the UI says which is
which.

## What was measured

Live site, ground floor `192.168.0.101`, second floor `192.168.1.101` behind its
own router:

| Address | On the till | Same subnet | Floor behind its own router |
|---|---|---|---|
| `http://192.168.0.101:8090` | works | works | **works** — NAT is directional, the POS is upstream |
| `http://pos.xenithpulse.local:8090` | **works** (hosts file) | usually (mDNS) | **fails** — 224.0.0.251, TTL 1 |
| `http://<machine-name>:8090` | works | usually | fails — NetBIOS/LLMNR are broadcast-scoped |

Nothing on the box blocks the cross-subnet case: Caddy binds `:{$POS_HTTP_PORT}`
on all interfaces, the firewall rule is `-Profile Any` with no `-RemoteAddress`
scope, and `POS_ALLOWED_CIDRS` defaults to allow-all. The only thing that failed
across a router was *discovery*, because every name we had was link-local.

## Answer 1 — the till: `pos.xenithpulse.local`

A fenced block in `%SystemRoot%\System32\drivers\etc\hosts`:

```
# >>> XP POS (managed - do not edit this block) >>>
127.0.0.1	pos.xenithpulse.local
# <<< XP POS (managed) <<<
```

**Loopback, not the LAN IP.** Caddy binds every interface including loopback, so
the POS answers there — and pointing it at the LAN address would put us straight
back into rewriting it every time DHCP moves, which is the problem the name
exists to end. As loopback it is correct forever, works with the cable out, and
works before the network comes up at boot.

**Written in three places, on purpose.** `provision.ps1` at install;
`connect-card.ps1` on every watchdog tick that notices an address change; and
`lib/net/localName.ts` on every app start. The one address the owner is told to
use must not be the one that breaks, and the realistic failure — an antivirus
product or a Windows repair stripping the hosts file — is completely silent.
Each writer is idempotent and only writes when the content is actually wrong, so
a needless hosts write never happens on a healthy box.

The desktop shortcut and the Start-menu shortcut now point at this name rather
than at `127.0.0.1`. Same guarantees, but readable and retypable.

`Diagnostics` reports `localName.installed`. `false` means the self-repair is
itself failing, which in practice means the app is not running elevated.

## Answer 2 — every other device: the QR code

`Server Management → Connect Devices` shows a QR carrying
`http://<lan-ip>:<port>`, re-read every 30 seconds so it follows a DHCP change
with nobody reloading the page.

**The QR carries the number, always.** This is the one decision on that screen
worth being stubborn about, and it reverses an earlier attempt to print a name
instead. The numeric address is the only form that reaches every device: it is
what crosses a router to a floor on its own subnet, and it is what works on an
Android too old to speak mDNS. A number a waiter never types is not a usability
problem — scanning is what removes the typing, so the address only has to be
*right*.

## What was tried and rejected

**Per-site public DNS records** (`<site>.pos.xenithpulse.com` → `192.168.0.101`,
re-registered by an agent on the box). It genuinely solves the cross-subnet case
— public DNS is resolved by unicast, so it works on every floor. It was dropped
because it hardcodes something per client: it needs XenithPulse to run and keep
running a registration service, needs onboarding per customer, needs the site to
have working internet, and a minority of routers block private IPs in public DNS
answers as rebinding protection anyway. The QR code solves the same problem with
no infrastructure and no per-site state.

**A DNS server on the box.** Makes the POS a single point of failure for the
whole building's browsing, and needs every router's DHCP reconfigured by hand.

## mDNS is now a bonus, not the plan

`lib/net/mdns.ts` answers for **two** names:

- `pos.xenithpulse.local` — the branded one, so a same-subnet tablet resolves the
  same string the till uses.
- `xppos.local` — kept because a single-label `.local` name is the most broadly
  supported form of mDNS, and because sites installed before this have it on
  their printed cards.

The responder answers using the name that was **asked for** — a response naming
`xppos.local` does not satisfy a question about `pos.xenithpulse.local`, however
identical the address behind it.

Nothing depends on mDNS any more. The till has the hosts file; everything else
has the QR code.

## Test plan

1. **Till, network up.** Open the desktop shortcut. Expect
   `pos.xenithpulse.local:8090` to load.
2. **Till, network down.** Unplug the cable, reboot, open the shortcut. Expect it
   to still load — this is what loopback buys.
3. **Hosts file vandalised.** Delete the managed block, restart `XPPOS-App`.
   Expect `[localname] pos.xenithpulse.local -> 127.0.0.1` in the app log and the
   block restored.
4. **Cross subnet.** Scan the QR from a tablet on a floor behind its own router.
   Expect it to load. This is the case the whole rework exists for.
5. **DHCP change.** Move the box's IP. Within one watchdog tick expect the card,
   the shortcut and the QR to agree on the new address, and the hosts entry to be
   *unchanged* — it is loopback and must never need rewriting.
6. **Connect Devices on a tablet.** Expect the "On this computer" panel to say
   the name did not open on this device, and to point at the QR — not to claim
   the name works everywhere.
