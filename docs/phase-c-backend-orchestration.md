# Phase C — Backend Orchestration Design

**Status:** C1 & C2 implemented and verified end-to-end (2026-06) — C2 includes the approval⇄case bridge AND process delegation (BPMN approval node → orchestrator parks → decision resumes process + case), verified through `purchase_request`. C4 (shared SLA: profile-based tiered SLA on cases + alarm-SLA-discard fix) implemented & verified. C3 (shared routing/assignment: least-loaded-in-group engine, reused by case creation + orchestrator task creation via one endpoint) implemented & verified. C5 (durable alarm⇄case outbox + retry/dead-letter + reconciliation) implemented & verified. **All of Phase C (C1–C5) is implemented and verified.**
**Author:** Platform refactor initiative
**Scope:** Make the three work engines (case-service, bpm-orchestrator, approval-service) behave as one orchestrated platform. Collapse the five structural redundancies identified in the functional audit.

---

## 1. Problem statement

Today the platform runs three independent state machines for what is, to a user, a single piece of work:

| Engine | Owns | Models work as |
|---|---|---|
| `case-service` | `cases` | a record with status + SLA + owner |
| `bpm-orchestrator` | `process_instances`, `tasks` | a workflow with steps |
| `approval-service` | `approval_instances` | a decision chain |

A single incident can exist simultaneously as a case (`status=open`), a process (`status=active`), and tasks — **and none of them updates the others**. Completing a task does not advance the case; approving an approval does not transition the case. Humans are the integration layer.

### The five structural redundancies (from the audit)
1. **Work modeled 3 ways** (case, process, tasks) with no enforced sync.
2. **Approvals modeled 2 ways** (`approval_instances` vs BPMN user-tasks), no orchestration between them.
3. **Assignment implemented 4 ways** (`case.assignee_id`, `task.assignee_id`, `task.candidate_groups`, `work_order_assignments`) with no shared routing.
4. **SLA computed 3 ways** (case hardcoded matrix, task `due_at`, alarm 3-tier calculator) — and the alarm's computed SLA is discarded when the case is created.
5. **Alarm→Case coupling is one-way** with no retry/feedback loop.

---

## 2. Target architecture: Case as the spine

**Principle:** the **Case is the system of record** (the *what*: identity, SLA, ownership, audit). A **Process instance** is the *orchestration* of that case (the *how*). **Tasks**, **Approvals**, and **Work Orders** are *steps the process emits*, not parallel tracks. State stays in lock-step through **events**, not manual coupling.

```
                 INTAKE (catalog / case create / alarm)
                              │
                              ▼
        ┌──────────────────  CASE  ──────────────────┐   system of record
        │  status · priority · SLA · owner · audit    │
        │                                             │
        │   orchestrated by →  PROCESS INSTANCE       │   the "how"
        │                          │                  │
        │                emits ┌───┴────┐             │
        │                      ▼        ▼             │
        │                   TASKS   APPROVALS         │   steps, carry case_id
        │                      │        │             │
        │                      ▼        ▼             │
        │                 WORK ORDERS (dispatch)      │
        └─────────────────────────────────────────────┘
                ▲                         ▲
        SLA service (shared)     Assignment/Routing service (shared)
                ▲
        Alarms ⇄ Case (bidirectional, event-driven, retried)
```

The Kafka topics already exist (`bpm.task.completed`, `bpm.approvals`, etc.) — they are simply **not subscribed cross-service**. Phase C is largely *wiring the existing events*, plus two shared services.

---

## 3. Workstreams

### C1 — Case ⇄ Process state synchronization (the keystone)

**Goal:** one lifecycle. Starting work creates a case + (optionally) a process atomically; task completion advances the process; process stage transitions update the case.

**Data (already present, to be enforced):**
- `cases.process_instance_id` (FK) — link case → its orchestrating instance.
- `process_instances.case_id` (FK) — link instance → its case.
- `tasks.case_id` — **currently NOT propagated**; must be set at task creation.

