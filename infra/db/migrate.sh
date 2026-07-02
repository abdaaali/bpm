#!/bin/sh
# Controlled, ordered, idempotent DB migration runner.
# Replaces ad-hoc `psql -f` and init-only mounts. Tracks applied migrations in
# schema_migrations and applies each pending file once, in a transaction.
#
# Commands:
#   up        (default) apply all pending migrations in filename order
#   status    list applied vs pending
#   baseline  mark ALL present files as applied WITHOUT running them
#             (use once when adopting this runner on an already-migrated DB)
set -eu

MIG_DIR="${MIG_DIR:-/migrations}"
PSQL="psql -v ON_ERROR_STOP=1 -h ${PGHOST:-postgres} -U ${PGUSER:-bpm} -d ${PGDATABASE:-bpm_db}"

$PSQL -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());" >/dev/null

is_applied() { $PSQL -tAc "SELECT 1 FROM schema_migrations WHERE version='$1'" | grep -q 1; }

cmd="${1:-up}"
case "$cmd" in
  baseline)
    n=0
    for f in "$MIG_DIR"/*.sql; do
      v=$(basename "$f")
      $PSQL -c "INSERT INTO schema_migrations(version) VALUES ('$v') ON CONFLICT DO NOTHING;" >/dev/null
      n=$((n+1))
    done
    echo "baselined ${n} migration(s) as applied (not executed)"
    ;;
  status)
    echo "── applied ──"; $PSQL -tAc "SELECT version FROM schema_migrations ORDER BY version;" | sed 's/^/  ✓ /'
    echo "── pending ──"
    for f in "$MIG_DIR"/*.sql; do v=$(basename "$f"); is_applied "$v" || echo "  • $v"; done
    ;;
  up|"")
    # Adopt a DB that was already initialized by postgres initdb (which runs the
    # bundled migrations on an empty volume): if the ledger is empty but the core
    # schema exists, baseline the current files instead of re-applying them.
    if [ "$($PSQL -tAc 'SELECT count(*) FROM schema_migrations')" = "0" ] \
       && [ "$($PSQL -tAc "SELECT to_regclass('public.cases') IS NOT NULL")" = "t" ]; then
      echo "existing schema with empty ledger → baselining current migrations"
      for f in "$MIG_DIR"/*.sql; do
        $PSQL -c "INSERT INTO schema_migrations(version) VALUES ('$(basename "$f")') ON CONFLICT DO NOTHING;" >/dev/null
      done
    fi
    applied=0
    for f in "$MIG_DIR"/*.sql; do
      v=$(basename "$f")
      if is_applied "$v"; then continue; fi
      echo "applying ${v} ..."
      $PSQL -1 -f "$f"
      $PSQL -c "INSERT INTO schema_migrations(version) VALUES ('$v');" >/dev/null
      echo "  ✓ ${v}"
      applied=$((applied+1))
    done
    echo "migrations up to date (${applied} applied this run)"
    ;;
  *) echo "usage: migrate.sh [up|status|baseline]"; exit 1 ;;
esac
