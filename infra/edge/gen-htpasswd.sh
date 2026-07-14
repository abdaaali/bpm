#!/usr/bin/env bash
# Generate hardened HTTP basic-auth credentials for the ops tools that have no
# authentication of their own (Prometheus, Kafka UI) once they sit behind the
# edge proxy. Grafana and MinIO are NOT covered here — both already have their
# own real login (GRAFANA_ADMIN_PASSWORD / MINIO_ACCESS_KEY+SECRET_KEY in
# infra/.env), so stacking basic auth in front of them would just be a second,
# redundant login prompt.
#
# The password is bcrypt-hashed (-B, cost 12) rather than the weaker
# crypt/MD5 htpasswd default, and is a fresh random 32-char string generated
# here — not something you type in — matching the rest of this repo's secret
# posture (see rotate-secrets.sh).
#
#   ./gen-htpasswd.sh [username]      # default username: ops-admin
set -euo pipefail
command -v htpasswd >/dev/null 2>&1 || {
  echo "htpasswd not found. Install apache2-utils (Debian/Ubuntu) or httpd-tools (RHEL/Alpine: apk add apache2-utils)." >&2
  exit 1
}

USER="${1:-ops-admin}"
DIR="$(cd "$(dirname "$0")" && pwd)"
FILE="$DIR/infra-auth.htpasswd"

if [[ -f "$FILE" ]] && grep -q "^${USER}:" "$FILE"; then
  echo "User '$USER' already exists in $FILE — delete the line (or the file) to regenerate."
  exit 0
fi

PASSWORD="$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)"
if [[ -f "$FILE" ]]; then
  htpasswd -B -C 12 -b "$FILE" "$USER" "$PASSWORD"
else
  htpasswd -B -C 12 -b -c "$FILE" "$USER" "$PASSWORD"
fi

chmod 600 "$FILE"
cat <<EOF

Generated ops-tool basic-auth credentials (protects /prometheus/ and /kafka-ui/
behind the edge proxy — Grafana and MinIO keep their own separate login):

  Username: $USER
  Password: $PASSWORD

This password is NOT stored anywhere in plaintext — save it in your password
manager now. $FILE is bcrypt-hashed and gitignored; re-run this script (with a
different username, or after deleting the existing line) to rotate it.
EOF
