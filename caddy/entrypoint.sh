#!/bin/sh
# Pick the Caddy config at startup based on whether a custom domain is set.
#   APP_DOMAIN set   → trusted-HTTPS mode (Let's Encrypt via DNS-01)
#   APP_DOMAIN unset → plain HTTP on :80 (default, LAN-by-IP)
set -e

if [ -n "$APP_DOMAIN" ]; then
	# HTTPS mode needs the DNS-provider plugin compiled in (CADDY_VARIANT=plugin).
	# The default `plain` image does not have it, and the resulting failure is an
	# opaque "unknown directive" from the config adapter — so check up front.
	if ! caddy list-modules 2>/dev/null | grep -q '^dns\.providers\.'; then
		echo "[caddy] FATAL: APP_DOMAIN=${APP_DOMAIN} needs a DNS-provider plugin," >&2
		echo "[caddy]        but this image was built with CADDY_VARIANT=plain." >&2
		echo "[caddy]        Fix: set CADDY_VARIANT=plugin in .env, then run" >&2
		echo "[caddy]        docker compose up -d --build caddy" >&2
		echo "[caddy]        (Or leave APP_DOMAIN empty for normal LAN-by-IP use.)" >&2
		exit 1
	fi
	echo "[caddy] HTTPS mode for ${APP_DOMAIN} (Let's Encrypt DNS-01)"
	exec caddy run --config /etc/caddy/Caddyfile.tls --adapter caddyfile
else
	echo "[caddy] HTTP mode on :80 (no APP_DOMAIN set)"
	exec caddy run --config /etc/caddy/Caddyfile.http --adapter caddyfile
fi
