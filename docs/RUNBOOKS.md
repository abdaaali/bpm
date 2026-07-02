# Operational Runbooks

Incident-response and recovery procedures for the BPM Portal in production.
Companion docs: **`DEPLOY.md`** (deploy/rollback), **`infra/db/BACKUP.md`**
(backup/restore), **`security-review.md`**, **`production-go-live-plan.md`**.

Production compose stack (run from `infra/`):
```bash
COMPOSE="-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.edge.yml"
docker compose $COMPOSE ps
```
Topology: `edge` (nginx TLS, the only public entry) → `frontend` + `api-gateway`
→ 6 microservices (org/approval/orchestrator/case/integration/notification) →
`postgres`, `kafka` (KRaft), `keycloak`, `minio`. Ops UIs (prometheus/grafana/
kafka-ui/minio/alertmanager) bind loopback in prod (`BIND_ADDR=127.0.0.1`).

---

## 0. Health verification (is it up?)
```bash
docker compose $COMPOSE ps                       # all containers "healthy"
curl -sk https://<host>/healthz                  # edge up
curl -sk https://<host>/api/v1/health            # gateway via edge  (or :3000/health on the host)
# DB + Kafka
docker exec bpm-postgres pg_isready -U bpm
docker exec bpm-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list | head
```
Golden signal: a login + a `GET /api/v1/cases/stats` succeed end-to-end.

---

## 1. Incident response — platform down
1. **Confirm scope**: `docker compose $COMPOSE ps` — which containers are
   down/unhealthy/restarting? Check the edge first (public entry).
2. **Triage by layer** (bottom-up): postgres → kafka → keycloak → microservices
   → gateway → edge. A dependency down cascades upward.
3. **Recent change?** If a deploy just happened → **roll back** (`DEPLOY.md` §Rollback:
   re-deploy the previous `IMAGE_TAG`). If a migration just ran and is implicated →
   see §6.
4. **Resource exhaustion?** `docker stats --no-stream`; `df -h` (disk full → log
   rotation is on, but check `db_backups`/volumes); `free -m`.
5. **Restart the smallest failing unit**, not the whole stack:
   `docker compose $COMPOSE up -d <service>`.
6. Capture logs for the post-mortem: `docker compose $COMPOSE logs --since 30m <service> > /tmp/incident-<svc>.log`.
7. Communicate per §Comms in `CUTOVER.md`; open a tracking ticket.

---

## 2. Service recovery

### Postgres (the critical datastore)
```bash
docker compose $COMPOSE logs --tail 100 postgres
docker exec bpm-postgres pg_isready -U bpm
docker compose $COMPOSE restart postgres         # transient
```
- **Won't start / corruption** → restore from backup (`infra/db/BACKUP.md`): stop
  app services, restore into `bpm_db`, restart. Validate with row-count checks.
- **Connection exhaustion** (load): symptoms = gateway 502s, slow creates. Lever:
  add **PgBouncer** (noted in `infra/load/README.md`); short-term, restart the
  hottest service to drop its pool.
- After any restart, restart dependent services so pools reconnect cleanly.

### Kafka (KRaft, single broker)
```bash
docker compose $COMPOSE logs --tail 100 kafka
docker exec bpm-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list
```
- Events are **fire-and-forget with graceful degradation** — if Kafka is down,
  case/process operations still succeed; notifications + outbox deliveries queue/
  retry. The notification consumer **pre-creates its topics** on start, so after a
  Kafka recovery just ensure the consumers reconnected: `docker compose $COMPOSE
  restart notification-service integration-hub`.
- Disk pressure from logs → check retention; Kafka data is on its volume.

### Keycloak (auth — user-facing outage if down)
```bash
docker compose $COMPOSE logs --tail 100 keycloak
curl -s http://localhost:8443/realms/bpm/.well-known/openid-configuration | head -c 200
```
- If down, **no one can log in** (existing tokens work until expiry). Restart;
  if the realm is lost, re-import `infra/keycloak/realm-export.json` and re-run
  `infra/db/seed_roster.py` for the roster.
- JWKS/issuer mismatch after a host/URL change → update Keycloak frontend URL +
  the gateway's JWKS/issuer env, then restart the gateway.

