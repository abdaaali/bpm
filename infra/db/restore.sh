#!/bin/sh
# Restore a backup into a database. DESTRUCTIVE on the target.
# Usage (inside a container with psql + access to /backups):
#   ./restore.sh <backup.sql.gz> [target_db=bpm_db]
set -eu
FILE="${1:?usage: restore.sh <backup.sql.gz> [target_db]}"
TARGET="${2:-bpm_db}"
echo "Restoring ${FILE} → ${TARGET} ..."
gunzip -c "${FILE}" | psql -v ON_ERROR_STOP=1 -d "${TARGET}"
echo "Restore complete."
