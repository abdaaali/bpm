#!/bin/bash
set -e

echo "Running BPM database initialization..."

# Run migrations in order (schema + reference data).
for f in /docker-entrypoint-initdb.d/migrations/*.sql; do
  echo "Applying migration: $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done

if [ "${APP_ENV:-}" = "production" ]; then
  # PRODUCTION: real tenant data only — never the demo-flavored core seed or
  # demo fixtures. This branch never iterates seeds/ or seeds-demo/ regardless
  # of what's mounted (the base compose file always mounts seeds/ — Compose
  # can't conditionally exclude a bind mount per env var — so its presence
  # alone isn't an error; only actually loading it would be, and this branch
  # structurally can't). The one real misconfiguration worth failing loudly on
  # is LOAD_DEMO_SEEDS=true set alongside APP_ENV=production.
  if [ "${LOAD_DEMO_SEEDS:-false}" = "true" ]; then
    echo "FATAL: APP_ENV=production but LOAD_DEMO_SEEDS=true — refusing to start." \
         "Unset LOAD_DEMO_SEEDS (or set it to false) for production." >&2
    exit 1
  fi
  for f in /docker-entrypoint-initdb.d/seeds-production/*.sql; do
    [ -e "$f" ] || continue
    echo "Applying production seed: $f"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
  done
  echo "APP_ENV=production — production seed applied. Run provision-users.mjs" \
       "separately once services are up (see infra/db/seeds-production/provision-users.mjs)."
else
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
fi

echo "BPM database initialization complete."
