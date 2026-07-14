#!/usr/bin/env node
// Provisions biadmin + the 15 real QAST people through org-service's existing
// POST /users API (NOT raw SQL) — that's the one already-built mechanism that
// creates a real Keycloak account first and atomically links its real
// generated id into users.keycloak_id (see UserService.create() in
// services/org-service/src/user/user.service.ts). Raw SQL INSERTs would leave
// keycloak_id NULL, and there is no first-login/deferred-linking fallback
// anywhere in this codebase (every resolveUserId() path matches the JWT sub
// against keycloak_id with no other fallback) — so seeding these users any
// other way would silently break case/task/approval attribution for all of
// them. See the plan file for the full reasoning.
//
// Must run with network access to org-service (internal-only, not published
// by docker-compose — reachable at http://org-service:3001 inside the compose
// project's bridge network, named <project>_bpm-net — "infra_bpm-net" when
// the compose project name is "infra", e.g. run from the repo root):
//
//   docker run --rm --network infra_bpm-net \
//     -v "$(pwd)/infra/db/seeds-production:/seed:ro" \
//     -e ORG_SERVICE_URL=http://org-service:3001 \
//     node:20-alpine node /seed/provision-users.mjs
//
// (On Git Bash / MSYS, prefix with MSYS_NO_PATHCONV=1 or the /seed path gets
// mangled into a Windows path before reaching the container.)
//
// Idempotent: skips any person whose email already exists (GET /users?search=).
//
// KeycloakAdminService.createUser() sets the Keycloak credential with
// `temporary: true` — each account is forced to set its own password at
// first login (confirmed via the Admin API: requiredActions includes
// UPDATE_PASSWORD). Every created account shares the same first-login value
// (FIRST_PASSWORD below) rather than a per-person random one — since it's
// only ever usable once before Keycloak forces a real password, a shared
// known value is fine and simpler to distribute for a first rollout.

const ORG_SERVICE_URL = process.env.ORG_SERVICE_URL || 'http://org-service:3001';
const TENANT_ID = 'a0000000-0000-0000-0000-000000000001';

const ROLE = {
  admin: 'd0000000-0000-0000-0000-000000000001',
  manager: 'd0000000-0000-0000-0000-000000000003',
  it_engineer: 'd0000000-0000-0000-0000-000000000006',
  security: 'd0000000-0000-0000-0000-000000000009',
};

const ORG_UNIT = {
  qast: 'b1000000-0000-0000-0000-000000000001',
  it: 'b1000000-0000-0000-0000-000000000002',
  ossbi: 'b1000000-0000-0000-0000-000000000003',
  bi: 'b1000000-0000-0000-0000-000000000004',
  oss: 'b1000000-0000-0000-0000-000000000005',
  fm: 'b1000000-0000-0000-0000-000000000006',
  fmsec_dept: 'b1000000-0000-0000-0000-000000000007',
  fmsec_team: 'b1000000-0000-0000-0000-000000000008',
};

const POSITION = {
  gm: 'c1000000-0000-0000-0000-000000000001',
  it_director: 'c1000000-0000-0000-0000-000000000002',
  fm_director: 'c1000000-0000-0000-0000-000000000003',
  ossbi_manager: 'c1000000-0000-0000-0000-000000000004',
  fmsec_manager: 'c1000000-0000-0000-0000-000000000005',
  bi_lead: 'c1000000-0000-0000-0000-000000000006',
  oss_lead: 'c1000000-0000-0000-0000-000000000007',
  fmsec_lead: 'c1000000-0000-0000-0000-000000000008',
  bi_specialist: 'c1000000-0000-0000-0000-000000000009',
  oss_specialist: 'c1000000-0000-0000-0000-000000000010',
  fmsec_specialist: 'c1000000-0000-0000-0000-000000000011',
};

