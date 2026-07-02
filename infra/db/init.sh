#!/bin/bash
set -e

echo "Running BPM database initialization..."

# Run migrations in order (schema + reference data).
for f in /docker-entrypoint-initdb.d/migrations/*.sql; do
  echo "Applying migration: $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

# Run CORE seeds (reference config + platform admin) — always.
for f in /docker-entrypoint-initdb.d/seeds/*.sql; do
  echo "Applying core seed: $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

# Run DEMO seeds (demo users, sample cases/alarms/contractors) — only when
# LOAD_DEMO_SEEDS=true. PRODUCTION must leave this false/unset to ship a clean DB.
if [ "${LOAD_DEMO_SEEDS:-false}" = "true" ]; then
  echo "LOAD_DEMO_SEEDS=true — loading demo data."
  for f in /docker-entrypoint-initdb.d/seeds-demo/*.sql; do
    [ -e "$f" ] || continue
    echo "Applying demo seed: $f"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
  done
else
  echo "LOAD_DEMO_SEEDS not 'true' — skipping demo data (production-clean DB)."
fi

echo "BPM database initialization complete."
