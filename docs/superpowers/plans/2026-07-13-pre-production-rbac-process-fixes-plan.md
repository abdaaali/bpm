# Pre-Production RBAC & Process Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 4 pre-production fixes approved in `C:\Users\a.abdali\.claude\plans\fluffy-greeting-curry.md`: wire the org-service Roles screen into real enforcement, scope `cases:read` by ownership/role, fix Team Queue claim/assign + team pickers, and fix the 3 blocked BPMN processes + the validation tokenizer bug.

**Architecture:** Backend changes span `api-gateway` (auth/permissions), `case-service` (query scoping), and `bpm-orchestrator` (validation engine + seed BPMN). Frontend changes are in `frontend-portal`. No new services, no new database tables — reuses the existing `roles`/`user_org_assignments`/`approval_instances` tables and the existing direct-Postgres-pool pattern already used by `AuditService`.

**Tech Stack:** NestJS 10, `pg` (node-postgres), PostgreSQL, React 18/MUI 5, Jest, Playwright.

## Global Constraints

- No route/API contract changes beyond what's explicitly designed below (new `X-User-Roles` header, new `POST /cases/:id/claim` frontend call, new `claim` on `caseApi`).
- `admin` role must retain unrestricted `*` access through every change in this plan.
- Every backend change must fail safe for an ops platform: on any DB/lookup error, fall back to the previously-correct hardcoded behavior rather than locking users out.
- Out-of-scope case access returns **403 Forbidden** (confirmed user decision — not 404).
- `purchase_request`'s approval-gateway condition variables (`decision`/`approved`) must NOT be renamed — only its form field key changes. `fault_management` and `asset_movement` get both their form field key AND gateway conditions renamed consistently.
- `npx tsc --noEmit` clean in every touched service/app after each task. Existing Playwright suite (baseline: 45 passed / 1 skip) must stay green throughout.

---

## Track 4: Fix the 3 blocked BPMN processes + validation tokenizer bug

### Task 1: Fix the condition-tokenizer false-positive bug

**Files:**
- Modify: `services/bpm-orchestrator/src/engine/validation.ts`
- Modify: `services/bpm-orchestrator/src/engine/__tests__/validation.spec.ts`

**Interfaces:**
- No signature changes — `validateProcess()` keeps its exact current signature and return type.

- [ ] **Step 1: Write the failing test**

In `services/bpm-orchestrator/src/engine/__tests__/validation.spec.ts`, add this test inside the existing `describe('validateProcess — exclusive gateway determinism', ...)` block (find it and add after the last test in that block, before its closing `});`):

```ts
  test('a string literal on the right of == is never flagged as an unknown variable (regression: tokenizer previously extracted identifiers from inside quotes)', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1" camunda:startMode="api" camunda:formFields="${encodeURIComponent(JSON.stringify([
          { key: 'majorIncident', label: 'Major Incident?', type: 'select', required: true, options: 'yes:Yes,no:No' },
        ]))}"/>
        <exclusiveGateway id="g1"/>
        <userTask id="t1" name="Escalate" camunda:assignee="a"/>
        <userTask id="t2" name="Standard" camunda:assignee="b"/>
        <endEvent id="e1"/><endEvent id="e2"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="g1"/>
        <sequenceFlow id="f2" sourceRef="g1" targetRef="t1"><conditionExpression>\${majorIncident == "yes"}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f3" sourceRef="g1" targetRef="t2"><conditionExpression>\${majorIncident == "no"}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f4" sourceRef="t1" targetRef="e1"/>
        <sequenceFlow id="f5" sourceRef="t2" targetRef="e2"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    // Use codesOf (not blockingCodesOf) — GATEWAY_UNKNOWN_VARIABLE is a
    // non-blocking warning, so a blocking-only assertion would silently
    // pass even with the bug present. This is the exact bug: "no" and "yes"
    // (the string literals) were previously extracted as if they were
    // variable names and flagged as unknown, even though majorIncident
    // itself was correctly recognized.
    expect(codesOf(findings).filter(c => c === 'GATEWAY_UNKNOWN_VARIABLE')).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/bpm-orchestrator && npx jest src/engine/__tests__/validation.spec.ts -t "string literal on the right"`
Expected: FAIL — `codesOf(findings).filter(...)` contains `['GATEWAY_UNKNOWN_VARIABLE', 'GATEWAY_UNKNOWN_VARIABLE']` (one for each of "yes"/"no" being misread as unknown variables), not `[]`.

- [ ] **Step 3: Fix the tokenizer**

In `services/bpm-orchestrator/src/engine/validation.ts`, find (around line 199-201):

```ts
      const m = cond.match(CONDITION_VAR_RE);
      const body = m ? (m[1] ?? m[2] ?? '') : '';
      const varMatches = body.match(/[a-zA-Z_][a-zA-Z0-9_.]*/g) || [];
```

Replace with:

```ts
      const m = cond.match(CONDITION_VAR_RE);
      const body = m ? (m[1] ?? m[2] ?? '') : '';
      // Strip quoted string literals before tokenizing — otherwise the
      // right-hand side of `variable == "someLiteral"` gets scanned for
      // identifier-shaped tokens too, and "someLiteral" (not being a real
      // variable) is spuriously flagged as GATEWAY_UNKNOWN_VARIABLE.
      const bodyNoStringLiterals = body.replace(/'[^']*'|"[^"]*"/g, '');
      const varMatches = bodyNoStringLiterals.match(/[a-zA-Z_][a-zA-Z0-9_.]*/g) || [];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/bpm-orchestrator && npx jest src/engine/__tests__/validation.spec.ts -t "string literal on the right"`
Expected: PASS.

- [ ] **Step 5: Run the full validation spec file to confirm no regression**

