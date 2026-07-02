# Load / soak testing

Two equivalent harnesses that drive the API gateway with a realistic operator
mix (browse cases · open a case · list tasks · dashboards · file a case) and
report per-action latency percentiles, throughput and error rate.

- **`loadtest.py`** — stdlib-only (no installs); runs anywhere Python 3 + Docker
  exist. Captures a mid-run `docker stats` snapshot. Use locally / on the host.
- **`loadtest.js`** — k6 (portable artifact for CI/staging), with thresholds
  (p95 < 500 ms, errors < 1 %).

## Run

```bash
# Python (local)
python3 loadtest.py --vus 25 --duration 60          # baseline
python3 loadtest.py --vus 40 --duration 300         # soak (5 min)
python3 loadtest.py --base http://localhost:3000 --vus 20 --duration 30

# k6 (staging)
k6 run -e BASE=https://staging.bpm.example.com -e VUS=25 -e DURATION=2m loadtest.js
```

## Roles
Field engineers have no `cases:create` permission, so — as in real ops — they
browse and work rather than file cases. The harness models this (`can_create`),
keeping the error metric honest. (Running creates as a field engineer correctly
returns 403 — RBAC holding under load.)

## Baseline (local, 8-core host, dev volumes)
| VUs | Throughput | Errors | Read p99 | Notes |
|----:|-----------:|-------:|---------:|-------|
| 20  | ~573 req/s | 0 %    | 47–64 ms | comfortably past the 20-user target |
| 40  | ~574 req/s | 0 %    | 86–109 ms | 2× target, still 0 errors |

The plateau (~573 req/s) is **Postgres-bound** (~4–5 cores at saturation); the
gateway (~1 core) and case-service (~0.6 core) stay modest. 20 *real* concurrent
operators generate a tiny fraction of this continuous rate (think-time between
clicks), so the production target has large headroom.

## Production scaling levers (if needed beyond this)
- **PgBouncer** in front of Postgres (connection pooling) + Postgres tuning.
- Postgres CPU/IO sizing; read replicas for the heavy read endpoints.
- Horizontal scale of `api-gateway` / `case-service` (stateless) behind the edge.
