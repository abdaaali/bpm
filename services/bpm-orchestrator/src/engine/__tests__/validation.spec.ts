import { parseBpmn } from '../bpmn-parser';
import { validateProcess, ValidationContext, ValidationFinding } from '../validation';

const NO_POLICY: ValidationContext = { approvalPolicy: null };

const WRAP = (body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn">
${body}
</definitions>`;

function codesOf(findings: ValidationFinding[]): string[] {
  return findings.map(f => f.code);
}
function blockingCodesOf(findings: ValidationFinding[]): string[] {
  return findings.filter(f => f.blocking).map(f => f.code);
}

/** A minimal, fully valid linear process: start -> userTask(assigned) -> end. */
const VALID_LINEAR = WRAP(`
  <process id="p1">
    <startEvent id="s1" camunda:startMode="api"/>
    <userTask id="t1" name="Do work" camunda:assignee="alice"/>
    <endEvent id="e1"/>
    <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
    <sequenceFlow id="f2" sourceRef="t1" targetRef="e1"/>
  </process>`);

describe('validateProcess — graph integrity', () => {
  test('a fully valid linear process has zero blocking findings', () => {
    const findings = validateProcess(parseBpmn(VALID_LINEAR), NO_POLICY);
    expect(blockingCodesOf(findings)).toEqual([]);
  });

  test('no start event blocks', () => {
    const xml = WRAP(`<process id="p1"><endEvent id="e1"/></process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('NO_START_EVENT');
  });

  test('unreachable element blocks', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/><endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="e1"/>
        <userTask id="orphan" name="Never reached" camunda:assignee="bob"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    const finding = findings.find(f => f.code === 'UNREACHABLE_ELEMENT');
    expect(finding?.blocking).toBe(true);
    expect(finding?.elementId).toBe('orphan');
  });

  test('no path to an End Event blocks even if a startEvent and userTask exist', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <userTask id="t1" name="Dead end" camunda:assignee="bob"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    // t1 has no outgoing flow (NO_OUTGOING_FLOW) AND there is no reachable end event.
    expect(blockingCodesOf(findings)).toEqual(expect.arrayContaining(['NO_OUTGOING_FLOW', 'NO_REACHABLE_END_EVENT']));
  });

  test('a dangling sequence flow (missing source/target element) blocks', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/><endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="ghost"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('FLOW_MISSING_TARGET');
  });

  test('duplicate element IDs block', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="dup"/><endEvent id="dup"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('DUPLICATE_ELEMENT_ID');
  });
});

describe('validateProcess — unsupported runtime elements', () => {
  test('an eventBasedGateway is blocked as unsupported (parsed by the editor, not executed by the runtime)', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <eventBasedGateway id="g1"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="g1"/>
        <sequenceFlow id="f2" sourceRef="g1" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    const finding = findings.find(f => f.code === 'UNSUPPORTED_ELEMENT' && f.elementId === 'g1');
    expect(finding?.blocking).toBe(true);
  });

  test('a scriptTask is blocked as unsupported (the engine never runs its script)', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <scriptTask id="sc1" name="Compute"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="sc1"/>
        <sequenceFlow id="f2" sourceRef="sc1" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('UNSUPPORTED_ELEMENT');
  });

  test('subProcess is blocked as unsupported even though its nested userTask parses fine on its own', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <subProcess id="sub1" name="Sub">
          <userTask id="inner" name="Inner" camunda:assignee="bob"/>
        </subProcess>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="sub1"/>
        <sequenceFlow id="f2" sourceRef="sub1" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(findings.find(f => f.code === 'UNSUPPORTED_ELEMENT' && f.elementId === 'sub1')).toBeTruthy();
  });

  test('supported types (start/end/userTask/serviceTask/exclusive/parallel/inclusive gateway) never trigger UNSUPPORTED_ELEMENT', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <parallelGateway id="pg1"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <userTask id="t2" name="B" camunda:assignee="b"/>
        <parallelGateway id="pg2"/>
        <serviceTask id="svc1" camunda:serviceType="notification"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="pg1"/>
        <sequenceFlow id="f2" sourceRef="pg1" targetRef="t1"/>
        <sequenceFlow id="f3" sourceRef="pg1" targetRef="t2"/>
        <sequenceFlow id="f4" sourceRef="t1" targetRef="pg2"/>
        <sequenceFlow id="f5" sourceRef="t2" targetRef="pg2"/>
        <sequenceFlow id="f6" sourceRef="pg2" targetRef="svc1"/>
        <sequenceFlow id="f7" sourceRef="svc1" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(codesOf(findings)).not.toContain('UNSUPPORTED_ELEMENT');
  });
});

