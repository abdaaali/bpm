# BPMN Compatibility Contract — Process Studio ↔ Runtime

> This is the single source of truth for what a process designer can build in Process Studio and expect the runtime to actually execute. It exists because the authoring canvas (`bpmn-js`) can technically render far more BPMN 2.0 vocabulary than the execution engine (`services/bpm-orchestrator/src/engine/`) implements. The gap between "the palette lets you draw it" and "the engine runs it" is exactly what `services/bpm-orchestrator/src/engine/validation.ts` blocks at publish time — see [`06-production-readiness-risks.md`](production-readiness/06-production-readiness-risks.md) for how this was discovered, and the engine source itself for the authoritative rule list.

Last verified: 2026-07-13, by calling `POST /definitions/:id/validate` against all 11 real active process definitions directly (not just read — actually invoked) and the full Playwright regression suite. Result: **0 blocking findings and 0 warnings across all 11 processes.**

This corrects an earlier version of this line (dated 2026-07-12) that claimed the same verification but was not actually borne out when the validator was later re-run: at that time, 3 of the 11 processes (`purchase_request`, `fault_management`, `asset_movement`) each declared an approval-step form field named `decision` or `approved` — both reserved by the engine — which would have blocked Publish, and a separate tokenizer bug in the condition-variable extractor was flagging the string literal on the right of nearly every `X == "yes"`/`X == "no"` gateway condition as an "unknown variable" (a false positive, not a real issue). Both are now fixed:
- The three reserved-key collisions were resolved by renaming the affected form field(s) — see `infra/db/seeds/001_core_data.sql`, and for `purchase_request` specifically, note only the form field was renamed, not the gateway's `${decision == ...}` conditions, since that process's approval step (`formKey="approval"`) has its `decision`/`approved` variables injected by the engine itself after approval-service resolves the decision, independent of the form field's own name.
- The tokenizer bug (`services/bpm-orchestrator/src/engine/validation.ts`) was fixed by stripping quoted string literals from a condition's body before extracting identifier-shaped tokens.

## Supported element types

The runtime's `advance()` state machine (`services/bpm-orchestrator/src/process-instance/process-instance.service.ts`) only implements real BPMN semantics for:

| Element | Behavior |
|---|---|
| `startEvent` | Advances to its outgoing flow(s) on process start. Carries `startMode` (see below) and optional `formFields`. |
| `endEvent` | Completes the process instance (or ends just one branch, if reached inside an open parallel/inclusive fork — see Known limitations). |
| `userTask` | Creates a claimable task (assignee/candidate-group/unassigned-queue), **or** — if `formKey="approval"` — delegates to `approval-service` and parks the instance until a real decision comes back. |
| `serviceTask` | Fires a `bpm.service.task` Kafka event with its `serviceType`/`config`, then **immediately advances** — see the fire-and-forget caveat below. |
| `exclusiveGateway` | Takes the first outgoing flow whose condition evaluates true, or the explicit `default` flow if none match. |
| `parallelGateway` | Forks every outgoing flow; a join (≥2 incoming flows) waits for every forked branch to arrive (`gateway_forks`/`gateway_arrivals` tables) before proceeding. |
| `inclusiveGateway` | Forks every outgoing flow whose condition matches (falling back to unconditional flows, then the first flow); joins the same way as `parallelGateway`. |

**Any other element type is rejected by validation (`UNSUPPORTED_ELEMENT`) and cannot be published.** This was a real gap before this audit: `bpmn-js`'s default palette lets you add all of the types below, and the old parser happily parsed them without complaint — they just silently did nothing at runtime.

## Parsed but NOT executed (confirmed by tracing `advance()`)

These types are recognized by `bpmn-parser.ts` (so the editor/importer doesn't crash on them) but have **no case** in the engine's `advance()` switch — they fall through to a generic "take the first outgoing flow" no-op, or (for `subProcess`/`callActivity`) their nested content is never executed as a real scope at all:

- `scriptTask` — its script is parsed (`scriptContent`/`scriptFormat`) but never run.
- `manualTask`, `receiveTask`, `sendTask` — pass through with no real semantics.
- `eventBasedGateway` — behaves like an unconditional pass-through, not "wait for the first of several events."
- `intermediateThrowEvent`, `intermediateCatchEvent` — pass through immediately; a catch event does not actually wait for anything.
- `boundaryEvent` — parsed as a standalone element; the runtime has no concept of an event attached to another activity's boundary.
- `subProcess`, `callActivity` — treated as an opaque single node; nested child elements are flattened into the parent's element list for parsing purposes only (so an author doesn't lose their diagram on import), but the engine never executes them as a scoped sub-process.

