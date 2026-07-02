#!/usr/bin/env python3
"""
Reset operational data and reseed realistic telecom cases TAGGED with proper
root causes, so the RCA module (Pareto by root cause / sub-cause, repeat
offenders, trends, similar-case k-NN, anomaly) demonstrates real insight.

DESTRUCTIVE: truncates cases / process instances / tasks / approvals /
notifications, then inserts ~140 tagged telecom cases. Run against a running DB:
    python3 infra/db/seed_rca_demo.py
"""
import subprocess, random

random.seed(42)
TENANT = 'a0000000-0000-0000-0000-000000000001'
ADMIN  = 'c0000000-0000-0000-0000-000000000001'

# ── Telecom root-cause taxonomy (category -> subcategories) ──
TAXONOMY = {
  'Power Failure':            ['Grid/Mains Outage', 'Rectifier Fault', 'Battery Depletion', 'Generator Failure', 'DG Fuel Empty', 'ATS Changeover Fault'],
  'Transmission':             ['Microwave Link Down', 'Fiber Cut', 'Backhaul Congestion', 'Sync/Clock Loss'],
  'Radio & Hardware':         ['RRU Failure', 'BBU Failure', 'Antenna/Feeder Fault', 'Power Amplifier Fault', 'Card/Module Failure'],
  'Software & Configuration': ['Parameter Misconfiguration', 'Faulty Upgrade/Patch', 'License Expiry', 'Software Crash/Reset'],
  'Environmental':            ['HVAC Failure/Overheating', 'Flooding', 'Lightning/Surge'],
  'Capacity':                 ['Cell Congestion', 'Core Overload', 'Resource Exhaustion'],
  'Security':                 ['Theft/Vandalism', 'Fiber Sabotage', 'Unauthorized Access'],
  'Human Error':              ['Wrong Operation', 'Procedure Not Followed', 'Accidental Disconnect'],
  'External / Vendor':        ['Power Utility Outage', 'Vendor SLA Breach', 'Civil Works Damage'],
}
WEIGHTS = {'Power Failure': 30, 'Transmission': 16, 'Radio & Hardware': 14, 'Software & Configuration': 10,
           'Environmental': 8, 'Capacity': 7, 'Security': 6, 'Human Error': 5, 'External / Vendor': 4}
SYMPTOM = {
  'Power Failure': 'site on battery, mains down, no AC power',
  'Transmission': 'link down, no backhaul, path degraded',
  'Radio & Hardware': 'cell out of service, hardware alarm',
  'Software & Configuration': 'service degraded after change, software reset',
  'Environmental': 'high temperature alarm, shelter overheating',
  'Capacity': 'high blocking, congestion, resource exhaustion',
  'Security': 'site intrusion, equipment missing, vandalism',
  'Human Error': 'accidental outage during maintenance',
  'External / Vendor': 'external dependency outage, vendor delay',
}
SITES = ['BTS-CITY-01', 'BTS-NEAR-12', 'BTS-REMOTE-44', 'BTS-HIRISK-77', 'BTS-DESERT-22',
         'BTS-COAST-08', 'BTS-HILL-31', 'BSC-SOUTH-1', 'MSC-CORE-1', 'HLR-CORE-1']
TYPES = (['incident'] * 6) + (['fault'] * 3) + (['problem'] * 1)
PRIO_HI = ['critical', 'high']
PRIO_MED = ['high', 'medium']
# Resolution SLA window (hours) by priority — drives a CONSISTENT due date so a
# case's at-risk/breached state matches its age (the at-risk rule is "within the
# last 20% of the window"). Without this, a weeks-old "new" case with a far due
# date gets wrongly flagged at-risk.
SLA_WIN = {'critical': 4, 'high': 8, 'medium': 24, 'low': 72}

def esc(s): return s.replace("'", "''")

def q(sql):
    return subprocess.run(["docker", "exec", "bpm-postgres", "psql", "-U", "bpm", "-d", "bpm_db", "-tAc", sql],
                          capture_output=True, text=True).stdout.strip()

