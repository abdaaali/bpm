# 03 — Data Inventory & Cleanup Classification

> All counts below were pulled via **read-only** `SELECT count(*)`/`GROUP BY` queries against the running `bpm-postgres` container on 2026-07-09. Nothing was modified, archived, or deleted to produce this document. Cleanup SQL is proposed at the bottom under a clearly marked "DO NOT RUN YET" section — none of it has been executed.

## Current environment snapshot

| Table | Row count | Notes |
|---|---:|---|
| `tenants` | 2 | 1 real demo tenant + 1 E2E isolation-test tenant |
| `users` | 7 | 6 seeded demo users + 1 E2E isolation-test user |
| `org_units` | 7 | matches seed exactly |
| `roles` | 6 | matches seed exactly |
| `process_definitions` | 134 | **122 `status='archived'`, 12 `status='active'`** |
| `process_instances` | 91 | **90 linked to E2E-named definitions, 1 linked to a real definition** — none archived (`archived_process_instances` = 0 rows) |
| `tasks` | 159 | **158 linked to E2E process instances, 1 real** |
| `cases` | 103 | **57 E2E-named, 46 other** (of the 46: 42 are the seeded RCA demo cases, remainder are real/manual) |
| `approval_instances` | 0 | no approval has ever run end-to-end in this environment — see risk register R-07 |
| `notifications` | 78 | generated as a side effect of the above E2E/demo activity |
| `external_companies` | 3 | matches demo seed exactly (Alpha, Beta, Gamma) |
| `external_users` | 6 | matches demo seed exactly |
| `work_order_assignments` | 6 | matches demo seed |
| `external_attachments` | 19 | matches MinIO `bpm-attachments` object count exactly (19 objects) |
| `attachments` (case-service's own table) | 0 | unused so far in this environment |
| `connectors` | 3 | matches demo seed exactly, all `status='inactive'` |
| `unified_alarms` | 46 | matches seeded RCA demo alarm count |
| `rca_records` | 0 | no formal RCA record has been created yet |
| `audit_log` | 693 | accumulated from all of the above activity |

## Classification by category

| Category | Classification | Keep / Archive / Delete before production | Evidence |
|---|---|---|---|
| Tenant `a0000000-...-0001` (Demo Corp) + its 7 org units, 7 positions, 6 roles | Production-required seed **structure**, demo-flavored **content** | Replace — keep the schema-bootstrap pattern (`infra/db/seeds/001_core_data.sql`), but replace "Demo Corp" naming/org-units with the real customer's org structure before go-live | `infra/db/seeds/001_core_data.sql` |
| Platform admin user (`admin@democorp.com`) | Production-required seed (an initial admin is needed), demo-flavored identity | Replace — keep one bootstrap admin account, replace the email/identity and rotate the password before go-live | `infra/db/seeds/001_core_data.sql`, `infra/keycloak/realm-export.json` |
| 5 demo Keycloak/DB users (`requester1`, `manager1`, `finance1`, `cab1`, `engineer1`) | Demo/dev seed | Delete before production (only loaded when `LOAD_DEMO_SEEDS=true`) | `infra/db/seeds-demo/001_demo_users.sql`, `infra/keycloak/realm-export.json` |
| 6 core BPM process definitions (Purchase Request, Change Management, Incident/Problem/Fault Management, etc. — the 12 currently `status='active'`) | Production-required seed | Keep — these are the actual BPMN process templates the platform runs on, review/approve their BPMN content with the business before go-live rather than deleting | `infra/db/seeds/001_core_data.sql` |
| One active process definition literally named **"Test"** (in the 12 `active` list alongside real ones) | Unknown/manual data — not from any seed file reviewed | **Investigate before production** — determine who created it and whether it was meant to be a throwaway; either delete or rename/document it. Not auto-classified as E2E because it doesn't match the `E2E ...` naming convention. | live DB query, `process_definitions` table |
| 122 `status='archived'` process definitions (all `E2E ...`-named) | E2E test data — already archived out of default UI lists (the "E2E test pollution archived" work referenced in your prior session) | Should delete before production — archiving hides them from active lists but they still occupy the table indefinitely; recommend a genuine delete pass once you're confident no historical audit trail depends on them | live DB query; matches `e2e/tests/**/*.spec.ts` naming pattern `` `E2E ... ${Date.now()}` `` |
| 90 of 91 `process_instances` (all linked to `E2E`-named definitions) + 158 of 159 `tasks` | Generated local/E2E test data | Should delete before production — unlike process **definitions**, process **instances/tasks were never archived or cleaned up**; `archived_process_instances` has 0 rows, meaning the retention/archival job has not processed this backlog. This is the single largest pollution category found. | live DB query (`definition_id` join) |
| 57 `E2E ...`-titled cases | E2E test data | Should delete before production | live DB query (title pattern) |
| 42 seeded RCA demo cases + 46 unified_alarms rows tied to them | Demo/dev seed | Delete before production (`infra/db/seeds-demo/002_rca_demo_alarms.sql`, `003_rca_demo_cases.sql`, only loaded with `LOAD_DEMO_SEEDS=true`) | seed file inspection + live counts matching |
| Remainder of the 46 "other" cases (46 − 42 = 4 cases) | Unknown/manual data | Investigate before production — likely created manually during earlier engineering/debugging sessions in this environment; confirm none represent real business data worth preserving, then delete | live DB query (does not match seed row count) |
| 3 demo contractor companies (Alpha Field Services, Beta Tower Works, Gamma Power Services) + 6 demo contractor users + their bcrypt password hashes | Demo/dev seed | Delete before production — replace with real onboarded contractor companies | `infra/db/seeds-demo/004_contractor_demo.sql` |
| 6 demo work order assignments, 19 external attachments (+ matching 19 MinIO objects in `bpm-attachments`) | Demo/dev seed + generated local test data | Delete before production (DB rows) **and** purge the corresponding MinIO objects (object keys are referenced from `external_attachments`, so DB deletion should drive the MinIO cleanup, not the reverse) | `infra/db/seeds-demo/004_contractor_demo.sql`, live MinIO object count matches |
| 3 demo connectors (REST webhook, Kafka producer, cron health check — all `inactive`) | Demo/dev seed | Delete or replace before production with real connector configs; already `inactive` so zero runtime risk today | `infra/db/seeds-demo/001_demo_users.sql` |
| `approval_instances` (0 rows) | N/A — no data to clean | N/A, but see risk register R-07: this also means there is no live evidence any approval has run end-to-end via the UI in this environment | live DB query |
| `rca_records` (0 rows) | N/A — no data to clean | N/A | live DB query |
| E2E isolation-test tenant `b9999999-...-99` ("E2E Isolation Test Tenant") + its 1 user (`tenantb_isolated` / `tenantb.user@isolationtest.example.com`) | E2E test data (deliberately created by `case-assignee-reassignment.spec.ts`'s tenant-isolation test) | Should delete before production — this tenant should not exist outside the E2E test run that creates it; if the E2E suite doesn't already tear it down, it needs a manual/scripted cleanup step | `e2e/tests/01-main-portal/case-assignee-reassignment.spec.ts:70-79`, live DB query |
| 693 `audit_log` rows | Generated local test data (byproduct of all the above) | Should delete/reset before production — an audit log full of E2E noise defeats its own purpose; production should start with a clean audit trail | live DB query |
| 78 `notifications` rows | Generated local test data (byproduct) | Should delete before production | live DB query |
| Playwright storageState (`e2e/.auth/user.json`) | Generated local test data (not DB) | Should delete locally / never ship — see [04-files-to-remove-before-production.md](04-files-to-remove-before-production.md) | file inspection |
| `e2e/tests/02-contractor-portal/fixtures/sample.pdf` | E2E test fixture (source-controlled, intentional) | Keep in the repo (it's a small test fixture used by the suite), but confirm it never gets copied/deployed into a production image | file inspection |
| root-level `test-results/` directory (untracked, contains only `.last-run.json`) | Generated local test data | Safe to delete locally at any time (see [04-files-to-remove-before-production.md](04-files-to-remove-before-production.md)); not part of the DB, listed here only for completeness | file inspection |

## Summary judgment

- **Structurally, the seed design is sound**: `infra/db/seeds/001_core_data.sql` (always loaded) vs. `infra/db/seeds-demo/*.sql` (opt-in via `LOAD_DEMO_SEEDS=true`) is exactly the right separation — a production deploy that simply doesn't set `LOAD_DEMO_SEEDS=true` will not load any of the demo companies/users/alarms/cases.
- **The real gap is accumulated runtime data in this specific running environment**, not the seed files themselves: 90 process instances, 158 tasks, 57 cases, and most of the 693 audit-log rows are leftover E2E test-run output that was never cleaned up, on top of the demo seed data. None of this is dangerous by itself (it's confined to the demo tenant + one isolation-test tenant), but a production go-live should start from a fresh database (fresh migrations + `001_core_data.sql` only, `LOAD_DEMO_SEEDS` unset) rather than "cleaning up" this specific environment's accumulated state — see the runbook.
- **One genuine unknown** worth a human answer before proceeding: the process definition named **"Test"** sitting in the `active` list, and the 4 unexplained extra "other" cases. Neither matches a known seed or E2E naming pattern.

---

## Proposed cleanup commands — DO NOT RUN YET

These are **proposals only**, written for review. They are not scheduled, not run, and require your explicit approval per-statement (or per-block) before execution. They assume the standard demo/E2E pollution described above; **do not run any of this against a database that also contains real production data** without re-verifying the `WHERE` clauses first.

```sql
-- ============================================================
-- DO NOT RUN YET — proposed cleanup, pending explicit approval
-- Target: local/demo environment only, before first production seed
-- ============================================================

-- 1. Delete E2E-generated tasks (must run before deleting their parent instances, FK order)
DELETE FROM tasks
WHERE process_instance_id IN (
  SELECT pi.id FROM process_instances pi
  JOIN process_definitions pd ON pi.definition_id = pd.id
  WHERE pd.name LIKE 'E2E %'
);

-- 2. Delete E2E-generated process instances
DELETE FROM process_instances pi
USING process_definitions pd
WHERE pi.definition_id = pd.id
  AND pd.name LIKE 'E2E %';

-- 3. Delete archived E2E process definitions (the 122 already status='archived')
DELETE FROM process_definitions
WHERE status = 'archived' AND name LIKE 'E2E %';

-- 4. Investigate, then decide, the one active "Test" process definition
--    (do not delete blindly — confirm with the team first)
-- SELECT * FROM process_definitions WHERE name = 'Test' AND status = 'active';

-- 5. Delete E2E-titled cases
DELETE FROM cases WHERE title LIKE 'E2E %';

-- 6. Investigate the 4 unexplained "other" cases before deciding
-- SELECT id, title, created_at, tenant_id FROM cases
-- WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
--   AND title NOT LIKE 'E2E %'
-- ORDER BY created_at;
--    (cross-reference against the 42 known RCA-demo case titles/categories
--     from infra/db/seeds-demo/003_rca_demo_cases.sql before deleting)

-- 7. Delete demo RCA seed data (only if LOAD_DEMO_SEEDS was used)
DELETE FROM unified_alarms WHERE source IN ('zabbix','alertmanager','grafana','dynatrace')
  AND created_at IS NOT NULL; -- refine WHERE to match seeds-demo/002 exactly before running
DELETE FROM cases WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
  AND root_cause_category IS NOT NULL
  AND title NOT LIKE 'E2E %'; -- refine WHERE to match seeds-demo/003 exactly before running

-- 8. Delete demo contractor data (only if LOAD_DEMO_SEEDS was used)
DELETE FROM work_order_assignments WHERE company_id IN (
  SELECT id FROM external_companies WHERE company_name IN
    ('Alpha Field Services','Beta Tower Works','Gamma Power Services')
);
DELETE FROM external_attachments WHERE company_id IN (
  SELECT id FROM external_companies WHERE company_name IN
    ('Alpha Field Services','Beta Tower Works','Gamma Power Services')
);
DELETE FROM external_users WHERE company_id IN (
  SELECT id FROM external_companies WHERE company_name IN
    ('Alpha Field Services','Beta Tower Works','Gamma Power Services')
);
DELETE FROM external_companies WHERE company_name IN
  ('Alpha Field Services','Beta Tower Works','Gamma Power Services');
-- Corresponding MinIO objects (bucket bpm-attachments) must be removed separately,
-- driven by the object keys that were in external_attachments BEFORE running the
-- DELETE above (capture the key list first).

-- 9. Delete demo connectors
DELETE FROM connectors WHERE name IN
  ('Generic REST Webhook','Kafka Event Publisher','Hourly Health Check');

-- 10. Delete the 5 demo Keycloak-backed users (DB side; Keycloak side must be
--     removed separately via the Keycloak admin console/API, not SQL)
DELETE FROM user_org_assignments WHERE user_id IN (
  SELECT id FROM users WHERE username IN
    ('requester1','manager1','finance1','cab1','engineer1')
);
DELETE FROM user_roles WHERE user_id IN (
  SELECT id FROM users WHERE username IN
    ('requester1','manager1','finance1','cab1','engineer1')
);
DELETE FROM users WHERE username IN
  ('requester1','manager1','finance1','cab1','engineer1');

-- 11. Delete the E2E isolation-test tenant and its user entirely
DELETE FROM user_org_assignments WHERE user_id IN (
  SELECT id FROM users WHERE tenant_id = 'b9999999-0000-0000-0000-000000000099'
);
DELETE FROM user_roles WHERE user_id IN (
  SELECT id FROM users WHERE tenant_id = 'b9999999-0000-0000-0000-000000000099'
);
DELETE FROM users WHERE tenant_id = 'b9999999-0000-0000-0000-000000000099';
DELETE FROM tenants WHERE id = 'b9999999-0000-0000-0000-000000000099';

-- 12. Reset the audit trail and notifications for a clean production start
--     (only appropriate immediately before go-live, on a database that will
--     become the production database — never run this against an environment
--     you still need for debugging)
-- TRUNCATE audit_log;
-- TRUNCATE notifications;

-- 13. Rotate the grafana_ro Postgres role password baked in by migration 038
--     (cannot be "deleted" — must be rotated explicitly)
-- ALTER ROLE grafana_ro WITH PASSWORD '<new strong value, set via infra/rotate-secrets.sh output>';
```

**Before running any of the above:** take a full `pg_dump` backup (see [07-pre-production-cleanup-runbook.md](07-pre-production-cleanup-runbook.md)), run each numbered block individually, and verify row counts after each step rather than running the whole script unattended.
