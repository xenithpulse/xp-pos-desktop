# Server Management System - Complete Guide

## Overview

The **Server Management Dashboard** gives you control over your POS appliance:
the address staff connect to, backups, updates, licensing and health — without
touching the command line.

---

## Removed in Phase 15

Three tabs were deleted. Recorded here because the absence is deliberate:

- **WiFi Router (MAC whitelist)** — nothing in this repo has ever talked to a
  router. Addresses were written to MongoDB and read back by the same screen,
  while the UI claimed "devices not on the list will be blocked at the router
  level". It presented itself as access control while providing none. Real
  device access control is `POS_ALLOWED_CIDRS`, enforced by Caddy — see
  `installer/config/Caddyfile.http`.
- **Network Settings** — rate limit, max connections, session timeout and a
  never-wired "DNS integration" field, all duplicating `.env` and the Caddyfile,
  which are what actually take effect.
- **Active Connections** — a per-device session list that cannot be per-device
  on a multi-floor site: every device behind an upstairs router arrives NAT'd as
  that router's single WAN address, so the list showed one IP for a whole floor.

The MongoDB fields behind them are left in place and inert. Dropping columns
from an appliance database that upgrades in place, on sites we cannot inspect
first, buys tidiness at the price of a migration that can fail in a restaurant.

---

## Features

### 1. **Connect Devices**
Two addresses for two audiences — see `docs/handover/PHASE-15-ADDRESSING.md`.

- **QR code**, for phones and tablets. Carries the numeric LAN address, re-read
  every 30s. The number is deliberate: it is the only form that crosses a router
  to a floor on its own subnet, and scanning means nobody types it anyway.
- **`pos.xenithpulse.local`**, for the till itself. Backed by a hosts entry
  (`lib/net/localName.ts`) pointing at loopback, so it never changes, works with
  the network unplugged, and is what the desktop shortcut opens.
- **Reachability check**: probes the name from the device you are holding rather
  than claiming it works everywhere.
- **Pin the IP**: converts the current DHCP lease into a static configuration,
  and tells you to add a router DHCP reservation as well.

### 2. **Backup Management**
- **Multiple Backup Paths**: Configure local, external, and network storage
- **Retention Policies**: Set custom retention periods per path (1-365 days)
- **Manual Backups**: Trigger backups immediately without waiting for schedule
- **Status Tracking**: See storage usage and last backup time for each path
- **Backup History**: View and manage existing backups

### 4. **System Health Monitoring**
- **Status Dashboard**: Overall system health (healthy/warning/critical)
- **Health Checks**: Manual health check button with detailed results
- **Database Monitoring**: Connection status and latency
- **Disk Usage**: Real-time disk space monitoring with threshold alerts
- **Memory Usage**: Available memory tracking
- **Port Status**: Check key ports are accessible

> ⚠️ The "Security" block on this tab displays `requireHttps`,
> `enableRateLimiting`, `rateLimitPerMinute` and `enableAuditLog`. **Nothing
> enforces any of them** — no middleware reads those fields. They are the same
> class of problem as the removed MAC whitelist and should either be wired up or
> deleted; they were left alone in Phase 15 only because the tab was out of
> scope.

### 5. **Updates, Licence, Diagnostics**
See `docs/handover/PHASE-10-REMOTE-UPDATE.md` and
`docs/handover/PHASE-11-LICENSING.md`. Diagnostics also reports the permanent
address and what it currently points at, which is the first thing to check on a
"staff cannot reach the POS" call.

---

## Architecture

### Database Schema
```typescript
IServerConfig {
  // Backup Management
  backupPaths: IBackupPath[]
  backupEnabled: boolean
  backupHour: number
  backupRetentionDays: number

  // Health thresholds
  diskUsageThresholdPercent: number

  // Inert since Phase 15 — kept so existing documents load unchanged.
  // Nothing reads or writes these; see "Removed in Phase 15" above.
  routerEnabled, routerMacWhitelist, routerBlockUnknownDevices,
  allowedNetworks, maxConcurrentConnections, sessionTimeoutMinutes,
  trackConnections, activeConnections
}
```

### API Endpoints

#### Server Config (Main)
- `GET /api/admin/server-config` - Fetch full configuration (plus `serverUrl`
  and `localNameUrl`, both derived at request time)
- `PUT /api/admin/server-config` - Update configuration

#### Backup Management
- `POST /api/admin/server-config/backups` - Add backup path
- `PATCH /api/admin/server-config/backups` - Update backup path
- `DELETE /api/admin/server-config/backups` - Remove backup path

#### Addresses
- `GET /api/system/connect` - Every address that reaches this POS, plus the
  permanent-name status. Read live, never cached.
- `GET`/`POST /api/system/network` - Read the adapter; pin the IP or hand it
  back to DHCP.
- `GET /api/system/ping` - Reachability probe. The only CORS-open endpoint;
  keep its response body empty.

#### System Health
- `GET /api/admin/server-config/health` - Get health status
- `POST /api/admin/server-config/health` - Trigger health check

---

## Usage Scenarios

### Scenario 1: Restricting Access to Known Devices Only

1. Open **Server Management → WiFi Router**
2. Enable "Block Unknown Devices"
3. Add each trusted device's MAC address:
   - John's Laptop: `00:1A:2B:3C:4D:5E`
   - Manager's Tablet: `AA:BB:CC:DD:EE:FF`
   - etc.
4. Devices not on the list will be blocked at the router level

### Scenario 2: Temporary Device Block

1. Go to **WiFi Router** tab
2. Find the device in the list
3. Click the status icon to toggle from ✅ (active) to ❌ (blocked)
4. The device is immediately disconnected and cannot reconnect

