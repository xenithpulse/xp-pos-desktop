#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Nightly MongoDB backup for the offline appliance.
#
# Runs inside the `backup` service (mongo:7 image, which ships mongodump). Each
# night at BACKUP_HOUR it writes a gzipped archive of the whole database to the
# `backups` volume, then prunes archives older than RETENTION_DAYS.
#
# Env:
#   MONGODB_URI     connection string (default mongodb://mongo:27017)
#   BACKUP_HOUR     hour of day (0–23) to run the dump (default 2 = 02:00)
#   RETENTION_DAYS  delete archives older than this many days (default 14)
#
# Restore (see README for full procedure):
#   docker compose cp ./backups/erp-YYYY-MM-DD-HHMMSS.gz mongo:/tmp/restore.gz
#   docker compose exec mongo mongorestore --gzip --archive=/tmp/restore.gz --drop
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

MONGODB_URI="${MONGODB_URI:-mongodb://mongo:27017}"
BACKUP_HOUR="${BACKUP_HOUR:-2}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_DIR="/backups"

mkdir -p "$BACKUP_DIR"

run_backup() {
  local ts archive
  ts="$(date +%F-%H%M%S)"
  archive="$BACKUP_DIR/erp-$ts.gz"
  echo "[backup] $(date -Is) starting dump → $archive"
  if mongodump --uri="$MONGODB_URI" --gzip --archive="$archive"; then
    echo "[backup] $(date -Is) dump complete ($(du -h "$archive" | cut -f1))"
  else
    echo "[backup] $(date -Is) ERROR: mongodump failed" >&2
    rm -f "$archive"
    return 1
  fi
  # Retention: prune old archives.
  find "$BACKUP_DIR" -name 'erp-*.gz' -type f -mtime "+$RETENTION_DAYS" -print -delete
}

# Seconds until the next BACKUP_HOUR:00:00.
seconds_until_next_run() {
  local now target
  now="$(date +%s)"
  target="$(date -d "today ${BACKUP_HOUR}:00:00" +%s)"
  if [ "$target" -le "$now" ]; then
    target="$(date -d "tomorrow ${BACKUP_HOUR}:00:00" +%s)"
  fi
  echo $((target - now))
}

echo "[backup] service started — nightly dump at ${BACKUP_HOUR}:00, retention ${RETENTION_DAYS}d"
while true; do
  sleep_for="$(seconds_until_next_run)"
  echo "[backup] sleeping ${sleep_for}s until next run"
  sleep "$sleep_for"
  run_backup || true
done