# Map roster operators -> their team (by code); resolve ids and ENSURE the
# user_org_assignments rows exist so the "my team's unclaimed" query works.
USER_TEAM = {'noc.adel': 'NOC', 'noc.huda': 'NOC', 'noc.omar': 'NOC', 'ops.kamal': 'NOC',
             'field.sami': 'FIELD', 'field.rana': 'FIELD', 'sec.yusuf': 'SEC', 'sec.mona': 'SEC',
             'log.bilal': 'LOG', 'log.nadia': 'LOG'}
team_ids = dict(r.split('|') for r in q("SELECT code||'|'||id FROM org_units WHERE tenant_id='%s' AND type='team'" % TENANT).splitlines() if r)
user_ids = dict(r.split('|') for r in q("SELECT username||'|'||id FROM users WHERE tenant_id='%s' AND active" % TENANT).splitlines() if r)
ASSIGN_POOL = []
ASSIGN_SQL = []   # ensure user_org_assignments (run inside the seed transaction)
for uname, tcode in USER_TEAM.items():
    uid, tid = user_ids.get(uname), team_ids.get(tcode)
    if uid and tid:
        ASSIGN_POOL.append((uid, tid))
        ASSIGN_SQL.append(
            f"INSERT INTO user_org_assignments(user_id,org_unit_id,tenant_id,is_primary) "
            f"SELECT '{uid}','{tid}','{TENANT}',true WHERE NOT EXISTS(SELECT 1 FROM user_org_assignments WHERE user_id='{uid}' AND org_unit_id='{tid}');")
if not ASSIGN_POOL:
    ASSIGN_POOL = [(ADMIN, None)]
TEAM_IDS = list({t for _, t in ASSIGN_POOL if t}) or [None]

def pick_cat():
    cats, ws = zip(*WEIGHTS.items())
    return random.choices(cats, weights=ws)[0]

seq = {'INC': 2000, 'FLT': 2000, 'PRB': 2000}
PREF = {'incident': 'INC', 'fault': 'FLT', 'problem': 'PRB'}
rows = []

def add(cat, ci, recent=False, force_recurring=False):
    sub = random.choice(TAXONOMY[cat])
    typ = random.choices(TYPES)[0]
    pref = PREF[typ]; seq[pref] += 1
    num = f"{pref}{seq[pref]}"
    prio = random.choice(PRIO_HI if cat in ('Power Failure', 'Transmission') else PRIO_MED)
    h = random.randint(2, 168) if recent else random.randint(2, 1080)   # hours ago
    r = random.randint(1, 60)                                            # resolution hours
    resolved = random.random() < 0.7
    if resolved:
        status = random.choice(['resolved', 'closed'])
        sla_due = f"NOW() - INTERVAL '{random.randint(2, 400)} hours'"
        breached = random.random() < 0.20; at_risk = False
    else:
        status = random.choice(['open', 'in_progress', 'new'])
        win = SLA_WIN.get(prio, 24)                                      # SLA window (hours)
        # Realistic live mix — on-track / at-risk / breached — by how much of the
        # window has elapsed. created_at, sla_due_at and the flags all derive from
        # the same elapsed fraction, so they can never contradict each other.
        bucket = random.random()
        if bucket < 0.55:   frac = random.uniform(0.05, 0.70)           # on-track
        elif bucket < 0.80: frac = random.uniform(0.80, 0.99)           # at-risk (last 20%)
        else:               frac = random.uniform(1.10, 1.60)           # breached
        h = round(win * frac, 2)                                        # hours since created
        due = round(win - h, 2)                                         # hours from now to due
        sla_due = f"NOW() + INTERVAL '{due} hours'"
        breached = frac > 1.0
        at_risk = (not breached) and frac >= 0.80
    recurring = force_recurring or random.random() < 0.25
    title = f"{sub} at {ci}"
    desc = f"{SYMPTOM[cat]} on {ci}. {sub} identified as the cause."
    ctx = f'{{"affectedService":"{ci}","siteCode":"{ci}","symptom":"{esc(SYMPTOM[cat])}"}}'
    created = f"NOW() - INTERVAL '{h} hours'"
    resolved_at = f"NOW() - INTERVAL '{max(0, h - r)} hours'" if resolved else 'NULL'
    rcode = "'fixed'" if resolved else 'NULL'
    rnotes = f"'{esc('Restored after addressing ' + sub.lower())}'" if resolved else 'NULL'
    # Resolved cases always have an owner; ~40% of OPEN ones stay unclaimed in a team queue.
    if resolved or random.random() < 0.6:
        uid, team = random.choice(ASSIGN_POOL)
        a_sql = f"'{uid}'"; t_sql = f"'{team}'" if team else 'NULL'
    else:
        a_sql = 'NULL'; t_sql = f"'{random.choice(TEAM_IDS)}'" if TEAM_IDS[0] else 'NULL'
    rows.append(
      f"('{TENANT}','{num}','{typ}','{esc(title)}','{esc(desc)}','{status}','{prio}','{prio}','{prio}',"
      f"'{ADMIN}',{a_sql},{t_sql},'{ctx}'::jsonb,{created},{created},{resolved_at},{sla_due},{str(at_risk).lower()},"
      f"'{esc(cat)}','{esc(sub)}','{esc(desc)}',{str(recurring).lower()},{str(breached).lower()},{rcode},{rnotes})")

