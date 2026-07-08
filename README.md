# BPM Portal — End-to-End Business Process Management

A Dockerized BPM/ITIL platform: multi-tenant org structure, configurable approval matrix, case
management, a no-code BPMN process studio (Process Studio), a service catalog with dynamic request
forms, alarm ingestion, and a contractor portal + mobile PWA.

This file covers day-1 orientation: getting the stack running locally, logging in, and testing the
core flows. For the full architecture (every app/service, DB schema, Kafka topics, CI) see
[STRUCTURE.md](STRUCTURE.md).

## Prerequisites

- Docker Desktop (with Docker Compose v2)
- Node.js 20+ and npm (only needed if you're building/running an app outside Docker, or running the
  Playwright suite)

## Quick Start

```bash
cd infra
cp .env.example .env   # then fill in real values — see comments in the file
docker compose up -d --build
```

First build takes several minutes (11 service images). Watch health status with:

```bash
docker compose ps
```

Once `frontend`, `api-gateway`, and the backend services report `healthy`, open:

| URL | Service |
|---|---|
| http://localhost:8080 | **Frontend Portal** (React + MUI) — main app |
| http://localhost:8081 | Contractor Portal |
| http://localhost:8082 | Mobile PWA |
| http://localhost:3000 | API Gateway (Swagger at `/api/docs`) |
| http://localhost:8443 | Keycloak (auth) |
| http://localhost:8091 | Kafka UI |
| http://localhost:9000 / :9001 | MinIO (API / Console) |
| http://localhost:9090 | Prometheus |
| http://localhost:3300 | Grafana |

For local dev only, `infra/docker-compose.dev.yml` adds a direct port for `external-api` (3007) so
the contractor API can be hit without going through the contractor-frontend proxy:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

## Demo Users

Seeded via `infra/keycloak/realm-export.json` (Keycloak) + `infra/db/seeds*/*.sql` (Postgres). All
share the password **`Admin123!`**.

| Username | Role | Notes |
|---|---|---|
| `admin` | Platform Admin | Full permissions (`*`) — needed for Process Studio design + publish |
| `requester1` | Requester | Can submit and track requests |
| `manager1` | Manager / Approver | |
| `finance1` | Finance Controller | |
| `cab1` | CAB Member | |
| `engineer1` | IT Engineer | |

> **Fresh-environment note:** each Keycloak user's internal ID must match the `keycloak_id` seeded
> in the `users` Postgres table (e.g. `admin` → `admin-keycloak-id`) — the realm import now pins
> these explicitly. If you ever reset only the Keycloak volume but keep the Postgres volume (or vice
> versa), the two can drift apart again; symptom is a `500 Internal server error` (`null value in
> column "requester_id"`) on request/case submission. Fix: re-align `users.keycloak_id` in Postgres
> to the real Keycloak user ID, or reset both volumes together (`docker compose down -v`).

## Manual Test Checklist (core flows)

1. Open http://localhost:8080 → redirects to Keycloak → log in as `admin`.
2. Land on Home/Dashboard.
3. Open **Process Studio** (sidebar → Applications, or a process from **Processes**).
4. Open an existing process, or create a new one.
5. Click the **Start Event** on the canvas.
6. Under "Start Form Fields", click **Add start form field**, set a label/type/options, mark
   required.
7. Click **Save** — expect a "Saved!" toast.
8. Reload the page, re-click the Start Event — the field should still be there.
9. Click **Publish**.
10. Open **Service Catalog**, find the process, click **Request**.
11. Confirm your new field renders on the New Request form.
12. Leave the required field empty — **Submit Request** should be disabled. Fill it — it enables.
13. Submit — expect a confirmation screen with a case/request number.
14. Open **My Work → My Requests** — the new request should appear.

## Automated Browser Tests (Playwright)

An end-to-end Playwright suite lives in [`e2e/`](e2e), covering login, dashboard, Process Studio,
BPMN save/load/publish (including a regression test for an existing process authored without any
`camunda:` namespace — the exact scenario that used to silently drop new form fields), Service
Catalog, New Request, validation, and My Requests.

```bash
cd e2e
npm install
npx playwright install chromium
npx playwright test           # stack must already be running (see Quick Start)
npx playwright show-report    # view results after a run
```

Credentials are read at runtime from `infra/keycloak/realm-export.json` (no secrets hardcoded in
test source) via `E2E_USERNAME`/`E2E_PASSWORD` env vars, defaulting to `admin`. Auth uses a real
Keycloak UI login once (`tests/auth.setup.ts`), cached via Playwright `storageState` for the rest of
the suite; `login.spec.ts` runs the real login flow standalone to verify it directly.

## Environment Variables

Real values live in `infra/.env` (gitignored) — copy from `infra/.env.example` and fill them in.
Notable ones:

| Variable | Purpose |
|---|---|
| `POSTGRES_PASSWORD`, `KEYCLOAK_ADMIN_PASSWORD`, `KEYCLOAK_CLIENT_SECRET`, `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY`, `JWT_SECRET` | Required — services fail fast on startup in production if unset |
| `KC_FRONTEND_URL`, `VITE_KEYCLOAK_URL` | Must match the host-exposed Keycloak port (`:8443`) |
| `LOAD_DEMO_SEEDS` | `true` to load the demo users/data above; keep `false` for a clean prod DB |
| `BIND_ADDR` | `127.0.0.1` in production (only a TLS edge proxy should be public); leave unset for local dev |
| `CORS_ORIGINS` | Comma-separated allowlist; unset + `NODE_ENV=production` fails closed (deny cross-origin) |

## Troubleshooting

```bash
# View logs for one service
docker compose logs -f api-gateway

# Check health of everything
docker compose ps

# Validate compose config without starting anything
docker compose config --quiet

# Rebuild + restart a single service after a code change
docker compose up -d --build frontend

# Reset everything (WARNING: destroys all data, including Keycloak users/Postgres)
docker compose down -v && docker compose up -d --build

# Access PostgreSQL directly
docker exec -it bpm-postgres psql -U bpm -d bpm_db

# List Kafka topics
docker exec -it bpm-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list
```

If a build seems to hang on "load build context" for a long time, make sure a `.dockerignore`
excluding `node_modules` exists in that app/service's directory (one is present for all of them) —
without it, Docker uploads the entire local `node_modules` as build context on every build.

## Further Reading

- [STRUCTURE.md](STRUCTURE.md) — full repository map: every app/service, DB migrations, Kafka
  topics, CI.
- `docs/` — deployment, cutover, and runbook documentation.
