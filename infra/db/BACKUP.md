# Database Backup & Restore Runbook

## Backups (automated)
The `bpm-db-backup` service runs `pg_dump` on a schedule and keeps a rolling window.

- **What:** full logical dump of `bpm_db`, gzipped, `--clean --if-exists --no-owner`.
- **Where:** the `db_backups` Docker volume, files `bpm_db_YYYYMMDD_HHMMSS.sql.gz`.
- **Cadence / retention:** `BACKUP_INTERVAL_SECONDS` (default 21600 = 6h), `BACKUP_KEEP` (default 14).
- **Logs:** `docker logs bpm-db-backup`.

> **Production:** copy `db_backups` **offsite** (object storage / different host) — a backup on the same host is not disaster recovery. Add an `aws s3 sync` / `rclone` step or mount the volume to a synced path. Define and validate **RPO/RTO**.

### List backups
```bash
docker run --rm -v infra_db_backups:/b alpine ls -lht /b | head
```

## Restore (manual, DESTRUCTIVE on the target)
Restore the latest backup into a **scratch** DB first and validate before touching `bpm_db`.

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

## Test cadence
Run the scratch-restore validation (step 2) on a schedule (e.g. weekly) — **an untested backup is not a backup.**
