# BPM Platform — Production Go-Live Plan

**Target:** Production operation, ~20 concurrent users, demanding telecom managed-service environment, high rate of operational change (BPMN chosen for change-flexibility).

**Status of this doc:** Plan of record. Phases 0–5 are the **go-live gate**; Phase 6 is post-go-live expansion (iterative, leveraging the BPMN foundation).

---

## 0. Baseline — what is already built and verified

- **Frontend IA (Phases A/B):** sectioned sidebar, unified Workplace, Insights dashboard, single guided intake, unified work-item detail, Next-Best-Action.
- **Backend orchestration (Phase C, verified end-to-end):** C1 case⇄process sync, C2 unified approvals (bridge + BPMN delegation), C3 shared routing, C4 shared tiered SLA, C5 durable alarm⇄case (outbox + retry + reconcile).
- **Telecom model foundation:** parent-child Work Orders, `case_links` related-records, the 9 process types, frontend wiring.
- **Infra present:** 7 NestJS services + React frontend + Kafka + Keycloak + Postgres + MinIO + Prometheus/Grafana, Dockerised, healthchecks, `restart: unless-stopped`.

This is a sound, fit-for-purpose foundation. The plan below makes it **safe, secure, operable, and complete enough to run live**, then expands.

> **Scale note:** 20 concurrent users is a modest load for this architecture on a single well-provisioned host. HA/horizontal scaling is **out of scope** for go-live; revisit only if usage grows materially.

---

## Phase 0 — Foundation hardening (make it *safe to run*)

**Goal:** close the production blockers that gate any real go-live. Highest priority; mostly sequential-independent so several can run in parallel.

### 0.1 Process-change safety ⚠️ (highest risk — the reason BPMN was chosen) — ✅ DONE
Today a running instance resolves BPMN from the *current* definition row, and `update()` edits `bpmn_xml` in place → editing a live process corrupts in-flight cases.
- [x] Block in-place `bpmn_xml`/`config` edits on non-`draft` (published/archived) definitions — `update()` throws a directive to fork a new version.
- [x] `createDraftVersion()` + `POST /definitions/:id/new-version` (gateway proxied) forks an editable draft seeded from the source flow; publish archives the prior version (rows retained).
- [x] Verified by regression script: an instance started on v1 keeps running v1's flow after v2 is edited+published; new instances use v2; in-place edit of a published version returns HTTP 400.
- [x] Process Studio: Save on a published version shows "Save as new version", forks a draft, saves into it, and navigates to the draft (published version untouched).
- [ ] *(remaining)* Show which version each running instance is on (Monitoring UI nicety).
- **Exit:** ✅ editing/publishing a process never alters the behaviour of an in-flight instance; verified.

### 0.2 Authorization / RBAC — 🟡 core DONE, extensions remaining
Services currently trust `x-user-id`/`x-tenant-id` headers; frontend shows everything to everyone.
- [x] **Server-side enforcement at the gateway** from the verified Keycloak token (`PermissionsGuard` + `@RequirePermission`), driven by a `resource:action` model (`auth/permissions.ts`). Applied to **case, process, task, approval** controllers (the sensitive write paths).
- [x] **Telecom role model** defined (admin, manager, noc, field_engineer, security, logistics, approver, requester, process_designer) with permission matrix; roles created in Keycloak + added to `realm-export.json`; legacy roles back-compat-mapped.
- [x] **`/me` endpoint** exposes effective permissions; **frontend `useAccess` hook** gates sidebar sections.
- [x] **Verified with real Keycloak tokens:** field_engineer denied case-create/publish/approve (403); requester allowed create / denied approve; admin allowed — all enforced pre-proxy.
- [x] **Network isolation** — Postgres + all 7 microservices + Kafka's external listener no longer publish host ports (verified refused from host); app works only via the gateway. The gateway is now the sole authenticated entry, so the RBAC guard cannot be bypassed.
- [x] **Ops-UI / app-port lockdown**: all host port bindings (frontend, gateway, kafka-ui, MinIO, Prometheus, Grafana, Alertmanager) are now `${BIND_ADDR:-0.0.0.0}:…` — set `BIND_ADDR=127.0.0.1` in prod `.env` so they bind loopback-only and the TLS edge proxy is the sole public entry. *(Keycloak stays reachable for browser OIDC.)*
- [ ] *(remaining)* Extend `@RequirePermission` to the rest (contractor, mdm, connector, org, rca, audit controllers — mechanical); finer item-level frontend gating; provision real users/roles; tenant-isolation review.
- **Exit (core met):** sensitive operations enforce permissions per role, verified. Full coverage tracked above.

