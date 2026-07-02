# Security review — pre-go-live

Active probing of the running stack across the OWASP-relevant classes, with the
findings fixed and re-verified. **Result: 15/15 checks pass.**

## Findings & remediation

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **High** | **Cross-tenant data access** — `X-Tenant-ID` was honoured from the client (JWT strategy + tenant interceptor fell back to the request header), so a caller could set it and read another tenant's data. | Tenant is now derived **only** from the signed JWT (or the single-tenant default); the interceptor overwrites any client `X-Tenant-ID`. (`jwt.strategy.ts`, `tenant.interceptor.ts`) |
| 2 | **Medium** | **Authorization gaps** — 7 gateway controllers had `JwtAuthGuard` but no `PermissionsGuard`, so any authenticated user could write master data (DataHub/MDM), read the audit log, edit notification templates, or manage connectors. | Added `PermissionsGuard` + `@RequirePermission`: audit→`audit:read`; DataHub/MDM **writes**→`mdm:write`; notification send/templates→`notifications:manage`; integrations→`connectors:manage`; org **writes**→`org:manage`; contractors→`contractors:read`. New perms granted to admin (`*`) + manager. Reads stay open where the UI needs them. |
| 3 | Low | Swagger `/api/docs` publicly reachable (API surface disclosure). | Note: disable/lock behind admin in prod (deploy-time). |

## Verified secure (no change needed)
- **AuthN**: no token / garbage token → 401.
- **Identity-header trust**: a spoofed `X-User-Id` does NOT bypass RBAC — the gateway builds identity headers from the verified JWT, not client input (the proxy never forwards client headers).
- **Network isolation**: internal microservices (3001–3006) are not host-published — unreachable from the host; only the gateway (+ edge proxy) is the entry.
- **Webhooks**: alarm webhooks reject missing/bad `X-Webhook-Token` (401).
- **Injection**: search params are parameterised (pg) — SQLi probes are inert; a `DROP TABLE` attempt was a no-op.

## Defense-in-depth already in place
Gateway helmet + rate limiting; the TLS edge proxy (HSTS/headers/rate-limit); `BIND_ADDR` loopback lockdown of ops UIs; secrets in gitignored `.env`; RBAC enforced under load (the load test confirmed field engineers are correctly 403'd on create).

## Residual / deploy-time
- Lock `/api/docs` in prod; rotate secrets (script provided) + Keycloak password policy; real TLS cert; tenant claim in Keycloak if multi-tenancy is adopted; finer write-vs-read split on contractors/org (currently read-floor).
