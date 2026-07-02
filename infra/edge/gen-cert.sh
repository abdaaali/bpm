#!/usr/bin/env bash
# Generate a self-signed TLS cert for the edge proxy (dev / staging).
# For production, replace edge.crt/edge.key with a real cert (Let's Encrypt,
# corporate CA, …) — same paths, mounted into the edge container.
#
#   ./gen-cert.sh [common-name]      # default CN: localhost
set -euo pipefail
CN="${1:-localhost}"
DIR="$(cd "$(dirname "$0")" && pwd)/certs"
mkdir -p "$DIR"
if [[ -f "$DIR/edge.crt" ]]; then
  echo "Cert already exists at $DIR/edge.crt — delete it to regenerate."
  exit 0
fi
openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
  -keyout "$DIR/edge.key" -out "$DIR/edge.crt" \
  -subj "/CN=$CN" -addext "subjectAltName=DNS:$CN,DNS:localhost,IP:127.0.0.1"
chmod 600 "$DIR/edge.key"
echo "Self-signed cert generated for CN=$CN at $DIR (edge.crt / edge.key)."
