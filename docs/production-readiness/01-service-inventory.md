# 01 — Service Inventory

> Investigation date: 2026-07-09. All facts below were gathered read-only (code inspection, `docker ps`, `docker-compose.yml` inspection, read-only `psql` queries). No secret values are included. See [02-login-and-credentials-map.md](02-login-and-credentials-map.md) for auth/credential detail.

Container status at investigation time: all 22 containers in `docker ps` reported `healthy` (or running, for containers without a healthcheck) — see raw output referenced in [00-investigation-index.md](00-investigation-index.md).

---

## frontend-portal (Main BPM Portal)

- **Folder:** `apps/frontend-portal`
- **Container:** `bpm-frontend`
- **Port:** external `8080:80` (nginx serving built static assets) → proxies `/api` to `api-gateway` internally
- **URL:** `http://localhost:8080` (dev/local)
- **Purpose:** Primary internal-employee web portal — Service Catalog, My Requests, Process Studio (BPMN designer), Case management, dashboards, launcher.
- **Main dependencies:** `api-gateway` (all data), Keycloak (auth, browser redirect flow)
- **Database tables used:** none directly — all data via `api-gateway` → backend services
- **Kafka topics:** none directly
- **MinIO/storage:** none directly — attachment upload/download proxied through `api-gateway` → `case-service`
- **Health endpoint:** nginx default `/` (200 if serving); no dedicated `/health` route in this static SPA
- **Main APIs (consumed, not owned):** `api/v1/cases`, `api/v1/processes`, `api/v1/tasks`, `api/v1/org`, `api/v1/me`, `api/v1/dashboard`, `api/v1/reports`, etc. via `api-gateway`
- **Auth requirements:** Keycloak redirect login required for every route (`onLoad: 'login-required'`); see login map doc
- **Tenant scoping status:** N/A (frontend) — tenant is derived server-side from the validated JWT by `api-gateway`, not trusted from the client
- **Current known issues:** main JS bundle exceeds Vite's 500KB warning threshold (pre-existing, not a functional bug — see risk register item R-08)
- **Manual verification:** open `http://localhost:8080`, confirm Keycloak login redirect, log in, confirm `/home` loads, exercise Service Catalog → New Request → Process Studio → Cases
- **Command verification:** `docker logs --tail=100 bpm-frontend`; `curl -I http://localhost:8080`

---

## contractor-portal

- **Folder:** `apps/contractor-portal`
- **Container:** `bpm-contractor-frontend`
- **Port:** external `8081:80` (nginx) → proxies `/api/ext` to `external-api`
- **URL:** `http://localhost:8081`
- **Purpose:** External-facing portal for contractor/vendor companies — view/accept/update assigned work orders, submit progress, upload attachments, team overview.
- **Main dependencies:** `external-api` (all data + auth)
- **Database tables used:** none directly — via `external-api`
- **Kafka topics:** none directly
- **MinIO/storage:** none directly — attachment upload proxied through `external-api`
- **Health endpoint:** nginx default `/`; backend health is `external-api`'s `GET /api/ext/health`
- **Main APIs (consumed):** `POST /api/ext/auth/login`, `GET /api/ext/auth/profile`, `GET/PUT /api/ext/work-orders`, `POST /api/ext/submissions`, `POST /api/ext/attachments`, `GET /api/ext/company`
- **Auth requirements:** own JWT login form (not Keycloak) — see login map doc
- **Tenant scoping status:** scoped by `company_id`/`tenant_id` claim embedded in the contractor JWT, validated server-side by `external-api`
- **Current known issues:**
  - `NotificationsPage.tsx` is a **static stub** — hardcoded "No notifications yet" card, no API call, no real data wired up (confirmed by reading `apps/contractor-portal/src/pages/NotificationsPage.tsx`)
  - `TeamView.tsx` calls `companyApi.getMyCompany()`/`getTeam()` in a `useEffect` that fires **before** the role check (`if (!['company_admin','supervisor'].includes(...))`) later in the render — the network calls happen for any authenticated contractor regardless of role; only the rendered output is gated (`apps/contractor-portal/src/pages/TeamView.tsx:17-26`)
  - See risk register items R-03, R-04