describe('validateProcess — human task assignment', () => {
  test('a human task with no assignee and no candidate group blocks (orphan task)', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <userTask id="t1" name="Nobody\\'s task"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
        <sequenceFlow id="f2" sourceRef="t1" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('HUMAN_TASK_UNASSIGNED');
  });

  test('a candidate group alone clears the orphan-task finding', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <userTask id="t1" name="Team task" camunda:candidateGroups="it_engineer"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
        <sequenceFlow id="f2" sourceRef="t1" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(codesOf(findings)).not.toContain('HUMAN_TASK_UNASSIGNED');
  });

  test('explicit allowUnassigned="true" clears the finding even with nothing else set', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <userTask id="t1" name="Pool task" camunda:allowUnassigned="true"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
        <sequenceFlow id="f2" sourceRef="t1" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(codesOf(findings)).not.toContain('HUMAN_TASK_UNASSIGNED');
  });

  test('an approval-gate userTask is exempt from the assignment check (approvers come from the policy, not assignee/candidateGroups)', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <userTask id="t1" name="Approve" camunda:formKey="approval"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
        <sequenceFlow id="f2" sourceRef="t1" targetRef="e1"/>
      </process>`);
    const ctx: ValidationContext = { approvalPolicy: { id: 'pol1', name: 'P', active: true, steps: [{ type: 'hierarchy', hierarchyLevel: 1 }] } };
    const findings = validateProcess(parseBpmn(xml), ctx);
    expect(codesOf(findings)).not.toContain('HUMAN_TASK_UNASSIGNED');
  });
});

describe('validateProcess — approval gates', () => {
  const APPROVAL_XML = WRAP(`
    <process id="p1">
      <startEvent id="s1"/>
      <userTask id="t1" name="Approve" camunda:formKey="approval"/>
      <endEvent id="e1"/>
      <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
      <sequenceFlow id="f2" sourceRef="t1" targetRef="e1"/>
    </process>`);

  test('an approval gate with no linked policy blocks', () => {
    const findings = validateProcess(parseBpmn(APPROVAL_XML), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('APPROVAL_POLICY_MISSING');
  });

  test('an approval gate with a policy that has zero steps blocks', () => {
    const ctx: ValidationContext = { approvalPolicy: { id: 'pol1', name: 'Empty', active: true, steps: [] } };
    const findings = validateProcess(parseBpmn(APPROVAL_XML), ctx);
    expect(blockingCodesOf(findings)).toContain('APPROVAL_POLICY_EMPTY');
  });

  test('an inactive policy blocks', () => {
    const ctx: ValidationContext = { approvalPolicy: { id: 'pol1', name: 'Inactive', active: false, steps: [{ type: 'hierarchy' }] } };
    const findings = validateProcess(parseBpmn(APPROVAL_XML), ctx);
    expect(blockingCodesOf(findings)).toContain('APPROVAL_POLICY_INACTIVE');
  });

  test('a role-type step with no roleKey blocks', () => {
    const ctx: ValidationContext = { approvalPolicy: { id: 'pol1', name: 'P', active: true, steps: [{ type: 'role' }] } };
    const findings = validateProcess(parseBpmn(APPROVAL_XML), ctx);
    expect(blockingCodesOf(findings)).toContain('APPROVAL_STEP_INVALID');
  });

  test('a valid single-step hierarchy policy clears all approval findings', () => {
    const ctx: ValidationContext = { approvalPolicy: { id: 'pol1', name: 'P', active: true, steps: [{ type: 'hierarchy', hierarchyLevel: 1 }] } };
    const findings = validateProcess(parseBpmn(APPROVAL_XML), ctx);
    expect(codesOf(findings).filter(c => c.startsWith('APPROVAL_'))).toEqual([]);
  });
});

describe('validateProcess — exclusive gateway determinism', () => {
  test('two unconditioned outgoing branches with no default flow blocks (ambiguous / order-dependent routing)', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <exclusiveGateway id="g1"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <userTask id="t2" name="B" camunda:assignee="b"/>
        <endEvent id="e1"/><endEvent id="e2"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="g1"/>
        <sequenceFlow id="f2" sourceRef="g1" targetRef="t1"/>
        <sequenceFlow id="f3" sourceRef="g1" targetRef="t2"/>
        <sequenceFlow id="f4" sourceRef="t1" targetRef="e1"/>
        <sequenceFlow id="f5" sourceRef="t2" targetRef="e2"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('GATEWAY_MULTIPLE_UNCONDITIONED');
  });

  test('every branch conditioned with no default flow blocks (silent-stall risk if nothing matches)', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <exclusiveGateway id="g1"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <userTask id="t2" name="B" camunda:assignee="b"/>
        <endEvent id="e1"/><endEvent id="e2"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="g1"/>
        <sequenceFlow id="f2" sourceRef="g1" targetRef="t1"><conditionExpression>\${amount &gt;= 5000}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f3" sourceRef="g1" targetRef="t2"><conditionExpression>\${amount &lt; 5000}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f4" sourceRef="t1" targetRef="e1"/>
        <sequenceFlow id="f5" sourceRef="t2" targetRef="e2"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('GATEWAY_NO_DEFAULT_OR_ELSE');
  });

  test('one conditioned + one unconditioned branch (the classic if/else pattern) is valid — no gateway finding', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <exclusiveGateway id="g1"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <userTask id="t2" name="B" camunda:assignee="b"/>
        <endEvent id="e1"/><endEvent id="e2"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="g1"/>
        <sequenceFlow id="f2" sourceRef="g1" targetRef="t1"><conditionExpression>\${amount &gt;= 5000}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f3" sourceRef="g1" targetRef="t2"/>
        <sequenceFlow id="f4" sourceRef="t1" targetRef="e1"/>
        <sequenceFlow id="f5" sourceRef="t2" targetRef="e2"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings).filter(c => c.startsWith('GATEWAY_'))).toEqual([]);
  });

  test('two branches exhaustively testing decision == "approve" / "reject" (the platform\'s standard pattern, used by every real seeded process) do NOT block even with no explicit default', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <userTask id="approve1" name="Approve" camunda:formKey="approval"/>
        <exclusiveGateway id="g1"/>
        <userTask id="t1" name="Fulfil" camunda:assignee="a"/>
        <userTask id="t2" name="Reject notice" camunda:assignee="b"/>
        <endEvent id="e1"/><endEvent id="e2"/>
        <sequenceFlow id="f0" sourceRef="s1" targetRef="approve1"/>
        <sequenceFlow id="f1" sourceRef="approve1" targetRef="g1"/>
        <sequenceFlow id="f2" sourceRef="g1" targetRef="t1"><conditionExpression>\${decision == "approve"}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f3" sourceRef="g1" targetRef="t2"><conditionExpression>\${decision == "reject"}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f4" sourceRef="t1" targetRef="e1"/>
        <sequenceFlow id="f5" sourceRef="t2" targetRef="e2"/>
      </process>`);
    const ctx: ValidationContext = { approvalPolicy: { id: 'pol1', name: 'P', active: true, steps: [{ type: 'hierarchy', hierarchyLevel: 1 }] } };
    const findings = validateProcess(parseBpmn(xml), ctx);
    expect(blockingCodesOf(findings).filter(c => c.startsWith('GATEWAY_'))).toEqual([]);
  });

  test('two branches testing decision == "approve" TWICE (not exhaustive — "reject" is never handled) still blocks', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <exclusiveGateway id="g1"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <userTask id="t2" name="B" camunda:assignee="b"/>
        <endEvent id="e1"/><endEvent id="e2"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="g1"/>
        <sequenceFlow id="f2" sourceRef="g1" targetRef="t1"><conditionExpression>\${decision == "approve"}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f3" sourceRef="g1" targetRef="t2"><conditionExpression>\${decision == "approve"}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f4" sourceRef="t1" targetRef="e1"/>
        <sequenceFlow id="f5" sourceRef="t2" targetRef="e2"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('GATEWAY_NO_DEFAULT_OR_ELSE');
  });

  test('an explicit default flow with every other branch conditioned is valid', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <exclusiveGateway id="g1" default="f3"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <userTask id="t2" name="B" camunda:assignee="b"/>
        <endEvent id="e1"/><endEvent id="e2"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="g1"/>
        <sequenceFlow id="f2" sourceRef="g1" targetRef="t1"><conditionExpression>\${amount &gt;= 5000}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f3" sourceRef="g1" targetRef="t2"/>
        <sequenceFlow id="f4" sourceRef="t1" targetRef="e1"/>
        <sequenceFlow id="f5" sourceRef="t2" targetRef="e2"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings).filter(c => c.startsWith('GATEWAY_'))).toEqual([]);
  });

  test('a condition using unsupported syntax (e.g. a function call) blocks', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <exclusiveGateway id="g1"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <userTask id="t2" name="B" camunda:assignee="b"/>
        <endEvent id="e1"/><endEvent id="e2"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="g1"/>
        <sequenceFlow id="f2" sourceRef="g1" targetRef="t1"><conditionExpression>\${sum(amount, 5) &gt; 10}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f3" sourceRef="g1" targetRef="t2"/>
        <sequenceFlow id="f4" sourceRef="t1" targetRef="e1"/>
        <sequenceFlow id="f5" sourceRef="t2" targetRef="e2"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('GATEWAY_UNSUPPORTED_EXPRESSION');
  });

  test('a condition referencing a variable no form field captures is a non-blocking warning', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <exclusiveGateway id="g1"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <userTask id="t2" name="B" camunda:assignee="b"/>
        <endEvent id="e1"/><endEvent id="e2"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="g1"/>
        <sequenceFlow id="f2" sourceRef="g1" targetRef="t1"><conditionExpression>\${totallyUnknownVar == "x"}</conditionExpression></sequenceFlow>
        <sequenceFlow id="f3" sourceRef="g1" targetRef="t2"/>
        <sequenceFlow id="f4" sourceRef="t1" targetRef="e1"/>
        <sequenceFlow id="f5" sourceRef="t2" targetRef="e2"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    const finding = findings.find(f => f.code === 'GATEWAY_UNKNOWN_VARIABLE');
    expect(finding).toBeTruthy();
    expect(finding!.blocking).toBe(false);
  });

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
});