Run: `cd services/bpm-orchestrator && npx jest src/engine/__tests__/validation.spec.ts`
Expected: all existing tests still PASS (this change only removes false-positive warnings, never removes a real error/warning, since it only affects what's inside quoted string literals).

- [ ] **Step 6: Commit**

```bash
git add services/bpm-orchestrator/src/engine/validation.ts services/bpm-orchestrator/src/engine/__tests__/validation.spec.ts
git commit -m "fix: strip string literals before extracting condition variables in validateProcess"
```

### Task 2: Rename the reserved form-field key on `purchase_request` (form field only — NOT the gateway conditions)

**Files:**
- Modify: `infra/db/seeds/001_core_data.sql`

**Interfaces:**
- None — this is a data-only change (seeded BPMN XML text).

- [ ] **Step 1: Rename the form field, leave the gateway conditions untouched**

In `infra/db/seeds/001_core_data.sql`, find (around line 193-201, the `purchase_request` process's "Manager Approval" task):

```xml
    <userTask id="approval_gateway" name="Manager Approval" camunda:candidateGroups="manager" camunda:formKey="approval">
      <extensionElements>
        <camunda:formProperty id="decision" name="Decision" type="enum" required="true">
          <camunda:value id="approve" name="Approve"/>
          <camunda:value id="reject" name="Reject"/>
        </camunda:formProperty>
        <camunda:formProperty id="comment" name="Comment" type="textarea" required="false"/>
      </extensionElements>
    </userTask>
```

Replace with:

```xml
    <userTask id="approval_gateway" name="Manager Approval" camunda:candidateGroups="manager" camunda:formKey="approval">
      <extensionElements>
        <!-- id renamed from "decision" (reserved — the engine always injects its
             own `decision`/`approved` variables after this formKey="approval"
             task resolves, see process-instance.service.ts processCompleteApproval).
             The gateway conditions below intentionally still read the
             engine-injected `decision`, NOT this field — do not rename them. -->
        <camunda:formProperty id="approval_decision" name="Decision" type="enum" required="true">
          <camunda:value id="approve" name="Approve"/>
          <camunda:value id="reject" name="Reject"/>
        </camunda:formProperty>
        <camunda:formProperty id="comment" name="Comment" type="textarea" required="false"/>
      </extensionElements>
    </userTask>
```

Do **not** change lines 204-209 (`decision_gw` gateway and its `${decision == "approve"}` / `${decision == "reject"}` conditions) — leave them exactly as they are.

- [ ] **Step 2: Verify no other reference to the old field id exists in this process**

Run: `grep -n 'id="decision"' infra/db/seeds/001_core_data.sql` — after this change, only `fault_management`'s occurrence (not yet renamed — that's Task 3) should remain, plus zero occurrences referencing `purchase_request`'s old field.

- [ ] **Step 3: Commit**

```bash
git add infra/db/seeds/001_core_data.sql
git commit -m "fix: rename purchase_request's reserved 'decision' form field to approval_decision"
```

### Task 3: Rename the reserved form-field keys on `fault_management` and `asset_movement` (field AND gateway conditions, both processes)

**Files:**
- Modify: `infra/db/seeds/001_core_data.sql`

- [ ] **Step 1: `fault_management` — rename both the field and its gateway conditions**

Find (around line 730-742):

```xml
    <userTask id="exc_review" name="Review and Approve Exception" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="decision" name="Exception decision" type="enum" required="true">
          <camunda:value id="approve" name="Approve exception"/>
          <camunda:value id="reject" name="Reject - resume diagnosis"/>
        </camunda:formProperty>
        <camunda:formProperty id="reviewNotes" name="Review notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s12" sourceRef="exc_review" targetRef="exc_gw"/>
    <exclusiveGateway id="exc_gw" name="Exception Approved"/>
    <sequenceFlow id="s13" sourceRef="exc_gw" targetRef="exc_monitor"><conditionExpression>${decision == "approve"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="s14" sourceRef="exc_gw" targetRef="diagnose"><conditionExpression>${decision == "reject"}</conditionExpression></sequenceFlow>
```

Replace with:

```xml
    <userTask id="exc_review" name="Review and Approve Exception" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="exception_decision" name="Exception decision" type="enum" required="true">
          <camunda:value id="approve" name="Approve exception"/>
          <camunda:value id="reject" name="Reject - resume diagnosis"/>
        </camunda:formProperty>
        <camunda:formProperty id="reviewNotes" name="Review notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s12" sourceRef="exc_review" targetRef="exc_gw"/>
    <exclusiveGateway id="exc_gw" name="Exception Approved"/>
    <sequenceFlow id="s13" sourceRef="exc_gw" targetRef="exc_monitor"><conditionExpression>${exception_decision == "approve"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="s14" sourceRef="exc_gw" targetRef="diagnose"><conditionExpression>${exception_decision == "reject"}</conditionExpression></sequenceFlow>
```

This task has **no** `formKey="approval"` — it's a plain userTask, so unlike Task 2, renaming both the field id and the conditions consistently is correct: form values here are merged verbatim into `process_instances.variables` on normal task completion, with no engine-side injection to stay compatible with.

- [ ] **Step 2: `asset_movement` — rename both the field and its gateway conditions**

Find (around line 780-792):

```xml
    <userTask id="approve" name="Approve Movement" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="approved" name="Approved?" type="enum" required="true">
```

Read the full block first (it continues a few lines with `camunda:value` entries) to reproduce it exactly, then change only the `id="approved"` attribute to `id="movement_approved"` on the `camunda:formProperty` line — leave everything else in that `extensionElements` block untouched.

Then find:

```xml
    <exclusiveGateway id="appr_gw" name="Approved?"/>
    <sequenceFlow id="a4" sourceRef="appr_gw" targetRef="dispatch_asset"><conditionExpression>${approved == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="a5" sourceRef="appr_gw" targetRef="notify_reject"><conditionExpression>${approved == "no"}</conditionExpression></sequenceFlow>
```

Replace with:

```xml
    <exclusiveGateway id="appr_gw" name="Approved?"/>
    <sequenceFlow id="a4" sourceRef="appr_gw" targetRef="dispatch_asset"><conditionExpression>${movement_approved == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="a5" sourceRef="appr_gw" targetRef="notify_reject"><conditionExpression>${movement_approved == "no"}</conditionExpression></sequenceFlow>
```

- [ ] **Step 3: Verify no stray references remain**

Run: `grep -n '\${decision\|\${approved\|id="decision"\|id="approved"' infra/db/seeds/001_core_data.sql` — should return **zero** matches now (all three processes renamed, `purchase_request`'s gateway conditions are the only `${decision` occurrences left and they're intentional/unrenamed — confirm by reading the match context).

- [ ] **Step 4: Commit**

```bash
git add infra/db/seeds/001_core_data.sql
git commit -m "fix: rename fault_management/asset_movement reserved form-field keys and their gateway conditions"
```

### Task 4: Re-verify all 11 processes and correct the compatibility doc

**Files:**
- Modify: `docs/bpmn-compatibility-contract.md`

- [ ] **Step 1: Rebuild bpm-orchestrator and re-run full validation against all 11 seeded processes**

This requires a running stack with the corrected seed loaded (fresh DB or re-run of migrations+seeds). Once available:

```bash
cd infra && docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build bpm-orchestrator
```

For each of the 11 process slugs, call the validate endpoint (via the frontend Process Studio Checks button, or `POST /api/v1/processes/definitions/:id/validate` with a valid token) and confirm **zero blocking findings** on all 11, and note the total warning count (should now only include genuine `GATEWAY_UNKNOWN_VARIABLE`/`GATEWAY_DUPLICATE_CONDITION` findings, if any remain, not the string-literal false positives).

- [ ] **Step 2: Update the doc**

In `docs/bpmn-compatibility-contract.md`, find the "Last verified" line (around line 5) and update it with today's actual date and the real re-verified numbers from Step 1 (exact wording depends on what Step 1 finds — do not pre-fill a specific count here, fill in the actual observed result).

- [ ] **Step 3: Run the full Playwright suite**

Run: `cd e2e && npx playwright test`
Expected: 45 passed / 1 skipped (unchanged baseline) — this task changes no runtime behavior, only seed data and a doc.

- [ ] **Step 4: Commit**

```bash
git add docs/bpmn-compatibility-contract.md
git commit -m "docs: correct bpmn-compatibility-contract.md verification claim after Track 4 fixes"
```

---

## Track 1: Wire the org-service Roles screen into real enforcement

### Task 5: Reconcile the seeded `roles` table to match `permissions.ts` exactly

**Files:**
- Modify: `infra/db/seeds/001_core_data.sql`
- Modify: `infra/db/seed_roster.py`

**Interfaces:**
- Produces: 11 `roles` rows (ids `d0000000-...-0001` through `d0000000-...-0012`, one per key in `ROLE_PERMISSIONS`) whose `permissions` JSONB exactly mirrors `services/api-gateway/src/auth/permissions.ts`'s `ROLE_PERMISSIONS`.

- [ ] **Step 1: Replace the seeded roles INSERT**

In `infra/db/seeds/001_core_data.sql`, replace (lines 35-41):

```sql
INSERT INTO roles (id, tenant_id, name, key, permissions, system_role) VALUES
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Administrator',    'admin',              '["*"]',                          true),
  ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Requester',        'requester',          '["cases:create","tasks:view"]',  false),
  ('d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Manager',          'manager',            '["cases:*","tasks:*","approvals:approve"]', false),
  ('d0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','Finance Controller','finance_controller', '["approvals:approve","cases:view","reports:*"]', false),
  ('d0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','CAB Member',       'cab_member',         '["approvals:approve","cases:view"]', false),
  ('d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','IT Engineer',      'it_engineer',        '["tasks:*","cases:view","cases:update"]', false);
```

with (exactly mirroring `permissions.ts`'s `ROLE_PERMISSIONS`, all 12 keys — `admin` through the 3 legacy aliases):

```sql
INSERT INTO roles (id, tenant_id, name, key, permissions, system_role) VALUES
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Administrator',     'admin',              '["*"]', true),
  ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Requester',         'requester',          '["cases:read","cases:create","tasks:read","processes:read"]', false),
  ('d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Manager',           'manager',            '["cases:read","cases:create","cases:update","cases:assign","cases:resolve","cases:close","cases:link","cases:workorder","tasks:*","approvals:*","processes:read","rca:*","mdm:read","mdm:write","contractors:read","contractors:dispatch","contractors:manage","org:read","audit:read","notifications:manage","analytics:read"]', false),
  ('d0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','Finance Controller','finance_controller', '["cases:read","approvals:read","approvals:decide","tasks:read","processes:read"]', false),
  ('d0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','CAB Member',        'cab_member',         '["cases:read","approvals:read","approvals:decide","tasks:read","processes:read"]', false),
  ('d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','IT Engineer',       'it_engineer',        '["cases:read","cases:update","cases:workorder","tasks:read","tasks:claim","tasks:complete","processes:read","mdm:read"]', false),
  ('d0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','NOC Operator',      'noc',                '["cases:read","cases:create","cases:update","cases:assign","cases:resolve","cases:link","cases:workorder","tasks:*","processes:read","rca:read","mdm:read","analytics:read"]', false),
  ('d0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','Field Engineer',    'field_engineer',     '["cases:read","cases:update","cases:workorder","tasks:read","tasks:claim","tasks:complete","processes:read","mdm:read"]', false),
  ('d0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','Security Operations','security',          '["cases:read","cases:create","cases:update","cases:resolve","cases:close","cases:link","tasks:*","processes:read","rca:*","analytics:read"]', false),
  ('d0000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001','Logistics',         'logistics',          '["cases:read","cases:create","cases:update","cases:workorder","cases:link","tasks:*","processes:read","contractors:read","contractors:dispatch","mdm:read"]', false),
  ('d0000000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000001','Approver',          'approver',           '["cases:read","approvals:read","approvals:decide","tasks:read","processes:read"]', false),
  ('d0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000001','Process Designer',  'process_designer',   '["processes:*","cases:read","analytics:read"]', false);
```

- [ ] **Step 2: Simplify `seed_roster.py` — remove the now-duplicated `ROLE_PERMS` dict and role-creation loop**

In `infra/db/seed_roster.py`, delete the `ROLE_PERMS` dict (lines 36-44):

```python
# ── role → permissions (mirrors the gateway RBAC matrix; DB copy for completeness) ──
ROLE_PERMS = {
  "noc": ["cases:read","cases:create","cases:update","cases:assign","cases:resolve","cases:link","cases:workorder","tasks:*","rca:read","mdm:read","analytics:read"],
  "field_engineer": ["cases:read","cases:update","cases:workorder","tasks:read","tasks:claim","tasks:complete","mdm:read"],
  "security": ["cases:read","cases:create","cases:update","cases:resolve","cases:close","cases:link","tasks:*","rca:*","analytics:read"],
  "logistics": ["cases:read","cases:create","cases:update","cases:workorder","cases:link","contractors:read","contractors:dispatch","mdm:read"],
  "approver": ["cases:read","approvals:read","approvals:decide","tasks:read"],
  "process_designer": ["processes:*","cases:read","analytics:read"],
}
```

and replace the role-creation loop inside `main()` (lines 71-76):

```python
    print("== roles (DB) ==")
    for key, perms in ROLE_PERMS.items():
        sql(f"INSERT INTO roles(tenant_id,name,key,permissions) VALUES('{TENANT}','{key.replace('_',' ').title()}','{key}','{json.dumps(perms)}'::jsonb) ON CONFLICT DO NOTHING;")
        # ensure the realm role exists in Keycloak too
        kc("POST","/admin/realms/bpm/roles",tok,{"name":key})
    print("  ensured:", ", ".join(ROLE_PERMS))
```

with:

```python
    print("== roles (Keycloak realm roles) ==")
    # DB `roles` rows now come from the core seed (infra/db/seeds/001_core_data.sql),
    # which is the single source of truth for the permission matrix — no longer
    # duplicated here. This just ensures the matching Keycloak realm roles exist
    # for the users this script creates below.
    for key in ["noc", "field_engineer", "security", "logistics", "approver", "process_designer"]:
        kc("POST","/admin/realms/bpm/roles",tok,{"name":key})
    print("  ensured realm roles for:", "noc, field_engineer, security, logistics, approver, process_designer")
```

- [ ] **Step 3: Verify**

Run: `python3 -c "import json; d=json.loads(open('infra/db/seed_roster.py').read().split('ROLE_PERMS')[0]) if False else print('syntax check skipped, see next step')"` — actually just run a Python syntax check: `python3 -m py_compile infra/db/seed_roster.py` → no output = valid syntax.

- [ ] **Step 4: Commit**

```bash
git add infra/db/seeds/001_core_data.sql infra/db/seed_roster.py
git commit -m "fix: reconcile seeded roles.permissions with the real ROLE_PERMISSIONS matrix"
```

### Task 6: `RolesCacheService` — DB-driven permission lookup with fallback

**Files:**
- Create: `services/api-gateway/src/auth/roles-cache.service.ts`
- Modify: `services/api-gateway/src/auth/permissions.ts`

**Interfaces:**
- Produces: `RolesCacheService.getEffectivePermissionsMap(tenantId: string): Promise<Record<string, string[]>>`
- Produces: `hasPermission(roles, required, map?)`, `permissionsFor(roles, map?)` — both gain an optional 3rd/2nd `map` parameter defaulting to `ROLE_PERMISSIONS`, otherwise unchanged.

- [ ] **Step 1: Parameterize `permissions.ts`'s functions**

In `services/api-gateway/src/auth/permissions.ts`, replace (lines 64-84):

```ts
/** Does any of the user's roles grant the required `resource:action` permission? */
export function hasPermission(roles: string[] | undefined, required: string): boolean {
  if (!required) return true;
  if (!roles?.length) return false;
  const [res] = required.split(':');
  for (const role of roles) {
    const perms = ROLE_PERMISSIONS[role];
    if (!perms) continue;
    for (const p of perms) {
      if (p === '*' || p === required || p === `${res}:*`) return true;
    }
  }
  return false;
}

/** The flattened, de-duplicated permission set for a user's roles (for the UI). */
export function permissionsFor(roles: string[] | undefined): string[] {
  const set = new Set<string>();
  for (const role of roles || []) for (const p of ROLE_PERMISSIONS[role] || []) set.add(p);
  return [...set];
}
```

with:

```ts
/** Does any of the user's roles grant the required `resource:action` permission? */
export function hasPermission(roles: string[] | undefined, required: string, map: Record<string, string[]> = ROLE_PERMISSIONS): boolean {
  if (!required) return true;
  if (!roles?.length) return false;
  const [res] = required.split(':');
  for (const role of roles) {
    const perms = map[role];
    if (!perms) continue;
    for (const p of perms) {
      if (p === '*' || p === required || p === `${res}:*`) return true;
    }
  }
  return false;
}

/** The flattened, de-duplicated permission set for a user's roles (for the UI). */
export function permissionsFor(roles: string[] | undefined, map: Record<string, string[]> = ROLE_PERMISSIONS): string[] {
  const set = new Set<string>();
  for (const role of roles || []) for (const p of map[role] || []) set.add(p);
  return [...set];
}
```

- [ ] **Step 2: Create `RolesCacheService`**

```ts
// services/api-gateway/src/auth/roles-cache.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ROLE_PERMISSIONS } from './permissions';

const CACHE_TTL_MS = 30_000;

@Injectable()
export class RolesCacheService implements OnModuleInit {
  private readonly logger = new Logger(RolesCacheService.name);
  private pool: Pool;
  private cache = new Map<string, { map: Record<string, string[]>; expiresAt: number }>();

  onModuleInit() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.pool.on('error', (err) => this.logger.error('PG Pool error', err));
  }

  /**
   * DB-backed permission map for a tenant, backfilled from the static
   * ROLE_PERMISSIONS for any role key the tenant hasn't defined in the DB
   * yet, and falling back to the static map wholesale on any DB error.
   * This is an ops platform — a permission lookup must never fail closed
   * and lock everyone out because of a transient DB hiccup.
   */
  async getEffectivePermissionsMap(tenantId: string): Promise<Record<string, string[]>> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.map;

    try {
      const r = await this.pool.query<{ key: string; permissions: string[] }>(
        'SELECT key, permissions FROM roles WHERE tenant_id = $1',
        [tenantId],
      );
      const map: Record<string, string[]> = { ...ROLE_PERMISSIONS };
      for (const row of r.rows) map[row.key] = row.permissions;
      this.cache.set(tenantId, { map, expiresAt: Date.now() + CACHE_TTL_MS });
      return map;
    } catch (err) {
      this.logger.error(`Failed to load roles for tenant ${tenantId}, falling back to static permissions map`, err as Error);
      return ROLE_PERMISSIONS;
    }
  }
}
```

- [ ] **Step 3: Verify**

Run: `cd services/api-gateway && npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add services/api-gateway/src/auth/permissions.ts services/api-gateway/src/auth/roles-cache.service.ts
git commit -m "feat: add RolesCacheService for DB-driven permission lookup with static fallback"
```

### Task 7: Wire `RolesCacheService` into `PermissionsGuard` + `MeController`, make `AuthModule` global

**Files:**
- Modify: `services/api-gateway/src/auth/permissions.guard.ts`
- Modify: `services/api-gateway/src/auth/auth.module.ts`
- Modify: `services/api-gateway/src/me/me.controller.ts`

**Interfaces:**
- Consumes: `RolesCacheService.getEffectivePermissionsMap` (Task 6).
- `PermissionsGuard.canActivate` becomes `async`, matching Nest's `CanActivate` interface (`boolean | Promise<boolean> | Observable<boolean>` is already the declared return type, so this is not a breaking interface change).

- [ ] **Step 1: Make `AuthModule` global and provide `RolesCacheService`**

Replace `services/api-gateway/src/auth/auth.module.ts` in full:

```ts
import { Global, Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { RolesCacheService } from './roles-cache.service';

// Global: PermissionsGuard is applied via @UseGuards(...) directly in ~15
// feature-module controllers across the gateway, none of which import this
// module — they've always resolved Reflector (a Nest core token) implicitly.
// Once the guard also depends on RolesCacheService, every one of those
// modules needs it resolvable too; @Global() + exporting it here is the only
// way to do that without touching all ~15 modules individually.
@Global()
@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
  providers: [JwtStrategy, RolesCacheService],
  exports: [PassportModule, RolesCacheService],
})
export class AuthModule {}
```

- [ ] **Step 2: Make the guard async and DB-driven**

Replace `services/api-gateway/src/auth/permissions.guard.ts` in full:

```ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './require-permission.decorator';
import { hasPermission } from './permissions';
import { RolesCacheService } from './roles-cache.service';

/**
 * Enforces @RequirePermission(...) using the verified JWT roles (req.user.roles)
 * against the tenant's DB-driven permission map (falls back to the static
 * ROLE_PERMISSIONS map on any DB error — see RolesCacheService).
 * Routes without a declared permission are allowed for any authenticated user
 * (so coverage can be added incrementally without breaking un-annotated routes).
 * Must run AFTER JwtAuthGuard so req.user is populated.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesCache: RolesCacheService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required) return true;
    const req = ctx.switchToHttp().getRequest();
    const roles: string[] = req.user?.roles || [];
    const tenantId: string = req.user?.tenantId;
    const map = await this.rolesCache.getEffectivePermissionsMap(tenantId);
    if (!hasPermission(roles, required, map)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
```

- [ ] **Step 3: Switch `MeController` to the DB-driven map**

Replace `services/api-gateway/src/me/me.controller.ts` in full:

```ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { permissionsFor } from '../auth/permissions';
import { RolesCacheService } from '../auth/roles-cache.service';

@ApiTags('Me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/me')
export class MeController {
  constructor(private readonly rolesCache: RolesCacheService) {}

  // Identity + effective RBAC permissions for the signed-in user (drives UI gating).
  @Get()
  async me(@Req() req: any) {
    const roles: string[] = req.user?.roles || [];
    const map = await this.rolesCache.getEffectivePermissionsMap(req.user?.tenantId);
    return {
      sub: req.user?.sub,
      username: req.user?.username,
      name: req.user?.name,
      email: req.user?.email,
      tenantId: req.user?.tenantId,
      roles,
      permissions: permissionsFor(roles, map),
    };
  }

  @Get('permissions')
  async permissions(@Req() req: any) {
    const map = await this.rolesCache.getEffectivePermissionsMap(req.user?.tenantId);
    return { permissions: permissionsFor(req.user?.roles || [], map) };
  }
}
```

- [ ] **Step 4: Verify**

Run: `cd services/api-gateway && npx tsc --noEmit` → clean.

- [ ] **Step 5: Boot the gateway and confirm no DI resolution errors**

```bash
cd infra && docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build api-gateway
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs api-gateway --tail 50
```
Expected: `Nest application successfully started`, no `UnknownDependenciesException` or similar DI errors for any module (this is the exact failure mode Step 1's `@Global()` fix prevents — confirm it's actually gone, don't just trust the code).

- [ ] **Step 6: Run the full Playwright suite**

Run: `cd e2e && npx playwright test`
Expected: 45 passed / 1 skipped — this task changes the enforcement *mechanism*, not any actual permission outcome (Task 5 already made the DB data match the static map exactly), so no test should behave differently.

- [ ] **Step 7: Commit**

```bash
git add services/api-gateway/src/auth/permissions.guard.ts services/api-gateway/src/auth/auth.module.ts services/api-gateway/src/me/me.controller.ts
git commit -m "feat: wire PermissionsGuard and MeController to DB-driven RolesCacheService"
```

### Task 8: Add a working "edit role" endpoint + UI

**Files:**
- Modify: `services/org-service/src/role/role.service.ts`
- Modify: `services/org-service/src/role/role.controller.ts`
- Modify: `services/api-gateway/src/org/org.controller.ts`
- Modify: `apps/frontend-portal/src/api/client.ts`
- Modify: `apps/frontend-portal/src/pages/org/OrgStructure.tsx`

**Interfaces:**
- Produces: `RoleService.update(tenantId, id, dto): Promise<Role>`
- Produces: `orgApi.updateRole(id, dto)` client function.

- [ ] **Step 1: Add `update()` to `RoleService`**

In `services/org-service/src/role/role.service.ts`, add after `create()`:

```ts
  async update(tenantId: string, id: string, dto: { name?: string; permissions?: string[]; description?: string }) {
    const r = await this.db.query(
      `UPDATE roles SET
         name = COALESCE($3, name),
         permissions = COALESCE($4::jsonb, permissions),
         description = COALESCE($5, description),
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, dto.name ?? null, dto.permissions ? JSON.stringify(dto.permissions) : null, dto.description ?? null],
    );
    return r.rows[0];
  }
