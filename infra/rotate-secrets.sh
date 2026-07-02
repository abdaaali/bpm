#!/usr/bin/env bash
# Generate strong replacement secrets for production go-live (Phase 0.4).
#
# This SCRIPT ONLY GENERATES values into infra/.env.rotated — it does NOT mutate
# running systems. Review it, then apply during a maintenance window (see the
# follow-up checklist it prints). Stateful secrets (DB / Keycloak / MinIO) must
# be rotated IN the datastore too, not just in .env — see notes below.
#
#   ./rotate-secrets.sh            # writes infra/.env.rotated from infra/.env
set -euo pipefail
cd "$(dirname "$0")"
SRC=".env"; OUT=".env.rotated"
[[ -f "$SRC" ]] || { echo "No $SRC found. Copy .env.example → .env first."; exit 1; }

gen() { openssl rand -base64 "${1:-24}" | tr -d '/+=' | cut -c1-"${2:-32}"; }

# Keys safe to regenerate as random strings. (Webhook tokens, app secrets,
# admin passwords.) NOT app-functional identifiers.
ROTATE_KEYS=(
  POSTGRES_PASSWORD KEYCLOAK_ADMIN_PASSWORD KEYCLOAK_CLIENT_SECRET
  MINIO_ACCESS_KEY MINIO_SECRET_KEY GRAFANA_ADMIN_PASSWORD JWT_SECRET
  ZABBIX_WEBHOOK_TOKEN ALERTMANAGER_WEBHOOK_TOKEN GRAFANA_WEBHOOK_TOKEN MDM_API_KEY
)

cp "$SRC" "$OUT"
for key in "${ROTATE_KEYS[@]}"; do
  if grep -q "^${key}=" "$OUT"; then
    val="$(gen 32 40)"
    # macOS/BSD-safe in-place edit
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$OUT" && rm -f "$OUT.bak"
    echo "  rotated ${key}"
  fi
done
echo
echo "Wrote $OUT. Review it, then: mv $OUT $SRC and redeploy."
cat <<'NOTE'

Follow-up (stateful — .env alone is NOT enough):
  - POSTGRES_PASSWORD: ALTER USER bpm WITH PASSWORD '...'; in the DB, then restart
    services. (Fresh volume picks it up automatically.)
  - KEYCLOAK_ADMIN_PASSWORD: change via Keycloak admin console / kcadm, or recreate
    the admin on a fresh volume.
  - MINIO_ACCESS_KEY/SECRET_KEY: rotate the MinIO root creds (or use a service
    account); re-key any stored objects' access.
  - KEYCLOAK_CLIENT_SECRET: update the bpm-frontend/confidential client secret in
    the realm to match.
  - GRAFANA_ADMIN_PASSWORD: applied on next Grafana start (fresh) or via API.
  - Webhook tokens / MDM_API_KEY / JWT_SECRET: applied on service restart; update
    any external senders (Zabbix/Alertmanager/Grafana) with the new tokens.
  - Enforce a Keycloak password policy (length/complexity/expiry) for human users.
NOTE
