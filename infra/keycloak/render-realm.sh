#!/bin/bash
# Renders realm-export.json.template -> realm-export.json by substituting
# ${KEYCLOAK_CLIENT_SECRET} and ${KC_FRONTEND_URL}.
#
# Required because Keycloak's own `--import-realm` does NOT perform this
# substitution itself — realm JSON is imported literally. Deployed without
# running this first, Keycloak either fails to import or (depending on
# version) creates a client whose actual secret is the literal string
# "${KEYCLOAK_CLIENT_SECRET}", which then won't match what every backend
# service is configured with, breaking login/token validation.
#
# Run this before every `docker compose up` where KEYCLOAK_CLIENT_SECRET or
# KC_FRONTEND_URL in infra/.env has changed (including first-ever startup).
# The output (realm-export.json) is gitignored and bind-mounted into the
# Keycloak container at the same path this file used to occupy directly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "FATAL: $ENV_FILE not found — copy infra/.env.example to infra/.env and fill it in first." >&2
  exit 1
fi

# Extract only the two needed vars directly, rather than `source`-ing the
# whole .env file — other values in it (e.g. SMTP_FROM_NAME) can contain
# unquoted spaces that aren't valid bash and would break a full source.
KEYCLOAK_CLIENT_SECRET="$(grep -m1 '^KEYCLOAK_CLIENT_SECRET=' "$ENV_FILE" | cut -d= -f2-)"
KC_FRONTEND_URL="$(grep -m1 '^KC_FRONTEND_URL=' "$ENV_FILE" | cut -d= -f2-)"
export KEYCLOAK_CLIENT_SECRET KC_FRONTEND_URL

: "${KEYCLOAK_CLIENT_SECRET:?KEYCLOAK_CLIENT_SECRET must be set in infra/.env}"
: "${KC_FRONTEND_URL:?KC_FRONTEND_URL must be set in infra/.env}"

envsubst '${KEYCLOAK_CLIENT_SECRET} ${KC_FRONTEND_URL}' \
  < "$SCRIPT_DIR/realm-export.json.template" \
  > "$SCRIPT_DIR/realm-export.json"

echo "Rendered $SCRIPT_DIR/realm-export.json from realm-export.json.template."
