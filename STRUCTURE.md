# Repository Structure

This document maps the current layout of the BPM Portal monorepo: every top-level directory, what
lives inside it, and how the pieces connect. It complements — rather than replaces — the other docs
in this repo:

- **`README.md`** — quick start, demo users, day-1 orientation.
- **`docs/`** — deployment, cutover, runbooks, and security-review documents (linked at the bottom).
- **`STRUCTURE.md`** (this file) — the full map of the codebase: apps, services, infra, schema, CI.

The platform started as a 6-service BPM/approval engine and has since grown into a full ITIL
operations platform: process authoring (Studio), contractor/vendor dispatch, alarm ingestion with
MDM enrichment, RCA/CAPA and ML-assisted root-cause analytics, a mobile PWA, and a production
observability/hardening stack. This document reflects that current state.

## Top-Level Layout

```
bpm-v1/
├── apps/                  React/Vite frontends (3 apps)
│   ├── frontend-portal/   Main enterprise BPM operations portal
│   ├── contractor-portal/ External contractor/vendor web portal
│   └── mobile-pwa/        Installable dual-mode mobile PWA
├── services/               NestJS backend microservices (8 services)
│   ├── api-gateway/
│   ├── org-service/
│   ├── approval-service/
│   ├── bpm-orchestrator/
│   ├── case-service/
│   ├── integration-hub/
│   ├── notification-service/
│   └── external-api/
├── infra/                  Docker Compose stack, DB migrations, edge/TLS, monitoring, load testing
├── docs/                   Deployment, cutover, runbook, and design documentation
├── .github/workflows/      CI/CD pipeline (GitHub Actions)
└── .claude/                Local Claude Code harness settings (not part of the product)
```

## Architecture

```
                         ┌───────────────────────────────┐
                         │   Edge Proxy (nginx, TLS)      │   infra/edge — prod-only public entry
                         └───────────────┬─────────────────┘
                                         │
        ┌────────────────┬──────────────┼──────────────────┬─────────────────┐
        │                │              │                  │                 │
┌───────▼──────┐ ┌───────▼───────┐ ┌────▼─────────┐  ┌─────▼──────┐          │
│  frontend    │ │ contractor-   │ │ mobile-pwa    │  │ Keycloak   │          │
│  :8080       │ │ frontend      │ │ :8082         │  │ :8443      │          │
│ (frontend-   │ │ :8081         │ │ (dual-mode:   │  │ (SSO/JWT)  │          │
│  portal)     │ │ (contractor-  │ │  BPM+external)│  └────────────┘          │
└──────┬───────┘ │  portal)      │ └──────┬────────┘                          │
       │         └──────┬────────┘        │                                  │
       │ /api/v1         │ /api/ext        │ both                            │
       └────────┬────────┘                 │                                 │
                 │        ┌─────────────────┘                                │
        ┌────────▼────────▼──────┐                              ┌────────────▼───┐
        │   API Gateway :3000    │                              │  external-api   │
        │ JWT · routing · CORS   │──────────────────────────────▶│  :3007          │
        └──┬───┬───┬───┬───┬────┘                              │  (contractor    │
           │   │   │   │   │                                    │   auth + WOs)   │
   ┌───────▼┐┌─▼──┐┌▼───┐┌▼────┐┌▼──────┐                       └────────┬────────┘
   │Org     ││Appr││BPM ││Case ││Integ- │                                │
   │:3001   ││oval││Orch││:3004││ration │                                │
   │        ││:3002││:3003│      ││Hub    │                                │
   └───┬────┘└─┬──┘└─┬──┘└──┬──┘│:3005  │                                │
       │        │     │      │  └──┬────┘                                │
       │        │     │      │     │                                     │
       │  ┌──────────────────────────────────┐                           │
       │  │ Notification Service :3006        │                          │
       │  └──────────────┬─────────────────────┘                         │
       │                 │                                               │
       └─────────┬───────┴──────────┬────────────────────────────────────┘
                  │  All services publish/subscribe via Kafka             │
           ┌──────▼───────┐                                               │
           │  Kafka (KRaft)│                                              │
           │  :9092/9094   │                                              │
           └──────┬────────┘                                              │
                  │                                                       │
      ┌───────────┼────────────────────────────┐                         │
      │            │                            │                         │
┌─────▼─────┐ ┌────▼─────┐              ┌───────▼──────┐                 │
│ PostgreSQL │ │  MinIO   │              │   Keycloak    │◀────────────────┘
│  :5432     │ │ :9000/01 │              │    :8443      │
└────────────┘ └──────────┘              └───────────────┘

     Observability (separate from the request path): Prometheus :9090 →
     Grafana :3300 · Loki (log store, internal) ← Promtail (Docker log
     shipper) · Alertmanager :9094 (routes alerts by email)
```

