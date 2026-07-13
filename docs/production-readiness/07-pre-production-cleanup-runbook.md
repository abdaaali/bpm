# 07 — Pre-Production Cleanup Runbook

> This runbook sequences the work documented in files 01–06. Every destructive step is explicitly marked **DO NOT RUN UNTIL APPROVED**. Read [03-data-inventory-and-cleanup.md](03-data-inventory-and-cleanup.md) and [06-production-readiness-risks.md](06-production-readiness-risks.md) fully before running anything here. **No data or files have been deleted at any point in either investigation pass.**

## Known-fix log (2026-07-10 follow-up pass)

The original investigation (2026-07-09) was documentation-only. A follow-up pass on 2026-07-10 investigated the three highest-priority risks and fixed the two where a safe, complete fix was possible. Recorded here so this runbook's later steps (especially section 5a and section 7) reflect current reality rather than the original findings.

1. **R-13 (MinIO public download) — FIXED.** Verified no legitimate code path depended on anonymous bucket access (case-service and external-api both already used `presignedGetObject` behind authenticated endpoints). Changed the bucket policy live (`docker exec bpm-minio mc anonymous set none local/bpm-attachments`) and in `infra/docker-compose.yml`'s `minio-init` entrypoint (`mc anonymous set download` → `mc anonymous set none`) so it applies on every future environment build. Added 2 regression tests to `e2e/tests/02-contractor-portal/contractor-attachments-and-comments.spec.ts`. Full suite re-run clean (43 passed, 1 pre-existing skip).
   - **Side discovery, not fixed (R-22)**: presigned URLs are signed for the Docker-internal `minio` hostname, unreachable by a real browser outside `bpm-net`. This predates the R-13 fix and is unrelated to it. **Section 7 below (MinIO fix step) has been updated to reflect this — read it before assuming attachment downloads work end-to-end in your target environment.**

2. **R-07 (no live approval proof) — FIXED, and it was a real bug, not just a coverage gap.** Attempting the live proof immediately failed (`Approval delegation ... failed: No approvers resolved for this policy/context`). Root cause: `users.keycloak_id` for the 5 demo users (`requester1`, `manager1`, `finance1`, `cab1`, `engineer1`) still held literal seed-file placeholder strings instead of their real Keycloak-issued UUIDs — only `admin` had been correctly backfilled previously. This broke `approval-service`'s existing (and already-correct) `resolveUserId()` translation, so `org-service`'s manager-chain lookup silently found nobody for any demo user's request. **Fixed by backfilling `keycloak_id`** for all 5 users to their real Keycloak UUIDs (obtained by logging in as each and decoding the JWT `sub`) — no application code was changed. Re-verified live end-to-end (submit → real `approval_instances` row → real approve/reject decision via the real API → process instance advances → new downstream task created). Added `e2e/tests/04-backend-workflow/purchase-request-live-approval.spec.ts` (2 tests, both passing) using the real "Purchase Request" process definition and its real approval policy.
   - **Action required for any NEW environment seeded the same way**: after importing `infra/keycloak/realm-export.json` and running the demo seeds, verify every seeded user's `users.keycloak_id` actually matches their real Keycloak-issued `sub` — do not assume the seed file's placeholder values are ever correct. See the new step 5a-i below.

