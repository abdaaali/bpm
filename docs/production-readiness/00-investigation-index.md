# 00 — Production Readiness Investigation Index

**Investigation date:** 2026-07-09
**Scope:** Full service-by-service investigation of the BPM platform (11 apps/services + Keycloak/Postgres/Kafka/MinIO/nginx) ahead of a production go-live decision.
**Method:** Read-only code inspection, read-only `psql` queries against the live demo database, `docker ps`/`docker logs`, git history/tracking audit. No fixes were applied. No data, files, commits, or pushes were made.

## Documents in this investigation

1. [01-service-inventory.md](01-service-inventory.md) — every service: folder, container, ports, purpose, DB tables, Kafka topics, storage, health endpoint, main APIs, auth/tenant-scoping status, known issues, manual + command verification
2. [02-login-and-credentials-map.md](02-login-and-credentials-map.md) — every login flow (Main Portal, Mobile PWA × 2 modes, Contractor Portal, Keycloak admin) step by step, plus a full credentials table (locations only, no values) and a "secrets found in repo" disclosure
3. [03-data-inventory-and-cleanup.md](03-data-inventory-and-cleanup.md) — full classification of every data category (tenants/users/cases/process instances/tasks/contractor data/alarms/etc.) as production-required / demo / E2E / unknown, with live row counts and proposed (not-yet-run) cleanup SQL
4. [04-files-to-remove-before-production.md](04-files-to-remove-before-production.md) — every file/folder category that must not be committed or deployed, with exists/tracked/ignored status for each
5. [05-service-test-plan.md](05-service-test-plan.md) — manual + automated test plan per service, with production smoke-test checklists
6. [06-production-readiness-risks.md](06-production-readiness-risks.md) — risk register, 21 items (R-01…R-21), severity-rated, with evidence and recommended fixes
7. [07-pre-production-cleanup-runbook.md](07-pre-production-cleanup-runbook.md) — the safe, sequenced runbook for backup → cleanup → rotate → migrate → rebuild → smoke test → rollback, with every destructive command marked **DO NOT RUN UNTIL APPROVED**

## Current system status (at investigation time)

- All 22 Docker containers reported `healthy` (or running, where no healthcheck is defined) — `docker ps` snapshot taken 2026-07-09.
- Database: 2 tenants, 7 users, 103 cases, 91 process instances, 6 external (contractor) users across 3 companies, 46 alarms, 693 audit-log rows. Full breakdown in doc 03.
- Prior session context confirmed: Process Studio data repair, E2E test pollution "archived" (process **definitions** only — see below), assignee options fix, Mobile PWA redesign, and Server-field removal from the PWA Connect screen were all completed and the full Playwright suite (39 passed, 1 skipped) passed at that time. This investigation independently re-verified the Server-field removal and found it holds at the UI level (doc 01/02).

## What is done

- Complete service inventory across all 3 frontend apps, all 8 backend services, and 6 infra/platform components
- Complete login/credential mapping for all 5 login flows, with no secret values exposed
- Complete live-data classification with concrete row counts (not estimates)
- Complete file/artifact audit against `.gitignore`/git tracking
- A concrete, evidence-backed risk register (21 items) replacing several previously-vague "known issues" with confirmed true/false verdicts (see below)
- A safe, sequenced cleanup/rotation runbook

## What is pending (explicitly out of scope for this investigation pass)

- No fixes have been applied to any of the 21 risk register items
- No cleanup SQL has been run (doc 03's proposals are unexecuted)
- No credentials have been rotated
- No `.gitignore` edit has been applied (the one-line `test-results/` fix, R-16, is proposed but not committed)
- git history has **not** been scanned for secrets that may have existed in earlier commits of `infra/keycloak/realm-export.json` or elsewhere (only the current working tree was audited) — recommend a follow-up pass with a tool like `gitleaks`/`trufflehog` before this repo is ever made more broadly accessible
- Retention/archival job root-cause (R-18 — why `archived_process_instances` has 0 rows) was not diagnosed, only flagged
- The identity of the one active "Test" process definition and 4 unexplained "other" cases was not determined — needs a human answer, not further code archaeology

## What is risky (highest-priority items — see doc 06 for full register)

1. **R-13 — MinIO `bpm-attachments` bucket allows anonymous public download.** The clearest, most actionable confirmed security gap. Case/work-order attachments are downloadable by anyone with an object key, bypassing all application-level auth.
2. **R-01 — integration-hub's alarm subsystem has no tenant scoping at all** (`unified_alarms` has no `tenant_id` column). Critical if this platform will ever be multi-tenant; needs a product decision either way.
3. **R-07 — No live proof a multi-step approval has ever completed through the actual UI** in this environment (`approval_instances` = 0 rows, no UI-level E2E test). Recommended as a go-live blocker requiring a manual walkthrough at minimum.
4. **R-19 — Real demo credential material is committed in git** (seeded Keycloak passwords, contractor demo password + hash, a Postgres role's default password). Low real-world impact today (demo-only, no external system access) but must never reach a production realm/seed and should prompt a git-history secret scan.
5. **R-11 — 6 of 8 internal backend services have zero JWT auth guards**, relying entirely on `api-gateway` as the only network path in. Currently safe by network topology, zero defense-in-depth. Needs an explicit architectural sign-off, not just a code fix.
6. **R-14 — Recurring nginx stale-upstream-IP issue** between `contractor-frontend` and `external-api` after any rebuild, causing transient 502s until a manual container restart. Operationally risky for a production deploy cadence.

Full severity breakdown (6 High-severity items, 1 conditionally Critical, plus Medium/Low items) is in [06-production-readiness-risks.md](06-production-readiness-risks.md).

## Confirmations

- No data was deleted during this investigation.
- No files were deleted during this investigation.
- No Docker volumes were reset.
- No commits were made.
- No pushes were made.
- No secret/password/token values were printed in any of these documents — only file paths, variable names, table/column names, and structural facts.