### A microservice (org/approval/orchestrator/case/integration/notification)
```bash
docker compose $COMPOSE logs --tail 100 <service>
docker compose $COMPOSE up -d <service>
```
Stateless — safe to restart/redeploy individually. Verify health and a sample
call through the gateway.

### API gateway
- 502s from the gateway usually mean an upstream is down (not the gateway) — check
  §2 upstreams first. Restart: `docker compose $COMPOSE up -d api-gateway`.
- Rate-limit 429s under abuse are expected (throttle + edge limits).

### Edge proxy (nginx / TLS)
```bash
docker exec bpm-edge nginx -t                    # config valid?
docker compose $COMPOSE logs --tail 50 edge
docker compose $COMPOSE restart edge
```
- 502 from edge → frontend/gateway upstream down. TLS errors → cert problem (§4).

---

## 3. Common operations
| Task | Command |
|---|---|
| Tail a service | `docker compose $COMPOSE logs -f <service>` |
| Restart one service | `docker compose $COMPOSE up -d <service>` |
| Roll back | redeploy previous `IMAGE_TAG` — `DEPLOY.md` §Rollback |
| Apply migrations | `infra/db/migrate.sh up` (ledgered; `status` to inspect) |
| Backup / restore | `infra/db/backup.sh` · `BACKUP.md` |
| Rotate secrets | `infra/rotate-secrets.sh` → apply in a window (§5) |
| Load test | `infra/load/loadtest.py --vus 25 --duration 60` |

---

## 4. TLS certificate rotation
Certs live at `infra/edge/certs/edge.{crt,key}` (mounted read-only into `edge`).
1. Obtain the renewed cert (Let's Encrypt / corporate CA).
2. Replace `edge.crt` + `edge.key` at the same paths.
3. `docker exec bpm-edge nginx -t && docker exec bpm-edge nginx -s reload`
   (zero-downtime reload; no container restart needed).
4. Verify: `curl -vk https://<host>/healthz` shows the new cert dates.
Set a **calendar reminder before expiry** (or automate renewal).

---

## 5. Secret rotation
1. `cd infra && ./rotate-secrets.sh` → writes `.env.rotated` (gitignored).
2. Review, then in a maintenance window: `mv .env.rotated .env`.
3. Apply the **stateful** follow-ups the script prints (re-key DB/Keycloak/MinIO —
   `.env` alone is not enough), then `docker compose $COMPOSE up -d`.
4. Update external senders (Zabbix/Alertmanager/Grafana webhook tokens).
5. Verify login + a sample API call. Enforce Keycloak password policy.

---

## 6. Migration trouble
- Migrations are **ledgered** (`schema_migrations`); `migrate.sh status` shows
  applied vs pending. Forward-only.
- A bad migration → restore the pre-deploy backup (taken in the deploy checklist),
  fix the migration, re-deploy. Never hand-edit the ledger in prod without a backup.

---

## 7. Monitoring & alerts
- **Prometheus** (`:9090`, loopback) scrapes service `/api/metrics`; **Grafana**
  (`:3300`); **Alertmanager** (`:9094`) → email (SMTP in `.env`).
- Key alerts: `ServiceDown`, SLA-breach signals, `OutboxDeadLetter` (when the
  `bpm_outbox_dead` gauge is wired). Tunnel/VPN to reach these (loopback-bound).
- First place to look in an incident: Grafana service health + `docker stats`.

---

## 8. Scaling a host / capacity
- Postgres is the throughput ceiling (load test: ~573 req/s plateau at ~4–5 cores).
  Levers in order: Postgres CPU/IO sizing → **PgBouncer** → read replicas.
- Stateless services (`api-gateway`, `case-service`, …) scale horizontally behind
  the edge; raise the per-service `deploy.resources.limits` in
  `docker-compose.prod.yml` or move to multiple hosts.

---

## 9. Escalation
| Tier | Scope | Contact |
|---|---|---|
| L1 | Restart a service, follow §0–§3 | On-call ops |
| L2 | DB/Kafka/Keycloak recovery, rollback, migrations | Platform engineer |
| L3 | Data loss, security incident, code defect | Eng lead + (security) the security owner |
Fill in names/rota per `CUTOVER.md` §Owners before go-live.