describe('validateProcess — dropdown / form field validation', () => {
  function withStartField(field: string) {
    return WRAP(`
      <process id="p1">
        <startEvent id="s1" camunda:startMode="api" camunda:formFields="${encodeURIComponent(JSON.stringify([field ? JSON.parse(field) : {}]))}"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
        <sequenceFlow id="f2" sourceRef="t1" targetRef="e1"/>
      </process>`);
  }

  test('a dropdown with no options blocks', () => {
    const xml = withStartField(JSON.stringify({ key: 'priority', label: 'Priority', type: 'select', required: true, options: '' }));
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('DROPDOWN_EMPTY');
  });

  test('a dropdown with duplicate option values blocks', () => {
    const xml = withStartField(JSON.stringify({ key: 'priority', label: 'Priority', type: 'select', required: true, options: 'high:High,high:Also High' }));
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('DROPDOWN_DUPLICATE_VALUE');
  });

  test('a valid dropdown with unique options has no dropdown findings', () => {
    const xml = withStartField(JSON.stringify({ key: 'priority', label: 'Priority', type: 'select', required: true, options: 'high:High,low:Low' }));
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(codesOf(findings).filter(c => c.startsWith('DROPDOWN_'))).toEqual([]);
  });

  test('a reserved variable key ("decision") on a form field blocks', () => {
    const xml = withStartField(JSON.stringify({ key: 'decision', label: 'Decision', type: 'text', required: false }));
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('FORM_FIELD_RESERVED_KEY');
  });

  test('an invalid variable key format blocks', () => {
    const xml = withStartField(JSON.stringify({ key: '1-bad key!', label: 'Bad', type: 'text', required: false }));
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('FORM_FIELD_INVALID_KEY_FORMAT');
  });

  test('duplicate variable keys across two different tasks block (silent overwrite risk)', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1" camunda:startMode="api"/>
        <userTask id="t1" name="A" camunda:assignee="a" camunda:formFields="${encodeURIComponent(JSON.stringify([{ key: 'amount', label: 'Amount', type: 'number', required: true }]))}"/>
        <userTask id="t2" name="B" camunda:assignee="b" camunda:formFields="${encodeURIComponent(JSON.stringify([{ key: 'amount', label: 'Amount again', type: 'text', required: false }]))}"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
        <sequenceFlow id="f2" sourceRef="t1" targetRef="t2"/>
        <sequenceFlow id="f3" sourceRef="t2" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('FORM_FIELD_DUPLICATE_KEY');
  });
});

