# Deployment Runbook

## Environments
| Env | Purpose | Compose | Env file |
|---|---|---|---|
| **dev** | local development (builds from source) | `docker-compose.yml` | `infra/.env` |
| **staging** | prod-like validation | base + `docker-compose.prod.yml` | `infra/.env` (staging values) |
| **production** | live | base + `docker-compose.prod.yml` | `infra/.env` (prod values) |

Each environment has its **own `infra/.env`** (gitignored) — see `infra/.env.example`. Use strong, unique secrets per environment (Phase 0.4).

## Images & versioning
- **Deploy model: manual/SSH.** There is no CI/CD pipeline in this repo — no
  registry, no image push/pull. `image: ${REGISTRY:-bpm}/<svc>:${IMAGE_TAG:-latest}`
  in the compose files is present only so a registry-based workflow *could*
  be added later; today it's unused and both vars stay at their local
  defaults. The host **builds from source** on every deploy.

## Deploy (staging or prod)
SSH to the target host:
```bash
cd /opt/bpm
git pull origin main                                  # or the release tag/commit
cd infra
./keycloak/render-realm.sh                             # only if KEYCLOAK_CLIENT_SECRET/KC_FRONTEND_URL changed (see PROD_DEPLOY.md §3a)
docker compose run --rm db-migrate                     # 1. apply pending DB migrations (ordered, ledgered, idempotent)
docker compose -f docker-compose.yml -f docker-compose.prod.yml build           # 2. build images from the pulled source
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d           # 3. roll out (limits + log rotation + TZ)
```
Healthchecks gate startup ordering; watch with `docker compose ps` and `docker compose logs -f <svc>`.

## Database migrations
- Managed by `infra/db/migrate.sh` via the `db-migrate` one-shot service (profile `tools`, never auto-starts).
- `docker compose run --rm db-migrate` → applies pending `db/migrations/*.sql` in order, each in a transaction, recorded in `schema_migrations`. Idempotent (re-running is a no-op).
- `docker compose run --rm db-migrate status` → applied vs pending.
- **Adopting on an existing DB:** run `docker compose run --rm db-migrate baseline` ONCE to mark current files applied without re-running them.
- Migrations must be **forward-only and idempotent** (use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`). Never edit a migration that has shipped — add a new one.

## Rollback
No registry to re-pull from — rollback means checking out the previous good
commit and rebuilding:
```bash
git checkout <previous-good-commit-or-tag>
docker compose -f docker-compose.yml -f docker-compose.prod.yml build
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```
**Caveat:** DB migrations are forward-only. If a release added a backward-incompatible migration, rolling the *code* back is not enough — restore from backup (see `infra/db/BACKUP.md`) or ship a compensating migration. Prefer additive, backward-compatible migrations so a code rollback is always safe.

## Pre-deploy checklist
- [ ] `infra/.env` for this environment has strong secrets + real SMTP + webhook tokens.
- [ ] `./keycloak/render-realm.sh` run since the last `KEYCLOAK_CLIENT_SECRET`/`KC_FRONTEND_URL` change (Keycloak does not substitute these itself — see `PROD_DEPLOY.md` §3a).
- [ ] `MINIO_PUBLIC_ENDPOINT`/`PORT`/`USE_SSL` (+ `EXTERNAL_MINIO_PUBLIC_*`) set to the real public domain(s), not left unset — otherwise attachment downloads fail for real users (`PROD_DEPLOY.md` §3b).
- [ ] Backups verified (`infra/db/BACKUP.md`) and the latest restore-test passed.
- [ ] TLS/reverse proxy in front of frontend + gateway (Phase 0.6 — deploy-time).
- [ ] Alert receiver wired (`ALERTS_EMAIL_TO` + SMTP) and Alertmanager reachable.
- [ ] Migrations reviewed (additive/idempotent); `db-migrate status` clean after deploy.
- [ ] Smoke test: login, create a case, complete a task, an approval, an alarm webhook.

## Hosts & sizing
~20 concurrent users fit comfortably on a single well-provisioned host (≈ 8 vCPU / 16 GB). Resource limits in `docker-compose.prod.yml` keep any one service bounded. Scale vertically first; revisit HA only if usage grows materially.
