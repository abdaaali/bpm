# 02 — Login & Credentials Map

> No secret values appear in this document. Every credential is documented by **location** (file path / env var name / DB table / DB column) only. Where a file was found to contain a literal secret value, that is flagged in bold under "Secrets found in repo" — the value itself is never reproduced here.

---

## A. Main BPM Portal login (frontend-portal)

- **URL:** `http://localhost:8080` → Keycloak login page (redirect)
- **Frontend app:** `apps/frontend-portal`, auth logic in `apps/frontend-portal/src/auth/AuthContext.tsx`
- **Auth provider:** Keycloak, via the `keycloak-js` library
- **Keycloak realm/client:** realm `bpm`, client `bpm-frontend` (public client, PKCE S256, standard + implicit + direct-access-grants flows enabled) — defined in `infra/keycloak/realm-export.json`
- **Init call:** `kc.init({ onLoad: 'login-required', checkLoginIframe: false, pkceMethod: 'S256' })` (`AuthContext.tsx:44`) — full browser redirect, not a popup or direct-grant
- **Token endpoint:** `${VITE_KEYCLOAK_URL}/realms/bpm/protocol/openid-connect/token` (standard Keycloak endpoint, driven by `keycloak-js` internally)
- **Callback/token storage behavior:** the Keycloak token itself is kept only in the in-memory `kc` (Keycloak instance) object / React state — not written to localStorage or sessionStorage. The only `sessionStorage` key used is `bpm_landed_session` (`AuthContext.tsx:65,68`), which stores the Keycloak `session_state` purely to decide whether to redirect to `/home` on a fresh login. Token refresh: a 30-second interval calls `kc.updateToken(60)`; on failure it calls `kc.logout()` (`AuthContext.tsx:75-81`).
- **Backend validation path:** every API call goes through `api-gateway`, which validates the JWT via Keycloak's JWKS endpoint (`JWT_PUBLIC_KEY_URL` env var, see credentials table) using `JwtAuthGuard`
- **User mapping to DB:** `api-gateway`/`org-service` map the Keycloak subject (`sub` claim / username) to the `users` table (`org-service` owns this table); `tenant_id` is attached as a Keycloak user **attribute** (`tenant_id`) in `infra/keycloak/realm-export.json`
- **Roles/permissions used:** Keycloak realm roles `admin`, `requester`, `manager`, `finance_controller`, `cab_member`, `it_engineer`, `noc`, `field_engineer`, `security`, `logistics`, `approver`, `process_designer` (defined in `infra/keycloak/realm-export.json`); enforced downstream by `api-gateway`'s `PermissionsGuard`
- **Where seeded dev users are defined:** `infra/keycloak/realm-export.json` (Keycloak identity: `admin`, `requester1`, `manager1`, `finance1`, `cab1`, `engineer1`) **and** `infra/db/seeds/001_core_data.sql` + `infra/db/seeds-demo/001_demo_users.sql` (matching DB-side `users`/org/role rows)
- **Where passwords are defined:** `infra/keycloak/realm-export.json`, in each seeded user's `credentials[].value` field. **Do not print this value** — see "Secrets found in repo" below.

---

## B. Mobile PWA — BPM mode login