**Changes:**
1. **Atomic intake.** When a catalog request maps to a process, `bpm-orchestrator.startProcess()` creates the case (call `case-service`) **and** the instance in one logical operation, cross-linking both ids. When a case is created with a `processSlug`, `case-service` asks `bpm-orchestrator` to start the instance. One of the two is the entry; the other is created as a side-effect, transactionally where possible, compensating on failure.
2. **Propagate `case_id` to tasks.** In `process-instance.service.ts#createTask()`, copy `case_id` from the instance onto every task it emits. (One-line fix + backfill migration.)
3. **Task completion → case status.** `bpm-orchestrator` already publishes `bpm.task.completed` and advances the instance. Add: on **instance stage transition**, map the BPMN node/stage → a case status and PATCH the case. Mapping lives on the process definition (`camunda:caseStatus` attribute per stage, set in Process Studio) with a sane default (first user-task → `in_progress`, end-event → `resolved`).
4. **Process terminal → case terminal.** Instance `completed` → case `resolved`; instance `terminated` → case `cancelled` (unless already closed).

**Event contract (new subscription, not new topic):**
```
topic: bpm.instance.stage_changed         (publisher: bpm-orchestrator)
{
  instanceId, caseId, fromNode, toNode,
  mappedCaseStatus,            // resolved from definition, may be null
  at
}
→ subscriber: case-service → transitions the case if mappedCaseStatus != null
```

**Idempotency:** every sync event carries `(entity, version)`; subscribers no-op if their stored version ≥ event version. Prevents loops (case→process→case).

---

### C2 — Unified approvals

**Goal:** one approval system. A process that needs a decision **delegates to `approval-service`** rather than re-implementing approval as a bare user-task; the approval result transitions both the process and the case.

**Changes:**
1. **Approval service-task.** Add a BPMN service-task type `approval` (configured in Process Studio: policy, entity binding). When the instance reaches it, `bpm-orchestrator` calls `approval-service.createInstance({ policyId, entityType:'case', entityId: caseId, instanceId, taskId })`.
2. **Result event closes the loop.** `approval-service` already publishes `bpm.approvals { eventType: approved|rejected }`. Add subscribers:
   - `bpm-orchestrator`: on result, complete the waiting service-task with outcome `approved`/`rejected` → process advances down the matching sequence flow.
   - `case-service`: on result, transition `pending_approval` → `approved`/`rejected`.
3. **Populate `cases.approval_instance_id`** when the approval is created (currently optional + unset).

**Deprecate:** modeling approvals as plain human user-tasks. Existing demo processes migrate to the `approval` service-task. Standalone approvals (not driven by a process) remain supported via the same `approval-service` API.

---

### C3 — Shared Assignment / Routing service

**Goal:** one answer to "who should handle this?", reused by cases, tasks, and work orders.

**Design:** a routing module (new `routing-service`, or a library shared by the engines) exposing:
```
resolveAssignee({
  entityType,            // case | task
  type, priority, category,
  candidateGroups,       // from BPMN or case
  region, assignmentGroup, slaClass,   // from MDM enrichment
}) → { assigneeId?, assignedTeamId?, queue? }
```
- Rules: round-robin / least-loaded within a candidate group; honor MDM `assignment_group`/`oncall_group`; fall back to a team queue (unassigned + `candidate_groups`) when no individual resolves.
- `case-service.create()`, `bpm-orchestrator.createTask()`, and contractor dispatch all call it instead of their bespoke logic.
- Keeps `candidate_groups` semantics (claimable pool) as the fallback, not a separate mechanism.

**Migration:** the four current assignment paths become thin callers; their inline logic is deleted.

---

### C4 — Shared SLA service

**Goal:** one SLA engine; every entity references it; alarm SLA is no longer discarded.