## Backend Services (`services/`)

All services are NestJS + TypeScript, built with `tsc`, tested with Jest, and share a common
environment contract (`DATABASE_URL`, `KAFKA_BROKERS`, Keycloak JWKS URL, MinIO credentials). Every
service exposes `/health` (or `/api/health`) for Docker healthchecks and Prometheus metrics.

| Service | Port | Purpose |
|---|---|---|
| `api-gateway` | 3000 | Public entry point for the frontend/contractor apps: JWT validation via Keycloak JWKS, `X-Tenant-ID` injection, request routing/proxying to all downstream services, CORS, rate limiting, dashboard aggregation, Kafka request logging |
| `org-service` | 3001 | Multi-tenant org hierarchy (Company → Division → Department → Section → Team), users, positions, roles, RBAC policy, Keycloak user provisioning |
| `approval-service` | 3002 | Approval policy engine: hierarchy/role/specific-user/org-unit-manager/parallel step types, conditional steps, delegation (date-range substitution), immutable decision snapshots |
| `bpm-orchestrator` | 3003 | BPMN 2.0 process engine: definitions, versioning, token-based execution (start/user-task/gateway/end), SLA breach scheduler, process analytics, automated digests, retention/archival, RCA integration |
| `case-service` | 3004 | ITIL case management (Incident/Problem/Change/Request/Alarm/Fault): state machine, auto-numbering, SLA calculation with pause/resume and at-risk prediction, case↔process linking, parent/child cases, RCA/CAPA, contractor work-order linkage, MinIO attachments |
| `integration-hub` | 3005 | Connector framework (REST/Webhook/Kafka/Cron); alarm ingestion from Zabbix/Alertmanager/Grafana with dedup and MDM enrichment; auto-creates cases from alarms; SLA auto-application |
| `notification-service` | 3006 | Handlebars-templated notifications (in-app + SMTP email), Kafka consumer for all `bpm.*` events, unread counts, mark-as-read |
| `external-api` | 3007 | Separate JWT-secured backend for the contractor portal: contractor/company accounts, work-order submissions, attachment upload, restricted read access to linked cases |

### Notes on the larger services

- **`bpm-orchestrator`** is the most structurally complex service: `process-definition/`,
  `process-instance/`, `process-packs/`, `task/`, `engine/` (BPMN execution core), `scheduler/`
  (cron-based SLA/async jobs), `analytics/`, `digest/`, `retention/`, and `rca/` subfolders.
- **`case-service`** centers on `case/` (lifecycle, `hybrid-sla.ts`, `sla-scheduler.service.ts`,
  routing/escalation), plus `sla-config/`, `attachment/` (MinIO), `contractor/`, `datahub/`, `rca/`.
- **`integration-hub`** centers on `alarm/` (with per-source `normalizers/` for Zabbix/Alertmanager/
  Grafana), `connector/`, `connector-log/`, `mdm/`, `cron/`.

Every service also carries `audit/`, `kafka/` (producer/consumer), `metrics/`, and `health/` modules
for cross-cutting concerns.

## Frontend Apps (`apps/`)

All three apps are React 18 + TypeScript + Vite, styled with MUI 5 + Emotion, containerized via a
multi-stage Docker build (Node 20 → Nginx 1.25) with an app-specific `nginx.conf` that reverse-proxies
API calls and serves the SPA.

### `frontend-portal` (served as `frontend`, port 8080)

The main enterprise BPM operations platform, targeting operators, managers, process designers, and
admins. Authenticates via Keycloak (`keycloak-js`), talks to the platform through `api-gateway:3000`
(`/api/v1/*`), and uses React Query for data fetching, `bpmn-js` for the visual process editor, and
Recharts for analytics.

