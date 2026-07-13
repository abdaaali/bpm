# 05 — Service Test Plan (Manual + Automated)

> Reflects the Playwright suite as reorganized in the most recent session (`e2e/tests/00-auth` … `04-backend-workflow`). Last full-suite run referenced by this investigation: **39 passed, 1 skipped** (contractor work-order-lifecycle "accepting a pending work order" was skipped — likely because no `pending`-status work order was available in that run's seed state, not a failure).
>
> **Update 2026-07-10**: a follow-up fix pass (R-13 MinIO policy, R-07 approval live-proof) added 4 new tests. Full-suite re-run after the fixes: **43 passed, 1 skipped** (same pre-existing skip as before, unrelated to today's changes). See [06-production-readiness-risks.md](06-production-readiness-risks.md) for what was fixed and why.

## frontend-portal (Main BPM Portal)

- **Manual test steps:** open `http://localhost:8080` → Keycloak redirect → log in as a seeded user → land on `/home` → open Service Catalog → start a new request → confirm it appears in My Requests → open Process Studio → open an existing process → confirm it loads and can be saved/published.
- **API test command:** `curl -I http://localhost:8080` (expect 200); `curl -I http://localhost:3000/health` (api-gateway, expect 200)
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM process_definitions WHERE status='active';"` (expect ≥ 1)
- **Expected result:** login succeeds, dashboard loads with no console errors, a new request creates a `process_instances` row and at least one `tasks` row
- **Playwright coverage:** `e2e/tests/00-auth/main-portal-auth.setup.ts` + `main-portal-login.spec.ts`, `e2e/tests/01-main-portal/*` (5 spec files: smoke, my-requests-flow, process-studio-start-event-fields, service-catalog-new-request, case-assignee-reassignment)
- **Missing tests:** no dedicated test for the Launcher/dashboard tiles themselves; no test asserting the recently modernized visual/theme elements beyond what's implicitly exercised by navigation
- **Production smoke checklist:** [ ] login redirect works [ ] `/home` loads [ ] Service Catalog lists real process definitions (not "Test"/E2E ones) [ ] a request can be submitted [ ] Process Studio opens without error

## contractor-portal

- **Manual test steps:** open `http://localhost:8081` → log in with a contractor account → dashboard loads → open Work Orders → accept a pending order → add a progress update with notes → upload an attachment → check Team Overview (as company_admin/supervisor) → check Notifications page.
- **API test command:** `curl -X POST http://localhost:8081/api/ext/auth/login -H "Content-Type: application/json" -d '{"email":"<seeded contractor email>","password":"<seeded contractor password>"}'` (expect 200 + JWT, not 502 — a 502 here indicates the known stale-nginx-upstream issue, see risk register R-14)
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM external_audit_log WHERE action='LOGIN' AND created_at > now() - interval '5 minutes';"` (expect ≥ 1 after a manual login test)
- **Expected result:** login succeeds, work orders scoped to the logged-in contractor's company only, attachment upload creates a row in `external_attachments` and an object in MinIO `bpm-attachments`
- **Playwright coverage:** `e2e/tests/02-contractor-portal/*` (4 spec files: contractor-auth, contractor-navigation, contractor-work-order-lifecycle, contractor-attachments-and-comments)
- **Update 2026-07-10 (R-13 fix)**: `contractor-attachments-and-comments.spec.ts` gained 2 new tests: (1) `raw MinIO bucket object is not publicly downloadable` — confirms anonymous access to `http://localhost:9000/bpm-attachments/...` returns 403 now that the bucket policy was changed from `download` to `none`; (2) `authenticated contractor still gets a valid signed download URL` — uploads a file, confirms the unauthenticated download endpoint returns 401, and confirms the authenticated endpoint returns a redirect whose `Location` header contains a valid `X-Amz-Signature`. Both passing. **Caveat found while writing this test**: the signed URL's host is the Docker-internal `minio:9000`, unreachable by a real browser — see risk register R-22 (newly discovered, not fixed). The test therefore verifies the redirect and signature are correct rather than following the redirect like a real browser would, since a real browser could not complete that hop in this environment.
- **Missing tests:** **Notifications page has no test** (consistent with it being a static stub, see R-03); **TeamView has no test** covering the fetch-before-role-check behavior (R-04)
- **Production smoke checklist:** [ ] login works with a real (non-demo) contractor account [ ] work order list is scoped to that company only [ ] attachment upload/download works end-to-end **from an actual browser, not just via `docker exec`** (verify R-22 doesn't apply to your deployment topology) [ ] 502s do not occur on first login after a deploy [ ] raw MinIO bucket URLs return 403, not 200

## mobile-pwa

- **Manual test steps:** open `http://localhost:8082` → Connect screen shows both modes with no Server field → pick BPM Platform → log in → Cases/Tasks tabs load and survive a reload → pick Contractor Portal mode → log in → work order list loads → open a work order detail.
- **API test command:** same as frontend-portal (BPM mode) / contractor-portal (Contractor mode) underlying endpoints
- **DB verification query:** none specific — this app has no direct DB access; verify via the same queries as the app it's mirroring
- **Expected result:** both modes visually distinct (blue vs. orange), no Server field ever shown, session persists across reload
- **Playwright coverage:** `e2e/tests/03-mobile-pwa/*` (4 spec files: mobile-bpm-mode, mobile-connect-screen, mobile-contractor-mode, mobile-work-order-status-regression) — includes an explicit assertion that the Server field is absent (`getByLabel(/server/i)` count = 0) and brand-identity assertions on `data-testid="login-hero"` background color
- **Missing tests:** no test for token-refresh/expiry behavior (there is none to test, per [02](02-login-and-credentials-map.md)); no test confirming mode-switch does not leak the previous mode's session (both modes share the `pwa_token`/`pwa_user` keys — see R-09)
- **Production smoke checklist:** [ ] Connect screen has no Server field [ ] both modes log in successfully [ ] bottom-nav tabs work in both modes [ ] app is installable/works after a reload

## api-gateway

- **Manual test steps:** N/A (no UI) — verify indirectly via any frontend app working
- **API test command:** `curl -I http://localhost:3000/health` (expect 200); `curl -i http://localhost:3000/api/v1/cases` with no `Authorization` header (expect 401, confirming the gateway rejects unauthenticated requests)
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM audit_log WHERE created_at > now() - interval '1 hour';"`
- **Expected result:** health check 200; unauthenticated business API calls rejected with 401, not silently proxied
- **Playwright/API test coverage:** exercised implicitly by every `01-main-portal` spec (all traffic flows through this service)
- **Missing tests:** no dedicated test asserting the `TenantInterceptor` actually overwrites a forged `x-tenant-id` header sent by a malicious/misconfigured client — this is the platform's single tenant-trust boundary and currently has no explicit regression test proving it can't be bypassed
- **Production smoke checklist:** [ ] `/health` returns 200 [ ] unauthenticated request to a business endpoint returns 401 [ ] a request with a forged `x-tenant-id` header is still scoped to the JWT's real tenant, not the forged one

## bpm-orchestrator

- **Manual test steps:** start a process with a parallel gateway from Process Studio/Service Catalog, complete tasks on both branches in either order, confirm the join only fires once and only after both arrive
- **API test command:** `curl -I http://localhost:3003/health` (dev-only exposed port, expect 200)
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT status, count(*) FROM process_instances GROUP BY status;"`; `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM archived_process_instances;"` (currently 0 — see R-18, retention job has never archived a completed instance)
- **Expected result:** gateway-join tests pass; no duplicate downstream execution on a duplicate branch arrival
- **Playwright/API test coverage:** `e2e/tests/04-backend-workflow/gateway-join-synchronization.spec.ts` (4 tests: parallel join waits for all arrivals, duplicate arrival doesn't double-execute, early branch-end doesn't prematurely complete the instance, approval-resumed branch still joins correctly) — all passing per the most recent full-suite run
- **Missing tests:** no test exercises the documented asymmetric-branch edge case acknowledged in code comments (`process-instance.service.ts:113-125`); no test for the retention/archival job itself (0 rows in `archived_process_instances` in this environment means it's never been observed to run)
- **Production smoke checklist:** [ ] `/health` 200 [ ] a simple linear process completes end-to-end [ ] a parallel-gateway process joins correctly

## case-service

- **Manual test steps:** create a case, reassign it via the dialog (with and without typing a search term), confirm persistence after reload; upload an attachment to a case
- **API test command:** `curl -I http://localhost:3004/health` (internal-only, exec into a container on the same network or use `docker exec bpm-api-gateway wget -qO- http://case-service:3004/health` )
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM cases;"`
- **Expected result:** reassignment persists; a large org (>50 users) still allows finding the right assignee via search, but an untyped list is capped at 50 (see R-05)
- **Playwright/API test coverage:** `e2e/tests/01-main-portal/case-assignee-reassignment.spec.ts` (3 tests: dropdown loads real users, reassignment persists to DB and survives reload, tenant isolation)
- **Missing tests:** no test specifically proving the >50-user truncation behavior or that search correctly narrows a >50-user org
- **Production smoke checklist:** [ ] a case can be created [ ] reassignment persists [ ] attachment upload/download round-trips through MinIO

## approval-service

- **Manual test steps:** submit a request whose process definition requires CAB/manager approval, log in as the resolved approver, approve, confirm the process advances; then repeat with a reject decision
- **API test command:** `docker exec bpm-api-gateway wget -qO- http://approval-service:3002/health`
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM approval_instances;"` (was 0 before 2026-07-10; now has real rows from the live-proof test runs — see below)
- **Expected result:** an `approval_instances` row is created, an `approval_step_decisions` row is created on decision, the parent process instance advances/branches accordingly
- **Update 2026-07-10 (R-07 fix)**: a live proof was attempted and initially **failed** — `bpm-orchestrator` logged `Approval delegation ... failed: No approvers resolved for this policy/context` on the first real submission. Root cause: the demo users' `users.keycloak_id` held stale seed-file placeholder strings instead of their real Keycloak UUIDs, so `approval-service`'s existing `resolveUserId()` translation couldn't match a real login to the seeded user row, and `org-service`'s manager-chain lookup silently returned nobody. **Fixed by backfilling `keycloak_id`** for `requester1`/`manager1`/`finance1`/`cab1`/`engineer1` to their real Keycloak-issued UUIDs (no application code changed). Re-verified live end-to-end: `requester1` submits a real "Purchase Request" (`f0000000-0000-0000-0000-000000000001`) → `approval_instances` row created with `status='pending'`, correctly resolved to `manager1` (their real line manager per the org hierarchy) → `manager1` approves via the real `POST /api/v1/approval/instances/:id/steps/:stepId/approve` API → `approval_instances.status` becomes `'approved'` → the process instance's `current_node_id` automatically advances from `approval_gateway` to `fulfill_request`, with `variables.decision='approve'` and a new `Fulfill Request` task created. The reject path was verified the same way, routing to `rejection_task` instead.
- **Playwright/API test coverage:** **new** `e2e/tests/04-backend-workflow/purchase-request-live-approval.spec.ts` (2 tests: full approve path, full reject path) — both use the real "Purchase Request" process definition and its real seeded approval policy (not a synthetic BPMN fixture), both passing. This closes the "no Playwright spec drives a full approval" gap at the API level; a true browser/UI-driven version (clicking through the actual approval screens) is still not covered — see below.
- **Missing tests:** a browser/UI-driven approval test (clicking through frontend-portal's actual approval screens, not just calling the API directly) — the new test proves the backend flow is genuinely correct end-to-end, but doesn't exercise the approval UI's rendering/interaction layer
- **Production smoke checklist:** [ ] a real approval can be completed via the UI before go-live (the backend flow is now proven correct — this checklist item is about the UI layer specifically) [ ] **before importing any demo/seed users into a new environment, verify their `keycloak_id` matches their real Keycloak-issued UUID** (this is now the known failure mode — see runbook)

## org-service

- **Manual test steps:** open any screen that lists org units/positions/users (e.g. the assignee dropdown, org chart if present); verify data matches the real org structure once seeded
- **API test command:** `docker exec bpm-api-gateway wget -qO- http://org-service:3001/health`
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM org_units;"`
- **Expected result:** org tree renders correctly, manager-chain endpoint returns a plausible chain
- **Playwright/API test coverage:** indirectly via `case-assignee-reassignment.spec.ts` (org-units/users queries)
- **Missing tests:** no direct test of `org-unit.controller.ts`/`position.controller.ts` CRUD endpoints (both recently modified, both have no service-level auth guard — see R-11)
- **Production smoke checklist:** [ ] org tree loads [ ] user list is tenant-scoped correctly

## external-api

- **Manual test steps:** contractor login, profile fetch, work-order list/update, submission, attachment upload — all covered indirectly via contractor-portal's manual tests above
- **API test command:** `curl http://localhost:8081/api/ext/health` (via nginx) or `curl http://localhost:3007/api/ext/health` (dev-only exposed port)
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM external_users WHERE active=true;"`
- **Expected result:** 200 on health; login/CRUD flows scoped correctly per company
- **Playwright/API test coverage:** `e2e/tests/02-contractor-portal/*` (see above)
- **Missing tests:** none identified beyond the contractor-portal gaps already listed (Notifications stub, TeamView fetch-before-check)
- **Production smoke checklist:** [ ] `/api/ext/health` 200 [ ] login works [ ] work orders scoped by company

## notification-service

- **Manual test steps:** trigger a task assignment or case status change, confirm the assignee sees a notification (bell icon / notifications list) in frontend-portal
- **API test command:** `docker exec bpm-api-gateway wget -qO- http://notification-service:3006/health`
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM notifications WHERE created_at > now() - interval '1 hour';"`
- **Expected result:** a Kafka event (e.g. `bpm.task.created`) results in a new `notifications` row within seconds
- **Playwright/API test coverage:** none found — no spec directly exercises notification-service's consumer path or its list/mark-read API
- **Missing tests:** end-to-end "action creates notification, notification is visible in UI" test
- **Production smoke checklist:** [ ] a task assignment produces a visible notification for the assignee within a reasonable time window

## integration-hub

- **Manual test steps:** POST a signed test payload to one of the webhook ingestion endpoints, confirm a `unified_alarms` row appears; activate/deactivate a connector via its CRUD API
- **API test command:** `docker exec bpm-api-gateway wget -qO- http://integration-hub:3005/health`; `docker exec bpm-api-gateway wget -qO- http://integration-hub:3005/alarms/healthz/status`
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM unified_alarms;"`; `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT name, status FROM connectors;"`
- **Expected result:** webhook ingestion creates an alarm row; connector activation persists and (if type=cron) gets picked up by the scheduler on next reload
- **Playwright/API test coverage:** none found in the current E2E suite — this service has zero Playwright coverage
- **Missing tests:** webhook ingestion happy-path + auth-rejection test; connector CRUD test; and critically, **no test proves the alarm tenant-scoping gap (R-01)** — recommend adding a regression test once a tenant-identity design decision is made for webhook ingestion (see R-01 deep-dive in doc 06)
- **Update 2026-07-10**: re-investigated R-01/R-02 in full (see doc 06). R-02 (`loadActiveCrons` cross-tenant loading) was **downgraded to a non-issue** — each connector correctly carries its own `tenant_id` through every actual execution/log write; only the one-time scheduler bootstrap query itself has no filter, which is correct behavior for a shared scheduler process, not a bug. R-01 (`unified_alarms` has no `tenant_id`) remains open — confirmed that no webhook ingestion endpoint has any per-tenant identity mechanism today (single global static token per source type, no tenant field extracted by any normalizer), so a schema-only fix was deliberately not implemented to avoid a misleading partial fix. See doc 06's "R-01 deep-dive" for the full proposal.
- **Production smoke checklist:** [ ] webhook ingestion accepts a correctly-signed payload and rejects an unsigned one [ ] connector list loads [ ] **a tenant-identity design decision has been made for alarm ingestion before go-live if this service will serve more than one tenant** (see R-01)

## Keycloak

- **Manual test steps:** log in to the admin console with the (rotated, production) admin credentials; confirm the `bpm` realm is present with the expected clients/roles and no leftover demo users
- **API test command:** `curl -I http://localhost:8443/realms/bpm/.well-known/openid-configuration` (expect 200)
- **DB verification query:** N/A (Keycloak's own storage, not queried directly here)
- **Expected result:** realm reachable, demo users absent in production
- **Playwright/API test coverage:** exercised indirectly by every `00-auth` and mode-login spec
- **Production smoke checklist:** [ ] admin console reachable only from an authorized network [ ] demo users (`requester1`, `manager1`, etc.) absent [ ] `bpm-frontend`/`bpm-backend` client secrets rotated

## Postgres / Kafka / MinIO

- **Manual test steps:** N/A (infra) — verify via the services that depend on them
- **API test command:** `docker exec bpm-postgres pg_isready -U bpm`; `docker exec bpm-kafka kafka-topics.sh --bootstrap-server localhost:9092 --list` (if the image ships this script); MinIO console at `http://localhost:9001`
- **DB verification query:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT version();"`
- **Expected result:** all three respond
- **Update 2026-07-10**: MinIO's `bpm-attachments` bucket policy is now `none` (private) in both the live environment and `infra/docker-compose.yml` (was `download`, R-13, now fixed — verify with `docker exec bpm-minio mc anonymous get local/bpm-attachments`, expect `private`). While verifying this, found presigned URLs are signed for the Docker-internal `minio` hostname, unreachable by a real browser — see R-22, not fixed, needs a topology decision before production attachment downloads can be trusted to work for real users.
- **Production smoke checklist:** [ ] Postgres accepting connections [ ] Kafka broker healthy [ ] MinIO bucket policy is `private`/`none`, not `download` (R-13 — **fixed** 2026-07-10, re-verify after any environment rebuild since `minio-init` only runs its policy command once per bucket creation) [ ] a presigned attachment URL is actually reachable from a real browser outside the Docker network, not just from another container (R-22 — **not yet fixed**)

## Full-suite command reference

```bash
cd e2e
npx playwright test              # full suite
npx playwright test --project=main-portal
npx playwright test --project=contractor-portal
npx playwright test --project=mobile-pwa
npx playwright test --project=backend-workflow
npx playwright show-report       # view last HTML report
```

Run from the `e2e/` directory specifically — running from the repo root has previously caused an unrelated Jest test file (`services/integration-hub/src/alarm/__tests__/*.spec.ts`) to be picked up incorrectly and has produced the untracked root-level `test-results/` directory flagged in [04](04-files-to-remove-before-production.md).