// email placeholders use the .invalid TLD (IANA-reserved by RFC 2606,
// guaranteed to never resolve/deliver) rather than a real-looking company
// domain — a placeholder that looks like a real address (e.g.
// {username}@sd.zain.com) risks an actual delivery attempt to a real domain
// nobody here controls the inbox for, the moment SMTP is ever configured.
// Not final — correct to each person's real address later via Org > Users.
const PEOPLE = [
  { username: 'biadmin',        firstName: 'BI',          lastName: 'Admin',       roleIds: [ROLE.admin] },

  { username: 'm.elassad',      firstName: 'Mahmoud',     lastName: 'Elassad',     roleIds: [ROLE.manager], orgUnitId: ORG_UNIT.qast,       positionId: POSITION.gm },
  { username: 'a.isam',         firstName: 'Abdalla',     lastName: 'Isam',        roleIds: [ROLE.manager], orgUnitId: ORG_UNIT.it,         positionId: POSITION.it_director },
  { username: 'i.taha',         firstName: 'Isam',        lastName: 'Taha',        roleIds: [ROLE.manager], orgUnitId: ORG_UNIT.fm,         positionId: POSITION.fm_director },
  { username: 'a.meissa',       firstName: 'Ahmed',       lastName: 'Eissa',       roleIds: [ROLE.manager], orgUnitId: ORG_UNIT.ossbi,      positionId: POSITION.ossbi_manager },
  { username: 'm.mohealdin',    firstName: 'Monawar',     lastName: 'Mohealdin',   roleIds: [ROLE.manager], orgUnitId: ORG_UNIT.fmsec_dept, positionId: POSITION.fmsec_manager },

  { username: 's.elagib',       firstName: 'Sally',       lastName: 'Elagib',      roleIds: [ROLE.manager], orgUnitId: ORG_UNIT.bi,  positionId: POSITION.bi_lead },
  { username: 'a.mohammedahmed',firstName: 'Ahmed',       lastName: 'Mohammed',    roleIds: [ROLE.manager], orgUnitId: ORG_UNIT.oss, positionId: POSITION.oss_lead },
  { username: 'g.mohamed',      firstName: 'G.',          lastName: 'Mohamed',     roleIds: [ROLE.manager], orgUnitId: ORG_UNIT.fmsec_team, positionId: POSITION.fmsec_lead },

  { username: 'a.abdali',       firstName: 'Abdalrahman', lastName: 'Ahmed',       roleIds: [ROLE.it_engineer], orgUnitId: ORG_UNIT.bi, positionId: POSITION.bi_specialist, employeeType: 'trainee' },
  { username: 'e.mohamad',      firstName: 'Elaf',        lastName: 'Mohamad',     roleIds: [ROLE.it_engineer], orgUnitId: ORG_UNIT.bi, positionId: POSITION.bi_specialist, employeeType: 'trainee' },
  { username: 'l.mirghany',     firstName: 'Leem',        lastName: 'Mirghany',    roleIds: [ROLE.it_engineer], orgUnitId: ORG_UNIT.bi, positionId: POSITION.bi_specialist, employeeType: 'trainee' },
  { username: 'm.alsiddig',     firstName: 'Mohamed',     lastName: 'Ali',         roleIds: [ROLE.it_engineer], orgUnitId: ORG_UNIT.bi, positionId: POSITION.bi_specialist, employeeType: 'specialist' },
  { username: 'a.yasir',        firstName: 'Ahmed',       lastName: 'Yasir',       roleIds: [ROLE.it_engineer], orgUnitId: ORG_UNIT.bi, positionId: POSITION.bi_specialist, employeeType: 'specialist' },

  { username: 'm.hatim',        firstName: 'Mohamed',     lastName: 'Hatim',       roleIds: [ROLE.it_engineer], orgUnitId: ORG_UNIT.oss, positionId: POSITION.oss_specialist, employeeType: 'trainee' },

  { username: 'm.salaheldin',   firstName: 'Mohamed',     lastName: 'Salaheldin',  roleIds: [ROLE.security],    orgUnitId: ORG_UNIT.fmsec_team, positionId: POSITION.fmsec_specialist, employeeType: 'specialist' },
];

// Fixed first-login password for every provisioned account — every account is
// created with temporary:true (see KeycloakAdminService.createUser()), so
// this is only ever valid for exactly one login before Keycloak forces a
// change. Not a long-term credential.
const FIRST_PASSWORD = 'Welcome@123';

async function findByEmail(email) {
  const res = await fetch(`${ORG_SERVICE_URL}/users?search=${encodeURIComponent(email)}`, {
    headers: { 'x-tenant-id': TENANT_ID },
  });
  if (!res.ok) throw new Error(`GET /users?search failed ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return (body.data || []).find((u) => u.email === email) || null;
}

async function createUser(person, email, password) {
  const body = {
    email,
    firstName: person.firstName,
    lastName: person.lastName,
    username: person.username,
    password,
    roleIds: person.roleIds,
    orgUnitId: person.orgUnitId,
    positionId: person.positionId,
    metadata: person.employeeType ? { employee_type: person.employeeType } : {},
  };
  const res = await fetch(`${ORG_SERVICE_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-id': TENANT_ID },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /users failed ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const created = [];
  const skipped = [];
  for (const person of PEOPLE) {
    const email = `${person.username}@qast.invalid`;
    const existing = await findByEmail(email);
    if (existing) {
      skipped.push(email);
      continue;
    }
    const user = await createUser(person, email, FIRST_PASSWORD);
    created.push({ email, username: person.username, id: user.id });
    console.log(`created ${email}`);
  }

  console.log('\n--- summary ---');
  console.log(`created: ${created.length}, skipped (already existed): ${skipped.length}`);
  if (skipped.length) console.log('skipped emails:', skipped.join(', '));
  if (created.length) {
    console.log(`\nEvery created account's first-login password is "${FIRST_PASSWORD}". Each`);
    console.log('account is forced to set its own new password at first login (Keycloak');
    console.log('UPDATE_PASSWORD required action), so this value is only ever valid once.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