```

- [ ] **Step 2: Add the route in org-service's `role.controller.ts`**

Replace `services/org-service/src/role/role.controller.ts` in full:

```ts
import { Controller, Get, Post, Put, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleService } from './role.service';

@ApiTags('Roles')
@Controller('roles')
export class RoleController {
  constructor(private readonly svc: RoleService) {}

  @Get() findAll(@Req() req: any, @Query() q: any) {
    // Tenant from the verified header only — not caller-supplied query/body.
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.findAll(tid, { page: q.page ? +q.page : 1, pageSize: q.pageSize ? +q.pageSize : 50 });
  }
  @Post() create(@Req() req: any, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.create(tid, body);
  }
  @Put(':id') update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.update(tid, id, body);
  }
}
```

- [ ] **Step 3: Add the gateway route**

In `services/api-gateway/src/org/org.controller.ts`, find the existing roles routes (confirmed at lines 65-67):
```ts
  @Get('roles') getRoles(@Req() req: any, @Query() q: any) { return this.proxy.forward(ORG_URL(), 'GET', '/roles', undefined, hdrs(req), q); }
  @RequirePermission('org:manage')
  @Post('roles') createRole(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'POST', '/roles', b, hdrs(req)); }
```
Add immediately after `createRole` (before the class's closing `}`):
```ts
  @RequirePermission('org:manage')
  @Put('roles/:id') updateRole(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'PUT', `/roles/${id}`, b, hdrs(req)); }