- **URL:** `http://localhost:8082/connect` → select "BPM Platform" → `/login`
- **Connect mode behavior:** `apps/mobile-pwa/src/connection.ts` — `Conn = { mode: 'bpm' | 'contractor', server: '' }`, persisted to `localStorage` key **`pwa_conn`**. The Server text field was removed from the Connect UI (`apps/mobile-pwa/src/pages/Connect.tsx:45` hardcodes `server: ''`); the `server` field still exists in the `Conn` TypeScript type and is interpolated (as an empty string) into `apiBase()`/`kcTokenUrl()` — functionally same-origin only, but the field itself was not removed from the data model (code-cleanliness note, see risk register R-09).
- **Keycloak token endpoint:** `kcTokenUrl()` = `${server}/kc/realms/bpm/protocol/openid-connect/token` (`connection.ts:25`) — called via a **direct-grant** (Resource Owner Password Credentials) POST from `apps/mobile-pwa/src/auth.tsx:18-19`, with `client_id: 'bpm-frontend'`. This is a different flow from frontend-portal's redirect login, but uses the same public Keycloak client.
- **API base:** `apiBase(conn)` resolves to same-origin `/api` for BPM mode
- **localStorage keys used:** `pwa_conn` (connection/mode), `pwa_token`, `pwa_user` (JSON, both set in `auth.tsx:11-12,21-24`)
- **Token storage:** plain `localStorage`, no encryption (typical for a PWA; flagged only because there's no refresh mechanism to shorten the exposure window — see below)
- **User profile loading:** decoded client-side from the JWT payload (`atob(t.split('.')[1])`, `auth.tsx:22-23`) — no `/me` API call
- **Known risks:**
  - No token-refresh loop (unlike frontend-portal's 30s `updateToken`) — a session simply stops working at token expiry with no silent renewal
  - Direct-grant (password) flow requires the client to see the raw username/password in the request body — this is normal for a native/PWA client using ROPC but means Keycloak brute-force protection (`bruteForceProtected: true` in the realm) is the primary defense, not PKCE

---

## C. Contractor Portal login

- **URL:** `http://localhost:8081/login`
- **Endpoint:** `POST /api/ext/auth/login` (`apps/contractor-portal/src/api/client.ts:14-15`)
- **Backend service:** `services/external-api`, controller `services/external-api/src/auth/auth.controller.ts`
- **Contractor user source table:** `external_users` joined to `external_companies`, filtered `eu.email = $1 AND eu.active = true` (`auth.service.ts:16-22`)
- **Password/hash behavior:** bcrypt (`bcrypt.compare(...)`, `auth.service.ts:4,27`) — hash stored in `external_users.password_hash`
- **Token behavior:** `@nestjs/jwt` `JwtService.sign` (`auth.service.ts:60`); signing secret env var name **`JWT_SECRET`** (dev fallback default present, fails fast if unset when `NODE_ENV=production`, `auth.module.ts:8-13,20`); expiry env var **`JWT_EXPIRES_IN`** (default `8h`)
- **Tenant/company scoping:** JWT payload includes `sub`, `email`, `full_name`, `company_id`, `company_name`, `role`, `tenant_id`, `portal: 'external'` (`auth.service.ts:48-57`) — every downstream `external-api` query scopes by these claims
- **Token storage (client):** `localStorage` keys **`contractor_token`** and **`contractor_user`** (`apps/contractor-portal/src/auth/AuthContext.tsx:38-39`)
- **Attach to requests:** axios default header `Authorization`, set via `setAuthToken()` (`client.ts:5-7`)
- **Refresh mechanism:** none — token used until 8h expiry, then user must log in again. No interceptor reacts to 401s; only the `RequireAuth` route guard checks local `isAuthenticated` state.
- **Audit trail:** every login writes a row to `external_audit_log` with action `LOGIN` (`auth.service.ts:36-41`)

---

## D. Mobile PWA — Contractor mode login

- **Connect mode behavior:** same `pwa_conn` mechanism as section B, `mode: 'contractor'`
- **Endpoint:** `POST ${apiBase(conn)}/auth/login` where `apiBase` resolves to `${server}/api/ext` (`connection.ts:24`) — i.e. the **same** `external-api` login endpoint used by contractor-portal (section C)
- **API base:** same-origin `/api/ext`
- **Token storage:** `localStorage` keys `pwa_token`/`pwa_user` (same keys as BPM mode — the PWA does not namespace storage per mode; switching modes overwrites the previous mode's session)
- **Work order scoping:** identical to contractor-portal — enforced server-side by `external-api` via the `company_id`/`tenant_id` JWT claims

---

## E. Keycloak admin login

- **URL:** `http://localhost:8443` (Keycloak admin console, `/admin`)
- **Realm/admin setup:** the Keycloak **master** realm holds the bootstrap admin account (username env var **`KEYCLOAK_ADMIN`**, if set — not found explicitly set in `infra/.env`, likely using Keycloak's default `admin` bootstrap username); the **`bpm`** realm (application realm) is imported from `infra/keycloak/realm-export.json` at container start
- **Where admin credentials come from:** env var **`KEYCLOAK_ADMIN_PASSWORD`**, defined (as a placeholder to be filled) in `infra/.env` (gitignored) and templated in `infra/.env.example` (tracked, no value)
- **Production replacement requirement:** `docs/PROD_DEPLOY.md` and `infra/rotate-secrets.sh` (referenced in docs) already document that `KEYCLOAK_ADMIN_PASSWORD` and `KEYCLOAK_CLIENT_SECRET` must be rotated to strong, unique values before go-live — see risk register R-15 and the runbook in [07-pre-production-cleanup-runbook.md](07-pre-production-cleanup-runbook.md)

---

## Credentials table

| Credential name | Used by | Source file/env/table | Dev/Demo/Prod? | Must rotate before production? | Should be removed from repo? | Notes |
|---|---|---|---|---|---|---|
| `POSTGRES_PASSWORD` | postgres, all backend services, db-migrate, db-backup | `infra/.env` (gitignored, not in repo) | Dev | Yes | N/A — not in repo | Fine as-is; only the gitignored local `.env` file has a value |
| `KEYCLOAK_ADMIN_PASSWORD` | keycloak container bootstrap admin | `infra/.env` (gitignored) | Dev | Yes | N/A — not in repo | |
| `KEYCLOAK_CLIENT_SECRET` | keycloak (`bpm-backend` client), all backend services (client-credentials calls) | `infra/.env` (gitignored); templated as `${KEYCLOAK_CLIENT_SECRET}` placeholder inside the **tracked** `infra/keycloak/realm-export.json` | Dev | Yes | The placeholder reference is fine to keep tracked; the real value must never be committed | `docs/PROD_DEPLOY.md` explicitly calls out replacing "the old hardcoded one" — confirm no literal value was ever committed in an earlier revision (out of scope for this read-only pass; recommend a `git log -p -- infra/keycloak/realm-export.json` / secret-scan of history before go-live) |
| **Seeded Keycloak user passwords** (`admin`, `requester1`, `manager1`, `finance1`, `cab1`, `engineer1`) | Keycloak `bpm` realm login (all 3 frontends) | **`infra/keycloak/realm-export.json`** — `credentials[].value` field, literal plaintext, tracked in git | Demo/dev | Yes — must not exist in production realm | **Yes — flagged, see "Secrets found in repo" below** | Same password value shared across all 6 seeded users |
| **Contractor demo users' shared password** | `external_users.password_hash` (bcrypt), all 6 seeded contractor accounts | **`infra/db/seeds-demo/004_contractor_demo.sql`** — file-header SQL comment states the plaintext password directly; the hash itself is a bcrypt literal in the same file | Demo/dev | Yes — this seed file must not run against production | **Yes — flagged, see "Secrets found in repo" below** | Only loads when demo seeds are applied; not part of the always-loaded `001_core_data.sql` |
| `grafana_ro` Postgres role password | Grafana's built-in Postgres datasource (observability stack) | **`infra/db/migrations/038_observability.sql`** — hardcoded literal default password in a `CREATE ROLE ... PASSWORD '<literal>'` statement; mirrors the `GRAFANA_DB_PASSWORD` default fallback in `infra/docker-compose.yml` | Dev/demo default | Yes | **Yes — flagged, see "Secrets found in repo" below** (the fallback default, not the env-overridden runtime value) | Since it's a migration, the literal password is baked into schema history even if `.env` is rotated — needs an explicit `ALTER ROLE` rotation step, not just an env var change |
| `JWT_SECRET` | external-api (contractor/mobile-contractor JWT signing) | `infra/.env` (gitignored); dev fallback default in `services/external-api/src/auth/auth.module.ts` | Dev | Yes | N/A — not in repo (fallback default is a non-secret dev convenience string, fails fast in `NODE_ENV=production` if unset) | |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | minio, minio-init, case-service, external-api | `infra/.env` (gitignored) | Dev | Yes | N/A — not in repo | |
| `SMTP_USER` / `SMTP_PASSWORD` | notification-service, alertmanager | `infra/.env` (gitignored) | Dev/unset locally | Yes (if email is enabled in production) | N/A — not in repo | |
| `ZABBIX_WEBHOOK_TOKEN` / `ALERTMANAGER_WEBHOOK_TOKEN` / `GRAFANA_WEBHOOK_TOKEN` | integration-hub webhook ingestion (`alarm-ingestion.controller.ts`, static-token + `timingSafeEqual` check) | `infra/.env` (gitignored) | Dev | Yes | N/A — not in repo | |
| `MDM_API_KEY` | integration-hub (outbound MDM enrichment calls) | `infra/.env` (gitignored) | Dev | Yes | N/A — not in repo | |
| `GRAFANA_ADMIN_PASSWORD` / `GRAFANA_DB_PASSWORD` | grafana container | `infra/.env` (gitignored); `GRAFANA_DB_PASSWORD` also has a fallback default in `infra/docker-compose.yml` | Dev | Yes | N/A (env var not in repo) but the **fallback default value** effectively duplicates the `038_observability.sql` literal — see above | |
| E2E test credentials (`E2E_USERNAME`/`E2E_PASSWORD`, `E2E_CONTRACTOR_EMAIL`/`E2E_CONTRACTOR_PASSWORD`) | `e2e/tests/helpers/auth.ts` | Read at runtime from `infra/keycloak/realm-export.json` and from the demo-seed SQL comment (not hardcoded a second time in TS); optionally overridden via env vars | Dev/test | N/A (test-only, never used in prod) | No — this is the correct pattern (reads secrets from existing seed sources instead of duplicating them) | Good practice already in place |

### Secrets found in repo (report immediately, do not print values)

Three files, all already gitignored-adjacent seed/config files (not `.env` secrets, but literal application-data secrets), contain real plaintext or hashed credential material checked into git history:

1. **`infra/keycloak/realm-export.json`** — 6 seeded Keycloak users each have a `credentials[].value` field holding the **same literal plaintext password**, tracked in git. This file is also referenced directly by `README.md` (which documents the demo login flow and states this same password in plaintext for onboarding purposes) and by `e2e/tests/helpers/auth.ts` (reads it at runtime rather than hardcoding a duplicate).
2. **`infra/db/seeds-demo/004_contractor_demo.sql`** — a SQL comment near the top of the file states the shared demo contractor password in plaintext, and every seeded `external_users` row carries the matching bcrypt hash. Tracked in git.
3. **`infra/db/migrations/038_observability.sql`** — a `CREATE ROLE grafana_ro ... PASSWORD '<literal>'` statement with a hardcoded default password, matching the `GRAFANA_DB_PASSWORD` fallback default in `infra/docker-compose.yml`. Tracked in git, and because it's a migration (not a seed), it is baked into every environment's schema history.

None of these are `.env`/infrastructure secrets (those are correctly gitignored and use `${VAR}` placeholders) — they are **demo/dev application data** that happens to double as login credentials. They are appropriate for a local/demo environment but **must not** be present in a production Keycloak realm, production seed data, or a production migration target. See [03-data-inventory-and-cleanup.md](03-data-inventory-and-cleanup.md) for cleanup classification and [07-pre-production-cleanup-runbook.md](07-pre-production-cleanup-runbook.md) for the rotation runbook. This finding does not necessarily mean the repo is "leaking a production secret" — these are self-contained demo credentials with no external system access — but they should be rotated/removed before any production cutover per your explicit instruction to flag committed secrets immediately.

### Locations searched (per investigation instructions)

`infra/keycloak/realm-export.json`, `infra/.env` / `infra/.env.example`, `apps/frontend-portal/.env.local`, `infra/docker-compose.yml`, `infra/docker-compose.dev.yml`, `infra/docker-compose.prod.yml`, `infra/docker-compose.edge.yml`, all `infra/db/migrations/*.sql`, all `infra/db/seeds*/**/*.sql`, `.gitignore` (root + `e2e/`), `README.md` and all `docs/*.md`, all `package.json` scripts (11 files), `e2e/tests/helpers/auth.ts`, `e2e/tests/00-auth/*.setup.ts`, `apps/mobile-pwa/src/connection.ts`, `apps/mobile-pwa/src/auth.tsx`, `apps/contractor-portal/src/api/client.ts`, `services/external-api/src/auth/*`, `services/api-gateway/src/auth/*`.
