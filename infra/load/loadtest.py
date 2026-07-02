#!/usr/bin/env python3
"""
Load / soak harness for the BPM gateway — stdlib only (no pip installs).

Simulates N concurrent operators running a realistic weighted mix of work
(browse cases, open a case, list tasks, dashboards, create a case) against the
real gateway, and reports per-action latency percentiles, throughput and error
rate. Captures a docker-stats snapshot mid-run.

  python3 loadtest.py --vus 25 --duration 60
  python3 loadtest.py --vus 40 --duration 300            # soak
  python3 loadtest.py --base http://localhost:3000 --vus 20 --duration 30
"""
import argparse, http.client, json, random, threading, time, urllib.parse, subprocess, sys
from collections import defaultdict

KC = "http://localhost:8443"
# (username, password, can_create) — seeded roster. Field engineers have no
# cases:create permission (RBAC), so — as in real ops — they browse and work
# tasks rather than file cases. Modelling this keeps the error metric honest.
USERS = [("admin", "Admin123!", True), ("noc.adel", "Bpm2024!", True), ("noc.huda", "Bpm2024!", True),
         ("noc.omar", "Bpm2024!", True), ("field.sami", "Bpm2024!", False), ("field.rana", "Bpm2024!", False),
         ("ops.kamal", "Bpm2024!", True), ("manager1", "Admin123!", True), ("engineer1", "Admin123!", False)]

# action → (method, path-builder, body-builder, weight)
def rnd_case(ids): return random.choice(ids) if ids else None

def login(user, pw):
    body = urllib.parse.urlencode({"client_id": "bpm-frontend", "username": user, "password": pw, "grant_type": "password"})
    c = http.client.HTTPConnection("localhost", 8443, timeout=10)
    c.request("POST", "/realms/bpm/protocol/openid-connect/token", body, {"Content-Type": "application/x-www-form-urlencoded"})
    r = c.getresponse(); data = json.loads(r.read()); c.close()
    return data["access_token"]

def host_port(base):
    u = urllib.parse.urlparse(base); return u.hostname, u.port or 80

class VU(threading.Thread):
    def __init__(self, base, token, case_ids, deadline, can_create=True):
        super().__init__(daemon=True)
        self.host, self.port = host_port(base)
        self.token, self.case_ids, self.deadline = token, case_ids, deadline
        self.can_create = can_create
        self.records = []   # (action, ms, ok, status)
        self.conn = None

    def _conn(self):
        if self.conn is None:
            self.conn = http.client.HTTPConnection(self.host, self.port, timeout=15)
        return self.conn

    def call(self, action, method, path, body=None, _retry=True):
        hdrs = {"Authorization": f"Bearer {self.token}"}
        if body is not None: hdrs["Content-Type"] = "application/json"
        t0 = time.perf_counter()
        status = None
        try:
            c = self._conn()
            c.request(method, path, json.dumps(body) if body is not None else None, hdrs)
            r = c.getresponse(); r.read()
            status = r.status
        except Exception as e:
            # Reset the keep-alive connection and retry once on a fresh one — a
            # broken pipe / stale-keepalive is a client artifact, not a server error.
            try: self.conn.close()
            except Exception: pass
            self.conn = None
            if _retry:
                return self.call(action, method, path, body, _retry=False)
            status = type(e).__name__
        ok = isinstance(status, int) and 200 <= status < 400
        self.records.append((action, (time.perf_counter() - t0) * 1000, ok, status))

    def run(self):
        TYPES = ["incident", "fault"]
        while time.perf_counter() < self.deadline:
            roll = random.random()
            if roll < 0.30:
                self.call("list_cases", "GET", "/api/v1/cases?page=1&pageSize=20")
            elif roll < 0.50:
                cid = rnd_case(self.case_ids)
                if cid: self.call("view_case", "GET", f"/api/v1/cases/{cid}")
            elif roll < 0.65:
                self.call("list_tasks", "GET", "/api/v1/tasks?page=1&pageSize=20")
            elif roll < 0.80:
                self.call("stats", "GET", "/api/v1/cases/stats")
            elif roll < 0.90 or not self.can_create:
                self.call("ops_dashboard", "GET", "/api/v1/cases/ops-overview")
            else:
                self.call("create_case", "POST", "/api/v1/cases",
                          {"type": random.choice(TYPES), "title": "loadtest", "priority": random.choice(["low", "medium", "high"])})