Pages are organized by domain under `src/pages/`:

| Domain | Routes (representative) |
|---|---|
| Launcher | `/home`, `/apps`, `/dashboards`, `/admin` — navigation hub |
| Work | `/workplace` (unified requests/tasks/approvals inbox), `/dashboard`, `/dashboard/operations` |
| Catalog & Cases | `/catalog`, `/catalog/:defId/new`, `/cases`, `/cases/new`, `/cases/:id`, `/tasks/:id`, `/requests/:id` |
| Process Studio | `/processes`, `/processes/:id/studio` (bpmn-js editor), `/processes/instances`, `/processes/instances/:id`, `/processes/analytics` |
| Approvals | `/approvals/policies`, `/approvals/instances` |
| Org & Audit | `/org` (structure/users/positions/roles), `/audit` |
| Admin | `/admin/connectors`, `/admin/notification-templates`, `/admin/datahub`, `/admin/sla` |
| MDM | `/mdm` (hosts, lookups, bulk import) |
| RCA | `/rca` (Pareto, trends, repeat offenders, process analysis) |
| Contractors | `/contractors/companies`, `/contractors/users`, `/contractors/dispatch`, `/contractors/review`, `/contractors/dashboard` |
| Reporting | `/reports` (custom report builder), `/digest` (management digest config) |

### `contractor-portal` (served as `contractor-frontend`, port 8081)

Lightweight external portal for field contractors, talking exclusively to `external-api:3007`
(`/api/ext/*`) with its own AuthContext (JWT, not Keycloak).

| Route | Purpose |
|---|---|
| `/login` | Contractor login |
| `/` | Dashboard — work summary, stats |
| `/work-orders`, `/work-orders/:id` | List/detail: accept, reject, progress updates, clarification requests, reschedule requests |
| `/team` | Company team roster |
| `/notifications`, `/profile` | Inbox and account settings |

### `mobile-pwa` (port 8082)

Installable Progressive Web App combining both worlds: `/connect` lets the user pick a backend
("BPM Platform" via `api-gateway:3000`, or "Contractor Portal" via `external-api:3007`), then
`/login`, `/` (unified case/work-order inbox), `/case/:id`, `/wo/:id`. Both modes authenticate
through Keycloak, proxied at `/kc/`. Ships a service worker (`public/sw.js`, app-shell caching,
network-first navigation with offline fallback, cache-first static assets) and a web manifest
(`public/manifest.webmanifest`, standalone display, portrait orientation).

## Infrastructure (`infra/`)

| Path | Purpose |
|---|---|
| `docker-compose.yml` | Local/dev orchestration — builds all 8 services + 3 apps from source, plus Postgres, Kafka (KRaft), MinIO, Keycloak, Prometheus/Grafana/Loki/Promtail/Alertmanager, one-shot `db-migrate` and background `db-backup` tools |
| `docker-compose.prod.yml` | Production overlay (resource limits, image-based rather than build-from-source, UTC timezone) — applied with `-f docker-compose.yml -f docker-compose.prod.yml` |
| `docker-compose.edge.yml` | Adds the TLS-terminating edge proxy for production, so only nginx is publicly exposed |
| `.env` / `.env.example` | Environment configuration (secrets, hostnames, feature flags) — `.env.example` documents every variable |
| `rotate-secrets.sh` | Generates fresh production secrets into `.env.rotated` (does not apply them automatically) and prints a checklist for rotating stateful secrets (DB password, Keycloak admin, MinIO keys) |
| `db/` | `init.sh` (Postgres container entrypoint), `migrate.sh` (one-shot migration runner: `up` / `status`), `migrations/` (39 ordered SQL files, see below), `seeds/` (base reference data), `seeds-demo/` (optional demo data, gated by `LOAD_DEMO_SEEDS`), `backup.sh`/`restore.sh` (6-hourly backups, 14-day retention), `seed_rca_demo.py` / `seed_roster.py` (Python demo-data seeders), `BACKUP.md` |
| `edge/` | `nginx.conf` — TLS-terminating reverse proxy (HTTP→HTTPS redirect, rate limiting, security headers) and `gen-cert.sh` (self-signed cert generator for dev/staging) |
| `keycloak/` | `realm-export.json` — the `bpm` realm (users, roles, clients) imported on Keycloak startup |
| `keycloak-themes/` | Custom Keycloak login/account theme (`bpm-theme/`) |
| `load/` | Load/soak test harnesses: `loadtest.py` (stdlib-only Python), `loadtest.js` (k6, CI-portable), `README.md` — baseline ~573 req/s at 20–40 VUs, p99 < 110ms |
| `monitoring/` | `prometheus/` (scrape config + alert rules), `grafana/` (provisioned datasources + 3 dashboards: overview, operations, administration), `loki/` (log store config), `promtail/` (Docker log shipper config), `alertmanager/` (email alert routing template) |
| `processes/` | `publish_launch_processes.py` — seeds the initial BPMN processes (Incident Management, Fault Management, Change Management) via the API gateway; `README.md` |

