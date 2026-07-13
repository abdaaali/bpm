/**
 * Central process-definition validation engine.
 *
 * This is the SINGLE source of truth for "can this BPMN diagram actually run
 * on this engine." It is used by:
 *   - `POST /definitions/:id/validate` (called by Process Studio's Checks button,
 *     against whatever XML is currently on the canvas — saved or not)
 *   - `ProcessDefinitionService.publish()` (re-validates the persisted XML;
 *     publish is REJECTED if any blocking finding remains, so validation can
 *     never be bypassed by calling the API directly with unchecked XML)
 *
 * There is exactly one rule list. The frontend never re-implements or
 * duplicates these checks — it only renders whatever this function returns.
 * See docs/bpmn-compatibility-contract.md for the supported-element rationale.
 */
import { BpmnProcess, BpmnElement, BpmnFlow, FormField, getOutgoingFlows, getIncomingFlows } from './bpmn-parser';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationFinding {
  /** Stable machine code — safe to key UI copy, docs, or tests off of. Never renumbered. */
  code: string;
  severity: ValidationSeverity;
  elementId?: string;
  elementName?: string;
  message: string;
  remediation: string;
  /** true = this finding alone blocks publish. Every 'error' is blocking; 'warning' never is. */
  blocking: boolean;
}

// ── The runtime-supported subset (see process-instance.service.ts `advance()`) ─
// An element type not in this list either falls through to a silent
// first-outgoing-flow no-op or is never reached by the engine at all —
// confirmed by tracing every `fromEl.type === '...'` branch in advance().
export const RUNTIME_SUPPORTED_ELEMENT_TYPES = new Set([
  'startEvent', 'endEvent', 'userTask', 'serviceTask',
  'exclusiveGateway', 'parallelGateway', 'inclusiveGateway',
]);
// Parsed by bpmn-parser.ts (so authoring/import doesn't crash) but NOT executed
// with their real BPMN semantics by process-instance.service.ts — each either
// silently no-ops to its first outgoing flow, or (subProcess/callActivity)
// never runs its nested content at all.
export const PARSED_BUT_UNSUPPORTED_ELEMENT_TYPES = new Set([
  'scriptTask', 'manualTask', 'receiveTask', 'sendTask',
  'eventBasedGateway', 'intermediateThrowEvent', 'intermediateCatchEvent',
  'boundaryEvent', 'subProcess', 'callActivity',
]);

export const SUPPORTED_SERVICE_TYPES = new Set(['notification', 'connector', 'script']);
export const SUPPORTED_FORM_FIELD_TYPES = new Set(['text', 'textarea', 'number', 'date', 'select', 'checkbox']);
export const RESERVED_VARIABLE_KEYS = new Set(['decision', 'approved']);
export const SUPPORTED_START_MODES = new Set(['service_catalog', 'api', 'system']);
const VARIABLE_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
// Allowlist for gateway condition syntax — anything outside this character set
// cannot be parsed by safe-expr.ts's tokenizer (see engine/safe-expr.ts) and
// would silently evaluate to `false` at runtime rather than throw where a
// process designer could see it.
const CONDITION_SYNTAX_RE = /^[\s()!&|=<>a-zA-Z0-9_."'${}]*$/;
const CONDITION_VAR_RE = /\$\{([^}]*)\}|#\{([^}]*)\}/;
// Case-level context variables `delegateApproval` merges into every approval
// context (process-instance.service.ts `delegateApproval`) — legitimate to
// reference in a condition even though no form field defines them.
const KNOWN_SYSTEM_VARIABLES = new Set(['risk_level', 'change_type', 'priority', 'impact', 'urgency', 'caseNumber']);
const SECRET_KEY_RE = /(password|secret|token|api[_-]?key|credential)/i;

export interface ApprovalPolicyContext {
  id: string;
  name: string;
  active: boolean;
  steps: Array<{ id?: string; type: string; roleKey?: string; userId?: string; slaHours?: number; hierarchyLevel?: number }>;
}