```

- [ ] **Step 4: Add the frontend API client function**

In `apps/frontend-portal/src/api/client.ts`, replace (line 47-48):
```ts
  // Roles
  getRoles:            ()                        => axios.get(`${BASE}/roles`, { headers: headers() }).then(r => r.data),
```
with:
```ts
  // Roles
  getRoles:            ()                        => axios.get(`${BASE}/roles`, { headers: headers() }).then(r => r.data),
  updateRole:          (id: string, dto: any)    => axios.put(`${BASE}/roles/${id}`, dto, { headers: headers() }).then(r => r.data),
```

- [ ] **Step 5: Add an edit UI to the Roles tab**

In `apps/frontend-portal/src/pages/org/OrgStructure.tsx`, add the `useAccess` import (not currently imported in this file):
```ts
import { useAccess } from '../../auth/useAccess';
```
Inside the component, add (near the other `useState` declarations, and note the query key is `'org-roles'`, confirmed at line 447):
```ts
  const { can } = useAccess();
  const [roleDlg, setRoleDlg] = useState<{ open: boolean; role?: any }>({ open: false });
  const saveRole = useMutation(
    (dto: any) => orgApi.updateRole(roleDlg.role.id, dto),
    { onSuccess: () => { qc.invalidateQueries('org-roles'); setRoleDlg({ open: false }); } },
  );
