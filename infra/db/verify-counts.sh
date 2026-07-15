#!/bin/bash
# Pre/post-deployment row-count verification.
#
# Read-only. Prints row counts for the tables a deployment must never
# silently lose data from, plus the Keycloak user count. Run once BEFORE a
# deployment and once AFTER; the two outputs should match (or only grow —
# never shrink unexpectedly). This does not compare automatically — save
# both outputs and diff them yourself, since a deployment may legitimately
# add rows (e.g. a migration seeding new reference data) and a script
# guessing what "acceptable growth" looks like would be more dangerous than
# a human reading two counts.
#
# Usage (from infra/, against the running stack):
#   ./db/verify-counts.sh                    # local/dev stack
#   ./db/verify-counts.sh bpm-postgres        # explicit container name
set -euo pipefail

PG_CONTAINER="${1:-bpm-postgres}"
KC_CONTAINER="${2:-bpm-keycloak}"

echo "=== Row-count verification — $(date -u +%FT%TZ) ==="
echo "--- PostgreSQL ($PG_CONTAINER) ---"

docker exec "$PG_CONTAINER" psql -U bpm -d bpm_db -t -A -F' | ' -c "
  SELECT 'users', count(*) FROM users
  UNION ALL SELECT 'cases', count(*) FROM cases
  UNION ALL SELECT 'process_definitions', count(*) FROM process_definitions
  UNION ALL SELECT 'process_instances', count(*) FROM process_instances
  UNION ALL SELECT 'tasks', count(*) FROM tasks
  UNION ALL SELECT 'notifications', count(*) FROM notifications
  ORDER BY 1;
"

echo ""
echo "--- Keycloak realm 'bpm' users ($KC_CONTAINER) ---"
# Soft-fails on purpose: a missing credential or unreachable admin API should
# not abort the (more important) Postgres counts already printed above.
if [ -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]; then
  echo "(KEYCLOAK_ADMIN_PASSWORD not set in this shell — export it from infra/.env to include this check; skipped)"
elif ! docker exec "$KC_CONTAINER" test -x /opt/keycloak/bin/kcadm.sh 2>/dev/null; then
  echo "(kcadm.sh not found in $KC_CONTAINER — skipped)"
elif docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh config credentials \
      --server http://localhost:8080 --realm master --user admin \
      --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null 2>&1; then
  docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh get users -r bpm --fields id 2>/dev/null | grep -c '"id"' || echo "0"
else
  echo "(could not authenticate to the Keycloak admin API — check the password/reachability; this does not affect the Postgres counts above)"
fi

echo ""
echo "=== End verification ==="
echo "Save this output. Run again after deployment and compare — any count"
echo "that DECREASED unexpectedly must be investigated before declaring the"
echo "deployment successful."
