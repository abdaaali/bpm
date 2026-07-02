// Portable load test (k6) — the CI/staging artifact mirroring loadtest.py.
//   k6 run -e BASE=https://staging.bpm.example.com -e VUS=25 -e DURATION=2m loadtest.js
//
// Models a realistic operator mix: browse cases, open a case, list tasks,
// dashboards, and (for create-capable roles) file a case. Field engineers have
// no cases:create permission, so they browse/work rather than create.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE = __ENV.BASE || 'http://localhost:3000';
const KC = __ENV.KC || 'http://localhost:8443';
const VUS = parseInt(__ENV.VUS || '20');
const DURATION = __ENV.DURATION || '60s';

const latency = new Trend('action_latency', true);
const errRate = new Rate('action_errors');

export const options = {
  scenarios: {
    operators: { executor: 'ramping-vus', startVUs: 0,
      stages: [{ duration: '10s', target: VUS }, { duration: DURATION, target: VUS }, { duration: '5s', target: 0 }] },
  },
  thresholds: {
    action_errors: ['rate<0.01'],            // < 1% errors
    'action_latency': ['p(95)<500'],         // p95 under 500ms
  },
};

const USERS = [
  ['admin', 'Admin123!', true], ['noc.adel', 'Bpm2024!', true], ['noc.huda', 'Bpm2024!', true],
  ['noc.omar', 'Bpm2024!', true], ['field.sami', 'Bpm2024!', false], ['field.rana', 'Bpm2024!', false],
  ['ops.kamal', 'Bpm2024!', true], ['manager1', 'Admin123!', true], ['engineer1', 'Admin123!', false],
];

export function setup() {
  const sessions = [];
  for (const [u, p, canCreate] of USERS) {
    const r = http.post(`${KC}/realms/bpm/protocol/openid-connect/token`,
      { client_id: 'bpm-frontend', username: u, password: p, grant_type: 'password' });
    if (r.status === 200) sessions.push({ token: r.json('access_token'), canCreate });
  }
  // seed some case ids for reads
  const list = http.get(`${BASE}/api/v1/cases?page=1&pageSize=100`, { headers: { Authorization: `Bearer ${sessions[0].token}` } });
  const ids = (list.json('data') || []).map((c) => c.id);
  return { sessions, ids };
}

export default function (data) {
  const s = data.sessions[(__VU - 1) % data.sessions.length];
  const H = { headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' } };
  const roll = Math.random();
  let res, action;
  if (roll < 0.30) { action = 'list_cases'; res = http.get(`${BASE}/api/v1/cases?page=1&pageSize=20`, H); }
  else if (roll < 0.50 && data.ids.length) { action = 'view_case'; res = http.get(`${BASE}/api/v1/cases/${data.ids[Math.floor(Math.random() * data.ids.length)]}`, H); }
  else if (roll < 0.65) { action = 'list_tasks'; res = http.get(`${BASE}/api/v1/tasks?page=1&pageSize=20`, H); }
  else if (roll < 0.80) { action = 'stats'; res = http.get(`${BASE}/api/v1/cases/stats`, H); }
  else if (roll < 0.90 || !s.canCreate) { action = 'ops_dashboard'; res = http.get(`${BASE}/api/v1/cases/ops-overview`, H); }
  else { action = 'create_case'; res = http.post(`${BASE}/api/v1/cases`, JSON.stringify({ type: 'incident', title: 'loadtest', priority: 'low' }), H); }

  latency.add(res.timings.duration, { action });
  const ok = res.status >= 200 && res.status < 400;
  errRate.add(!ok, { action });
  check(res, { 'status 2xx/3xx': () => ok });
  sleep(Math.random() * 0.5);   // think-time
}
