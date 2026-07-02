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
| `LOAD_DEMO_SEEDS` | `false` (ship a clean DB — **must** stay false) |
| `CORS_ORIGINS` | `https://DOMAIN` |
| `ALLOWED_ORIGINS` | `https://DOMAIN` (or the contractor host) |
| `KC_HOSTNAME` | `DOMAIN` |
| `KC_FRONTEND_URL` | `https://DOMAIN` |
| `KEYCLOAK_CLIENT_SECRET` | strong value (replaces the old hardcoded one; substituted into the realm on import) |
| `VITE_API_URL` / `VITE_KEYCLOAK_URL` | `https://DOMAIN` / `https://DOMAIN/auth` |
| `SMTP_*`, `ALERTS_EMAIL_TO` | real SMTP creds |

`.env` is gitignored — never commit it. Keep a copy in the client's secret store.

---

## 2. Build the frontend for the client domain (blocker: hardcoded localhost)
The frontend bakes URLs at build time. With `VITE_*` set in `.env` (step 1):
```bash
docker compose build frontend contractor-frontend mobile-pwa
```
(Or build elsewhere and push to `REGISTRY`; set `REGISTRY`/`IMAGE_TAG` in `.env`.)

---

## 3. Keycloak production store (blocker: dev mode / dev-file DB)
The prod overlay runs Keycloak in real `start` mode on Postgres. Create its DB
once (first deploy only):
```bash
docker compose up -d postgres
docker exec bpm-postgres psql -U bpm -d bpm_db -c "CREATE DATABASE keycloak OWNER bpm;"
```
The realm imports on first Keycloak start, substituting `KEYCLOAK_CLIENT_SECRET`
and `KC_FRONTEND_URL` (no more wildcard origins / hardcoded secret — validated).

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
- `prod.yml` → resource limits, log rotation, UTC, **Keycloak prod mode**.
- `edge.yml` → TLS reverse proxy (HSTS/CSP/rate-limit).
- `LOAD_DEMO_SEEDS=false` → `init.sh` loads schema + reference config + the
  platform admin only; **no demo users/cases/alarms/contractors**.

---

## 6. Post-deploy bootstrap
1. **Admin login**: Keycloak admin console at `https://DOMAIN/auth` (user `admin`,
   `KEYCLOAK_ADMIN_PASSWORD`). Create real users in realm `bpm`, assign realm
   roles (`admin`/`manager`/`noc`/`field_engineer`/`security`/`logistics`/
   `approver`/`requester`). Each app user also needs a row in the `users` table
   (org module) with a matching `keycloak_id`.
2. **Org structure**: adjust org units/teams in the Org module to the client's
   real structure (the seed ships a telecom-ops skeleton: NOC / Field / Security /
   Logistics / Operation Support).
3. Reference data (RCA taxonomy, MDM lookups, notification templates, process
   definitions, approval policies) is already loaded by migrations + core seed.

---

## 7. Smoke test (gate to go-live)
```bash
curl -sk https://DOMAIN/api/v1/health            # gateway up
curl -sk https://DOMAIN/                          # frontend served over TLS
# Log in as the admin in a browser; create a test case; resolve it; check RCA loads.
docker compose ps                                 # all services healthy
```
Confirm: TLS valid (no cert warning), login works, a case can be created/worked,
and **no demo data is present** (`SELECT count(*) FROM cases;` → 0).

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
- [ ] `LOAD_DEMO_SEEDS=false`; DB has 0 demo cases/users
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