### Docker Compose Container Inventory

| Category | Containers | Notes |
|---|---|---|
| Core infra | `postgres` (5432, internal), `kafka` (KRaft, 9092/9094), `kafka-ui` (8090), `minio` (9000/9001), `minio-init`, `keycloak` (8443) | |
| Backend services | `org-service`, `approval-service`, `bpm-orchestrator`, `case-service`, `integration-hub`, `notification-service`, `api-gateway` (3000, public), `external-api` | All internal except api-gateway |
| Frontends | `frontend` (8080), `contractor-frontend` (8081), `mobile-pwa` (8082) | |
| Observability | `prometheus` (9090), `grafana` (3300), `loki` (internal), `promtail`, `alertmanager` (9094) | |
| Tooling | `db-migrate` (profile `tools`, run on demand), `db-backup` (background, every 6h) | |

## Database Schema (`infra/db/migrations/`, 39 files)

| # | Migration | Adds |
|---|---|---|
| **Foundation** | | |
| 001 | `tenants_and_org` | Tenants, org units, positions |
| 002 | `approval_engine` | Approval policies, instances |
| 003 | `bpm_processes` | Process definitions, instances, tasks |
| 004 | `cases` | Core case/ticket objects |
| 005 | `integration_notifications` | Notification templates, event mappings |
| 006 | `audit_log` | Append-only audit trail |
| **Alarms & MDM** | | |
| 007 | `alarm_ingestion` | Unified alarm ingestion (Zabbix/Alertmanager/Grafana) |
| 008 | `mdm_hosts` | MDM host/asset catalog |
| 009 | `drop_actor_fks` | Actor FK cleanup |
| 010 | `mdm_lookups` | MDM attribute lookups (customer/region/tier) |
| **RCA & Case Enhancements** | | |
| 011 | `rca_taxonomy` | RCA category taxonomy |
| 012 | `case_enhancements` | Impact/urgency/priority fields |
| **Contractor & Case Relationships** | | |
| 013 | `external_contractor` | Contractor/vendor work orders & submissions |
| 014 | `case_process_sync` | Case↔process auto-start linkage |
| 015 | `cases_rejected_status` | Rejected/failed case states |
| 016 | `case_sla_tiers` | Multi-tier, calendar-aware SLAs |
| 017 | `case_sync_outbox` | Outbox pattern for case events |
| 018 | `case_parent_child` | Parent/child case relationships |
| 019 | `case_links_and_process_types` | Case-to-case links, process type categories |
| 020 | `case_optimistic_lock` | Version-based optimistic locking |
| **SLA & DataHub** | | |
| 021 | `datahub_sites_hybrid_sla` | Site/domain mapping, hybrid SLA rules |
| 022 | `sla_pause` | SLA pause/resume for waiting states |
| 023 | `notification_templates` | Handlebars template store |
| 024 | `major_incident` | Major incident / severity escalation |
| 025 | `sla_at_risk` | SLA breach prediction/alerts |
| 026 | `change_cab_policy` | Change Advisory Board delegation policy |
| 027 | `auto_links` | Automatic case-linking rules |
| 028 | `datahub_domains` | DataHub domain/area definitions |
| **Vendor, RCA/CAPA & ML** | | |
| 029 | `vendor_escalation` | Vendor escalation rules/thresholds |
| 030 | `rca_capa` | Formal RCA + Corrective/Preventive Actions |
| 031 | `rca_ml_phase1` | RCA ML pattern-detection infrastructure |
| 032 | `fix_qualification_status` | Qualification/validation state fixes |
| 033 | `reschedule_response` | Reschedule response SLA support |
| **Reporting, Digest & Retention** | | |
| 034 | `sla_config` | SLA policy configuration management |
| 035 | `report_templates` | Report definitions/scheduling |
| 036 | `management_digest` | Weekly management digest |
| 037 | `case_retention` | Case archival/retention policy |
| 038 | `observability` | Schema support for logs/traces/metrics |
| 039 | `request_retention` | Request-specific retention rules |