def pct(vals, p):
    if not vals: return 0
    s = sorted(vals); k = max(0, min(len(s) - 1, int(round(p / 100 * (len(s) - 1)))))
    return s[k]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="http://localhost:3000")
    ap.add_argument("--vus", type=int, default=20)
    ap.add_argument("--duration", type=int, default=30)
    args = ap.parse_args()

    print(f"== Load test: {args.vus} VUs, {args.duration}s, target {args.base} ==")
    # tokens (one login per distinct user, reused across VUs)
    sessions = []   # (token, can_create)
    for u, p, can_create in USERS:
        try: sessions.append((login(u, p), can_create))
        except Exception as e: print(f"  login {u} failed: {e}")
    if not sessions: sys.exit("No users could log in.")
    toklist = [s[0] for s in sessions]

    # warm: collect case ids for view_case
    host, port = host_port(args.base)
    c = http.client.HTTPConnection(host, port, timeout=15)
    c.request("GET", "/api/v1/cases?page=1&pageSize=100", None, {"Authorization": f"Bearer {toklist[0]}"})
    case_ids = [x["id"] for x in json.loads(c.getresponse().read()).get("data", [])]; c.close()
    print(f"  {len(sessions)} users, {len(case_ids)} cases pre-loaded for reads")

    deadline = time.perf_counter() + args.duration
    vus = [VU(args.base, sessions[i % len(sessions)][0], case_ids, deadline, sessions[i % len(sessions)][1]) for i in range(args.vus)]
    t_start = time.time()
    for v in vus: v.start(); time.sleep(0.01)  # slight ramp

    # mid-run docker stats snapshot
    time.sleep(min(args.duration / 2, 15))
    stats = subprocess.run(["docker", "stats", "--no-stream", "--format", "{{.Name}} {{.CPUPerc}} {{.MemUsage}}"],
                           capture_output=True, text=True).stdout
    for v in vus: v.join()
    wall = time.time() - t_start

    # aggregate
    by = defaultdict(list); errs = defaultdict(int); total = 0; total_err = 0
    err_codes = defaultdict(int)
    for v in vus:
        for action, ms, ok, status in v.records:
            by[action].append(ms); total += 1
            if not ok: errs[action] += 1; total_err += 1; err_codes[status] += 1
    print(f"\n{'action':16}{'count':>8}{'rps':>9}{'p50':>8}{'p95':>8}{'p99':>8}{'max':>8}{'err%':>8}")
    print("-" * 75)
    for action in sorted(by):
        v = by[action]; rps = len(v) / wall
        print(f"{action:16}{len(v):>8}{rps:>9.1f}{pct(v,50):>7.0f}m{pct(v,95):>7.0f}m{pct(v,99):>7.0f}m{max(v):>7.0f}m{errs[action]/len(v)*100:>7.1f}%")
    print("-" * 75)
    print(f"{'TOTAL':16}{total:>8}{total/wall:>9.1f}{'':>24}{'':>8}{total_err/max(1,total)*100:>7.1f}%")
    print(f"\nWall: {wall:.1f}s · throughput {total/wall:.0f} req/s · errors {total_err}/{total}")
    if err_codes: print("Error breakdown:", dict(err_codes))
    print("\nMid-run docker stats (app services):")
    for line in stats.splitlines():
        if any(s in line for s in ["api-gateway", "case-service", "postgres", "bpm-orchestrator", "keycloak"]):
            print("  " + line)

if __name__ == "__main__":
    main()
