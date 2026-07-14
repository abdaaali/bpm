# Production Deployment Runbook — BPM Platform

Deploy the BPM platform to a client server. Pair this with `CUTOVER.md` (go/no-go
+ rollback) and `RUNBOOKS.md` (incident response). Every go-live blocker from the
readiness audit is addressed by the steps below — do them in order.

> Conventions: `DOMAIN` = the client's public host, e.g. `bpm.client.com`.
> All commands run from `infra/` unless noted.

---

## 0. Prerequisites
- Linux host, Docker + Docker Compose v2, ≥ 8 GB RAM, ≥ 50 GB disk.
- DNS A record: `DOMAIN` → server public IP.
- A TLS certificate for `DOMAIN` (Let's Encrypt/`certbot` or client-provided).
- Outbound SMTP for notifications/alerts.
- The repo on the server (`git clone …`), on the release commit.

**Deploy model: manual/SSH.** There is no CI/CD pipeline in this repo — deploy
by SSHing to the server, `git pull`ing the release commit, and running
`docker compose … build && … up -d` directly on the host (step 5). There is
no `REGISTRY`/`IMAGE_TAG` push-and-pull step; ignore any reference to one
elsewhere in this doc set from before this pipeline was removed.

---

## 1. Secrets (blockers: weak/default secrets, committed secret)
```bash
cp .env.example .env
./rotate-secrets.sh          # generates strong POSTGRES/KEYCLOAK/MINIO/GRAFANA/JWT/webhook values
```
Then edit `.env` and set the deployment-specific values:
| Var | Value |
|---|---|
| `BIND_ADDR` | `127.0.0.1` (loopback — only the edge proxy is public) |
| `APP_ENV` | `production` (loads `seeds-production/`, never the demo `seeds/`/`seeds-demo/` — see step 3a) |
| `LOAD_DEMO_SEEDS` | `false` (**must** stay false — `init.sh` refuses to start if `true` alongside `APP_ENV=production`) |
| `CORS_ORIGINS` | `https://DOMAIN` |
| `ALLOWED_ORIGINS` | `https://DOMAIN` (or the contractor host) |
| `KC_HOSTNAME` | `DOMAIN` |
| `KC_FRONTEND_URL` | `https://DOMAIN` |
| `KEYCLOAK_CLIENT_SECRET` | strong value (replaces the old hardcoded one) |
| `MINIO_PUBLIC_ENDPOINT`/`PORT`/`USE_SSL`, `EXTERNAL_MINIO_PUBLIC_*` | `DOMAIN` / `443` / `true` (and the contractor host's equivalents) — **required**, see step 3b |
| `VITE_API_URL` / `VITE_KEYCLOAK_URL` | `https://DOMAIN` / `https://DOMAIN` (same origin — edge proxies `/realms/` etc to Keycloak) |
| `SMTP_*`, `ALERTS_EMAIL_TO` | real SMTP creds |

`.env` is gitignored — never commit it. Keep a copy in the client's secret store.

**Do not use `KEYCLOAK_CLIENT_SECRET`/`KC_FRONTEND_URL` from `.env` directly —
run `./keycloak/render-realm.sh` after setting them (step 3) to bake them into
`realm-export.json`; Keycloak's own import does not substitute `${VAR}`
placeholders itself.**

---

## 2. Build the frontend for the client domain (blocker: hardcoded localhost)
The frontend bakes URLs at build time. With `VITE_*` set in `.env` (step 1),
build directly on the server (manual/SSH deploy — no registry):
```bash
docker compose build frontend contractor-frontend mobile-pwa
```

---

## 3. Keycloak production store (blocker: dev mode / dev-file DB)
The prod overlay runs Keycloak in real `start` mode on Postgres. Create its DB
once (first deploy only):
```bash
docker compose up -d postgres
docker exec bpm-postgres psql -U bpm -d bpm_db -c "CREATE DATABASE keycloak OWNER bpm;"
```

### 3a. Render the realm import (blocker: `${VAR}` placeholders are not substituted by Keycloak)
`realm-export.json.template` (committed) contains literal `${KEYCLOAK_CLIENT_SECRET}`
and `${KC_FRONTEND_URL}` placeholders. Keycloak's own `--import-realm` does
**not** substitute these — deployed without this step, Keycloak either fails
to import or imports the literal placeholder string as the real client
secret, breaking login for everyone. Render the real file first, every time
either value changes:
```bash
./keycloak/render-realm.sh
```
This writes `infra/keycloak/realm-export.json` (gitignored — never commit it),
the exact file already bind-mounted into the Keycloak container. Also remove
the 5 demo users (`requester1`/`manager1`/`finance1`/`cab1`/`engineer1`) from
`realm-export.json.template` before a real production import — see
`docs/production-readiness/07-pre-production-cleanup-runbook.md` §5a.

### 3b. MinIO public endpoint (blocker: presigned download links point at the Docker-internal `minio` hostname)
Without `MINIO_PUBLIC_ENDPOINT`/`PORT`/`USE_SSL` (and the contractor-portal
equivalents `EXTERNAL_MINIO_PUBLIC_*`) set in `.env`, attachment download
links are signed for `minio:9000`, which a real browser can't resolve —
uploads work, downloads don't. Set these to `DOMAIN`/`443`/`true` (and the
contractor host's equivalents) — `infra/edge/nginx.conf` and
`apps/contractor-portal/nginx.conf` already forward the bucket path to MinIO.

---

## 4. TLS edge (blocker: ports exposed / no TLS)
With `BIND_ADDR=127.0.0.1` every app/ops port is loopback-only; the edge nginx
is the sole public listener (80/443).
```bash
# Real cert: place fullchain.pem + privkey.pem where edge/nginx.conf expects them
# (see infra/edge/). For a quick self-signed test only: ./edge/gen-cert.sh
```
Edit `infra/edge/nginx.conf` `server_name` → `DOMAIN`.

---

## 5. Bring up the stack
```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.prod.yml \
  -f docker-compose.edge.yml \
  up -d --build
```
- `prod.yml` → resource limits, log rotation, UTC, **Keycloak prod mode**,
  `APP_ENV: production` + the `seeds-production/` mount on postgres.
- `edge.yml` → TLS reverse proxy (HSTS/CSP/rate-limit).
- `APP_ENV=production` → `init.sh` loads schema + `infra/db/seeds-production/`
  only (tenant/org structure/roles/process definitions/notification templates);
  **never** the demo `seeds/`/`seeds-demo/`. Only takes effect on first boot
  against an empty Postgres volume.

---

## 6. Post-deploy bootstrap
1. **Provision real users** (org structure/roles from `seeds-production/` are
   already loaded by step 5 — this creates the actual people, atomically
   creating each Keycloak account + linking its real `keycloak_id`, the one
   mechanism in this codebase that does so correctly):
   ```bash
   docker run --rm --network <compose-project>_bpm-net \
     -v "$(pwd)/db/seeds-production:/seed:ro" \
     -e ORG_SERVICE_URL=http://org-service:3001 \
     node:20-alpine node /seed/provision-users.mjs
   ```
   Idempotent — safe to re-run; skips anyone already provisioned. Edit
   `infra/db/seeds-production/provision-users.mjs`'s `PEOPLE` array first for
   the client's real org chart (see the org-unit/position/role SQL files in
   the same directory for the IDs it references).
2. **Admin login**: Keycloak admin console at `https://DOMAIN/realms/bpm/account`
   or the admin console (user `admin`, `KEYCLOAK_ADMIN_PASSWORD`). Demo users
   must be absent (removed from `realm-export.json.template` per step 3a, not
   just unused).
3. **Org structure**: verify the Org module tree matches the client's real
   structure (re-parenting, secondary team assignment, and manager
   designation are all supported in-app under Org > Structure).
4. Reference data (RCA taxonomy, MDM lookups, notification templates, process
   definitions, approval policies) is already loaded by migrations +
   `seeds-production/`.

---

## 7. Smoke test (gate to go-live)
```bash
curl -sk https://DOMAIN/api/v1/health            # gateway up
curl -sk https://DOMAIN/                          # frontend served over TLS
# Log in as the admin in a browser; create a test case; resolve it; check RCA loads.
docker compose ps                                 # all services healthy
```
Confirm: TLS valid (no cert warning), login works, a case can be created/worked,
**no demo data is present** (`SELECT count(*) FROM cases;` → 0), and an
attachment uploads **and downloads** successfully via a real browser request
(not `docker exec`) — this specifically exercises the MinIO public-endpoint
fix in step 3b.

---

## 8. Backups (warn: local-only today)
A `db-backup` container takes 6-hourly gzip dumps to a local volume. For prod add
an **offsite copy and a tested restore**:
```bash
# Cron: copy newest dump offsite (S3/MinIO/rsync), keep ≥ 14 days.
# Restore drill (staging): gunzip -c dump.sql.gz | docker exec -i bpm-postgres psql -U bpm -d bpm_db
```
Record RPO (≤ 6 h with current cadence) and RTO from the drill.

---

## 9. Rollback
See `CUTOVER.md`. In short: `docker compose … down`, restore the last good DB
dump, redeploy the previous image tag. Keycloak realm + Postgres data persist in
named volumes; a DB restore reverts app + auth state together.

---

## Go-live checklist (all must be ✅)
- [ ] `.env` secrets rotated; no default/`change-me` values; `.env` not committed
- [ ] `APP_ENV=production`, `LOAD_DEMO_SEEDS=false`; DB has 0 demo cases/users
- [ ] `./keycloak/render-realm.sh` run after setting `KEYCLOAK_CLIENT_SECRET`/`KC_FRONTEND_URL`; demo users removed from `realm-export.json.template`
- [ ] `MINIO_PUBLIC_ENDPOINT`/`PORT`/`USE_SSL` + `EXTERNAL_MINIO_PUBLIC_*` set; attachment download verified from a real browser
- [ ] `provision-users.mjs` run for the client's real org chart; `seeds-production/provision-users.mjs`'s `PEOPLE` array reflects them
- [ ] `BIND_ADDR=127.0.0.1`; only 80/443 public (verify `ss -tlnp`)
- [ ] Real TLS cert for `DOMAIN`; HTTP→HTTPS redirect works
- [ ] `CORS_ORIGINS`/`ALLOWED_ORIGINS` = client domain (cross-origin denied)
- [ ] Keycloak in prod mode on Postgres; realm secret/origins from env (no `*`)
- [ ] Frontend built with `https://DOMAIN`
- [ ] Real admin + users created in Keycloak; demo accounts absent
- [ ] SMTP verified (a test notification arrives)
- [ ] Offsite backup running; restore drill passed
- [ ] All containers healthy; smoke test passed

## Known remaining hardening (non-blocking)
- Connector execution logs store full request/response payloads
  (`integration-hub`) — redact tokens before enabling outbound connectors with
  credentials.
- Edge cert auto-renewal (certbot timer) should be configured.