export interface ValidationContext {
  /** The active approval policy linked to this process's slug, or null if none exists. */
  approvalPolicy: ApprovalPolicyContext | null;
}

function f(code: string, severity: ValidationSeverity, blocking: boolean, message: string, remediation: string, el?: BpmnElement): ValidationFinding {
  return { code, severity, blocking, message, remediation, elementId: el?.id, elementName: el?.name || el?.id };
}

export function validateProcess(process: BpmnProcess, ctx: ValidationContext): ValidationFinding[] {
  const out: ValidationFinding[] = [];
  const byId = new Map(process.elements.map(e => [e.id, e]));

  // ── Graph integrity ─────────────────────────────────────────────────────
  if (!process.startEventId) {
    out.push(f('NO_START_EVENT', 'error', true,
      'This process has no Start Event.',
      'Add exactly one Start Event to the diagram.'));
  }

  const seenIds = new Set<string>();
  for (const el of process.elements) {
    if (seenIds.has(el.id)) {
      out.push(f('DUPLICATE_ELEMENT_ID', 'error', true,
        `Element ID "${el.id}" is used more than once.`,
        'Every element must have a unique ID — rename one of the duplicates.', el));
    }
    seenIds.add(el.id);
  }

  for (const flow of process.flows) {
    if (!byId.has(flow.source)) {
      out.push(f('FLOW_MISSING_SOURCE', 'error', true,
        `Sequence flow "${flow.id}" points from an element ("${flow.source}") that does not exist.`,
        'Delete this dangling flow or reconnect it to a real element.'));
    }
    if (!byId.has(flow.target)) {
      out.push(f('FLOW_MISSING_TARGET', 'error', true,
        `Sequence flow "${flow.id}" points to an element ("${flow.target}") that does not exist.`,
        'Delete this dangling flow or reconnect it to a real element.'));
    }
  }

  for (const el of process.elements) {
    const isStart = el.type === 'startEvent';
    const isEnd = el.type === 'endEvent';
    const inCount = getIncomingFlows(process, el.id).length;
    const outCount = getOutgoingFlows(process, el.id).length;
    if (!isStart && inCount === 0) {
      out.push(f('NO_INCOMING_FLOW', 'error', true,
        `"${el.name || el.id}" has no incoming flow.`,
        'Connect an arrow into this element, or delete it if unused.', el));
    }
    if (!isEnd && outCount === 0) {
      out.push(f('NO_OUTGOING_FLOW', 'error', true,
        `"${el.name || el.id}" has no outgoing flow.`,
        'Connect an arrow out of this element, or delete it if it should be an End Event.', el));
    }
  }

  // Reachability: BFS from the start event over sequence flows.
  const reachable = new Set<string>();
  if (process.startEventId) {
    const queue = [process.startEventId];
    while (queue.length) {
      const id = queue.shift()!;
      if (reachable.has(id)) continue;
      reachable.add(id);
      for (const flow of getOutgoingFlows(process, id)) queue.push(flow.target);
    }
    for (const el of process.elements) {
      if (!reachable.has(el.id)) {
        out.push(f('UNREACHABLE_ELEMENT', 'error', true,
          `"${el.name || el.id}" can never be reached from the Start Event.`,
          'Connect this element into the flow, or delete it.', el));
      }
    }
    const hasReachableEnd = process.elements.some(el => el.type === 'endEvent' && reachable.has(el.id));
    if (!hasReachableEnd) {
      out.push(f('NO_REACHABLE_END_EVENT', 'error', true,
        'No End Event is reachable from the Start Event — this process can never complete.',
        'Add an End Event and connect a path to it from every branch.'));
    }
  }

  // ── Unsupported runtime behavior ────────────────────────────────────────
  for (const el of process.elements) {
    if (PARSED_BUT_UNSUPPORTED_ELEMENT_TYPES.has(el.type)) {
      out.push(f('UNSUPPORTED_ELEMENT', 'error', true,
        `"${el.name || el.id}" is a ${el.type}, which this runtime does not execute — it would silently pass through without doing what it looks like it does.`,
        `Remove this element, or replace it with a supported type: ${[...RUNTIME_SUPPORTED_ELEMENT_TYPES].join(', ')}.`, el));
    } else if (!RUNTIME_SUPPORTED_ELEMENT_TYPES.has(el.type)) {
      out.push(f('UNSUPPORTED_ELEMENT', 'error', true,
        `"${el.name || el.id}" (${el.type}) is not a supported element type.`,
        `Supported types: ${[...RUNTIME_SUPPORTED_ELEMENT_TYPES].join(', ')}.`, el));
    }
  }

  // ── Gateway determinism ──────────────────────────────────────────────────
  for (const el of process.elements) {
    if (el.type !== 'exclusiveGateway') continue;
    const outFlows = getOutgoingFlows(process, el.id);
    if (outFlows.length < 2) continue;
    const conditioned = outFlows.filter(fl => !!fl.condition);
    const unconditioned = outFlows.filter(fl => !fl.condition);
    const hasDefault = !!el.defaultFlow && outFlows.some(fl => fl.id === el.defaultFlow);

    if (unconditioned.length > 1 && !hasDefault) {
      out.push(f('GATEWAY_MULTIPLE_UNCONDITIONED', 'error', true,
        `Gateway "${el.name || el.id}" has ${unconditioned.length} branches with no condition — routing would depend on undocumented XML element order.`,
        'Add a condition to all but one branch, or mark one branch as the explicit default flow.', el));
    } else if (unconditioned.length === 0 && !hasDefault && !isExhaustiveEnumSwitch(conditioned, process)) {
      out.push(f('GATEWAY_NO_DEFAULT_OR_ELSE', 'error', true,
        `Gateway "${el.name || el.id}" has no default flow and every branch is conditioned — if no condition matches at runtime, the process silently stalls forever with no error.`,
        'Set one outgoing flow as the default flow (so there is always a fallback), or leave one branch unconditioned.', el));
    }

    for (const flow of conditioned) {
      const cond = flow.condition!;
      if (!CONDITION_SYNTAX_RE.test(cond)) {
        out.push(f('GATEWAY_UNSUPPORTED_EXPRESSION', 'error', true,
          `Condition on a branch of "${el.name || el.id}" uses syntax the engine cannot evaluate: ${cond}`,
          'Use only ==, !=, >=, <=, >, <, &&, ||, !, parentheses, string/number/boolean literals, and dotted variable names.', el));
        continue;
      }
      const m = cond.match(CONDITION_VAR_RE);
      const body = m ? (m[1] ?? m[2] ?? '') : '';
      // Strip quoted string literals before tokenizing — otherwise the
      // right-hand side of `variable == "someLiteral"` gets scanned for
      // identifier-shaped tokens too, and "someLiteral" (not being a real
      // variable) is spuriously flagged as GATEWAY_UNKNOWN_VARIABLE.
      const bodyNoStringLiterals = body.replace(/'[^']*'|"[^"]*"/g, '');
      const varMatches = bodyNoStringLiterals.match(/[a-zA-Z_][a-zA-Z0-9_.]*/g) || [];
      const knownVars = new Set([...RESERVED_VARIABLE_KEYS, ...KNOWN_SYSTEM_VARIABLES, ...collectFormFieldKeys(process)]);
      for (const tok of varMatches) {
        if (['true', 'false', 'null', 'and', 'or', 'not'].includes(tok)) continue;
        const root = tok.split('.')[0];
        if (!knownVars.has(root)) {
          out.push(f('GATEWAY_UNKNOWN_VARIABLE', 'warning', false,
            `Condition on "${el.name || el.id}" references "${root}", which is not captured by any form field earlier in this process.`,
            'Double-check the variable name, or add a form field that captures it.', el));
        }
      }
    }

    // Duplicate/overlapping literal conditions (best-effort: exact string match only).
    const seen = new Map<string, string>();
    for (const flow of conditioned) {
      const key = normalizeCondition(flow.condition!);
      if (seen.has(key)) {
        out.push(f('GATEWAY_DUPLICATE_CONDITION', 'warning', false,
          `Gateway "${el.name || el.id}" has two branches with the same condition — only the first (by document order) will ever be taken.`,
          'Make the conditions mutually exclusive, or remove the duplicate branch.', el));
      }
      seen.set(key, flow.id);
    }
  }

  for (const el of process.elements) {
    if (el.type === 'inclusiveGateway' || el.type === 'parallelGateway') {
      // Both are implemented with real fork/join synchronization (see
      // gateway_forks/gateway_arrivals) — no additional structural
      // requirement beyond the generic graph-integrity checks above.
      continue;
    }
  }

  // ── Human task assignment ───────────────────────────────────────────────
  for (const el of process.elements) {
    if (el.type !== 'userTask' || el.formKey === 'approval') continue;
    const hasAssignee = !!el.assignee;
    const hasGroups = !!(el.candidateGroups?.length || el.candidateUsers?.length);
    const allowsUnassigned = el.allowUnassigned === true;
    if (!hasAssignee && !hasGroups && !allowsUnassigned) {
      out.push(f('HUMAN_TASK_UNASSIGNED', 'error', true,
        `"${el.name || el.id}" has no assignee and no candidate group — it would create an orphan task nobody can find.`,
        'Set an assignee or at least one candidate group, or explicitly enable "Allow this task to enter the unassigned work queue."', el));
    }
  }

  // ── Approval gates ───────────────────────────────────────────────────────
  const approvalGates = process.elements.filter(el => el.type === 'userTask' && el.formKey === 'approval');
  if (approvalGates.length) {
    if (!ctx.approvalPolicy) {
      for (const el of approvalGates) {
        out.push(f('APPROVAL_POLICY_MISSING', 'error', true,
          `Approval gate "${el.name || el.id}" has no approval policy linked to this process.`,
          'Create an approval policy for this process in the Properties Panel before publishing.', el));
      }
    } else {
      const policy = ctx.approvalPolicy;
      if (!policy.active) {
        for (const el of approvalGates) {
          out.push(f('APPROVAL_POLICY_INACTIVE', 'error', true,
            `The approval policy linked to "${el.name || el.id}" is not active.`,
            'Activate the approval policy, or link an active one.', el));
        }
      }
      if (!policy.steps?.length) {
        for (const el of approvalGates) {
          out.push(f('APPROVAL_POLICY_EMPTY', 'error', true,
            `The approval policy linked to "${el.name || el.id}" has no steps — nobody would ever be asked to decide.`,
            'Add at least one approval step to the policy.', el));
        }
      } else {
        policy.steps.forEach((step, i) => {
          if (step.type === 'role' && !step.roleKey) {
            out.push(f('APPROVAL_STEP_INVALID', 'error', true,
              `Approval policy step ${i + 1} ("${step.type}") has no role selected.`,
              'Pick a role for this step, or change its approver type.'));
          }
          if (step.type === 'specific_user' && !step.userId) {
            out.push(f('APPROVAL_STEP_INVALID', 'error', true,
              `Approval policy step ${i + 1} ("${step.type}") has no user selected.`,
              'Pick a user for this step, or change its approver type.'));
          }
          if (!['hierarchy', 'role', 'specific_user', 'org_unit_manager'].includes(step.type)) {
            out.push(f('APPROVAL_STEP_INVALID', 'error', true,
              `Approval policy step ${i + 1} has an unrecognized approver type "${step.type}".`,
              'Use one of: line manager, department head, specific role, or specific user.'));
          }
        });
      }
    }
  }

  // ── Start Event / start mode ─────────────────────────────────────────────
  const startEl = process.elements.find(e => e.type === 'startEvent');
  if (startEl) {
    const startMode = startEl.startMode || 'service_catalog'; // unset = backward-compatible default
    if (startMode === 'service_catalog') {
      if (!startEl.formFields?.length) {
        out.push(f('START_FORM_REQUIRED', 'error', true,
          'This process starts from the Service Catalog but captures no data — requesters would see an empty form.',
          'Add at least one meaningful start form field, or change the start mode to API-triggered / system-triggered if this process is never started by a person.', startEl));
      }
    } else if (!SUPPORTED_START_MODES.has(startMode)) {
      out.push(f('START_MODE_INVALID', 'error', true,
        `Start mode "${startMode}" is not recognized.`,
        `Use one of: ${[...SUPPORTED_START_MODES].join(', ')}.`, startEl));
    }
  }

  // ── Form fields (Start Event + every User Task) ─────────────────────────
  const keyOwners = new Map<string, BpmnElement[]>();
  for (const el of process.elements) {
    if (!el.formFields?.length) continue;
    for (const field of el.formFields) validateFormField(field, el, out);
    for (const field of el.formFields) {
      if (!keyOwners.has(field.key)) keyOwners.set(field.key, []);
      keyOwners.get(field.key)!.push(el);
    }
  }
  for (const [key, owners] of keyOwners) {
    if (RESERVED_VARIABLE_KEYS.has(key)) {
      for (const el of owners) {
        out.push(f('FORM_FIELD_RESERVED_KEY', 'error', true,
          `Field key "${key}" on "${el.name || el.id}" collides with an engine-reserved variable name.`,
          `Rename this field — "${key}" is always set automatically after an approval decision.`, el));
      }
    }
    if (owners.length > 1) {
      for (const el of owners) {
        out.push(f('FORM_FIELD_DUPLICATE_KEY', 'error', true,
          `Field key "${key}" is defined on more than one step ("${owners.map(o => o.name || o.id).join('", "')}") — whichever runs last will silently overwrite the earlier value.`,
          `Give each field a unique key, or intentionally reuse the same key only when steps should share that value.`, el));
      }
    }
  }

  // ── Service Tasks ────────────────────────────────────────────────────────
  for (const el of process.elements) {
    if (el.type !== 'serviceTask') continue;
    const serviceType = el.serviceType;
    if (serviceType && !SUPPORTED_SERVICE_TYPES.has(serviceType)) {
      out.push(f('SERVICE_TASK_UNSUPPORTED_TYPE', 'error', true,
        `"${el.name || el.id}" uses service type "${serviceType}", which is not supported.`,
        `Use one of: ${[...SUPPORTED_SERVICE_TYPES].join(', ')}.`, el));
    }
    if (el.configRaw && el.configRaw.trim()) {
      if (!el.config) {
        out.push(f('SERVICE_TASK_INVALID_CONFIG_JSON', 'error', true,
          `"${el.name || el.id}"'s config is not valid JSON.`,
          'Fix the JSON syntax in the Config field.', el));
      } else {
        for (const key of Object.keys(el.config)) {
          if (SECRET_KEY_RE.test(key) && typeof el.config[key] === 'string' && el.config[key].trim()) {
            out.push(f('SERVICE_TASK_SECRET_IN_CONFIG', 'error', true,
              `"${el.name || el.id}"'s config contains a field ("${key}") that looks like a credential, embedded directly in the process definition.`,
              'Store secrets in the connector/integration configuration outside the BPMN, and reference them by name instead.', el));
          }
        }
      }
    }
  }

  return out;
}

