#!/usr/bin/env python3
"""
Seed a realistic telecom-ops roster: roles, users (Keycloak + DB linked by
keycloak_id), teams, and assignments — so C3 routing lands on real people and
they can log in with the right RBAC. Idempotent: safe to re-run.

Run against a running stack:  python3 infra/db/seed_roster.py
Default password for all seeded users: Bpm2024!
"""
import json, subprocess, urllib.request, urllib.parse, urllib.error

KC = "http://localhost:8443"
TENANT = "a0000000-0000-0000-0000-000000000001"
PASSWORD = "Bpm2024!"

def sql(q):
    return subprocess.run(["docker","exec","bpm-postgres","psql","-U","bpm","-d","bpm_db","-tAc",q],
                          capture_output=True, text=True).stdout.strip()

def kc_token():
    d = urllib.parse.urlencode({"client_id":"admin-cli","username":"admin","password":"Admin123!","grant_type":"password"}).encode()
    r = urllib.request.Request(f"{KC}/realms/master/protocol/openid-connect/token", data=d,
                               headers={"Content-Type":"application/x-www-form-urlencoded"}, method="POST")
    return json.loads(urllib.request.urlopen(r).read())["access_token"]

def kc(method, path, tok, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(KC+path, data=data, method=method,
                                 headers={"Authorization":f"Bearer {tok}","Content-Type":"application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, (json.loads(r.read()) if r.length else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()[:120]

# ── role → permissions (mirrors the gateway RBAC matrix; DB copy for completeness) ──
ROLE_PERMS = {
  "noc": ["cases:read","cases:create","cases:update","cases:assign","cases:resolve","cases:link","cases:workorder","tasks:*","rca:read","mdm:read","analytics:read"],
  "field_engineer": ["cases:read","cases:update","cases:workorder","tasks:read","tasks:claim","tasks:complete","mdm:read"],
  "security": ["cases:read","cases:create","cases:update","cases:resolve","cases:close","cases:link","tasks:*","rca:*","analytics:read"],
  "logistics": ["cases:read","cases:create","cases:update","cases:workorder","cases:link","contractors:read","contractors:dispatch","mdm:read"],
  "approver": ["cases:read","approvals:read","approvals:decide","tasks:read"],
  "process_designer": ["processes:*","cases:read","analytics:read"],
}

# ── teams (org_units, type=team) under a division ──
DIVISION = ("NETOPS", "Network Operations")
TEAMS = [("NOC","Network Operations Center"), ("FIELD","Field Operations"),
         ("SEC","Security Operations"), ("LOG","Logistics & Warehouse"),
         ("CSM","Change & Service Management")]

# ── roster: username, first, last, [role keys], team code ──
ROSTER = [
  ("noc.adel","Adel","Noor",["noc"],"NOC"),
  ("noc.huda","Huda","Saleh",["noc"],"NOC"),
  ("noc.omar","Omar","Khan",["noc"],"NOC"),
  ("field.sami","Sami","Tariq",["field_engineer"],"FIELD"),
  ("field.rana","Rana","Aziz",["field_engineer"],"FIELD"),
  ("sec.yusuf","Yusuf","Adam",["security"],"SEC"),
  ("sec.mona","Mona","Rashid",["security"],"SEC"),
  ("log.bilal","Bilal","Hadi",["logistics"],"LOG"),
  ("log.nadia","Nadia","Omar",["logistics"],"LOG"),
  ("ops.kamal","Kamal","Reda",["manager"],"CSM"),
  ("cab.layla","Layla","Faris",["cab_member","approver"],"CSM"),
]
# existing users → make active + ensure these telecom role keys (additive)
EXISTING_ROLES = {"engineer1":["field_engineer"], "manager1":["manager"], "cab1":["cab_member","approver"], "finance1":["approver"]}

def main():
    tok = kc_token()
    print("== roles (DB) ==")
    for key, perms in ROLE_PERMS.items():
        sql(f"INSERT INTO roles(tenant_id,name,key,permissions) VALUES('{TENANT}','{key.replace('_',' ').title()}','{key}','{json.dumps(perms)}'::jsonb) ON CONFLICT DO NOTHING;")
        # ensure the realm role exists in Keycloak too
        kc("POST","/admin/realms/bpm/roles",tok,{"name":key})
    print("  ensured:", ", ".join(ROLE_PERMS))

    print("== teams (org_units) ==")
    sql(f"INSERT INTO org_units(tenant_id,code,name,type) VALUES('{TENANT}','{DIVISION[0]}','{DIVISION[1]}','division') ON CONFLICT DO NOTHING;")
    div_id = sql(f"SELECT id FROM org_units WHERE tenant_id='{TENANT}' AND code='{DIVISION[0]}'")
    for code,name in TEAMS:
        sql(f"INSERT INTO org_units(tenant_id,code,name,type,parent_id) VALUES('{TENANT}','{code}','{name}','team','{div_id}') ON CONFLICT DO NOTHING;")
    print("  ensured:", ", ".join(c for c,_ in TEAMS))

    def role_rep(name):
        s,r = kc("GET",f"/admin/realms/bpm/roles/{name}",tok); return r
    def ensure_kc_user(u, first, last, roles):
        s,_ = kc("POST","/admin/realms/bpm/users",tok,
                 {"username":u,"email":f"{u}@bpm.local","firstName":first,"lastName":last,"enabled":True,"emailVerified":True})
        s2,res = kc("GET",f"/admin/realms/bpm/users?username={u}",tok)
        uid = res[0]["id"]
        kc("PUT",f"/admin/realms/bpm/users/{uid}/reset-password",tok,{"type":"password","value":PASSWORD,"temporary":False})
        kc("POST",f"/admin/realms/bpm/users/{uid}/role-mappings/realm",tok,[role_rep(r) for r in roles])
        return uid

    print("== users (Keycloak + DB linked) ==")
    for u, first, last, roles, team in ROSTER:
        kid = ensure_kc_user(u, first, last, roles)
        sql(f"""INSERT INTO users(tenant_id,keycloak_id,username,email,first_name,last_name,active)
                VALUES('{TENANT}','{kid}','{u}','{u}@bpm.local','{first}','{last}',true)
                ON CONFLICT (tenant_id,email) DO UPDATE SET keycloak_id=EXCLUDED.keycloak_id, active=true;""")
        uid = sql(f"SELECT id FROM users WHERE tenant_id='{TENANT}' AND email='{u}@bpm.local'")
        team_id = sql(f"SELECT id FROM org_units WHERE tenant_id='{TENANT}' AND code='{team}'")
        for rk in roles:
            sql(f"INSERT INTO user_roles(user_id,role_id,tenant_id) SELECT '{uid}', id, '{TENANT}' FROM roles WHERE tenant_id='{TENANT}' AND key='{rk}' ON CONFLICT DO NOTHING;")
        sql(f"INSERT INTO user_org_assignments(user_id,org_unit_id,is_primary) VALUES('{uid}','{team_id}',true) ON CONFLICT DO NOTHING;")
        print(f"  {u:12} {','.join(roles):28} → {team}")

    print("== existing users: activate + ensure roles ==")
    sql(f"UPDATE users SET active=true WHERE tenant_id='{TENANT}';")
    for u, roles in EXISTING_ROLES.items():
        uid = sql(f"SELECT id FROM users WHERE tenant_id='{TENANT}' AND username='{u}'")
        s,res = kc("GET",f"/admin/realms/bpm/users?username={u}",tok)
        if res: kc("POST",f"/admin/realms/bpm/users/{res[0]['id']}/role-mappings/realm",tok,[role_rep(r) for r in roles])
        for rk in roles:
            sql(f"INSERT INTO user_roles(user_id,role_id,tenant_id) SELECT '{uid}', id, '{TENANT}' FROM roles WHERE tenant_id='{TENANT}' AND key='{rk}' ON CONFLICT DO NOTHING;")
        print(f"  {u:12} += {','.join(roles)}")

    print("\nDone. Password for seeded users: " + PASSWORD)
    print("Coverage:", sql(f"SELECT string_agg(key||':'||c,'  ') FROM (SELECT ro.key, count(*) c FROM user_roles ur JOIN roles ro ON ro.id=ur.role_id JOIN users u ON u.id=ur.user_id WHERE u.active GROUP BY ro.key ORDER BY ro.key) t"))

if __name__ == "__main__":
    main()