Both `validateProcess()` and the Process Studio Checks panel block publishing on any of these — see `UNSUPPORTED_ELEMENT` in [Validation rule reference](#validation-rule-reference) below.

## Supported gateway determinism rules

- An `exclusiveGateway` with 2+ outgoing flows must have **at most one unconditioned branch** (`GATEWAY_MULTIPLE_UNCONDITIONED` otherwise), and **must have a fallback** — either that one unconditioned branch, or an explicit `default="flowId"` attribute (`GATEWAY_NO_DEFAULT_OR_ELSE` otherwise). Before this fix, an exhausted gateway with no match silently stalled the instance forever with no error.
- **Exception, discovered by running this rule against real data**: if every conditioned branch is a plain equality test (`${var == "value"}`) against the *same* variable, and that variable has a known, bounded domain — either the engine-injected `decision` variable (always exactly `approve`/`reject`) or a `select`-type form field with a fixed option list — and the tested values cover every value in that domain, the gateway is provably exhaustive and does **not** need an explicit default. This is the standard approve/reject pattern used by all 11 of the platform's seeded processes; without this exception, none of them could ever be re-published.
- Condition syntax is restricted to what `engine/safe-expr.ts` can evaluate: `==`, `!=`, `>=`, `<=`, `>`, `<`, `&&`, `||`, `!`, parentheses, string/number/boolean/null literals, and dotted variable paths (plus the `and`/`or`/`not` keyword aliases). Anything else — function calls, arithmetic, etc. — is rejected (`GATEWAY_UNSUPPORTED_EXPRESSION`), because it would otherwise silently evaluate to `false` at runtime rather than error visibly.
- A condition referencing a variable not captured by any form field earlier in the process is a **warning**, not a block (`GATEWAY_UNKNOWN_VARIABLE`) — it may be a known system variable (see below) or a legitimate typo the process owner should double-check, but it isn't necessarily wrong.
- `parallelGateway`/`inclusiveGateway` have real fork/join implementations (see table above) and no extra structural requirement beyond standard graph integrity.

## Known system variables

Available in gateway conditions without being defined by any form field:

- `decision`, `approved` — injected by the engine immediately after an approval-gate decision. **Reserved**: a form field cannot use either key (`FORM_FIELD_RESERVED_KEY`).
- `risk_level`, `change_type`, `priority`, `impact`, `urgency`, `caseNumber` — merged into the approval context from the linked case, when one exists (`delegateApproval()` in `process-instance.service.ts`).

## Human task assignment

A `userTask` (that isn't an approval gate) must have at least one of:
- `camunda:assignee` — a specific user
- `camunda:candidateGroups` / Flowable `candidateUsers` — a claimable pool
- `camunda:allowUnassigned="true"` — an explicit, author-set opt-in to the unassigned work queue

This is never inferred from empty fields — an unassigned task with none of the three is blocked (`HUMAN_TASK_UNASSIGNED`). The "Allow this task to enter the unassigned work queue" checkbox in Process Studio's Properties Panel only appears (and is only needed) once assignee and candidate groups are both empty.

## Approval gates

A `userTask` with `camunda:formKey="approval"` requires an **active** approval policy linked to the process's `slug` (looked up from `approval-service` at validation/publish time), with **at least one step**, and every step structurally valid for its type (`role` steps need a `roleKey`, `specific_user` steps need a `userId`). See `APPROVAL_POLICY_MISSING` / `APPROVAL_POLICY_EMPTY` / `APPROVAL_POLICY_INACTIVE` / `APPROVAL_STEP_INVALID`.

**Not validated in this pass** (documented limitation, not silently skipped): deep referential integrity of `role`/`specific_user` steps against org-service's *currently active* roles/users. A step can reference a role key or user id that's structurally well-formed but no longer exists. Extending this would require bpm-orchestrator to call org-service at validation time, mirroring the pattern `approval-resolver.service.ts` already uses at actual approval-resolution time.

## Start modes

Every process now has an explicit start mode, carried on the Start Event as `camunda:startMode`:

| Mode | Requires a start form? |
|---|---|
| `service_catalog` (default when unset — backward compatible with every process published before this change) | Yes — at least one meaningful field (`START_FORM_REQUIRED` otherwise) |
| `api` | No |
| `system` | No |

## Form fields

- Types: `text`, `textarea`, `number`, `date`, `select`, `checkbox` (`FORM_FIELD_UNSUPPORTED_TYPE` for anything else).
- Keys must match `^[a-zA-Z_][a-zA-Z0-9_]*$` (`FORM_FIELD_INVALID_KEY_FORMAT`) and have a non-empty label (`FORM_FIELD_MISSING_LABEL`).
- A key must be unique **across the whole process**, not just within one task — reusing a key on two different steps means whichever runs last silently overwrites the earlier value (`FORM_FIELD_DUPLICATE_KEY`).
- `select` fields need at least one option (`DROPDOWN_EMPTY`), with unique values (`DROPDOWN_DUPLICATE_VALUE`) and no blank label/value rows (`DROPDOWN_BLANK_OPTION`).

## Service tasks

- `serviceType` must be one of `notification`, `connector`, `script` (`SERVICE_TASK_UNSUPPORTED_TYPE`).
- `camunda:serviceConfig` — **fixed in this pass**: it was written by the Properties Panel but never actually read by the parser (`el.config` was declared in the `BpmnElement` interface but never populated). It's now parsed as JSON (`SERVICE_TASK_INVALID_CONFIG_JSON` if it isn't valid JSON) and scanned for keys that look like embedded credentials (`password`, `secret`, `token`, `api[_-]?key`, `credential`) with a non-empty string value (`SERVICE_TASK_SECRET_IN_CONFIG`).
- **Execution is fire-and-forget** — the engine emits the Kafka event and advances immediately, regardless of whether whatever consumes `bpm.service.task` (currently `integration-hub`) actually succeeds. There is no retry, no failure branch, and no way for a service task to block the process on its own outcome. This is a real architectural limitation, not something validation can catch — flagged here rather than silently left undocumented.

## Namespace handling

The parser (rewritten in this pass on `fast-xml-parser`, see [`06-production-readiness-risks.md`](production-readiness/06-production-readiness-risks.md)) resolves vendor attributes **by namespace URI**, not by literal prefix — it reads the document's own `xmlns:*` declarations to find whichever prefix is actually bound to `http://activiti.org/bpmn` (Camunda 7 / Activiti), `http://camunda.org/schema/1.0/bpmn` (Camunda), or `http://flowable.org/bpmn` (Flowable), and accepts an arbitrary/unexpected prefix bound to any of those URIs too. Studio-authored, Flowable-imported, and Activiti-imported BPMN all resolve to the same internal attribute set.

## Validation rule reference

Every finding has a stable `code`, a `severity` (`error`/`warning`), a `blocking` flag, the offending `elementId`/`elementName` where applicable, a human `message`, and a `remediation`. The full, current rule list lives in `services/bpm-orchestrator/src/engine/validation.ts` — this doc summarizes intent, that file is the literal source of truth (frontend and backend both call it; there is exactly one implementation, never two to keep in sync).

| Code | Blocking? |
|---|---|
| `NO_START_EVENT`, `DUPLICATE_ELEMENT_ID`, `FLOW_MISSING_SOURCE`, `FLOW_MISSING_TARGET`, `NO_INCOMING_FLOW`, `NO_OUTGOING_FLOW`, `UNREACHABLE_ELEMENT`, `NO_REACHABLE_END_EVENT` | Yes |
| `UNSUPPORTED_ELEMENT` | Yes |
| `GATEWAY_MULTIPLE_UNCONDITIONED`, `GATEWAY_NO_DEFAULT_OR_ELSE`, `GATEWAY_UNSUPPORTED_EXPRESSION` | Yes |
| `GATEWAY_UNKNOWN_VARIABLE`, `GATEWAY_DUPLICATE_CONDITION` | No (warning) |
| `HUMAN_TASK_UNASSIGNED` | Yes |
| `APPROVAL_POLICY_MISSING`, `APPROVAL_POLICY_EMPTY`, `APPROVAL_POLICY_INACTIVE`, `APPROVAL_STEP_INVALID` | Yes |
| `START_FORM_REQUIRED`, `START_MODE_INVALID` | Yes |
| `DROPDOWN_EMPTY`, `DROPDOWN_DUPLICATE_VALUE`, `DROPDOWN_BLANK_OPTION` | Yes |
| `FORM_FIELD_MISSING_LABEL`, `FORM_FIELD_INVALID_KEY_FORMAT`, `FORM_FIELD_UNSUPPORTED_TYPE`, `FORM_FIELD_DUPLICATE_KEY`, `FORM_FIELD_RESERVED_KEY` | Yes |
| `SERVICE_TASK_UNSUPPORTED_TYPE`, `SERVICE_TASK_INVALID_CONFIG_JSON`, `SERVICE_TASK_SECRET_IN_CONFIG` | Yes |

## How validation is enforced

1. **Process Studio's Checks button** (and an automatic baseline check on load, and again after every Save) calls `POST /definitions/:id/validate` with the *current canvas XML* — validating unsaved work, not just what's persisted.
2. **Publish** (`POST /definitions/:id/publish`) re-validates the *persisted* XML server-side and rejects with HTTP 400 (plus the full findings array) if any blocking finding remains. This cannot be bypassed by calling the API directly — publish always re-validates regardless of what any client already checked.
3. There is exactly one rule engine (`engine/validation.ts`). The frontend has a matching TypeScript *type* for rendering findings, but zero duplicated *logic* — it only renders whatever the backend returns.

## Known limitations not addressed in this pass

- Service task execution is fire-and-forget (see above) — validation checks config *shape*, not runtime success/failure handling.
- Approval policy steps aren't checked against currently-active org-service roles/users (structural validity only).
- `GATEWAY_DUPLICATE_CONDITION` detection is exact-string-match only (after whitespace/case normalization) — it won't catch semantically-equivalent-but-differently-written duplicate conditions.
- `bpm-orchestrator`'s retention/archival job behavior for old process instances was flagged as a separate, undiagnosed gap in an earlier audit (`06-production-readiness-risks.md`, R-18) — unrelated to this pass, not revisited here.