function validateFormField(field: FormField, el: BpmnElement, out: ValidationFinding[]) {
  if (!field.label || !field.label.trim()) {
    out.push(f('FORM_FIELD_MISSING_LABEL', 'error', true,
      `A field on "${el.name || el.id}" has no display label.`,
      'Give every field a label so the person filling out the form knows what it means.', el));
  }
  if (!field.key || !VARIABLE_KEY_RE.test(field.key)) {
    out.push(f('FORM_FIELD_INVALID_KEY_FORMAT', 'error', true,
      `Field "${field.label || field.key}" on "${el.name || el.id}" has an invalid variable key ("${field.key}").`,
      'Keys must start with a letter or underscore and contain only letters, numbers, and underscores.', el));
  }
  if (!SUPPORTED_FORM_FIELD_TYPES.has(field.type)) {
    out.push(f('FORM_FIELD_UNSUPPORTED_TYPE', 'error', true,
      `Field "${field.label || field.key}" on "${el.name || el.id}" has an unsupported type ("${field.type}").`,
      `Use one of: ${[...SUPPORTED_FORM_FIELD_TYPES].join(', ')}.`, el));
  }
  if (field.type === 'select') {
    const rows = (field.options || '').split(',').map(s => s.trim()).filter(Boolean);
    if (rows.length === 0) {
      out.push(f('DROPDOWN_EMPTY', 'error', true,
        `Dropdown "${field.label || field.key}" on "${el.name || el.id}" has no options.`,
        'Add at least one option, or change this field to a different type.', el));
    } else {
      const seenValues = new Set<string>();
      let hasBlank = false;
      for (const row of rows) {
        const [value, label] = row.includes(':') ? row.split(/:(.*)/s) : [row, row];
        if (!value.trim() || !(label ?? value).trim()) hasBlank = true;
        if (seenValues.has(value.trim())) {
          out.push(f('DROPDOWN_DUPLICATE_VALUE', 'error', true,
            `Dropdown "${field.label || field.key}" on "${el.name || el.id}" has more than one option with value "${value.trim()}".`,
            'Give every option a unique value.', el));
        }
        seenValues.add(value.trim());
      }
      if (hasBlank) {
        out.push(f('DROPDOWN_BLANK_OPTION', 'error', true,
          `Dropdown "${field.label || field.key}" on "${el.name || el.id}" has a blank option label or value.`,
          'Fill in every option, or remove the blank row.', el));
      }
    }
  }
}