# Hot CI #1 — recurring power offender (drives Pareto 'Power Failure' + repeat offenders)
for _ in range(18): add('Power Failure', 'BTS-REMOTE-44', force_recurring=True)
# Hot CI #2 — a RECENT spike (last 7 days) for the anomaly detector
for _ in range(15): add('Power Failure', 'BTS-DESERT-22', recent=True, force_recurring=True)
# A couple of moderate offenders
for _ in range(7): add('Transmission', 'BTS-HILL-31')
for _ in range(6): add('Radio & Hardware', 'BTS-COAST-08')
# The rest — weighted-random spread across CIs
for _ in range(95):
    add(pick_cat(), random.choice(SITES))

sql = []
sql.append("BEGIN;")
sql.append("TRUNCATE cases, process_instances, tasks, approval_instances, approval_step_decisions, notifications RESTART IDENTITY CASCADE;")
sql.extend(ASSIGN_SQL)   # ensure roster users are in their teams
sql.append("DELETE FROM root_cause_taxonomy;")
for cat, subs in TAXONOMY.items():
    for s in subs:
        sql.append(f"INSERT INTO root_cause_taxonomy(category, subcategory) VALUES('{esc(cat)}','{esc(s)}');")
cols = ("tenant_id,case_number,type,title,description,status,priority,impact,urgency,requester_id,assignee_id,assigned_team_id,context,"
        "created_at,updated_at,resolved_at,sla_due_at,sla_at_risk,root_cause_category,root_cause_subcategory,root_cause_description,"
        "is_recurring,breached,resolution_code,resolution_notes")
sql.append(f"INSERT INTO cases({cols}) VALUES\n" + ",\n".join(rows) + ";")
# keep API-generated numbers clear of the seeded range
for p in ('INC', 'FLT', 'PRB', 'REQ', 'CHG', 'ALM'):
    sql.append(f"INSERT INTO case_sequences(tenant_id,prefix,next_val) VALUES('{TENANT}','{p}',3000) ON CONFLICT(tenant_id,prefix) DO UPDATE SET next_val=3000;")
sql.append("COMMIT;")

out = subprocess.run(["docker", "exec", "-i", "bpm-postgres", "psql", "-U", "bpm", "-d", "bpm_db", "-v", "ON_ERROR_STOP=1"],
                     input="\n".join(sql), capture_output=True, text=True)
print(out.stdout.strip()[-500:])
if out.returncode != 0:
    print("ERROR:\n", out.stderr[-1500:]); raise SystemExit(1)
print(f"\nSeeded {len(rows)} telecom cases across {len(set())} CIs; taxonomy = {len(TAXONOMY)} categories.")
