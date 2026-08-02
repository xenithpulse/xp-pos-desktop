#!/bin/sh
# Local DNS for the appliance.
#
# `interface-name` makes dnsmasq answer APP_DOMAIN with the CURRENT primary
# address of LAN_INTERFACE, and update automatically when that address changes
# (new DHCP lease, router swap). That is the "IP-follow agent": the hostname
# always resolves to wherever the box currently is, with no manual edits.
#
# All other queries are forwarded to the upstream resolvers so normal internet
# DNS keeps working for clients that use this box as their DNS server.
#
# Requires host networking + NET_ADMIN (see docker-compose.yml, profile "dns").
set -e

: "${APP_DOMAIN:?APP_DOMAIN is required for the dnsmasq service}"
LAN_INTERFACE="${LAN_INTERFACE:-eth0}"
UPSTREAM1="${DNS_UPSTREAM1:-1.1.1.1}"
UPSTREAM2="${DNS_UPSTREAM2:-8.8.8.8}"

cat > /etc/dnsmasq.conf <<EOF
# Auto-follow the box's IP on ${LAN_INTERFACE} for ${APP_DOMAIN}
interface-name=${APP_DOMAIN},${LAN_INTERFACE}

# Forward everything else upstream
no-resolv
server=${UPSTREAM1}
server=${UPSTREAM2}

# Listen on all interfaces; cache a bit
cache-size=1000
log-queries
EOF

echo "[dnsmasq] serving ${APP_DOMAIN} -> current IP of ${LAN_INTERFACE}; upstream ${UPSTREAM1}, ${UPSTREAM2}"
exec dnsmasq --keep-in-foreground --conf-file=/etc/dnsmasq.conf
