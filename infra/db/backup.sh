#!/bin/sh
# Periodic Postgres backup. Runs as the bpm-db-backup service.
#
# Backs up TWO logical databases on the same Postgres instance:
#   - bpm_db    (the application database — always present)
#   - $KC_DB_NAME (default "keycloak" — only present when the production
#                  overlay's Keycloak-on-Postgres store is in use; local/dev
#                  Keycloak runs KC_DB=dev-file with no separate database at
#                  all, so this is skipped gracefully rather than erroring
#                  the whole backup cycle when it doesn't exist).
set -eu
INTERVAL="${BACKUP_INTERVAL_SECONDS:-21600}"   # default 6h
KEEP="${BACKUP_KEEP:-14}"                        # retained backups per database
KC_DB="${KC_DB_NAME:-keycloak}"
mkdir -p /backups
echo "[db-backup] started — interval=${INTERVAL}s keep=${KEEP} db=${PGDATABASE} kc_db=${KC_DB}"

dump_one() {
  DB="$1"
  PREFIX="$2"
  TS=$(date +%Y%m%d_%H%M%S)
  OUT="/backups/${PREFIX}_${TS}.sql.gz"
  if pg_dump --no-owner --clean --if-exists "${DB}" | gzip > "${OUT}.tmp"; then
    mv "${OUT}.tmp" "${OUT}"
    echo "[db-backup] $(date -u +%FT%TZ) wrote ${OUT} ($(du -h "${OUT}" | cut -f1))"
    # prune all but the newest ${KEEP} for this database's own prefix only —
    # each database's retention window is independent.
    ls -1t "/backups/${PREFIX}_"*.sql.gz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
  else
    echo "[db-backup] $(date -u +%FT%TZ) FAILED for ${DB}"; rm -f "${OUT}.tmp"
    return 1
  fi
}

while true; do
  dump_one "${PGDATABASE}" "bpm_db" || true

  # Only attempt the Keycloak database if it actually exists on this instance
  # — absent in local/dev (dev-file mode), present in the production overlay.
  if psql -tAc "SELECT 1 FROM pg_database WHERE datname='${KC_DB}'" | grep -q 1; then
    dump_one "${KC_DB}" "${KC_DB}" || true
  else
    echo "[db-backup] $(date -u +%FT%TZ) database '${KC_DB}' not present — skipping (expected in local/dev)"
  fi

  sleep "${INTERVAL}"
done
