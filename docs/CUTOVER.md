# Go-Live Cutover & Rollback Plan

The plan to take the BPM Portal into production (~20 concurrent operators,
telecom ops). Pairs with `RUNBOOKS.md`, `DEPLOY.md`, `BACKUP.md`,
`security-review.md`, `production-go-live-plan.md`.

> Fill in the **[bracketed]** owners/dates/contacts before the cutover review.

## 1. Owners & roles
| Role | Name | Responsibility |
|---|---|---|
| Cutover lead | **[name]** | Runs the cutover, calls go/no-go |
| Platform engineer | **[name]** | Deploy, DB/Kafka/Keycloak, rollback |
| Security owner | **[name]** | Secret rotation, TLS, sign-off on review |
| Ops / NOC lead | **[name]** | Operator readiness, UAT sign-off, first-line support |
| Business owner | **[name]** | Go/no-go authority, comms to users |

## 2. Comms plan
- **Channels:** [Slack/Teams channel], [status page/email DL].
- **Pre-cutover (T-1 day):** notify users of the window + expected impact.
- **During:** status updates at each milestone (start, migration done, smoke
  passed, traffic cut, hypercare begins) and on any go/no-go decision.
- **After:** "we are live" + where to report issues.

## 3. Go / No-Go gates (all must be ✅ at the review)
- [ ] **Phase 0 hardening** applied: real TLS cert + DNS; secrets **rotated** to
      prod values (`rotate-secrets.sh` + stateful follow-ups) + Keycloak password
      policy; `BIND_ADDR=127.0.0.1` (ops UIs loopback); `CORS_ORIGINS` = real domain.
- [ ] **Security review** signed off (`security-review.md`, 15/15); `/api/docs`
      locked; external pen-test [done/accepted-risk].
- [ ] **Backups** validated (restore-tested) + **offsite copy** working; **RPO/RTO**
      agreed: RPO **[e.g. 24h]**, RTO **[e.g. 2h]**.
- [ ] **Load/soak** acceptable on staging (target 20–40 concurrent; baseline
      ~573 req/s, 0 errors — `infra/load/`).
- [ ] **UAT** passed by operators on staging (the launch processes end-to-end).
- [ ] **Runbooks** reviewed; on-call rota set; monitoring + alert email verified.
- [ ] **Rollback plan** (below) rehearsed; pre-cutover backup taken.
- [ ] Deploy is manual/SSH (no CI/CD pipeline in this repo) — SSH access to
      the target host confirmed for whoever runs the cutover, and a staging
      deploy has succeeded end-to-end via `DEPLOY.md`'s manual steps.
- [ ] `./keycloak/render-realm.sh` and `MINIO_PUBLIC_*`/`EXTERNAL_MINIO_PUBLIC_*`
      set (`PROD_DEPLOY.md` §3a/3b) — without these, login or attachment
      downloads break on real traffic.

## 4. Cutover runbook (maintenance window)
Production stack: `COMPOSE="-f docker-compose.yml -f docker-compose.prod.yml -f docker-compose.edge.yml"`

| # | Step | Owner | Verify / rollback point |
|--:|------|-------|--------------------------|
| 1 | Announce window start | Lead | comms sent |
| 2 | **Backup** current prod DB (`infra/db/backup.sh`) + snapshot volumes | Platform | backup file present + restore-listable |
| 3 | Put up maintenance notice (or drain traffic at the edge) | Platform | users see notice |
| 4 | `git pull` the release commit; build images on the host (`DEPLOY.md` — no registry, manual/SSH deploy) | Platform | images built, `docker compose ps` shows the new build |
| 5 | `infra/db/migrate.sh up` | Platform | `migrate.sh status` all applied; **rollback → step R** |
| 6 | `docker compose $COMPOSE up -d` | Platform | all containers healthy (`RUNBOOKS.md §0`) |
| 7 | **Smoke test** (login, create+resolve a case, an approval, a dashboard, a notification) | Ops | all pass; **rollback → step R** |
| 8 | Cut real traffic (DNS / edge) | Platform | `https://<host>` serves; TLS valid |
| 9 | Announce **live**; begin hypercare | Lead | comms sent |

**Step R — Rollback** (if step 5/6/7 fails): `git checkout` the previous good
commit and rebuild (`DEPLOY.md §Rollback`); if a migration is implicated, **restore the step-2
backup** (`BACKUP.md`), restart, re-verify smoke. Restore maintenance notice and
communicate. Forward-only migrations mean DB rollback = restore, so the step-2
backup is the safety net — do not skip it.

## 5. Rollback decision criteria
Roll back if, within the window: smoke test fails and isn't fixable in **[15] min**;
data integrity is in doubt; auth is broken for users; or error rate / latency is
materially worse than the staging baseline. **When in doubt, roll back** — the
window exists for exactly this.

## 6. Phased rollout
1. **Pilot** (day 1–2): a subset of operators + the highest-value process (e.g.
   Fault/Incident) only. Monitor closely.
2. **Expand** (day 3–5): add teams (NOC → field → security/logistics) and the
   remaining processes as confidence builds.
3. **Full** (week 2): all operators, all 9 processes.
The platform supports all processes already; phasing is about *people + load*
ramp, not feature gating.

## 7. Hypercare (1–2 weeks post-go-live)
- Heightened monitoring; **daily standup** (lead + platform + ops) reviewing
  errors, SLA breaches, vendor/CAPA backlog.
- **Daily backup verification** (restore a backup to scratch).
- Fast-track defect lane; daily comms summary to the business owner.
- Track: login success rate, API error rate, SLA-breach count, p95 latency,
  open vendor escalations / CAPA.

## 8. Post-go-live review (end of hypercare)
Metrics vs targets; incident log + actions; what to fix/improve; groom the
backlog (Phase 6: remaining dashboards depth, DataHub governance, design-system
pass, multi-tenancy if needed). Close out the go-live.