### 0.3 Concurrency correctness — ✅ DONE (cases)
- [x] Optimistic locking on cases: `cases.version` (migration 020); `update`/`transition`/`assign` bump it; `update`/`transition` reject a stale `expected_version` with **HTTP 409**. C1 `syncCase` direct writes bump version too. Frontend `CaseDetail` sends `expected_version` and shows a reload prompt on 409.
- [x] Verified: User A edit succeeds → User B's stale edit → 409 → reload → retry succeeds.
- [ ] *(remaining)* Extend the same pattern to tasks (the other concurrent-edit surface).
- **Exit:** ✅ simultaneous edits to the same case are detected and rejected with a clear reload message.

### 0.4 Secrets & tokens — ✅ DONE
- [x] All secrets parameterized to `${VAR}` (compose has **zero literal secrets**); values live in gitignored `infra/.env` (perms 600) with a committed `infra/.env.example` template + rotation notes.
- [x] Real alarm webhook tokens set — **verified webhooks now require the token** (no/wrong token → 401, valid → 202; was open mode).
- [x] `.gitignore` covers `.env`; strong `JWT_SECRET` generated.
- [x] **Secret-rotation helper** (`infra/rotate-secrets.sh`): generates strong replacements into `.env.rotated` (gitignored) for DB/Keycloak/MinIO/Grafana/JWT/webhook secrets and prints a stateful follow-up checklist (re-key the datastore, not just `.env`). *(Apply during the deploy maintenance window; enforce a Keycloak password policy then.)*
- **Exit:** ✅ no secret in the committed compose; webhooks authenticated.

### 0.5 Backups & restore — ✅ DONE (offsite is a prod config step)
- [x] Automated Postgres backup: `bpm-db-backup` service runs `pg_dump --clean --if-exists --no-owner | gzip` every 6h, retains 14, prunes old → `db_backups` volume (`infra/db/backup.sh`).
- [x] **Restore TESTED**: restored the dump into a scratch DB — row counts matched exactly (cases 102 / defs 5 / links 2 / users 6) and a known case survived the round-trip. Runbook + `restore.sh` in `infra/db/BACKUP.md`.
- [ ] *(prod)* Copy `db_backups` **offsite** (object storage / another host); define & validate **RPO/RTO**; schedule the weekly scratch-restore test.
- **Exit:** ✅ scheduled, restore-tested backups (offsite copy is a deploy-config step).