describe('validateProcess — start mode / start form', () => {
  test('a Service Catalog process (default start mode) with no start form fields blocks', () => {
    const findings = validateProcess(parseBpmn(WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
        <sequenceFlow id="f2" sourceRef="t1" targetRef="e1"/>
      </process>`)), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('START_FORM_REQUIRED');
  });

  test('an API-triggered process is exempt from the start-form requirement', () => {
    const findings = validateProcess(parseBpmn(WRAP(`
      <process id="p1">
        <startEvent id="s1" camunda:startMode="api"/>
        <userTask id="t1" name="A" camunda:assignee="a"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="t1"/>
        <sequenceFlow id="f2" sourceRef="t1" targetRef="e1"/>
      </process>`)), NO_POLICY);
    expect(codesOf(findings)).not.toContain('START_FORM_REQUIRED');
  });
});

describe('validateProcess — service task config', () => {
  test('invalid JSON in serviceConfig blocks', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1" camunda:startMode="api"/>
        <serviceTask id="svc1" camunda:serviceType="notification" camunda:serviceConfig="{not valid json"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="svc1"/>
        <sequenceFlow id="f2" sourceRef="svc1" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('SERVICE_TASK_INVALID_CONFIG_JSON');
  });

  test('an unsupported service type blocks', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1" camunda:startMode="api"/>
        <serviceTask id="svc1" camunda:serviceType="carrier_pigeon"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="svc1"/>
        <sequenceFlow id="f2" sourceRef="svc1" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('SERVICE_TASK_UNSUPPORTED_TYPE');
  });

  test('a secret-looking key embedded in serviceConfig blocks', () => {
    const cfg = JSON.stringify({ url: 'https://example.com', apiKey: 'sk-not-a-real-secret-value' });
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1" camunda:startMode="api"/>
        <serviceTask id="svc1" camunda:serviceType="connector" camunda:serviceConfig="${cfg.replace(/"/g, '&quot;')}"/>
        <endEvent id="e1"/>
        <sequenceFlow id="f1" sourceRef="s1" targetRef="svc1"/>
        <sequenceFlow id="f2" sourceRef="svc1" targetRef="e1"/>
      </process>`);
    const findings = validateProcess(parseBpmn(xml), NO_POLICY);
    expect(blockingCodesOf(findings)).toContain('SERVICE_TASK_SECRET_IN_CONFIG');
  });
});
