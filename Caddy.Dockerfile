# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Caddy image for the LAN appliance, in two variants.
#
#   CADDY_VARIANT=plain   (DEFAULT) stock caddy:2 — no Go toolchain, no module
#                         downloads, builds in seconds and works on a box with
#                         no internet. This is all a LAN-by-IP deploy needs,
#                         because Caddyfile.http never touches ACME.
#
#   CADDY_VARIANT=plugin  compiles a caddy binary with a DNS-provider plugin so
#                         it can solve the ACME DNS-01 challenge and get a
#                         publicly-trusted cert for a private-IP box. Only
#                         needed when APP_DOMAIN is set. Requires internet.
#
# BuildKit only builds stages the target actually depends on, so with the
# default `plain` the plugin-builder stage below is skipped entirely — that is
# the whole point of this split. Select the variant in .env; do not edit here.
# ─────────────────────────────────────────────────────────────────────────────

# Must be declared before the first FROM to be usable in a FROM line.
ARG CADDY_VARIANT=plain

# ---- Only built when CADDY_VARIANT=plugin ----
FROM caddy:builder AS plugin-builder
ARG DNS_PLUGIN=github.com/caddy-dns/cloudflare
RUN xcaddy build --with ${DNS_PLUGIN}

# ---- Variant bases ----
FROM caddy:2 AS variant-plain

FROM caddy:2 AS variant-plugin
COPY --from=plugin-builder /usr/bin/caddy /usr/bin/caddy

# ---- Final image: whichever variant was selected ----
FROM variant-${CADDY_VARIANT} AS final
COPY caddy/Caddyfile.http /etc/caddy/Caddyfile.http
COPY caddy/Caddyfile.tls /etc/caddy/Caddyfile.tls
COPY caddy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
