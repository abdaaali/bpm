#!/bin/sh
# Periodic MinIO backup. Runs as the bpm-minio-backup service.
#
# Maintains a near-real-time mirror of the bpm-attachments bucket on a
# separate Docker volume, independent of the minio_data volume MinIO itself
# uses. This protects attachment bytes against loss/corruption of the
# primary MinIO volume — a database backup alone does NOT include these
# (attachment metadata lives in Postgres, the bytes live only in MinIO).
#
# This is a continuous mirror (mc mirror), not timestamped point-in-time
# snapshots like backup.sh's Postgres dumps — mirroring is efficient
# (incremental after the first run) and directly addresses "don't lose the
# only copy of the bytes." Point-in-time MinIO snapshots (e.g. periodic
# dated copies, or MinIO's own versioning/replication) are a documented
# future enhancement, not implemented here — see BACKUP.md.
set -eu
INTERVAL="${MINIO_BACKUP_INTERVAL_SECONDS:-21600}"   # default 6h, matches backup.sh
BUCKET="${MINIO_BUCKET:-bpm-attachments}"
mkdir -p /backups/${BUCKET}

echo "[minio-backup] started — interval=${INTERVAL}s bucket=${BUCKET}"

until mc alias set local "http://${MINIO_ENDPOINT:-minio}:${MINIO_PORT:-9000}" "${MINIO_ACCESS_KEY}" "${MINIO_SECRET_KEY}" >/dev/null 2>&1; do
  echo "[minio-backup] waiting for MinIO..."
  sleep 5
done

while true; do
  # Deliberately NOT --remove: an object deleted from the live bucket stays
  # in the backup. A backup that mirrors deletions isn't a backup against
  # accidental/malicious deletion — only --overwrite (sync new/changed
  # objects) is used, so this destination only ever grows.
  if mc mirror --overwrite local/${BUCKET} /backups/${BUCKET} > /tmp/mirror.log 2>&1; then
    echo "[minio-backup] $(date -u +%FT%TZ) mirrored ${BUCKET} ($(du -sh /backups/${BUCKET} 2>/dev/null | cut -f1))"
  else
    echo "[minio-backup] $(date -u +%FT%TZ) FAILED — see /tmp/mirror.log"; cat /tmp/mirror.log
  fi
  sleep "${INTERVAL}"
done
