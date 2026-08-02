# Tiny dnsmasq image for the appliance's local DNS. Resolves APP_DOMAIN to the
# box's current LAN IP and forwards all other queries upstream. Built from
# alpine so it rebuilds offline and depends on no third-party image.
FROM alpine:3.20
RUN apk add --no-cache dnsmasq
COPY dns/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