**Design:** promote the existing alarm SLA calculator (`integration-hub/.../sla-calculator.service.ts`) into a shared **SLA service** with named **SLA profiles** (24×7, business-hours, blackout windows, response/onsite/restore tiers).
- `case-service` stops using its hardcoded `SLA_HOURS` matrix; it calls `slaService.compute({ type, priority, slaClass, profile })`.
- Tasks get their `due_at` from the same service (profile from the process definition).
- **Alarm→case fix:** the alarm's already-computed `response_due_at`/`onsite_due_at`/`restore_due_at` are passed through and **persisted as structured case SLA columns** (not buried in `context` JSONB).

**Schema:** add `cases.sla_profile`, `cases.response_due_at`, `cases.restore_due_at` (the alarm tiers); keep `sla_due_at` as the primary breach clock.

---

### C5 — Bidirectional alarm ⇄ case sync with retry

**Goal:** resolving an alarm reliably closes its case, and vice-versa, with no lost updates.

**Changes:**
1. **Outbox + retry.** `integration-hub`'s `bpm-ticket.service.ts` currently best-effort PATCHes the case and only logs on failure. Replace with a transactional **outbox**: state changes enqueue a row; a worker delivers with retry + dead-letter. (The `alarm_enrichment_jobs` queue pattern already exists — reuse it.)
2. **Case→alarm feedback.** When a case linked to an alarm is resolved/closed by a human, emit `bpm.case.resolved`; `integration-hub` acks the alarm mapping (and optionally notifies the monitoring source).
3. **Reconciliation job.** Periodic sweep over `alarm_ticket_map` to repair any drift (alarm RESOLVED but case still open, or vice-versa) — defense in depth against missed events.

---

## 4. Cross-cutting: the event-sync invariant

All four sync paths (C1, C2, C5) follow one rule to stay safe:

- **Versioned, idempotent events.** Every entity carries a monotonically increasing `version`. Sync events include the source version; a subscriber applies the change only if it advances its own state, then bumps its version. This makes the case↔process↔approval graph converge instead of oscillating.
- **No synchronous cross-service writes in request path.** Intake (C1 atomic create) is the only place we accept a saga with compensation; everything else is async event-driven, so a downstream outage degrades gracefully (work queues, syncs on recovery) rather than failing the user action.

---

## 5. Migrations (additive, reversible)

```
014_case_process_sync.sql      tasks.case_id backfill; cases.sla_profile,
                               response_due_at, restore_due_at; NOT NULL deferred
015_event_versions.sql         add version columns to cases, process_instances,
                               approval_instances; outbox table for integration-hub
016_routing.sql                routing_rules / queue tables (if standalone service)
```
All additive — no destructive changes; old rows default to version 0 and a null SLA profile (falls back to current behavior until backfilled).

---

## 6. Phasing & risk

| Step | Delivers | Risk | Prereq |
|---|---|---|---|
| C1 | task→case advance (the core "efficiency" fix) | Med — touches both engines | event versioning |
| C2 | one approval system | Med | C1 |
| C4 | one SLA engine; alarm SLA preserved | Low–Med | — |
| C3 | one routing engine | Med | — |
| C5 | reliable alarm⇄case | Low | C4 (SLA columns) |

**Recommended order:** event-versioning groundwork → **C1** (highest user-visible payoff: completing a task finally moves the case) → C4 → C2 → C5 → C3.

**Non-goals (explicitly out of scope):** merging the three services into one (UX unification already covers the user-facing need); a single `work_items` table (the case-as-spine + FKs gives us one lifecycle without a destructive schema merge).

---

## 7. Acceptance criteria

- Completing the last task of a process moves its case to `resolved` automatically (C1).
- Approving a `pending_approval` case advances the process **and** flips the case to `approved` (C2).
- A case created from an alarm shows the alarm's response/restore SLA, not a generic 24h default (C4/C5).
- Resolving an alarm closes its case within one retry cycle even if `case-service` was briefly unavailable (C5).
- Cases, tasks, and dispatch all assign through one routing call; deleting any one engine's inline assignment logic changes nothing functionally (C3).
