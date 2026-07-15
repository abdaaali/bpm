# Database & Object-Storage Backup Runbook

## Backups (automated)

### PostgreSQL — `bpm-db-backup`
Runs `pg_dump` on a schedule and keeps a rolling window, **for both Postgres
databases** on the instance:

- **What:** full logical dump of `bpm_db` (always present) **and** the
  Keycloak Postgres store (`$KC_DB_NAME`, default `keycloak` — only present
  when the production overlay's Keycloak-on-Postgres store is in use; local
  dev Keycloak runs in `dev-file` mode with no separate database, and the
  script detects this and skips it without failing). Each gzipped,
  `--clean --if-exists --no-owner`.
- **Where:** the `db_backups` Docker volume, files `bpm_db_YYYYMMDD_HHMMSS.sql.gz`
  and `<KC_DB_NAME>_YYYYMMDD_HHMMSS.sql.gz`.
- **Cadence / retention:** `BACKUP_INTERVAL_SECONDS` (default 21600 = 6h),
  `BACKUP_KEEP` (default 14) — retention is tracked independently per database.
- **Logs:** `docker logs bpm-db-backup`.
- **Script:** `infra/db/backup.sh`.

### MinIO attachments — `bpm-minio-backup`
A Postgres backup does **not** include attachment bytes (only their metadata
row lives in Postgres) — the `minio-backup` service mirrors the
`bpm-attachments` bucket to a separate volume, independent of `minio_data`,
so losing/corrupting the primary MinIO volume doesn't also lose every
attachment ever uploaded.

- **What:** `mc mirror --overwrite` (no `--remove`, deliberately — an object
  deleted from the live bucket stays in the backup; this backup only grows).
  This is a continuous near-real-time mirror, not timestamped snapshots —
  point-in-time MinIO restore (e.g. dated snapshot directories, or MinIO's
  own object versioning/replication) is a documented future enhancement, not
  implemented here.
- **Where:** the `minio_backups` Docker volume.
- **Cadence:** `MINIO_BACKUP_INTERVAL_SECONDS` (default 21600 = 6h).
- **Logs:** `docker logs bpm-minio-backup`.
- **Script:** `infra/db/minio-backup.sh`.

> **Production:** copy `db_backups` **and** `minio_backups` **offsite**
> (object storage / different host) — a backup on the same host is not
> disaster recovery. Add an `aws s3 sync` / `rclone` step or mount the
> volumes to a synced path. Define and validate **RPO/RTO**. A pre-deployment
> backup of both volumes, verified restorable and copied offsite, is a
> required gate before any production deployment — see `docs/DEPLOY.md`.

### List backups
```bash
# Postgres — replace "infra_" with the actual Compose project name in use on
# the target host if it differs (verify with `docker volume ls`, don't assume).
docker run --rm -v infra_db_backups:/b alpine ls -lht /b | head
# MinIO
docker run --rm -v infra_minio_backups:/b alpine du -sh /b
```

## Restore (manual, DESTRUCTIVE on the target)
Restore the latest backup into a **scratch** DB first and validate before touching `bpm_db`
or the Keycloak database. The same pattern applies to the `$KC_DB_NAME`
backups (`<KC_DB_NAME>_YYYYMMDD_HHMMSS.sql.gz`) — swap the filename prefix
and target database name; never restore either database over a live one
without first validating in a scratch database, and never run any of this
against production without an explicit, reviewed go-ahead.

```bash
# 1. Pick a backup file (in the db_backups volume, mounted at /backups in bpm-db-backup)
docker exec bpm-db-backup sh -c 'ls -1t /backups/*.sql.gz | head'

# 2. Restore into a scratch DB and sanity-check
docker exec bpm-postgres createdb -U bpm bpm_restore_check
docker exec bpm-db-backup sh -c 'gunzip -c /backups/<FILE>.sql.gz | psql -h postgres -U bpm -d bpm_restore_check'
docker exec bpm-postgres psql -U bpm -d bpm_restore_check -c "SELECT count(*) FROM cases;"
docker exec bpm-postgres dropdb -U bpm bpm_restore_check

# 3. Real restore into bpm_db (only after stopping the app services)
#    cd infra && docker compose stop <app services>
docker exec bpm-db-backup sh -c 'gunzip -c /backups/<FILE>.sql.gz | psql -h postgres -U bpm -d bpm_db'
#    docker compose start <app services>
```

`PGPASSWORD` is injected into `bpm-db-backup` from `.env`; the helper `db/restore.sh` wraps step 2/3.

### MinIO restore
The `minio_backups` volume holds a plain file-per-object mirror (not an
archive format) — restore by mirroring it back into the bucket:
```bash
# Validate first: list what's in the backup without touching the live bucket
docker run --rm -v infra_minio_backups:/b alpine find /b -maxdepth 2
# Restore (only after confirming with the project owner — this writes into
# the live bucket; use --dry-run first to see exactly what would change)
docker exec bpm-minio-backup mc mirror --overwrite --dry-run /backups/bpm-attachments local/bpm-attachments
docker exec bpm-minio-backup mc mirror --overwrite /backups/bpm-attachments local/bpm-attachments
```

## Test cadence
Run the scratch-restore validation (step 2) on a schedule (e.g. weekly) — **an untested backup is not a backup.** This applies equally to `bpm_db`, the Keycloak database, and the MinIO mirror.