```

Replace the Roles tab block (lines 621-641):
```tsx
      {/* ── Tab 3: Roles ── */}
      {tab === 3 && (
        <Grid container spacing={2}>
          {allRoles.map((r: any) => (
            <Grid item key={r.id} xs={12} sm={6} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="subtitle1" fontWeight={600}>{r.name}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.key || r.slug}</Typography>
                  {r.description && <Typography variant="body2" mt={1}>{r.description}</Typography>}
                </CardContent>
              </Card>
            </Grid>
          ))}
          {allRoles.length === 0 && (
            <Grid item xs={12}>
              <Typography color="text.secondary">No roles defined</Typography>
            </Grid>
          )}
        </Grid>
      )}
```
with:
```tsx
      {/* ── Tab 3: Roles ── */}
      {tab === 3 && (
        <Grid container spacing={2}>
          {allRoles.map((r: any) => (
            <Grid item key={r.id} xs={12} sm={6} md={4}>
              <Card variant="outlined">
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                    <Box>
                      <Typography variant="subtitle1" fontWeight={600}>{r.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{r.key || r.slug}</Typography>
                    </Box>
                    {can('org:manage') && (
                      <IconButton size="small" onClick={() => setRoleDlg({ open: true, role: r })}><EditIcon fontSize="small" /></IconButton>
                    )}
                  </Box>
                  {r.description && <Typography variant="body2" mt={1}>{r.description}</Typography>}
                  <Typography variant="caption" color="text.secondary" mt={1} sx={{ display: 'block', wordBreak: 'break-word' }}>
                    {(r.permissions || []).join(', ') || 'No permissions'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
          {allRoles.length === 0 && (
            <Grid item xs={12}>
              <Typography color="text.secondary">No roles defined</Typography>
            </Grid>
          )}
        </Grid>
      )}
      {roleDlg.open && (
        <Dialog open onClose={() => setRoleDlg({ open: false })} maxWidth="sm" fullWidth>
          <DialogTitle>Edit Role — {roleDlg.role.name}</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField label="Name" defaultValue={roleDlg.role.name} id="role-name" size="small" />
            <TextField label="Description" defaultValue={roleDlg.role.description || ''} id="role-description" size="small" multiline rows={2} />
            <TextField
              label="Permissions (comma-separated resource:action strings)"
              defaultValue={(roleDlg.role.permissions || []).join(', ')}
              id="role-permissions"
              size="small"
              multiline
              rows={3}
              helperText='e.g. "cases:read, cases:create, tasks:*" — use "*" for unrestricted admin access'
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRoleDlg({ open: false })}>Cancel</Button>
            <Button
              variant="contained"
              disabled={saveRole.isLoading}
              onClick={() => {
                const name = (document.getElementById('role-name') as HTMLInputElement).value;
                const description = (document.getElementById('role-description') as HTMLInputElement).value;
                const permissions = (document.getElementById('role-permissions') as HTMLInputElement).value
                  .split(',').map(s => s.trim()).filter(Boolean);
                saveRole.mutate({ name, description, permissions });
              }}
            >
              {saveRole.isLoading ? 'Saving…' : 'Save'}
            </Button>
          </DialogActions>
        </Dialog>
      )}
```

Note: `Dialog`/`DialogTitle`/`DialogContent`/`DialogActions`/`IconButton`/`EditIcon` must already be imported in this file (it already uses `EditIcon` per line 12 and almost certainly `Dialog`-family components for `OrgUnitDialog`/`UserDialog` — verify all are in the existing `@mui/material` import block at the top of the file before adding this code; add any missing ones to that import).

- [ ] **Step 6: Verify**

Run: `cd services/org-service && npx tsc --noEmit`, `cd services/api-gateway && npx tsc --noEmit`, `cd apps/frontend-portal && npx tsc --noEmit` — all clean.
Manual: log in as `admin`, go to Administration → Organization → Roles tab, edit a role's permissions, save, confirm the change persists (reload the page, see the new value) and — since `RolesCacheService`'s cache TTL is 30s — within 30 seconds a user with that role sees the new permission take effect (e.g. an API call that was previously 403 now succeeds).

- [ ] **Step 7: Commit**

```bash
git add services/org-service/src/role/ services/api-gateway/src/org/org.controller.ts apps/frontend-portal/src/api/client.ts apps/frontend-portal/src/pages/org/OrgStructure.tsx
git commit -m "feat: add working role-edit endpoint and UI now that roles.permissions is the real enforcement source"
```

---

## Track 3: Fix Team Queue claim/assign + team pickers

### Task 9: Wire Team Queue to the real claim endpoint

**Files:**
- Modify: `apps/frontend-portal/src/api/client.ts`
- Modify: `apps/frontend-portal/src/pages/workplace/TeamQueue.tsx`

**Interfaces:**
- Produces: `caseApi.claim(id: string): Promise<Case>`

- [ ] **Step 1: Add `claim` to `caseApi`**

In `apps/frontend-portal/src/api/client.ts`, find (line 107):
```ts
  assign:        (id: string, dto: any)   => axios.patch(`${BASE}/cases/${id}/assign`, dto, { headers: headers() }).then(r => r.data),
```
Add immediately after it:
```ts
  claim:         (id: string)             => axios.post(`${BASE}/cases/${id}/claim`, {}, { headers: headers() }).then(r => r.data),
```

- [ ] **Step 2: Use it in `TeamQueue.tsx`**

Replace (lines 21-32):
```ts
  const claim = useMutation(
    async (c: any) => {
      // Keep the case on its team while assigning it to me (the server resolves
      // my id from the sub). Otherwise the claim would clear the team context.
      await caseApi.assign(c.id, { assigneeId: user?.id, teamId: c.assigned_team_id || undefined });
      if (c.status === 'new') await caseApi.transition(c.id, { status: 'open' });
    },
    {
      onSuccess: () => { qc.invalidateQueries('my-work'); setToast('Case claimed and assigned to you'); },
      onError: (e: any) => setToast(e?.response?.data?.message || 'Could not claim — you may not be on this team'),
    },
  );
```
with:
```ts
  const claim = useMutation(
    async (c: any) => {
      // POST /cases/:id/claim is the purpose-built endpoint: it verifies the
      // caller is actually a member of the case's team (see case.service.ts
      // claimCase()) — the generic assign() endpoint used here previously had
      // no such check and required a permission (cases:assign) that
      // field_engineer/security/logistics don't hold, so this button 403'd
      // for exactly the roles who should be using it.
      await caseApi.claim(c.id);
      if (c.status === 'new') await caseApi.transition(c.id, { status: 'open' });
    },
    {
      onSuccess: () => { qc.invalidateQueries('my-work'); setToast('Case claimed and assigned to you'); },
      onError: (e: any) => setToast(e?.response?.data?.message || 'Could not claim — you may not be on this team'),
    },
  );
```

- [ ] **Step 3: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend-portal/src/api/client.ts apps/frontend-portal/src/pages/workplace/TeamQueue.tsx
git commit -m "fix: Team Queue claim button calls the real claim endpoint instead of assign"
```

### Task 10: Filter "Assigned Team" pickers to actual teams

**Files:**
- Modify: `apps/frontend-portal/src/pages/cases/CreateCase.tsx`
- Modify: `apps/frontend-portal/src/pages/cases/CaseDetail.tsx`

- [ ] **Step 1: `CreateCase.tsx`**

Replace (line 123):
```ts
  const orgUnits: any[] = orgData?.data || [];
```
with:
```ts
  // Only leaf "team" org units are valid assignment targets — Team Queue
  // matching is an exact org_unit_id match (case.service.ts getMyWork), so
  // assigning to a division/department/section orphans the case: nobody's
  // queue would ever match it.
  const orgUnits: any[] = (orgData?.data || []).filter((ou: any) => ou.type === 'team');
```

- [ ] **Step 2: `CaseDetail.tsx`**

Replace (line 218):
```ts
  const orgUnits: any[] = orgData?.data || [];
```
with:
```ts
  // Only leaf "team" org units are valid reassignment targets — see the same
  // comment in CreateCase.tsx.
  const orgUnits: any[] = (orgData?.data || []).filter((ou: any) => ou.type === 'team');
```

- [ ] **Step 3: Verify**

Run: `cd apps/frontend-portal && npx tsc --noEmit` → clean.
Manual: open New Case and Case Detail's Reassign dialog, confirm the "Assigned Team" dropdown only lists team-level units (e.g. "Infrastructure Team", "Finance Team"), not divisions/departments.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend-portal/src/pages/cases/CreateCase.tsx apps/frontend-portal/src/pages/cases/CaseDetail.tsx
git commit -m "fix: restrict Assigned Team pickers to type=team org units"
```

---

## Track 2: Scope `cases:read` by ownership/role

### Task 11: Forward roles from the gateway to case-service

**Files:**
- Modify: `services/api-gateway/src/case/case.controller.ts`
- Modify: `services/case-service/src/case/case.controller.ts`

**Interfaces:**
- Produces: `X-User-Roles` header (comma-separated role names), forwarded on every case-service request.

- [ ] **Step 1: Gateway — add the header**

In `services/api-gateway/src/case/case.controller.ts`, replace (lines 11-13):
```ts
function hdrs(req: any) {
  return { Authorization: req.headers['authorization'] || '', 'X-Tenant-ID': req.tenantId || '', 'X-User-ID': req.user?.sub || '' };
}
```
with:
```ts
function hdrs(req: any) {
  return {
    Authorization: req.headers['authorization'] || '',
    'X-Tenant-ID': req.tenantId || '',
    'X-User-ID': req.user?.sub || '',
    'X-User-Roles': (req.user?.roles || []).join(','),
  };
}
```

- [ ] **Step 2: Case-service — read the header**

In `services/case-service/src/case/case.controller.ts`, replace (lines 8-9):
```ts
  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id']; }
```
with:
```ts
  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id']; }
  private roles(h: Record<string, string>) { return (h['x-user-roles'] || '').split(',').filter(Boolean); }
```

- [ ] **Step 3: Verify**

Run: `cd services/api-gateway && npx tsc --noEmit`, `cd services/case-service && npx tsc --noEmit` — both clean. This step alone changes no behavior (the header is now sent and readable, but nothing consumes it yet — that's Task 12).

- [ ] **Step 4: Commit**

```bash
git add services/api-gateway/src/case/case.controller.ts services/case-service/src/case/case.controller.ts
git commit -m "feat: forward caller roles from gateway to case-service via X-User-Roles"
```

### Task 12: Implement role-based scoping in `findAll`/`findOne`

**Files:**
- Modify: `services/case-service/src/case/case.service.ts`
- Modify: `services/case-service/src/case/case.controller.ts`

**Interfaces:**
- `findAll(tenantId, filters, page, pageSize, roles?)` — new optional 5th parameter.
- `findOne(tenantId, id, actorId?, roles?)` — new optional 4th parameter. Throws `ForbiddenException` (403) when the case exists but is outside the caller's scope; throws the existing `NotFoundException` (404) unchanged when it truly doesn't exist.
- Both existing internal call sites (`assign()`'s `this.findOne(tenantId, id)`, `claimCase()`'s `this.findOne(tenantId, caseId)`) are left as-is — omitting `roles` means unscoped/full access, which is correct: these are post-controller-authorization internal lookups, not the public detail-view endpoint.

- [ ] **Step 1: Add the scoping helper to `CaseService`**

In `services/case-service/src/case/case.service.ts`, add this private method (place it near `resolveUserId`, e.g. right after it):

```ts
  /**
   * Role-based visibility scope for cases:read. Returns null for roles with
   * full tenant visibility (no extra filter needed). Returns a SQL fragment
   * (using the given 1-based placeholder index) plus the bound value for
   * roles that must be scoped, or a fragment that never matches if the
   * caller's roles don't map to any known tier (fail closed, not open).
   */
  private async buildRoleScope(
    tenantId: string, roles: string[] | undefined, actorId: string | undefined, paramIndex: number,
  ): Promise<{ sql: string; val: string } | null> {
    if (!roles?.length) return null; // internal/unscoped callers (assign(), claimCase()) — no filter
    const FULL_VISIBILITY = new Set(['admin', 'manager', 'noc']);
    if (roles.some(r => FULL_VISIBILITY.has(r))) return null;

    const uid = await this.resolveUserId(actorId, tenantId);
    if (!uid) return { sql: '1=0', val: '' }; // can't resolve identity — fail closed

    const TEAM_SCOPED = new Set(['field_engineer', 'it_engineer', 'security', 'logistics']);
    const OWN_ONLY = new Set(['requester', 'process_designer']);
    const APPROVER = new Set(['approver', 'cab_member', 'finance_controller']);

    const fragments: string[] = [];
    if (roles.some(r => TEAM_SCOPED.has(r))) {
      fragments.push(`(c.assignee_id = $${paramIndex} OR c.assigned_team_id IN (SELECT org_unit_id FROM user_org_assignments WHERE user_id = $${paramIndex}))`);
    }
    if (roles.some(r => OWN_ONLY.has(r) || APPROVER.has(r))) {
      fragments.push(`c.requester_id = $${paramIndex}`);
    }
    if (roles.some(r => APPROVER.has(r))) {
      fragments.push(`EXISTS (SELECT 1 FROM approval_instances ai JOIN approval_step_decisions asd ON asd.instance_id = ai.id WHERE ai.tenant_id = c.tenant_id AND ai.entity_type = 'case' AND ai.entity_id = c.id AND asd.approver_id = $${paramIndex} AND asd.decision IS NULL)`);
    }
    if (!fragments.length) return { sql: '1=0', val: uid }; // unrecognized role — fail closed
    return { sql: `(${fragments.join(' OR ')})`, val: uid };
  }
```

- [ ] **Step 2: Apply it in `findAll`**

Replace the signature and add the scope (lines 99-126):
```ts
  async findAll(tenantId: string, filters: any, page = 1, pageSize = 20) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const conds: string[] = ['c.tenant_id=$1'];
    const vals: any[] = [tenantId];
    let i = 2;
```
becomes:
```ts
  async findAll(tenantId: string, filters: any, page = 1, pageSize = 20, roles?: string[]) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const conds: string[] = ['c.tenant_id=$1'];
    const vals: any[] = [tenantId];
    let i = 2;
```
Then, immediately before the existing `const where = conds.join(' AND ');` line (line 126), insert:
```ts
    const scope = await this.buildRoleScope(tenantId, roles, filters.actorId, i);
    if (scope) { conds.push(scope.sql); vals.push(scope.val); i++; }
```
(Note: `filters.actorId` is a new field the controller must now pass — see Step 4.)

- [ ] **Step 3: Apply it in `findOne`**

Replace the full method (lines 145-169):
```ts
  async findOne(tenantId: string, id: string, actorId?: string) {
    const r = await this.db.query(
      `SELECT c.*,
              (u.first_name || ' ' || u.last_name) as requester_name,
              (a.first_name || ' ' || a.last_name) as assignee_name,
              NULLIF(TRIM(m.first_name || ' ' || m.last_name), '') as mim_name,
              ou.name as team_name
       FROM cases c
       LEFT JOIN users u  ON u.id=c.requester_id
       LEFT JOIN users a  ON a.id=c.assignee_id
       LEFT JOIN users m  ON m.id=c.mim_id
       LEFT JOIN org_units ou ON ou.id=c.assigned_team_id
       WHERE c.id=$1 AND c.tenant_id=$2`,
      [id, tenantId],
    );
    if (!r.rows.length) throw new NotFoundException('Case not found');
    const row = r.rows[0];
    // Ownership flag for the caller — lets clients gate work actions (claim vs
    // begin/resolve) on whether the case is actually assigned to them.
    if (actorId) {
      const uid = await this.resolveUserId(actorId, tenantId);
      row.mine = !!uid && row.assignee_id === uid;
    }
    return row;
  }
```
with:
```ts
  async findOne(tenantId: string, id: string, actorId?: string, roles?: string[]) {
    const r = await this.db.query(
      `SELECT c.*,
              (u.first_name || ' ' || u.last_name) as requester_name,
              (a.first_name || ' ' || a.last_name) as assignee_name,
              NULLIF(TRIM(m.first_name || ' ' || m.last_name), '') as mim_name,
              ou.name as team_name
       FROM cases c
       LEFT JOIN users u  ON u.id=c.requester_id
       LEFT JOIN users a  ON a.id=c.assignee_id
       LEFT JOIN users m  ON m.id=c.mim_id
       LEFT JOIN org_units ou ON ou.id=c.assigned_team_id
       WHERE c.id=$1 AND c.tenant_id=$2`,
      [id, tenantId],
    );
    if (!r.rows.length) throw new NotFoundException('Case not found');
    const row = r.rows[0];
    const uid = actorId ? await this.resolveUserId(actorId, tenantId) : null;
    // Ownership flag for the caller — lets clients gate work actions (claim vs
    // begin/resolve) on whether the case is actually assigned to them.
    if (actorId) row.mine = !!uid && row.assignee_id === uid;
    // Role-based visibility: 403 (not 404) when the case exists but the
    // caller's role tier doesn't cover it — confirmed product decision, not
    // the simpler "just 404 it" default.
    if (roles?.length) {
      const inScope = await this.isInRoleScope(row, roles, uid);
      if (!inScope) throw new ForbiddenException('You do not have access to this case');
    }
    return row;
  }

  /** In-process scope check for a single already-fetched case row (findOne's 403 path). */
  private async isInRoleScope(row: any, roles: string[], uid: string | null): Promise<boolean> {
    const FULL_VISIBILITY = new Set(['admin', 'manager', 'noc']);
    if (roles.some(r => FULL_VISIBILITY.has(r))) return true;
    if (!uid) return false;

    const TEAM_SCOPED = new Set(['field_engineer', 'it_engineer', 'security', 'logistics']);
    const OWN_ONLY = new Set(['requester', 'process_designer']);
    const APPROVER = new Set(['approver', 'cab_member', 'finance_controller']);

    if (roles.some(r => TEAM_SCOPED.has(r))) {
      if (row.assignee_id === uid) return true;
      if (row.assigned_team_id) {
        const member = await this.db.query(
          `SELECT 1 FROM user_org_assignments WHERE user_id=$1 AND org_unit_id=$2 LIMIT 1`,
          [uid, row.assigned_team_id],
        );
        if (member.rowCount) return true;
      }
    }
    if (roles.some(r => OWN_ONLY.has(r) || APPROVER.has(r)) && row.requester_id === uid) return true;
    if (roles.some(r => APPROVER.has(r))) {
      const pending = await this.db.query(
        `SELECT 1 FROM approval_instances ai JOIN approval_step_decisions asd ON asd.instance_id = ai.id
         WHERE ai.tenant_id = $1 AND ai.entity_type = 'case' AND ai.entity_id = $2 AND asd.approver_id = $3 AND asd.decision IS NULL`,
        [row.tenant_id, row.id, uid],
      );
      if (pending.rowCount) return true;
    }
    return false;
  }
```

Note: `ForbiddenException` must be imported in this file if not already — check the top of `case.service.ts` for its existing `@nestjs/common` import line and add it there (it's very likely already imported, since `claimCase()` already throws it — verify before adding a duplicate import).

- [ ] **Step 4: Wire the controller to pass roles through**

In `services/case-service/src/case/case.controller.ts`, replace the `findAll` handler (lines 46-59):
```ts
  @Get()
  findAll(
    @Headers() h: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('requesterId') requesterId?: string,
    @Query('teamId') teamId?: string,
    @Query('search') search?: string,
    @Query('breached') breached?: string,
  ) { return this.svc.findAll(this.tenant(h), { type, status, priority, assigneeId, requesterId, teamId, search, breached }, page, pageSize); }
```
with:
```ts
  @Get()
  findAll(
    @Headers() h: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('requesterId') requesterId?: string,
    @Query('teamId') teamId?: string,
    @Query('search') search?: string,
    @Query('breached') breached?: string,
  ) { return this.svc.findAll(this.tenant(h), { type, status, priority, assigneeId, requesterId, teamId, search, breached, actorId: this.actor(h) }, page, pageSize, this.roles(h)); }
```
(Passing `actorId` inside the `filters` object so `findAll`'s existing single-`filters`-argument shape doesn't need a 6th positional parameter — `buildRoleScope` reads it as `filters.actorId`, per Step 2.)

Replace `findOne` (lines 61-64):
```ts
  @Get(':id')
  findOne(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.findOne(this.tenant(h), id, this.actor(h));
  }
```
with:
```ts
  @Get(':id')
  findOne(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.findOne(this.tenant(h), id, this.actor(h), this.roles(h));
  }
```

- [ ] **Step 5: Verify**

Run: `cd services/case-service && npx tsc --noEmit` → clean.

- [ ] **Step 6: Manual smoke test against the running stack**

Rebuild case-service and api-gateway, then:
- As `admin`/`manager1`: `GET /api/v1/cases` still returns all cases (unchanged).
- As `requester1`: `GET /api/v1/cases` returns only cases where `requester_id` matches `requester1`.
- As `requester1`: `GET /api/v1/cases/:id` for a case raised by someone else → `403`.

- [ ] **Step 7: Commit**

```bash
git add services/case-service/src/case/case.service.ts services/case-service/src/case/case.controller.ts
git commit -m "feat: scope cases:read by role — full/team/own visibility tiers, 403 on out-of-scope access"
```

### Task 13: Add e2e fixture user for cross-team isolation testing

**Files:**
- Modify: `infra/keycloak/realm-export.json`
- Modify: `infra/db/seeds-demo/001_demo_users.sql`

**Interfaces:**
- Produces: one new demo user, `security1` (role `security`, team = Finance Team), to test team-scoped visibility against the existing `engineer1` (role `it_engineer`, team = Infrastructure Team) — two different field-tier roles on two different teams is exactly what's needed to prove cross-team isolation, and every other tier (`admin`/`manager1` for full-visibility, `requester1` for own-only, `cab1`/`finance1` for approver-tier) is already covered by existing demo users.

- [ ] **Step 1: Add the Keycloak user**

In `infra/keycloak/realm-export.json`, find the `users` array (the `engineer1` entry, per the existing pattern already confirmed) and add a new entry immediately after it:

```json
{
  "id": "security1-keycloak-id",
  "username": "security1",
  "email": "security1@democorp.com",
  "firstName": "Fatima",
  "lastName": "Security",
  "enabled": true,
  "emailVerified": true,
  "credentials": [
    {
      "type": "password",
      "value": "Admin123!",
      "temporary": false
    }
  ],
  "realmRoles": [
    "security"
  ],
  "attributes": {
    "tenant_id": [
      "a0000000-0000-0000-0000-000000000001"
    ]
  }
}
```

- [ ] **Step 2: Add the matching DB rows**

In `infra/db/seeds-demo/001_demo_users.sql`, replace the three `INSERT` blocks to add `security1` (id `c0000000-...-0007`, team = Finance Team `b0000000-...-0007`, role `security` = `d0000000-...-0009` per Task 5's reconciled IDs):

```sql
-- ─── Demo Users ─────────────────────────────────────────────────────────────
INSERT INTO users (id, tenant_id, keycloak_id, email, first_name, last_name, username, active) VALUES
  ('c0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','requester1-keycloak-id','requester1@democorp.com','Alice','Johnson', 'requester1', true),
  ('c0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','manager1-keycloak-id',  'manager1@democorp.com',  'Bob',  'Smith',   'manager1',   true),
  ('c0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','finance1-keycloak-id',  'finance1@democorp.com',  'Carol','Finance', 'finance1',   true),
  ('c0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','cab1-keycloak-id',      'cab1@democorp.com',      'Dave', 'CAB',     'cab1',       true),
  ('c0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','engineer1-keycloak-id', 'engineer1@democorp.com', 'Eve',  'Engineer','engineer1',  true),
  ('c0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','security1-keycloak-id', 'security1@democorp.com', 'Fatima','Security','security1', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_org_assignments (user_id, tenant_id, org_unit_id, position_id, is_primary) VALUES
  ('c0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000006', true),
  ('c0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003', true),
  ('c0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000006','e1000000-0000-0000-0000-000000000004', true),
  ('c0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000006','e1000000-0000-0000-0000-000000000007', true),
  ('c0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000005', true),
  ('c0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000007',NULL, true)
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, tenant_id) VALUES
  ('c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000006','d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000007','d0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;
```

(`position_id` is `NULL` for `security1` since no existing seeded position fits — read the `positions` table seed first to confirm no better-fitting row exists before defaulting to `NULL`; if the `user_org_assignments` schema requires a non-null `position_id`, pick the closest existing one instead, e.g. reuse `e1000000-...-0007` from Finance Team's CAB Member position.)

- [ ] **Step 2b: Verify the FK dependency**

This step depends on Task 5 (roles table reconciliation) having landed first — `d0000000-0000-0000-0000-000000000009` (the `security` role) must already exist in `roles` before this INSERT's `user_roles` FK will succeed. Confirm Task 5 is committed before running this.

- [ ] **Step 3: Verify**

Run a fresh migration+seed cycle against a scratch DB (or the dev stack's `docker compose down -v && up` if acceptable) and confirm no FK violation errors during seed load.

- [ ] **Step 4: Commit**

```bash
git add infra/keycloak/realm-export.json infra/db/seeds-demo/001_demo_users.sql
git commit -m "test: add security1 demo user (Finance Team) for cross-team case-visibility e2e coverage"
```

### Task 14: E2E test for role-based case visibility

**Files:**
- Create: `e2e/tests/01-main-portal/case-role-visibility.spec.ts`

**Interfaces:**
- Consumes: `getDevUser`, `getAccessToken`, `apiHeaders` (`e2e/tests/helpers/auth.ts`, already used identically by `case-assignee-reassignment.spec.ts`).

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test';
import { getDevUser, getAccessToken, apiHeaders } from '../helpers/auth';

/**
 * Regression coverage for Track 2 of the pre-production RBAC fixes: cases:read
 * must be scoped by role, not tenant-wide for every role that holds it.
 */
test.describe('case visibility scoping by role', () => {
  test('requester sees only their own cases, not ones raised by someone else', async ({ request }) => {
    const requesterToken = await getAccessToken(request, getDevUser('requester1'));
    const managerToken = await getAccessToken(request, getDevUser('manager1'));

    // A case raised by manager1 (via the API, actorId resolves to manager1's identity).
    const created = await request.post('/api/v1/cases', {
      headers: apiHeaders(managerToken),
      data: { title: `E2E role-visibility (manager-raised) ${Date.now()}`, type: 'incident', priority: 'low', description: 'seed' },
    });
    expect(created.ok()).toBeTruthy();
    const managerCase = await created.json();

    // requester1 must not see it in the list...
    const list = await request.get('/api/v1/cases', { headers: apiHeaders(requesterToken), params: { pageSize: 200 } });
    expect(list.ok()).toBeTruthy();
    const listBody = await list.json();
    expect(listBody.data.map((c: any) => c.id)).not.toContain(managerCase.id);

    // ...nor fetch it directly by ID.
    const direct = await request.get(`/api/v1/cases/${managerCase.id}`, { headers: apiHeaders(requesterToken) });
    expect(direct.status()).toBe(403);
  });

  test('requester DOES see a case they raised themselves', async ({ request }) => {
    const requesterToken = await getAccessToken(request, getDevUser('requester1'));
    const created = await request.post('/api/v1/cases', {
      headers: apiHeaders(requesterToken),
      data: { title: `E2E role-visibility (self-raised) ${Date.now()}`, type: 'request', priority: 'low', description: 'seed' },
    });
    expect(created.ok()).toBeTruthy();
    const ownCase = await created.json();

    const direct = await request.get(`/api/v1/cases/${ownCase.id}`, { headers: apiHeaders(requesterToken) });
    expect(direct.ok()).toBeTruthy();
  });

  test('field/security-tier roles see cases assigned to their team, not another team\'s', async ({ request }) => {
    const engineerToken = await getAccessToken(request, getDevUser('engineer1')); // it_engineer, Infrastructure Team
    const securityToken = await getAccessToken(request, getDevUser('security1')); // security, Finance Team
    const managerToken = await getAccessToken(request, getDevUser('manager1'));

    // A case explicitly routed to the Infrastructure Team's queue.
    const created = await request.post('/api/v1/cases', {
      headers: apiHeaders(managerToken),
      data: {
        title: `E2E team-visibility ${Date.now()}`, type: 'fault', priority: 'low', description: 'seed',
        assigned_team_id: 'b0000000-0000-0000-0000-000000000004', // Infrastructure Team
      },
    });
    expect(created.ok()).toBeTruthy();
    const teamCase = await created.json();

    // engineer1 (Infrastructure Team) can see it...
    const asEngineer = await request.get(`/api/v1/cases/${teamCase.id}`, { headers: apiHeaders(engineerToken) });
    expect(asEngineer.ok()).toBeTruthy();

    // ...security1 (Finance Team) cannot.
    const asSecurity = await request.get(`/api/v1/cases/${teamCase.id}`, { headers: apiHeaders(securityToken) });
    expect(asSecurity.status()).toBe(403);
  });

  test('manager keeps full tenant-wide visibility, unchanged', async ({ request }) => {
    const requesterToken = await getAccessToken(request, getDevUser('requester1'));
    const managerToken = await getAccessToken(request, getDevUser('manager1'));

    const created = await request.post('/api/v1/cases', {
      headers: apiHeaders(requesterToken),
      data: { title: `E2E manager-full-visibility ${Date.now()}`, type: 'request', priority: 'low', description: 'seed' },
    });
    expect(created.ok()).toBeTruthy();
    const requesterCase = await created.json();

    const asManager = await request.get(`/api/v1/cases/${requesterCase.id}`, { headers: apiHeaders(managerToken) });
    expect(asManager.ok()).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it against the rebuilt stack**

```bash
cd e2e && npx playwright test --project=main-portal case-role-visibility.spec.ts
```
Expected: all 4 tests pass. If `getDevUser('security1')` fails because the realm-export fixture wasn't reloaded, restart the stack with a fresh Keycloak import (`docker compose down -v && up`, or the project's documented fixture-reload procedure) — this test depends on Task 13's fixtures actually being loaded.

- [ ] **Step 3: Run the full suite**

```bash
cd e2e && npx playwright test
```
Expected: previous 45 passed + these 4 new = 49 passed / 1 skipped, no regressions.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/01-main-portal/case-role-visibility.spec.ts
git commit -m "test: add e2e coverage for role-based case visibility scoping"
```

---

## Self-Review Notes

- **Spec coverage**: all 4 approved tracks covered — Track 1 (Tasks 5-8), Track 2 (Tasks 11-14), Track 3 (Tasks 9-10), Track 4 (Tasks 1-4). The 4 design decisions (wire not label, tiered visibility, 403 not 404, process_designer=own-only) are all reflected in the actual code (Task 12's `buildRoleScope`/`isInRoleScope`).
- **Sequencing preserved**: Track 4 has no dependency on anything and can run first or in parallel; Task 5 (role seed reconciliation) is placed before Task 13 (e2e fixtures) since the fixture's `user_roles` FK needs Task 5's `security` role row; Task 9-10 (Track 3) have no dependency on Track 2 despite touching adjacent files.
- **Type/interface consistency checked**: `findAll`'s new `roles` parameter is threaded consistently from `case.controller.ts` (Task 12 Step 4) through to `buildRoleScope` (Task 12 Step 1); `findOne`'s new `roles` parameter likewise. `caseApi.claim` (Task 9) matches the exact axios-call style of every other function in `client.ts`. `RolesCacheService` (Task 6) is referenced with the identical import path in both `permissions.guard.ts` and `me.controller.ts` (Task 7).
- **No placeholders**: every step either contains complete, ready-to-apply code or explicit "read the file first, the existing pattern is X" instructions grounded in verified real file content (Task 8's org-service role controller step, Task 4's re-verification step, and Task 5 Step 2's org_unit_id lookup are the only steps that ask the implementer to look something up rather than handing them the exact value — each names exactly what to look up and why).