3. **R-01 / R-02 (integration-hub tenant scoping) — investigated in depth, deliberately NOT fixed.** R-02 (cron scheduler loading all tenants) was re-investigated and found to already be correct (each connector's execution is properly tenant-scoped; only the one-time scheduler bootstrap loads across tenants, which is intentional for a shared process) — downgraded to a non-issue, no fix needed. R-01 (`unified_alarms` has no `tenant_id`) remains genuinely open: there is no existing mechanism for an inbound alarm webhook to identify which tenant it belongs to (single global static token per source type, no tenant field in any payload normalizer), so a schema-only fix would have been cosmetic rather than a real solution. See the full technical proposal in [06-production-readiness-risks.md](06-production-readiness-risks.md) ("R-01 deep-dive") — this needs a product/architecture decision before implementation, not a code change alone.

4. **Test data note**: proving R-07 live created 2 new real `approval_instances` rows and their associated `process_instances`/`tasks` under the real (non-E2E-prefixed) "Purchase Request" definition, plus the automated Playwright test adds 2 more on every suite run. These are genuine test artifacts (not silently hidden) — factor them into section 6a's cleanup scope if this specific database is ever reused rather than starting fresh for production (see updated data counts note in step 6a below).

## 0. Prerequisites

- [ ] All stakeholders have reviewed docs 00–06 and signed off on the cleanup/rotation scope
- [ ] A maintenance window is scheduled (Keycloak/secret rotation and DB cleanup should not happen while users are active)
- [ ] You have confirmed which environment this runbook is being run against (local/demo vs. a real pre-prod/staging target) — **the DB cleanup steps in section 4 assume a demo/dev database being prepared for reuse; if you are instead standing up a genuinely fresh production database, skip section 4 entirely and just apply migrations + `001_core_data.sql` to an empty database (section 6)**

---

## 1. Backup first

```bash
# DO NOT RUN UNTIL APPROVED
# Full logical backup of the current database before touching anything
docker exec bpm-postgres pg_dump -U bpm -d bpm_db -F c -f /tmp/pre_cleanup_backup.sql.gz
docker cp bpm-postgres:/tmp/pre_cleanup_backup.sql.gz ./pre_cleanup_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

- [ ] Confirm the backup file is non-empty and copy it somewhere outside the Docker host (this repo's working tree is **not** an acceptable long-term backup location — see [04](04-files-to-remove-before-production.md), DB dumps must never be committed)
- [ ] Note: `bpm-db-backup` already runs scheduled `pg_dump`s into the `db_backups` Docker volume per `infra/db/BACKUP.md` — confirm a recent scheduled backup also exists as a second safety net

## 2. Verify environment

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml ps
```

- [ ] Confirm you are pointed at the intended environment (hostnames, `infra/.env`'s `KC_FRONTEND_URL`/`VITE_API_URL`, etc.) — running production-rotation steps against the wrong environment is a real risk
- [ ] Confirm all containers are currently healthy before making changes (a cleanup performed against a partially-degraded stack is harder to reason about)

## 3. Stop services (only if required for the specific step)

Most steps below (file cleanup, DB queries) do **not** require stopping services. Only stop services if you are about to rotate a secret that requires a coordinated restart (section 5) or apply a migration that requires exclusive access (rare — check the migration file first).

```bash
# DO NOT RUN UNTIL APPROVED — only if a specific step below requires it
docker compose -f infra/docker-compose.yml stop <service-name>
```

## 4. Clean up files (safe, local-only, no approval needed for read/delete of your own generated artifacts)

These are safe to run at any time — they only touch gitignored/untracked local artifacts, never source or seed files:

```bash
# Safe — local generated artifacts only, not tracked by git
rm -rf test-results/                  # repo-root Playwright artifacts (see R-16 — also add to .gitignore, see step 4b)
rm -rf e2e/test-results/
rm -rf e2e/playwright-report/
rm -rf e2e/.auth/                     # will be regenerated by the next `00-auth` setup run
```

- [ ] **4b (requires your approval — a repo edit, even though trivial):** add `test-results/` to the root `.gitignore` to close the gap described in R-16. This is a one-line documentation-adjacent fix; per your "do not commit" instruction for this investigation phase, this edit should be proposed to you separately and only committed when you explicitly approve it.
- [ ] Confirm no `.env`/certificate files were accidentally included in anything you delete above (none should be — the patterns above only match Playwright output directories)

## 5. Rotate credentials

```bash
# DO NOT RUN UNTIL APPROVED
./infra/rotate-secrets.sh
```

- [ ] Confirm the script exists and review it before running (referenced by `docs/PROD_DEPLOY.md`, `docs/RUNBOOKS.md`, `docs/CUTOVER.md`, and `STRUCTURE.md`, but not read in full during this investigation pass — read it now before trusting it blindly)
- [ ] It is documented to write fresh values to a gitignored `infra/.env.rotated` — after applying, confirm this file is either merged into `infra/.env` and then deleted, or moved directly into your production secret manager; it must never be left sitting in the working tree (see [04](04-files-to-remove-before-production.md))
- [ ] Rotate at minimum: `POSTGRES_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_CLIENT_SECRET`, `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`, `JWT_SECRET`, `GRAFANA_ADMIN_PASSWORD`, `GRAFANA_DB_PASSWORD`, all webhook tokens (`ZABBIX_WEBHOOK_TOKEN`, `ALERTMANAGER_WEBHOOK_TOKEN`, `GRAFANA_WEBHOOK_TOKEN`), `MDM_API_KEY`
- [ ] **Additionally rotate `grafana_ro`'s Postgres password (R-12), which is NOT covered by env var rotation alone** because it was set by a migration, not by `.env`:
  ```sql
  -- DO NOT RUN UNTIL APPROVED — run only after generating a new strong value
  ALTER ROLE grafana_ro WITH PASSWORD '<new value from rotate-secrets.sh output>';
  ```
  Then update Grafana's datasource config to match.

### 5a. Replace Keycloak realm seeded credentials

```
# DO NOT RUN UNTIL APPROVED
```
- [ ] Before importing `infra/keycloak/realm-export.json` into a production Keycloak, either:
  - (a) edit a **copy** of the file to remove the 5 demo users (`requester1`, `manager1`, `finance1`, `cab1`, `engineer1`) entirely and set a fresh, unique, strong password for the remaining `admin` bootstrap user, or
  - (b) import as-is into a throwaway/staging realm only, then manually recreate the real admin user with a fresh password directly in the Keycloak admin console and delete every seeded demo user before go-live
- [ ] Enforce a Keycloak password policy for the production realm (referenced as a TODO in `docs/security-review.md`/`docs/RUNBOOKS.md`/`docs/CUTOVER.md` but not yet confirmed applied)
- [ ] Confirm `sslRequired` is set appropriately for production (currently `none` in the dev realm export — must be `external` or `all` in production)

**5a-i. Verify `keycloak_id` sync for any user you DO keep (new step, added 2026-07-10 after fixing R-07).** Whenever a user exists in both Keycloak and the `users` table (whether from a demo seed or a real production onboarding flow), confirm `users.keycloak_id` holds that user's *actual* Keycloak-issued `sub` UUID, not a placeholder or stale value. A mismatch here doesn't error loudly — it fails silently as "no approvers resolved" deep in approval-service, exactly as found in this investigation. Verify with:
```bash
# Read-only — safe to run any time. Confirms no seeded/onboarded user has a
# keycloak_id that looks like a placeholder rather than a real UUID.
docker exec bpm-postgres psql -U bpm -d bpm_db -c "
  SELECT username, keycloak_id FROM users
  WHERE keycloak_id IS NULL OR keycloak_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
"
```
Any row returned (other than intentionally-Keycloak-less service/test fixtures) needs its `keycloak_id` corrected before that user can be an approver, an assignee resolved by identity, or rely on any other `(id::text=$1 OR keycloak_id=$1)`-style lookup (see `services/approval-service/src/instance/instance.service.ts`, `services/case-service/src/case/case.service.ts`, `services/bpm-orchestrator/src/process-instance/process-instance.service.ts` for the other call sites of this same pattern).

## 6. Apply migrations (fresh production database)

```bash
# DO NOT RUN UNTIL APPROVED
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml run --rm db-migrate
```

- [ ] Confirm all 40 migrations in `infra/db/migrations/` apply cleanly to an empty database
- [ ] Apply `infra/db/seeds/001_core_data.sql` only (the always-required seed) — **do not set `LOAD_DEMO_SEEDS=true`** in production, which would additionally load the demo users/RCA data/contractor companies documented in [03](03-data-inventory-and-cleanup.md)
- [ ] Before running, replace "Demo Corp" tenant/org-unit naming in `001_core_data.sql` (or apply a post-seed `UPDATE`) with the real customer's organization structure — see [03](03-data-inventory-and-cleanup.md) classification table
- [ ] Immediately rotate the bootstrap admin user's password (section 5a) — do not leave the seeded admin account with any demo-adjacent credential

## 6a. If instead reusing this demo/dev database (not recommended for real production, only for a shared staging environment)

Only if you deliberately choose to reuse this specific database rather than starting fresh, run the cleanup SQL proposed in [03-data-inventory-and-cleanup.md](03-data-inventory-and-cleanup.md) — copied here as a sequencing checklist, **the actual SQL statements live in doc 03, not duplicated here to avoid drift**:

- [ ] **DO NOT RUN UNTIL APPROVED** — Step 1–2: delete E2E-generated tasks and process instances
- [ ] **DO NOT RUN UNTIL APPROVED** — Step 3: delete archived E2E process definitions
- [ ] Investigate (do not blindly delete) the one active "Test" process definition and the 4 unexplained "other" cases — get a human answer first
- [ ] **DO NOT RUN UNTIL APPROVED** — Step 5, 7, 8, 9: delete E2E cases, demo RCA data, demo contractor data, demo connectors
- [ ] **DO NOT RUN UNTIL APPROVED** — Step 10: delete demo Keycloak-backed DB users (**and separately remove them from Keycloak itself via the admin console/API — SQL deletion alone does not remove the Keycloak identity**)
- [ ] **DO NOT RUN UNTIL APPROVED** — Step 11: delete the E2E isolation-test tenant and its user
- [ ] For MinIO: capture the object key list from `external_attachments` **before** deleting those rows, then remove the corresponding objects from the `bpm-attachments` bucket
- [ ] **DO NOT RUN UNTIL APPROVED** — Step 12: truncate `audit_log`/`notifications` — only immediately before go-live, never on an environment you still need for debugging

## 7. Fix the MinIO public-download policy (R-13 — DONE in this environment on 2026-07-10)

**This step has already been applied in the current dev/demo environment and in `infra/docker-compose.yml`** — see the Known-fix log above. It's left here, unmarked-destructive, so it's applied consistently to any OTHER environment (staging/prod) that was provisioned from this repo before the fix landed:

```bash
# Safe to run — makes the bucket private if it wasn't already; verify current
# state first with `mc anonymous get` if you want to confirm before changing.
docker exec bpm-minio mc anonymous set none local/bpm-attachments
docker exec bpm-minio mc anonymous get local/bpm-attachments   # expect: private
```

- [x] Confirmed case-service and external-api both already use presigned URLs for attachment access (`presignedGetObject`) so removing anonymous access does not break the existing download flow — verified via `e2e/tests/02-contractor-portal/contractor-attachments-and-comments.spec.ts`
- [x] Re-tested: unauthenticated raw bucket access → 403; unauthenticated app download endpoint → 401; authenticated download → valid signed URL; tampered signature → 403
- [ ] **New follow-up (R-22, not yet fixed)**: confirm the presigned URL's `Location` header points to a hostname your target environment's real users can actually resolve. In this dev compose stack it's the Docker-internal `minio` hostname, which only resolves inside `bpm-net` — a real browser cannot complete the download. Before relying on attachment downloads working in any environment, check `infra/docker-compose.yml`'s `MINIO_ENDPOINT` value and test a download from an actual browser outside the Docker host, not just via `docker exec`.

## 8. Rebuild containers

```bash
# DO NOT RUN UNTIL APPROVED
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml build
```

- [ ] Confirm production build args are set correctly for each frontend app: `VITE_API_URL`, `VITE_KEYCLOAK_URL`, `VITE_KEYCLOAK_REALM`, `VITE_KEYCLOAK_CLIENT_ID` (frontend-portal) must point at the real production HTTPS domain, not `localhost`
- [ ] Confirm `BIND_ADDR` is set to `127.0.0.1` in production `infra/.env` so internal admin ports (kafka-ui `8091`, Prometheus `9090`, Grafana `3300`, Alertmanager `9094`, MinIO console `9001`, Keycloak `8443` if not otherwise fronted) are not directly internet-reachable — only the TLS edge proxy (`infra/docker-compose.edge.yml`) should be public (R-21 and related)

## 9. Restart containers

```bash
# DO NOT RUN UNTIL APPROVED
docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml -f infra/docker-compose.edge.yml up -d
```

- [ ] After startup, immediately check for the known stale-nginx-upstream-IP issue (R-14): `docker logs bpm-contractor-frontend --tail=50` and test `curl -X POST .../api/ext/auth/login` for an unexpected 502; restart `contractor-frontend` if needed until the nginx `resolver` fix (R-14) is permanently applied
- [ ] Confirm every container reaches `healthy` status: `docker ps --format "table {{.Names}}\t{{.Status}}"`

## 10. Smoke test all apps

Run through the production smoke checklists in [05-service-test-plan.md](05-service-test-plan.md) for every app/service, in this order:

- [ ] Keycloak admin console reachable, demo users absent, secrets rotated
- [ ] frontend-portal: login → Service Catalog → new request → Process Studio
- [ ] contractor-portal: login (real contractor account, not demo) → work orders scoped correctly → attachment upload/download works through the new (non-anonymous) MinIO policy
- [ ] mobile-pwa: both modes, Connect screen has no Server field
- [ ] api-gateway `/health`, unauthenticated 401 check, forged-tenant-header check
- [ ] bpm-orchestrator: a linear process and a parallel-gateway process both complete correctly
- [ ] case-service: create + reassign a case
- [ ] **approval-service: manually complete one full CAB/manager approval through the real UI — this is the one flow with no automated proof (R-07), do not skip it**
- [ ] org-service: org tree / user list loads correctly for the real (not demo) org structure
- [ ] notification-service: an action produces a visible notification
- [ ] integration-hub: webhook ingestion + connector list; if multi-tenant, confirm R-01 has been fixed first
- [ ] Run the full Playwright suite one more time against the new environment: `cd e2e && npx playwright test`

## 11. Rollback plan

If smoke testing surfaces a blocking issue after step 9:

1. `docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml -f infra/docker-compose.edge.yml down`
2. Restore the database from the backup taken in step 1:
   ```bash
   # DO NOT RUN UNTIL APPROVED
   docker exec -i bpm-postgres pg_restore -U bpm -d bpm_db --clean --if-exists < pre_cleanup_backup_<timestamp>.sql.gz
   ```
3. Restore the pre-rotation `infra/.env` from your secret manager / backup copy (never from git — it was never committed)
4. Re-deploy the previously-known-good image tags (`${IMAGE_TAG}` in `infra/docker-compose.yml` — confirm your tagging/registry strategy supports pinning to the prior release before starting this runbook)
5. Re-run the smoke checklist against the rolled-back environment before declaring recovery complete

---

## Explicit confirmations

**2026-07-09 investigation pass** (documentation only):
- No data was deleted. No files were deleted. No commits or pushes were made. No secrets were printed in any doc.

**2026-07-10 fix pass** (investigated highest risks, fixed where safe — per explicit instruction to implement fixes for R-13/R-01/R-07):
- **No data was deleted** — the only data changes were: (1) a 5-row `UPDATE` correcting `users.keycloak_id` from stale placeholder strings to each user's real Keycloak UUID (R-07 fix — a correction, not a deletion, of existing rows), and (2) new rows created by exercising the real approval flow (2 new `approval_instances` + their process instances/tasks, plus 2 more from the new Playwright test's normal execution) — additive test evidence, not a modification of anything pre-existing.
- **No files were deleted.**
- **1 config line changed** in `infra/docker-compose.yml` (MinIO anonymous policy `download` → `none`) and **1 live infrastructure change** applied directly to the running MinIO container (same policy change) — both are the R-13 fix itself, not incidental changes.
- **3 new test files/additions**: `e2e/tests/02-contractor-portal/contractor-attachments-and-comments.spec.ts` (2 tests added to the existing file), `e2e/tests/04-backend-workflow/purchase-request-live-approval.spec.ts` (new file, 2 tests), `e2e/tests/helpers/api.ts` (3 new helper functions: `getPendingApprovals`, `approveApprovalStep`, `rejectApprovalStep`).
- **No cleanup SQL from doc 03 was run.** No Docker volumes were reset. No commits were made. No pushes were made. No secrets were printed in any document — the real Keycloak UUIDs used for the `keycloak_id` backfill are user identifiers, not credentials, and are not secret (they're not usable to authenticate as anyone).
- Full Playwright suite re-run after all changes: **43 passed, 1 skipped** (pre-existing, unrelated skip) — no regressions.
