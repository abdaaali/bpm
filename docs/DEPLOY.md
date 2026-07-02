# Deployment Runbook

## Environments
| Env | Purpose | Compose | Env file |
|---|---|---|---|
| **dev** | local development (builds from source) | `docker-compose.yml` | `infra/.env` |
| **staging** | prod-like validation | base + `docker-compose.prod.yml` | `infra/.env` (staging values) |
| **production** | live | base + `docker-compose.prod.yml` | `infra/.env` (prod values) |

Each environment has its **own `infra/.env`** (gitignored) — see `infra/.env.example`. Use strong, unique secrets per environment (Phase 0.4).

## Images & versioning
- App services carry `image: ${REGISTRY:-bpm}/<svc>:${IMAGE_TAG:-latest}`.
- CI (`.github/workflows/ci.yml`) builds and pushes each image tagged with the **git SHA** and the **branch/tag name** to the registry.
- A deploy pins `REGISTRY` + `IMAGE_TAG` (the SHA or `vX.Y.Z`). The host **pulls** images — it does not build.

## Deploy (staging or prod)
On the target host (CI does this over SSH; the manual equivalent):
```bash
cd /opt/bpm/infra
export REGISTRY=ghcr.io/<owner> IMAGE_TAG=<git-sha-or-vX.Y.Z>
docker compose pull                                   # 1. fetch the pinned images
docker compose run --rm db-migrate                    # 2. apply pending DB migrations (ordered, ledgered, idempotent)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d   # 3. roll out (limits + log rotation + TZ)
```
Healthchecks gate startup ordering; watch with `docker compose ps` and `docker compose logs -f <svc>`.

## Database migrations
- Managed by `infra/db/migrate.sh` via the `db-migrate` one-shot service (profile `tools`, never auto-starts).
- `docker compose run --rm db-migrate` → applies pending `db/migrations/*.sql` in order, each in a transaction, recorded in `schema_migrations`. Idempotent (re-running is a no-op).
- `docker compose run --rm db-migrate status` → applied vs pending.
- **Adopting on an existing DB:** run `docker compose run --rm db-migrate baseline` ONCE to mark current files applied without re-running them.
- Migrations must be **forward-only and idempotent** (use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`). Never edit a migration that has shipped — add a new one.

## Rollback
Images are immutable per tag, so rollback = redeploy the previous tag:
```bash
export IMAGE_TAG=<previous-good-sha-or-tag>
docker compose pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```
**Caveat:** DB migrations are forward-only. If a release added a backward-incompatible migration, rolling the *images* back is not enough — restore from backup (see `infra/db/BACKUP.md`) or ship a compensating migration. Prefer additive, backward-compatible migrations so image rollback is always safe.

## Pre-deploy checklist
- [ ] `infra/.env` for this environment has strong secrets + real SMTP + webhook tokens.
- [ ] Backups verified (`infra/db/BACKUP.md`) and the latest restore-test passed.
- [ ] TLS/reverse proxy in front of frontend + gateway (Phase 0.6 — deploy-time).
- [ ] Alert receiver wired (`ALERTS_EMAIL_TO` + SMTP) and Alertmanager reachable.
- [ ] Migrations reviewed (additive/idempotent); `db-migrate status` clean after deploy.
- [ ] Smoke test: login, create a case, complete a task, an approval, an alarm webhook.

## Hosts & sizing
~20 concurrent users fit comfortably on a single well-provisioned host (≈ 8 vCPU / 16 GB). Resource limits in `docker-compose.prod.yml` keep any one service bounded. Scale vertically first; revisit HA only if usage grows materially.