Migrations are applied via `infra/db/migrate.sh` (idempotent, forward-only). On first container start,
Postgres runs `init.sh`, which applies every file in `migrations/` in order, then `seeds/` and
(optionally) `seeds-demo/`.

## Kafka Topics

| Topic | Publisher | Consumers |
|---|---|---|
| `bpm.gateway.requests` | API Gateway | — |
| `bpm.org.changed` | Org Service | — |
| `bpm.process.started` / `bpm.process.completed` | BPM Orchestrator | Notification |
| `bpm.task.created` / `bpm.task.sla_breach` / `bpm.task.claimed` / `bpm.task.completed` | BPM Orchestrator | Notification |
| `bpm.approvals` | Approval Service | Notification |
| `bpm.case.created` / `bpm.case.sla_breach` / `bpm.case.assigned` | Case Service | Notification, Integration Hub |
| `bpm.service.task` | BPM Orchestrator | Integration Hub |
| `bpm.connectors.updated` | Integration Hub | — |

## `docs/`

| File | Purpose |
|---|---|
| `DEPLOY.md` | Standard deployment runbook (dev/staging/prod), image versioning, forward-only migrations, rollback strategy, host sizing |
| `PROD_DEPLOY.md` | Step-by-step production deployment: prerequisites, secret rotation, VITE_* build-time config, DB migration/backup, edge TLS setup |
| `CUTOVER.md` | Go-live plan: owner roles, communication plan, 15-point go/no-go checklist, cutover + rollback runbook |
| `RUNBOOKS.md` | Production incident response: health verification, triage by layer, service recovery, log capture, resource-exhaustion diagnostics |
| `security-review.md` | Pre-go-live security audit (15/15 checks pass), documented findings/fixes, defense-in-depth measures |
| `phase-c-backend-orchestration.md` | Architecture refactor unifying case-service/bpm-orchestrator/approval-service around "Case as the spine" |
| `production-go-live-plan.md` | Phase 0–6 go-live roadmap covering hardening, frontend/backend delivery, notifications, audit, post-go-live expansion |
| `BPM-Solution-HLD-LLD.pdf` / `bpm-solution-hld-lld.html` | High/low-level design document (architecture, data flows, API contracts, deployment topology) |

## CI/CD (`.github/workflows/ci.yml`)

Single workflow, four jobs:

1. **`test`** — matrix across all 8 services + `frontend-portal` + `contractor-portal`: `npm ci` →
   `npm run build --if-present` → `npm test --if-present`.
2. **`build-push`** — on push to `main` or a version tag: builds and pushes Docker images for all
   8 services + 2 frontends to GHCR, tagged by commit SHA and branch/tag name.
3. **`deploy-staging`** — auto-runs on `main`: SSH to the staging host, `docker compose pull`, run
   `db-migrate`, then `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d`.
4. **`deploy-prod`** — runs on version-tag pushes, gated by a manual-approval GitHub Environment;
   same deploy flow against the production host.

Note: `mobile-pwa` currently has no dedicated Dockerfile build in CI (it is built/deployed via
`infra/docker-compose.yml` directly, context `../apps/mobile-pwa`).

## Where to Go Next

- **Local quick start / demo users** → `README.md`
- **Production deployment** → `docs/DEPLOY.md`, `docs/PROD_DEPLOY.md`
- **Go-live checklist & rollback** → `docs/CUTOVER.md`
- **Incident response** → `docs/RUNBOOKS.md`
- **Security posture** → `docs/security-review.md`