- **Manual verification:** open `http://localhost:8081`, log in as a seeded demo contractor user, confirm dashboard/work-order list loads, open a work order, add a comment/attachment
- **Command verification:** `docker logs --tail=100 bpm-contractor-frontend`; `curl -X POST http://localhost:8081/api/ext/auth/login -H "Content-Type: application/json" -d '{"email":"<seeded email>","password":"<seeded password>"}'` (expect 200/JWT, not 502)

---

## mobile-pwa

- **Folder:** `apps/mobile-pwa`
- **Container:** `bpm-mobile-pwa`
- **Port:** external `8082:80` (nginx)
- **URL:** `http://localhost:8082`
- **Purpose:** Mobile-optimized dual-mode PWA — "BPM Platform" mode (Keycloak, cases/tasks for internal staff) and "Contractor Portal" mode (work orders for field technicians), selected on a Connect screen.
- **Main dependencies:** Keycloak (BPM mode), `external-api` (Contractor mode), `api-gateway` (BPM mode data)
- **Database tables used:** none directly
- **Kafka topics:** none directly
- **MinIO/storage:** none directly
- **Health endpoint:** nginx default `/`
- **Main APIs (consumed):** BPM mode — same `api/v1/*` surface as frontend-portal via `api-gateway`; Contractor mode — same `api/ext/*` surface as contractor-portal via `external-api`
- **Auth requirements:** BPM mode — Keycloak **direct-grant** (Resource Owner Password Credentials) POST to the realm token endpoint, not a redirect; Contractor mode — `POST /api/ext/auth/login`, same as contractor-portal
- **Tenant scoping status:** same as the two portals it mirrors
- **Current known issues:**
  - `connection.ts` still defines a `server: string` field on the `Conn` type and interpolates it into `apiBase()`/`kcTokenUrl()`; the UI-level Server text field was removed and every connection object is created with `server: ''` (same-origin only), so this is a code-cleanliness note, not a functional/security gap — see risk register R-09
  - No token-refresh mechanism (BPM mode's Keycloak token is used until it expires — no `updateToken` loop like frontend-portal has)
  - Main JS bundle size warning (same as frontend-portal, pre-existing)
- **Manual verification:** open `http://localhost:8082`, pick BPM Platform mode, log in, confirm Cases/Tasks tabs load; repeat for Contractor Portal mode
- **Command verification:** `docker logs --tail=100 bpm-mobile-pwa`; Playwright suite `e2e/tests/03-mobile-pwa/*`

---

## api-gateway

- **Folder:** `services/api-gateway`
- **Container:** `bpm-api-gateway`
- **Port:** external `3000:3000`
- **Internal URL:** `http://api-gateway:3000`
- **Purpose:** Edge/BFF — the platform's single tenant-trust boundary. Validates Keycloak JWTs, derives `tenantId`/`userId`/roles, and proxies to all internal backend services, overwriting any client-supplied `x-tenant-id` header.
- **Main dependencies:** Keycloak (JWT verification via JWKS), org-service, approval-service, bpm-orchestrator, case-service, integration-hub, notification-service (all internal, unauthenticated between themselves)
- **Database tables used:** `audit_log` only (own audit trail) — everything else proxied
- **Kafka topics:** produces `bpm.gateway.requests`
- **MinIO/storage:** none directly (attachment calls proxied downstream)
- **Health endpoint:** `GET /health` (liveness only, no DB check)
- **Main APIs owned/proxied:** `api/v1/cases`, `api/v1/approval`, `api/v1/processes`, `api/v1/tasks`, `api/v1/org`, `api/v1/alarms`, `api/v1/integrations`, `api/v1/notifications`, `api/v1/mdm/*`, `api/v1/rca`, `api/v1/sla`, `api/v1/reports`, `api/v1/digest`, `api/v1/retention`, `api/v1/audit`, `api/v1/dashboard`, `api/v1/datahub`, `api/v1/contractors`, `api/v1/me`
- **Auth requirements:** `JwtAuthGuard` + `PermissionsGuard` on nearly every business controller; `health`/`metrics` unguarded (expected); `alarm`/`rca`/`me`/`dashboard` controllers use `JwtAuthGuard` only (no fine-grained permission check — narrower, not obviously wrong)
- **Tenant scoping status:** this is the enforcement point — `TenantInterceptor` (`src/auth/tenant.interceptor.ts:14`) derives tenant from the validated JWT and overwrites any client-supplied value before forwarding downstream
- **Current known issues:** none found beyond the narrower-guard note above
- **Manual verification:** `curl -I http://localhost:3000/health` (expect 200)
- **Command verification:** `docker logs --tail=100 bpm-api-gateway`; `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM audit_log;"`

---

## bpm-orchestrator

- **Folder:** `services/bpm-orchestrator`
- **Container:** `bpm-orchestrator`
- **Port:** internal only `3003` (dev override in `docker-compose.dev.yml` exposes `3003:3003` on host for local Playwright)
- **Internal URL:** `http://bpm-orchestrator:3003`
- **Purpose:** BPMN process engine — starts/advances process instances, manages user/service tasks, parallel-gateway fork/join synchronization, process analytics/reports/digest/retention.
- **Main dependencies:** Postgres, Kafka (producer only), reached only via `api-gateway`
- **Database tables used:** `process_instances`, `process_definitions`, `tasks`, `gateway_forks`, `gateway_arrivals`, `cases`, `approval_instances`, `approval_policies`, `org_units`, `users`, `tenants`, `audit_log`, `archived_process_instances`, `archived_cases`, `digest_config/recipients/runs`, `report_templates`, `retention_runs`, `rca_records`, `work_order_assignments`, `case_comments`, `case_links`, `case_vendor_escalations`, `capa_actions`
- **Kafka topics (produced):** `bpm.process.started`, `bpm.process.completed`, `bpm.process.definition`, `bpm.task.created`, `bpm.task.claimed`, `bpm.task.completed`, `bpm.task.reassigned`, `bpm.task.sla_breach`, `bpm.service.task`, `bpm.case.synced`. No Kafka consumer in this service.
- **MinIO/storage:** none
- **Health endpoint:** `GET /health` (static ok, no DB check)
- **Main APIs:** `instances` (process-instance CRUD/advance), `tasks`, `definitions` (process-definition CRUD/publish/archive), `analytics`, `rca`, `reports`, `digest`, `retention`
- **Auth requirements:** **no auth guards at all** — `src/auth/` directory exists but is empty. Trusts `x-tenant-id`/`x-user-id` headers directly (falls back to a hardcoded default tenant UUID if absent). Secure only because `api-gateway` is the sole network path in.
- **Tenant scoping status:** consistent — every controller method derives `tenantId` from headers
- **Current known issues:**
  - Gateway-join fork/join mechanism (`process-instance.service.ts`) confirmed present and coherent: row-locked (`FOR UPDATE`) fork rows, idempotent arrival inserts, arrival-count vs. `expected_count` comparison, nested-fork support via `parent_fork_id`. Code comments acknowledge a documented gap for asymmetric fork branches that bypass their join (`process-instance.service.ts:113-125`) — not fully resolved, flagged for future work, not a regression from recent fixes
  - No JWT-level defense-in-depth (see cross-cutting note below)
- **Manual verification:** start a process from Service Catalog in frontend-portal, confirm a task is created and can be completed
- **Command verification:** `curl -I http://localhost:3003/health` (dev-only exposed port); `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT status, count(*) FROM process_definitions GROUP BY status;"`; Playwright `e2e/tests/04-backend-workflow/gateway-join-synchronization.spec.ts`

---

## case-service

- **Folder:** `services/case-service`
- **Container:** `bpm-case-service`
- **Port:** internal only `3004`
- **Internal URL:** `http://case-service:3004`
- **Purpose:** Manages operational "cases" (incidents/requests/changes/problems) — CRUD, SLA tracking, routing, attachments, contractor work-order assignment, DataHub site/vendor lookups, RCA linkage.
- **Main dependencies:** Postgres, Kafka (producer only), MinIO, approval-service (for policy resolution), reached only via `api-gateway`
- **Database tables used:** `cases`, `attachments`, `case_comments`, `case_links`, `case_sequences`, `case_sla_pauses`, `case_vendor_escalations`, `capa_actions`, `audit_log`, `tasks`, `process_definitions`, `rca_records`, `root_cause_taxonomy`, `sla_targets`, `sla_class_factors`, `datahub_sites/routes/spares/vendors`, `org_units`, `tenants`, `users`, `roles`, `user_roles`, `user_org_assignments`, `work_order_assignments`, plus `external_*` tables shared with external-api
- **Kafka topics (produced):** `bpm.case.created`, `bpm.case.assigned`, `bpm.case.status_changed`, `bpm.case.sla_breach`, `bpm.case.sla_at_risk`, `bpm.case.sla_paused`, `bpm.case.sla_resumed`, `bpm.case.major_declared`, `bpm.case.major_resolved`, `bpm.case.vendor_escalated`, `bpm.case.vendor_resolved`, `bpm.case.auto_linked`. No consumer.
- **MinIO/storage:** yes — bucket `bpm-attachments` (`attachment.service.ts:5`), `putObject`/`presignedGetObject`/`removeObject`
- **Health endpoint:** `GET /health` (DB-dependency checked)
- **Main APIs:** `cases` (CRUD + `/stats`, `/ops-overview`, `/my-work`, `/by-division`), `routing`, `contractors`, `datahub`, `sla` (SLA config)
- **Auth requirements:** **no auth guards** — `src/auth/` empty, same header-trust pattern as bpm-orchestrator
- **Tenant scoping status:** consistent via a `tenant(h)` header helper
- **Current known issues:**
  - Case-reassignment Assignee `Autocomplete` in frontend-portal's `CaseDetail.tsx` calls `orgApi.getUsers(1, 50, { search })` — server-side page size capped at 50 per page; without typing a search term, org units with more than 50 users will only show the first 50 alphabetically/by-id. Search is server-scoped (not just client-side filtering), so it is not a hard bug, but it is a real truncation risk for large tenants if a caller doesn't search — see risk register R-05
  - `attachments` table has 0 rows currently (case-service's own attachment path is unused so far; all 19 stored attachments in this environment are on the `external_attachments`/contractor path instead)
- **Manual verification:** open a case in frontend-portal, reassign it via the dialog, confirm persistence after reload
- **Command verification:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM cases;"`; Playwright `e2e/tests/01-main-portal/case-assignee-reassignment.spec.ts`

---

## approval-service

- **Folder:** `services/approval-service`
- **Container:** `bpm-approval-service`
- **Port:** internal only `3002`
- **Internal URL:** `http://approval-service:3002`
- **Purpose:** Resolves and tracks multi-step approval workflows (hierarchy/role/specific-user/org-unit approver resolution), applies delegations and segregation-of-duties, drives approval instance state.
- **Main dependencies:** Postgres, org-service (approver resolution), reached only via `api-gateway`
- **Database tables used:** `approval_instances`, `approval_policies`, `approval_step_decisions`, `delegations`, `locks`, `positions`, `roles`, `users`, `user_roles`, `user_org_assignments`, `cases`, `audit_log`
- **Kafka topics (produced):** `bpm.approvals`. No consumer.
- **MinIO/storage:** none
- **Health endpoint:** `GET /health`
- **Main APIs:** `instances` (approval decision endpoints), `policies`, `delegations`, `metrics`
- **Auth requirements:** **no auth guards** — same header-trust pattern
- **Tenant scoping status:** mostly consistent (e.g. `resolver/approval-resolver.service.ts:100`). One minor unscoped lookup: `approval-resolver.service.ts:128` — `SELECT * FROM users WHERE id = $1` (delegate lookup) has no `tenant_id` filter; the delegate ID is sourced from an already tenant-scoped delegation map so exploitability is limited, but it's a latent gap — see risk register R-06
- **Current known issues:**
  - `approval_instances` table currently has **0 rows** in this environment — meaning there is no live evidence in this database that a multi-step approval has ever run end-to-end through the UI; the fork/join synchronization test (`e2e/tests/04-backend-workflow/gateway-join-synchronization.spec.ts`) exercises the approval-resume code path at the API level, but no Playwright spec drives a full CAB/manager approval through the actual UI screens — see risk register R-07
  - Fork/join context round-trip (`instance.service.ts:64-68`) confirmed present and matches the orchestrator-side mechanism
- **Manual verification:** submit a request that requires CAB/manager approval, log in as the approver, approve/reject, confirm the process advances
- **Command verification:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM approval_instances;"`

---

## org-service

- **Folder:** `services/org-service`
- **Container:** `bpm-org-service`
- **Port:** internal only `3001`
- **Internal URL:** `http://org-service:3001`
- **Purpose:** Master org data — tenants, org units (hierarchy), positions, users, roles, and their assignments; source of truth consumed by every other service.
- **Main dependencies:** Postgres, Keycloak (admin API, for user provisioning), reached only via `api-gateway`
- **Database tables used:** `tenants`, `org_units`, `positions`, `users`, `roles`, `user_roles`, `user_org_assignments`, `audit_log`
- **Kafka topics (produced):** `bpm.org.changed`. No consumer.
- **MinIO/storage:** none
- **Health endpoint:** `GET /health`
- **Main APIs:** `tenants`, `org-units` (+ `/tree`, `/:id/manager-chain`), `positions`, `users`, `roles`
- **Auth requirements:** **no auth guards** — `org-unit.controller.ts` and `position.controller.ts` (both recently modified) have no `@UseGuards` import at all; every route is reachable without any service-level check, relying entirely on `api-gateway`'s guards upstream
- **Tenant scoping status:** consistent — `tid` derived from `x-tenant-id` header in every controller method
- **Current known issues:** none beyond the shared no-defense-in-depth pattern (see cross-cutting note below)
- **Manual verification:** open Org chart / user admin screens in frontend-portal (if present) or verify via API
- **Command verification:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM org_units;"`

---

## external-api

- **Folder:** `services/external-api`
- **Container:** `bpm-external-api`
- **Port:** internal `3007` (dev override exposes `3007:3007` on host for local Playwright)
- **Internal URL:** `http://external-api:3007`
- **Purpose:** Contractor/vendor-facing external API — its own self-contained JWT auth (separate from Keycloak), work-order intake, submissions, attachments, company profile.
- **Main dependencies:** Postgres, MinIO, reached directly by `contractor-frontend` and `mobile-pwa` (Contractor mode) — **not** proxied through `api-gateway`
- **Database tables used:** `external_companies`, `external_users`, `external_submissions`, `external_attachments`, `external_audit_log`, `cases`, `case_comments`, `work_order_assignments`, `users`
- **Kafka topics:** none — no Kafka module in this service
- **MinIO/storage:** yes — bucket from `MINIO_BUCKET` env (default `bpm-attachments`, same bucket name/instance as case-service)
- **Health endpoint:** `GET /api/ext/health`
- **Main APIs:** `api/ext/auth` (login/profile/logout), `api/ext/company`, `api/ext/work-orders`, `api/ext/submissions`, `api/ext/attachments`
- **Auth requirements:** the **only** internal service with real, self-contained JWT auth — `JwtAuthGuard` applied on `attachments`, `company`, `submissions`, `work-orders`, and the protected routes of `auth.controller.ts`
- **Tenant scoping status:** scoping tied to `company_id`/`tenant_id` claim in the contractor JWT; no unscoped cross-tenant query found in the controllers reviewed
- **Current known issues:** none found in this service directly (see contractor-portal frontend issues above, which consume this service)
- **Dockerfile note:** the only service Dockerfile that explicitly sets `USER node` (all other 7 backend services run as root in their containers) — see risk register R-10
- **Manual verification:** `curl -X POST http://localhost:8081/api/ext/auth/login ...` (via contractor-frontend) or directly to `:3007` in dev
- **Command verification:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM external_users;"`; `docker exec bpm-minio mc ls local/bpm-attachments --recursive | wc -l`

---

## notification-service

- **Folder:** `services/notification-service`
- **Container:** `bpm-notification-service`
- **Port:** internal only `3006`
- **Internal URL:** `http://notification-service:3006`
- **Purpose:** Consumes platform Kafka events and renders/dispatches in-app notifications (+ email via SMTP for some templates); lets users query/mark-read their notifications.
- **Main dependencies:** Postgres, Kafka (consumer), SMTP relay, reached only via `api-gateway`
- **Database tables used:** `notifications`, `notification_templates`, `users`, `roles`, `user_roles`
- **Kafka topics (consumed):** `bpm.task.created`, `bpm.task.sla_breach`, `bpm.task.reassigned`, `bpm.approvals`, `bpm.case.created`, `bpm.case.sla_breach`, `bpm.case.assigned`, `bpm.case.status_changed`, `bpm.case.major_declared`, `bpm.case.major_resolved`, `bpm.case.sla_at_risk`, `bpm.case.vendor_escalated`, `bpm.case.vendor_resolved`, `bpm.process.started`, `bpm.process.completed`. No producer topics.
- **MinIO/storage:** none
- **Health endpoint:** `GET /health` (DB-dependency checked)
- **Main APIs:** `notifications` (list/unread-count/mark-read/send), `templates`, `metrics`
- **Auth requirements:** **no auth guards** — same header-trust pattern
- **Tenant scoping status:** consistent via `tenant(h)` helper
- **Current known issues:** none found beyond the shared no-defense-in-depth pattern
- **Manual verification:** trigger a task assignment, confirm a notification appears for the assignee
- **Command verification:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM notifications;"`

---

## integration-hub

- **Folder:** `services/integration-hub`
- **Container:** `bpm-integration-hub`
- **Port:** internal only `3005`
- **Internal URL:** `http://integration-hub:3005`
- **Purpose:** Ingests alarms from external monitoring systems (Zabbix/Alertmanager/Grafana), normalizes/dedupes/enriches via MDM, computes SLA, auto-creates BPM cases/tickets, and manages outbound "connectors" (webhooks/cron jobs) to external systems.
- **Main dependencies:** Postgres, Kafka (producer + consumer), external monitoring webhooks
- **Database tables used:** `unified_alarms`, `alarm_ticket_map`, `alarm_enrichment_jobs`, `connectors`, `connector_logs`, `mdm_hosts`, `mdm_lookups`, `case_sync_outbox`, `cases`, `audit_log`
- **Kafka topics:** produces `bpm.connectors.updated`; consumes `bpm.service.task`, `bpm.case.created`, `bpm.connectors.updated`
- **MinIO/storage:** none
- **Health endpoint:** `GET /health` (DB-dependency) + `GET /alarms/healthz/status`
- **Main APIs:** `alarms/webhooks/{zabbix,alertmanager,grafana}` (ingestion, custom static-token auth), `alarms` (query), `connectors` (CRUD/activate/execute/logs), `mdm/hosts`, `mdm/lookups`, `rca`, `metrics`
- **Auth requirements:** `connectors`/`mdm`/`alarm-query` controllers have **no guards** (header-trust pattern); the **webhook ingestion controller** instead uses a static per-source token + `timingSafeEqual` comparison, fail-closed if the token env var is unset — appropriate for server-to-server webhooks
- **Tenant scoping status — CONFIRMED GAP:**
  - Connector queries (CRUD, logs) **are** consistently tenant-scoped
  - The **alarm subsystem is NOT tenant-scoped at all** — `unified_alarms` has no `tenant_id` column (confirmed absent in `infra/db/migrations/007_alarm_ingestion.sql`), and every alarm query (`alarm.service.ts` list/findById/ticket-mapping, `alarm-query.controller.ts`) operates across all tenants globally. See risk register R-01.
  - The connector cron scheduler's `loadActiveCrons()` (`connector.service.ts:188-194`) runs `SELECT * FROM connectors WHERE type='cron' AND status='active'` with **no tenant filter**, scheduling every tenant's active cron connectors together in-process. Individual `execute()` calls are still tenant-scoped once triggered, so this is a load-time hygiene issue rather than a cross-tenant write bug. See risk register R-02.
- **Current known issues:** see the two confirmed gaps above
- **Manual verification:** trigger `POST /alarms/webhooks/zabbix` with a signed test payload, confirm a `unified_alarms` row appears and (if configured) an auto-created case
- **Command verification:** `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT count(*) FROM unified_alarms;"`; `docker exec bpm-postgres psql -U bpm -d bpm_db -c "SELECT name, type, status FROM connectors;"`

---

## Cross-cutting backend observation

All internal backend services **except external-api** ship with a completely empty `src/auth/` directory — no JWT guards anywhere in api-gateway-internal services (bpm-orchestrator, case-service, approval-service, org-service, notification-service, integration-hub). They trust `x-tenant-id`/`x-user-id` request headers directly, falling back to a hardcoded default tenant UUID (`a0000000-0000-0000-0000-000000000001`) when absent. This is safe **only** as long as these services are never network-reachable except through `api-gateway`'s `TenantInterceptor`. In the current `infra/docker-compose.yml`, all of them are declared with **no host port mapping** (internal-only on `bpm-net`), which is the correct mitigation — but this is a single point of failure: if any of these services were ever given a host port mapping (e.g. for local debugging) without also adding a guard, they would become directly reachable with attacker-controlled tenant/user headers. Documented as risk register R-11 (defense-in-depth).

---

## Infrastructure / platform services

### Keycloak
- **Folder:** `infra/keycloak/realm-export.json` (config only, no service code)
- **Container:** `bpm-keycloak`
- **Port:** external `8443:8080` (comment in compose notes production should bind to loopback behind the TLS edge proxy)
- **Purpose:** Identity provider for internal users (realm `bpm`, clients `bpm-frontend` public / `bpm-backend` confidential)
- **Health endpoint:** Keycloak's own `/health` (compose healthcheck configured)
- **Known issues:** see [02-login-and-credentials-map.md](02-login-and-credentials-map.md) — seeded demo users ship with a literal plaintext password in the tracked realm-export file

### Postgres
- **Container:** `bpm-postgres`
- **Purpose:** Single shared database (`bpm_db`) for all backend services (schema-per-service via table naming, not separate DBs)
- **Port:** internal only
- **Known issues:** `038_observability.sql` migration creates a `grafana_ro` role with a hardcoded literal default password — see risk register R-12

### Kafka (+ kafka-ui)
- **Containers:** `bpm-kafka`, `bpm-kafka-ui`
- **Purpose:** Event bus for cross-service async notifications (case/task/approval/process lifecycle events → notification-service, integration-hub)
- **Port:** kafka internal only; kafka-ui external `8091:8080` (should not be exposed in production — admin UI with no auth configured by default)

### MinIO
- **Container:** `bpm-minio` (+ one-shot `bpm-minio-init`)
- **Purpose:** S3-compatible object storage for case/work-order attachments (bucket `bpm-attachments`)
- **Port:** external `9000` (API) / `9001` (console)
- **Known issue — CONFIRMED:** the `minio-init` entrypoint runs `mc anonymous set download local/bpm-attachments` (`infra/docker-compose.yml:149`), granting **public/anonymous download** access to the entire `bpm-attachments` bucket. Anyone who obtains or guesses an object key can download it without authentication. See risk register R-13 (high severity).

### nginx / proxy containers
- Each frontend app (`frontend`, `contractor-frontend`, `mobile-pwa`) ships its own nginx reverse-proxy container as part of its Docker image (not a separate shared nginx container)
- `infra/docker-compose.edge.yml` adds one shared TLS-terminating `bpm-edge` nginx container in front of `frontend` + `api-gateway` for production
- **Known issue:** recurring stale-upstream-IP problem observed during this engineering session — rebuilding one service (e.g. `mobile-pwa`) can cascade-recreate a dependency (`external-api`) with a new Docker bridge IP; `contractor-frontend`'s nginx caches the old IP until restarted, causing transient 502s. No permanent fix (e.g. an nginx `resolver` directive for dynamic DNS re-resolution) has been applied. See risk register R-14.