/** Matches a single equality test against a string literal: ${var == "value"} or ${var === "value"}. */
const EQUALITY_TEST_RE = /^[$#]\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*={2,3}\s*"([^"]*)"\s*\}$/;

/**
 * A gateway with no default flow and every branch conditioned is normally
 * flagged as GATEWAY_NO_DEFAULT_OR_ELSE (no guaranteed fallback if nothing
 * matches). But if every branch is a plain equality test against the SAME
 * known enum-domain variable (a dropdown field, or the engine-injected
 * `decision` variable, whose domain is contractually {"approve","reject"}),
 * and together they cover every possible value of that domain, routing is
 * provably exhaustive — there is no value the variable could hold that isn't
 * handled by some branch. Requiring a redundant default flow in that case
 * would reject the standard approve/reject pattern used throughout the
 * platform's own seeded process library (confirmed by running this validator
 * against all 11 real active process definitions during this audit).
 */
function isExhaustiveEnumSwitch(conditioned: BpmnFlow[], process: BpmnProcess): boolean {
  if (!conditioned.length) return false;
  const matches = conditioned.map(fl => fl.condition!.trim().match(EQUALITY_TEST_RE));
  if (matches.some(m => !m)) return false;
  const variable = matches[0]![1];
  if (!matches.every(m => m![1] === variable)) return false;
  const testedValues = new Set(matches.map(m => m![2]));

  const domain = enumDomainOf(variable, process);
  if (!domain) return false;
  return [...domain].every(v => testedValues.has(v));
}

/** The full set of possible values for a known enum-like variable, or null if unknown/unbounded. */
function enumDomainOf(variable: string, process: BpmnProcess): Set<string> | null {
  if (variable === 'decision') return new Set(['approve', 'reject']);
  for (const el of process.elements) {
    for (const field of el.formFields || []) {
      if (field.key !== variable || field.type !== 'select') continue;
      const rows = (field.options || '').split(',').map(s => s.trim()).filter(Boolean);
      const values = rows.map(row => (row.includes(':') ? row.split(/:(.*)/s)[0] : row).trim());
      return new Set(values);
    }
  }
  return null;
}

function collectFormFieldKeys(process: BpmnProcess): string[] {
  const keys: string[] = [];
  for (const el of process.elements) {
    if (el.formFields?.length) for (const f of el.formFields) keys.push(f.key);
  }
  return keys;
}

function normalizeCondition(cond: string): string {
  return cond.replace(/\s+/g, '').toLowerCase();
}

export function hasBlockingFindings(findings: ValidationFinding[]): boolean {
  return findings.some(fnd => fnd.blocking);
}
