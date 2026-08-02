# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage build for the xp-erp-banquet Next.js app, packaged for the
# offline LAN appliance. We use Debian "slim" (glibc) rather than Alpine (musl)
# so the native `bcrypt` addon's prebuilt binary works without a rebuild.
#
# NEXT_PUBLIC_* values are inlined into the CLIENT bundle at build time, so they
# must be supplied as build args (docker compose passes them from .env). All
# other (server-only) env vars are read at RUNTIME and are injected by compose.
# ─────────────────────────────────────────────────────────────────────────────

# ---- deps: install node_modules ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile the Next.js app ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Client-inlined public config (baked into the browser bundle).
ARG NEXT_PUBLIC_PUSHER_KEY=""
ARG NEXT_PUBLIC_PUSHER_HOST=""
ARG NEXT_PUBLIC_PUSHER_PORT="6001"
ARG NEXT_PUBLIC_PUSHER_CLUSTER=""
ARG NEXT_PUBLIC_BASE_URL=""
ARG NEXT_PUBLIC_HALL_CHARGES_NAME="Hall Charges"
ENV NEXT_PUBLIC_PUSHER_KEY=$NEXT_PUBLIC_PUSHER_KEY \
    NEXT_PUBLIC_PUSHER_HOST=$NEXT_PUBLIC_PUSHER_HOST \
    NEXT_PUBLIC_PUSHER_PORT=$NEXT_PUBLIC_PUSHER_PORT \
    NEXT_PUBLIC_PUSHER_CLUSTER=$NEXT_PUBLIC_PUSHER_CLUSTER \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_HALL_CHARGES_NAME=$NEXT_PUBLIC_HALL_CHARGES_NAME

# Placeholder server-only vars so module-load checks (lib/mongoose.ts) pass
# during the build. Real values are supplied at RUNTIME by docker compose and
# are NOT baked into the image.
ENV MONGODB_URI="mongodb://placeholder:27017" \
    TENANT_DB="placeholder" \
    SECRET="placeholder-build-secret" \
    NEXTAUTH_SECRET="placeholder-build-secret"

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: minimal runtime image ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/pos_uploads

# Pre-create the upload directory owned by `node`. This path MUST match the
# volume mount and UPLOAD_DIR in docker-compose.yml (pos_uploads:/data/pos_uploads):
# a fresh named volume inherits the mount point's ownership from the image, so
# without this the non-root runtime can't write uploads (EACCES).
RUN mkdir -p /data/pos_uploads && chown -R node:node /data

# Standalone output bundles only the files needed to run the server.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