### Scenario 3: Multi-Location Backup Strategy

1. **Active Backup Path** (local daily): `/backups` (retention: 14 days)
2. **External USB Drive**: `/mnt/external-ssd` (retention: 30 days)
3. **Network NAS**: `\\nas-server\backups` (retention: 90 days)

Schedule: Visit the dashboard monthly to manually copy backups to external storage.

### Scenario 4: Session Timeout Enforcement

1. Go to **Network Settings**
2. Set **Session Timeout** to 480 minutes (8 hours)
3. Any user inactive for 8 hours is automatically logged out
4. Prevents security issues if a device is left unattended

### Scenario 5: Rate Limiting for Security

1. Open **Network Settings**
2. Set **Rate Limit** to 60 requests/minute per IP
3. Attackers attempting to brute-force logins are throttled
4. Prevents credential-stuffing attacks without requiring Redis

---

## Configuration Management

### Updating Settings

All changes are **persisted to MongoDB** immediately. No rebuild required.

```bash
# Changes take effect immediately
# Example: Update backup hour from 2 AM to 3 AM
# 1. Open dashboard
# 2. Go to Backups tab
# 3. Edit "Daily Backup Time" to 3:00
# 4. Click Save
# 5. New backups will run at 3 AM starting tomorrow
```

### Default Values

```
maxConcurrentConnections: 100
sessionTimeoutMinutes: 480 (8 hours)
rateLimitPerMinute: 60
backupRetentionDays: 14
diskUsageThresholdPercent: 80
auditLogRetentionDays: 90
```

---

## Security Best Practices

1. **MAC Whitelist Usage**
   - Best for small teams (< 20 devices)
   - Add all trusted devices once
   - Review quarterly for old/unused devices

2. **Session Timeouts**
   - Set 8 hours (480 min) for office use
   - Set 30 minutes (30 min) for shared terminals
   - Match your security policy

3. **Rate Limiting**
   - Default 60 req/min is safe for normal use
   - Reduce to 30 req/min for critical deployments
   - Monitor for false positives

4. **Backups**
   - ✅ Local backups (redundancy)
   - ✅ External USB/SSD (disaster recovery)
   - ✅ Offsite weekly copies
   - ❌ Never rely on backups alone—test restores monthly

5. **Monitoring**
   - Check System Health monthly
   - Review active connections daily
   - Watch disk usage (alert at 80%)
   - Rotate audit logs after 90 days

---

## Integration with .env

The Server Management dashboard **does NOT replace .env configuration**. Instead, it **complements** it:

| Setting | Configured Via | Scope |
|---------|---|---|
| `NEXTAUTH_URL` | `.env` | Server startup |
| `BACKUP_HOUR` | `.env` + Dashboard | Toggle on/off in dashboard |
| `TENANT_DB` | `.env` | Immutable at deploy |
| Device Whitelist | **Dashboard** | Runtime changes, no rebuild |
| Session Timeout | **Dashboard** | Runtime changes, no rebuild |
| Rate Limiting | **Dashboard** | Runtime changes, no rebuild |

---

## Troubleshooting

### "Cannot access dashboard"
- Verify you're logged in as `super_admin`
- Check URL: `/server-management`
- Clear browser cache

### "Device whitelist not working"
- Verify `routerEnabled: true` in dashboard
- Check device MAC address is correct (case-insensitive)
- Ensure device status is `active` (not `blocked`)

### "Backup path not saving"
- Verify the path exists and is writable by the services (they run as LocalSystem)
- Check disk space available
- Use a full Windows path (`C:\backups`) or a UNC share (`\\server\share`).
  A mapped drive letter belonging to a logged-in user is NOT visible to a
  Windows service.

### "Health check fails"
- Database might be temporarily down; refresh
- Disk might be full (> 80% usage)
- Memory might be low; check server load

---

## API Examples

### Add Device to Whitelist
```bash
curl -X POST http://localhost:3000/api/admin/server-config/router \
  -H "Content-Type: application/json" \
  -d '{
    "macAddress": "00:1A:2B:3C:4D:5E",
    "deviceName": "Sales Manager Laptop",
    "deviceType": "laptop",
    "notes": "John@company.com - Office"
  }'
```

### Get Active Connections
```bash
curl http://localhost:3000/api/admin/server-config/connections
```

### Update Backup Retention
```bash
curl -X PATCH http://localhost:3000/api/admin/server-config/backups \
  -H "Content-Type: application/json" \
  -d '{
    "path": "/backups",
    "backupRetention": 30
  }'
```

### Trigger Health Check
```bash
curl -X POST http://localhost:3000/api/admin/server-config/health
```

---

## Future Enhancements

Planned additions:
- [ ] VPN configuration (WireGuard/OpenVPN)
- [ ] Email alerts for system warnings
- [ ] SNMP monitoring integration
- [ ] Grafana metrics dashboard
- [ ] Automated network diagnostics
- [ ] Device geolocation tracking
- [ ] Two-factor authentication (2FA)
- [ ] IP-based access control rules

---

## Support

For issues or questions:
1. Check System Health diagnostics
2. Review audit logs
3. Consult the main [DEPLOYMENT_AND_CONFIG_GUIDE.md](../../DEPLOYMENT_AND_CONFIG_GUIDE.md)
4. Restart the app service:
   `& "C:\Program Files\XP POS\scripts\services.ps1" -Action Restart -Service XPPOS-App`

---

**Access Dashboard:** Navigate to `http://<server-ip>/server-management` as a super_admin user.
