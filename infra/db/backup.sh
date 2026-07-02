#!/bin/sh
# Periodic Postgres backup. Runs as the bpm-db-backup service.
set -eu
INTERVAL="${BACKUP_INTERVAL_SECONDS:-21600}"   # default 6h
KEEP="${BACKUP_KEEP:-14}"                        # retained backups
mkdir -p /backups
echo "[db-backup] started — interval=${INTERVAL}s keep=${KEEP} db=${PGDATABASE}"
while true; do
  TS=$(date +%Y%m%d_%H%M%S)
  OUT="/backups/bpm_db_${TS}.sql.gz"
  if pg_dump --no-owner --clean --if-exists "${PGDATABASE}" | gzip > "${OUT}.tmp"; then
    mv "${OUT}.tmp" "${OUT}"
    echo "[db-backup] $(date -u +%FT%TZ) wrote ${OUT} ($(du -h "${OUT}" | cut -f1))"
    # prune all but the newest ${KEEP}
    ls -1t /backups/bpm_db_*.sql.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
  else
    echo "[db-backup] $(date -u +%FT%TZ) FAILED"; rm -f "${OUT}.tmp"
  fi
  sleep "${INTERVAL}"
done