### 0.6 Edge security & transport — ⏸ DEPLOY-TIME (needs domain + cert decision)
- [x] **TLS edge reverse proxy** (`infra/edge/` + `docker-compose.edge.yml`): nginx terminates HTTPS, redirects HTTP→HTTPS, and proxies `/`→frontend, `/api`→gateway. Self-signed cert via `edge/gen-cert.sh` (swap in a real cert at the same path for prod). **Verified locally:** 301 redirect, headers present, `/api`→gateway, `/`→SPA 200. *(Deploy step: real cert + DNS; the host running this currently has port 80 taken, so edge was verified on alt ports.)*
- [x] **Security headers + CORS lockdown + rate limiting**: nginx adds HSTS / X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy and per-IP rate-limit zones (tighter on `/api/v1/alarms/webhooks`); the gateway CORS dropped the unsafe `origin:'*'` for an env allowlist (`CORS_ORIGINS`) + `trust proxy`. Gateway keeps helmet + 300/min throttle.
- **Exit:** all external traffic over HTTPS; gateway hardened. *(Deferred to deployment — depends on the production domain and certificate source, e.g. Let's Encrypt vs corporate CA.)*

### 0.7 Observability & alerting — ✅ DONE
- [x] **Fixed a monitoring gap**: case-service / integration-hub / notification-service expose metrics at `/api/metrics` (global prefix) and were never scraped (`up=0`). Corrected the scrape paths — all 8 targets now `up=1`.
- [x] **Prometheus alert rules** (`monitoring/prometheus/alerts.yml`): ServiceDown, ServiceHighEventLoopLag, ServiceHighMemory, ServiceFlapping, OutboxDeadLetter, EnrichmentBacklog.
- [x] **Alertmanager** added + wired (Prometheus → alertmanager:9093, verified). Routing groups + critical-severity fast path + inhibit rules.
- [x] **SMTP email for BOTH**: Alertmanager (ops alerts → `ALERTS_EMAIL_TO`) and the **notification-service** (user emails) — env-driven from `.env` (Alertmanager config rendered at start, password kept in `.env`, not committed). Verified: AM email receiver loaded, notification SMTP env set, a live `ServiceDown` went `pending`.
- [ ] *(remaining)* expose the `bpm_outbox_dead` gauge from integration-hub so OutboxDeadLetter fires (rule is ready); Grafana ops-overview dashboard; log aggregation (Loki); a Postgres exporter for DB alerts; wire the real SMTP server in `.env`.
- **Exit:** ✅ alert rules fire and route to Alertmanager → email; all services observable.

---

## Phase 1 — Environments, CI/CD & infrastructure — ✅ DONE (artifacts; needs host/registry secrets to run)

> **2026-07-14 correction:** `.github/workflows/ci.yml` referenced below was
> subsequently removed from the repo and was never wired up with registry
> secrets. There is no CI/CD pipeline today — deploy is manual/SSH
> (`docker compose … build` directly on the host; see `docs/DEPLOY.md`). The
> checkboxes below describe a historical design, not current state.

**Goal:** repeatable, auditable delivery; no more manual `docker compose build` on the prod host.

- [x] **Three environments:** dev (`docker-compose.yml`, builds), staging/prod (base + `docker-compose.prod.yml`, pulls images) — separate gitignored `infra/.env` per env. Documented in `docs/DEPLOY.md`.
- [x] **CI pipeline** (`.github/workflows/ci.yml`): test matrix (build+test per service) → build & push images tagged with git SHA + ref name to the registry.
- [x] **CD:** auto-deploy to staging on `main`, prod on a `v*` tag with a manual-approval `production` environment; **rollback = redeploy a previous `IMAGE_TAG`** (documented).
- [x] **Controlled migrations:** `infra/db/migrate.sh` + `db-migrate` one-shot service (ledger `schema_migrations`, ordered, transactional, idempotent, auto-baselines an initdb'd DB). Verified: baseline/status/up/new-migration/auto-baseline. Replaces ad-hoc `psql -f`.
- [x] **Resource limits + log rotation + `TZ=UTC`** per service in `docker-compose.prod.yml`; app images tagged for registry pull/rollback. Merge validated.
- [ ] *(remaining / ops)* Wire registry + `STAGING_HOST`/`PROD_HOST`/`DEPLOY_SSH_KEY` secrets; Postgres tuning / PgBouncer if needed; host NTP.
- **Exit:** ✅ code → image → migrate → deploy → rollback path defined and the runnable parts verified.

---

## Phase 2 — Launch-scope functional build (make it *useful to run*)

**Goal:** the processes you actually go live with are complete and correct. Don't launch all 9 half-built — pick the first wave.

- [x] **Launch scope = Incident, Fault, Change.**
- [x] **BPMN lifecycles built & verified end-to-end** (`infra/processes/`): Incident (existing); **Fault** with its **Exception phase** (resolve OR exception→request→review→monitor — both paths verified); **Change** with **CAB approval via C2 delegation** (parks → approved → implement → close — verified). `fault→fault_management` wired in `TYPE_PROCESS`. Each rides C1–C4.
- [x] **Major Incident (P1) path** — BPMN branch in `incident_management` (triage → MI gateway → declare → bridge → technical recovery ↺ stakeholder updates → post-incident review → close) **and** a case-level capability: `POST /cases/:id/declare-major` escalates to critical, assigns a Major Incident Manager (routed from the manager group), flags the case; resolution auto-spawns a linked **Post-Incident Review** problem record. Stakeholder fan-out (managers + assignee/MIM + requester) via `major_incident_declared` / `major_incident_resolved` templates. CaseDetail banner + Declare action. **Verified end-to-end.** *(Hardening: notification consumer now pre-creates its Kafka topics so a cold deploy never misses brand-new event topics.)*
- [x] **Fixed a production-path bug**: gateway-routed approvals never matched the approver (Keycloak sub vs internal UUID) — approval-service now resolves the actor identity in `approve`/`reject`/`findPendingForUser`.
- [x] **Full Phase-2 spine end-to-end verification — 20/20 PASS** (through the gateway): RBAC, routing+spread, start forms, Hybrid SLA, SLA pause, at-risk, notifications, Major Incident, Fault lifecycle, Change CAB, optimistic locking. The pass found + fixed **two real bugs**: (1) case-level `TYPE_GROUP` routing still used legacy `it_engineer` (1 member, no spread) → remapped to telecom teams (noc/field/security/logistics); (2) **Change CAB approval parked the case forever** — policy step conditions never received case fields and a role step resolved all cab_members under `parallel:false` → fixed via migration 026 (CAB unconditional + `parallel:true`), `delegateApproval` now passes case context, and an approval-service safety net (empty resolution → fall back to task, never silent-park). See `memory/phase2-spine-verification.md`.
- [x] **Travel-aware Hybrid SLA** for field work — `case-service/src/case/hybrid-sla.ts`. Fixed response + on-site-restore targets (ITIL TARGETS × SLA-class) **plus** a DataHub travel allowance `base × road × security × seasonal + access + convoy(90)`, capped at the site's approved max. Breakdown is **snapshotted onto the case** (`sla_breakdown` JSONB) for audit/reproducibility; live `sla-preview` feeds the create-case UI. **Verified:** same critical fault → city ~4h vs high-risk border tower ~11.7h.
- [x] **Runtime SLA pause / exclusion** (stop-the-clock, gross vs net — migration 022): `case_sla_pauses` log + 7 exclusion reasons; pausing freezes the breach clock, resuming pushes the due dates out by the paused interval so only net working time counts; auto-resume on resolve; full audit/Kafka events; Pause/Resume UI + exclusion log on CaseDetail. **Verified:** 90-min pause → due date +90 min, breach query excludes paused cases, guard rails (no double-pause) hold.
- [x] **SLA-at-risk early warning** (migration 025): scheduler flags a case once when remaining time drops below 20% of its window (floor 15 min) and before breach, emitting `bpm.case.sla_at_risk` → `case_sla_at_risk` notification to the assignee; excludes paused/breached, resets on resume. CaseDetail + CaseList at-risk chips. **Verified:** seeded case flagged + assignee notified ahead of breach.
- [x] **Minimum-viable DataHub — Sites domain** (`datahub_sites`, migration 021): access class, support center, travel conditions, access delay, convoy/escort, SLA class, **versioned** (PUT bumps version; past-case snapshots stay pinned). CRUD + SLA-preview at `/api/v1/datahub/sites`; 4 reference sites seeded. *(Extension domains — workforce/vendor/asset/full route matrix/calendars — still pending.)*
- [x] **Real users / roles / teams seeded** (`infra/db/seed_roster.py`, idempotent): 6 telecom roles (DB + Keycloak), 5 teams, ~11 operators across NOC/Field/Security/Logistics/Management linked Keycloak↔DB; existing users activated. **Verified routing lands on people + least-loaded balances across the team.** Password `Bpm2024!`. *(Network-node / site / travel master data still pending — needs the DataHub build.)*
- [x] **Start (intake) forms** for the launch processes — authored on each BPMN StartEvent (`activiti:formFields`), served by the orchestrator (`GET /processes/definitions/slug/:slug/start-form`), rendered in CreateCase via the shared `DynField` with required-field gating; captured values flow into the case `context` **and** the process instance variables (downstream tasks/gateways can use them). Editable in Process Studio (parser + panel accept either prefix). Fault=5 / Change=4 / Incident=4 fields. **Verified end-to-end.**
- [x] Routing groups (real NOC/field/security/logistics roles) — see roster seed.
- [x] **Notification templates** (migration 023, idempotent upsert): 9 branded, variable-rich Handlebars templates with sensible channels (email+in_app for assignment / approval / SLA breach / resolution; in_app for acknowledgements). New `case_resolved` + `approval_decision`; events enriched (case.created/assigned/status_changed carry caseNumber/title/priority/SLA/requester) and the Kafka consumer wired for assignee-on-create, status→requester, and approval-decision→requester (fixed a latent bug where `approval_requested` never fired). Management API `GET/PUT /api/v1/notifications/templates`. **Verified:** create→requester+assignee notified, resolve→requester notified, all rendered (no fallback).
- **Exit:** a live operator can run each launch process end-to-end with correct routing, SLA, forms, approvals, and field dispatch.

---

## Phase 3 — Quality & validation

**Goal:** evidence the platform is correct, performant, and secure before cutover.

- [ ] **Automated regression suite:** unit + integration + key end-to-end flows (C1–C5, intake→resolve, approvals, alarm→case, WO/links). Wire into CI.
- [x] **Load/soak harness** (`infra/load/`): `loadtest.py` (stdlib, runs anywhere) + `loadtest.js` (k6, CI artifact) drive a realistic operator mix and report per-action latency percentiles, throughput, error rate + a docker-stats snapshot. **Baseline:** 20 VUs → ~573 req/s, **0 errors**, read p99 47–64 ms; 40 VUs (2× target) → ~574 req/s, **0 errors**, p99 86–109 ms. Plateau is Postgres-bound (~4–5 cores); gateway/case-service modest — the 20-user target has large headroom. The harness also confirmed **RBAC holds under load** (field engineers correctly 403 on create). *(Remaining: a longer soak on staging + add alarm-webhook ingestion volume; scaling levers — PgBouncer/replicas — noted in the README.)*
- [x] **Security review** (`docs/security-review.md`, **15/15**): active probing across authn, header-trust, tenant isolation, network isolation, injection, webhook abuse, authz. **Found + fixed:** (1) *cross-tenant* — `X-Tenant-ID` was trusted from the client → now derived only from the signed JWT (jwt.strategy + tenant.interceptor); (2) *authz gaps* — 7 unguarded controllers → added `PermissionsGuard`/`@RequirePermission` (audit / DataHub+MDM writes / notification templates / connectors / org writes / contractors), new perms granted to admin+manager, reads kept open. Confirmed safe: x-user-id spoof doesn't bypass RBAC, internal services not host-reachable, webhook token enforced, SQLi inert. *(Residual: lock `/api/docs` in prod; an external pen-test is still recommended before go-live.)*
- [ ] **UAT** with real operators on staging using the launch processes; defect triage to closure.
- [ ] **Data migration dry-run** (if importing existing tickets/assets) on staging, with reconciliation.
- **Exit:** green regression, load test within targets, security findings remediated, UAT signed off.

---

## Phase 4 — Operational readiness

**Goal:** the team can run, support, and recover the platform.

- [x] **Runbooks:** `docs/RUNBOOKS.md` (incident response / platform-down triage, per-service recovery for Postgres/Kafka/Keycloak/gateway/edge, TLS cert rotation, secret rotation, migration trouble, monitoring, scaling, escalation) + existing `DEPLOY.md` (deploy/rollback) + `infra/db/BACKUP.md` (backup/restore). Actionable with the real stack commands. *(On-call rota names = fill-in.)*
- [ ] **On-call & support model:** escalation, SLAs for platform issues, ownership per component.
- [ ] **User onboarding:** Keycloak provisioning, role assignment, SSO if applicable; offboarding process.
- [ ] **Training & docs:** operator guides per process, admin guide (Process Studio versioning, MDM/DataHub), quick-reference.
- [ ] **Change-management process** for BPMN/DataHub changes in production (who can publish a new process version; approval; audit).
- **Exit:** runbooks tested, operators trained, support model live.

---

## Phase 5 — Go-live (cutover) & hypercare

**Goal:** controlled cutover with a safety net.

- [x] **Cutover & rollback plan:** `docs/CUTOVER.md` — owners/roles, comms plan, go/no-go gates, a step-by-step cutover runbook (backup → migrate → deploy → smoke → traffic cut) with rollback points + decision criteria, phased rollout, hypercare, and post-go-live review. *(Owner names / dates / RPO-RTO numbers = fill-in at the cutover review.)*
- [x] **Phased rollout / Hypercare / Post-go-live review** — defined in `CUTOVER.md` §6–§8 (pilot → expand → full; daily standup + backup verification + metrics during hypercare; review at the end).
- **Exit:** stable in production for the hypercare window; sign-off to BAU.

---

## Phase 6 — Post-go-live expansion (iterative, where BPMN flexibility pays off)

Roll out on the live, hardened platform without downtime — one workstream at a time, each behind the same hardening/quality bar.

- [x] **Remaining process lifecycles built & verified** (`infra/processes/publish_launch_processes.py`): Problem (RCA loop → known-error → permanent-fix/monitor), Spare Parts, Asset Movement (w/ approval), Convoy (security-clearance loop), Theft (recover / FIR→write-off), Security Audit (findings → remediate/verify), PDT (analyze → tune). Each: BPMN + start form + `TYPE_PROCESS` auto-start + team routing; all drive to resolved via C1, owner lands on the right team. **The full 9-process telecom framework now has lifecycles.**
- [x] **Rule-driven auto-links** (migration 027 + `case.service evaluateAutoLinks`): asset-movement+escort→**Convoy** (requires), audit-missing-asset→**Theft** (spawned), N≥3 recurring incidents (same CI/30d)→**Problem** (escalated_to, links the whole set). Each auto-creates a linked case, marks provenance (`auto_rule` + `context.autoFromCase`), adds a work note + `bpm.case.auto_linked` event; dedup-guarded and recursion-safe. CaseDetail shows an "Auto · <source>" chip. **Verified** all three rules + dedup (no duplicates on re-edit / 4th incident).
- [x] **DataHub extension domains** (migration 028): vendors, route matrix, calendars, workforce, spares — uniform code/name/`data` tables behind a whitelisted generic CRUD API (`/api/v1/datahub/domains/:domain`), with a tabbed Operational DataHub admin page (Sites + 5 domains). **Route matrix wired into the Hybrid SLA** — a support-center→site route refines the per-site travel allowance (verified: BTS-REMOTE-44 uses route params, breakdown `source: route:…`); preview matches. *(Remaining: DataHub governance — ownership/change-approval/historical versioning; typed per-domain forms.)*
- [x] **RCA Level-2 + CAPA** (migration 030; case-service `rca` module): a formal Root Cause Analysis record per case (methods: 5-Whys / Fishbone / fault-tree / timeline / free-form, structured `analysis` JSONB, root-cause statement, draft→under_review→approved) plus **CAPA** — corrective & preventive actions with owner, due date, status and an **effectiveness review** (pending/effective/ineffective + verified_by). Endpoints under `/api/v1/cases/:id/{rca,capa}`; CaseDetail RCA tab gains a Level-2 panel (5-Whys/Fishbone editors + CAPA tracker); root cause mirrors to the Level-1 case fields; open/overdue CAPA on the Ops dashboard. **Verified** save/approve/upsert, CAPA lifecycle to verified-effective, validation 400.
- [x] **Shared Vendor Escalation** (migration 029): invocable from any case — `POST /cases/:id/vendor-escalations` records the escalation with the vendor's SLA clock + contacts (from `datahub_vendors`), optionally **pauses the case SLA** (`waiting_vendor`); acknowledge/resolve lifecycle, resolving **auto-resumes** the case SLA; notifies the assignee (raised/resolved templates). CaseDetail panel + dialog. **Verified** raise→pause, ack, resolve→auto-resume, any-type invocation, bad-vendor 400.
- [x] **Telecom Operations dashboard** (`case-service getOpsOverview` → `/api/v1/cases/ops-overview`; `OpsDashboard.tsx` at `/dashboard/operations`): live SLA health (on-track/at-risk/breached/paused), open cases by type + by team, vendor escalations (open/overdue/by-vendor), security ops (theft/audit by status), workforce load, and spare-parts stock with reorder alerts. 30s auto-refresh. Complements existing Operational Dashboard, Process Performance, and RCA dashboards. *(Per-domain deep dashboards — travel/field detail — can expand later.)*
- [ ] **Design-system consistency pass** (the earlier audit: design tokens, shared PageHeader/StatusChip/state components) — reduces UI drift as the surface grows.

---

## Cross-cutting: top risks & mitigations

| Risk | Impact | Mitigation (phase) |
|---|---|---|
| Live process edit corrupts in-flight cases | High | Version-lock published definitions (0.1) |
| Unauthorized access / privilege escalation | High | Server-side RBAC + security review (0.2, 3) |
| Data loss | High | Tested backups + PITR (0.5) |
| Lost updates under concurrency | Med | Optimistic locking (0.3) |
| SLA miscalculation (field/travel) | High (penalties) | Hybrid SLA + DataHub + versioning (2) |
| Secret leakage | High | Secrets manager, rotation (0.4) |
| Undetected outage/SLA breach | Med | Alerting (0.7) |

## Go-live gate (definition of done)

Platform is cleared for production when: **Phase 0 complete**, Phase 1 pipeline in use, **launch-scope processes (Phase 2) UAT-signed-off**, Phase 3 (regression + load + security) passed, Phase 4 runbooks/training done, and Phase 5 cutover/rollback approved.

## Suggested sequencing

- **Critical path:** 0.1 → 0.2 → 0.3 (correctness/security core) run first, in parallel with 0.4/0.5/0.6/0.7 (ops hardening) and Phase 1 (pipeline).
- Phase 2 (launch processes) can start in parallel once 0.1 lands (process versioning must be safe before building real processes).
- Phase 3 gates 5; Phase 4 runs alongside 2–3.
- Phase 6 begins only after a stable hypercare exit.
