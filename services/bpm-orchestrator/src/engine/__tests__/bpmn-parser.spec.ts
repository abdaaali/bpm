import { parseBpmn, evaluateCondition, getOutgoingFlows, getElementById } from '../bpmn-parser';

const WRAP = (body: string, extraNs = '') => `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:camunda="http://activiti.org/bpmn"${extraNs}
             targetNamespace="http://bpmn.io/schema/bpmn">
${body}
</definitions>`;

describe('parseBpmn — element & attribute extraction', () => {
  test('parses a simple start -> userTask -> end process', () => {
    const xml = WRAP(`
      <process id="p1" name="My Process" isExecutable="true">
        <startEvent id="start" name="Start"><outgoing>f1</outgoing></startEvent>
        <userTask id="t1" name="Do work" camunda:assignee="alice"><incoming>f1</incoming><outgoing>f2</outgoing></userTask>
        <endEvent id="end"><incoming>f2</incoming></endEvent>
        <sequenceFlow id="f1" sourceRef="start" targetRef="t1"/>
        <sequenceFlow id="f2" sourceRef="t1" targetRef="end"/>
      </process>`);
    const p = parseBpmn(xml);
    expect(p.id).toBe('p1');
    expect(p.name).toBe('My Process');
    expect(p.startEventId).toBe('start');
    expect(p.elements.map(e => e.id)).toEqual(['start', 't1', 'end']);
    const task = getElementById(p, 't1')!;
    expect(task.assignee).toBe('alice');
    expect(getOutgoingFlows(p, 't1')[0].target).toBe('end');
  });

  test('attributes in different orders are extracted identically', () => {
    const a = WRAP(`<process id="p1"><userTask id="t1" name="X" camunda:assignee="bob" camunda:slaHours="4"/></process>`);
    const b = WRAP(`<process id="p1"><userTask camunda:slaHours="4" name="X" id="t1" camunda:assignee="bob"/></process>`);
    const pa = parseBpmn(a).elements[0];
    const pb = parseBpmn(b).elements[0];
    expect(pa).toEqual(pb);
  });

  test('multiline / formatted tags parse the same as single-line', () => {
    const xml = WRAP(`
      <process id="p1">
        <userTask
          id="t1"
          name="Multi&#10;line tag"
          camunda:assignee="carol"
          camunda:candidateGroups="managers, finance"
        />
      </process>`);
    const el = parseBpmn(xml).elements[0];
    expect(el.assignee).toBe('carol');
    expect(el.candidateGroups).toEqual(['managers', 'finance']);
  });

  test('self-closing and explicit-close tags both work', () => {
    const selfClose = WRAP(`<process id="p1"><userTask id="t1" name="A"/></process>`);
    const explicit = WRAP(`<process id="p1"><userTask id="t1" name="A"></userTask></process>`);
    expect(parseBpmn(selfClose).elements[0].id).toBe('t1');
    expect(parseBpmn(explicit).elements[0].id).toBe('t1');
  });

  test('bpmn2: prefix and default (no prefix) namespace both parse elements', () => {
    const bpmn2 = `<?xml version="1.0"?><bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn">
      <bpmn2:process id="p1"><bpmn2:startEvent id="s"/><bpmn2:userTask id="t1" name="T"/><bpmn2:endEvent id="e"/>
      <bpmn2:sequenceFlow id="f1" sourceRef="s" targetRef="t1"/></bpmn2:process></bpmn2:definitions>`;
    const p = parseBpmn(bpmn2);
    expect(p.elements.map(e => e.id)).toEqual(['s', 't1', 'e']);
    expect(p.startEventId).toBe('s');
  });

  test('flowable: namespace prefix (imported Flowable export) resolves flowable-specific attrs', () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn">
      <process id="p1">
        <startEvent id="s" flowable:initiator="requesterId"/>
        <userTask id="t1" name="T" flowable:candidateGroups="it_engineer,noc" flowable:candidateUsers="bob,carol"/>
      </process></definitions>`;
    const p = parseBpmn(xml);
    expect(p.initiatorVariableName).toBe('requesterId');
    const t = getElementById(p, 't1')!;
    expect(t.candidateGroups).toEqual(['it_engineer', 'noc']);
    expect(t.candidateUsers).toEqual(['bob', 'carol']);
  });

  test('activiti: namespace prefix resolves the same logical attributes as camunda:', () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:activiti="http://activiti.org/bpmn">
      <process id="p1"><userTask id="t1" name="T" activiti:assignee="dave" activiti:formKey="approval"/></process></definitions>`;
    const el = parseBpmn(xml).elements[0];
    expect(el.assignee).toBe('dave');
    expect(el.formKey).toBe('approval');
  });

  test('a custom/unexpected namespace prefix for the Camunda URI is still resolved by URI, not literal prefix', () => {
    // Some tool exports use an arbitrary prefix (e.g. "ext") bound to the camunda URI.
    const xml = `<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:ext="http://activiti.org/bpmn">
      <process id="p1"><userTask id="t1" name="T" ext:assignee="erin"/></process></definitions>`;
    const el = parseBpmn(xml).elements[0];
    expect(el.assignee).toBe('erin');
  });

  test('escaped XML entities in attribute values are decoded to their literal characters', () => {
    const xml = WRAP(`<process id="p1"><userTask id="t1" name="Q&amp;A review &lt;urgent&gt;"/></process>`);
    const el = parseBpmn(xml).elements[0];
    expect(el.name).toBe('Q&A review <urgent>');
  });

  test('conditionExpression as a nested child element is extracted onto the flow, with entities decoded so the expression evaluator can read the operator', () => {
    const xml = WRAP(`
      <process id="p1">
        <exclusiveGateway id="g1"/>
        <sequenceFlow id="f1" sourceRef="g1" targetRef="t1">
          <conditionExpression xsi:type="tFormalExpression">\${amount &gt;= 5000}</conditionExpression>
        </sequenceFlow>
      </process>`, ' xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"');
    const p = parseBpmn(xml);
    expect(p.flows[0].condition).toBe('${amount >= 5000}');
    expect(evaluateCondition(p.flows[0].condition!, { amount: 6000 })).toBe(true);
    expect(evaluateCondition(p.flows[0].condition!, { amount: 100 })).toBe(false);
  });

  test('multiple <process> elements in one file — only the first process\'s own elements are collected, never bled together', () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL">
      <process id="p1" name="First"><startEvent id="s1"/></process>
      <process id="p2" name="Second"><startEvent id="s2"/></process>
      </definitions>`;
    const p = parseBpmn(xml);
    expect(p.id).toBe('p1');
    expect(p.elements.map(e => e.id)).toEqual(['s1']);
  });

  test('duplicate element IDs — parser keeps both occurrences (does not dedupe or error)', () => {
    const xml = WRAP(`<process id="p1"><userTask id="dup" name="First"/><userTask id="dup" name="Second"/></process>`);
    const p = parseBpmn(xml);
    expect(p.elements.filter(e => e.id === 'dup')).toHaveLength(2);
  });

  test('sequence flow missing sourceRef or targetRef is skipped, not crashed on', () => {
    const xml = WRAP(`
      <process id="p1">
        <sequenceFlow id="f1" targetRef="t1"/>
        <sequenceFlow id="f2" sourceRef="t1"/>
        <sequenceFlow id="f3" sourceRef="t1" targetRef="t2"/>
      </process>`);
    const p = parseBpmn(xml);
    expect(p.flows.map(f => f.id)).toEqual(['f3']);
  });

  test('malformed formFields JSON is ignored, not thrown', () => {
    const xml = WRAP(`<process id="p1"><userTask id="t1" name="T" camunda:formFields="not-valid-json-or-uri"/></process>`);
    expect(() => parseBpmn(xml)).not.toThrow();
    const el = parseBpmn(xml).elements[0];
    expect(el.formFields).toBeUndefined();
  });

  test('invalid URI-encoded form data is ignored, not thrown', () => {
    const xml = WRAP(`<process id="p1"><userTask id="t1" name="T" camunda:formFields="%E0%A4%A"/></process>`);
    expect(() => parseBpmn(xml)).not.toThrow();
  });

  test('valid URI-encoded formFields JSON round-trips', () => {
    const fields = [{ key: 'amount', label: 'Amount', type: 'number', required: true }];
    const encoded = encodeURIComponent(JSON.stringify(fields));
    const xml = WRAP(`<process id="p1"><startEvent id="s1" camunda:formFields="${encoded}"/></process>`);
    const el = parseBpmn(xml).elements[0];
    expect(el.formFields).toEqual(fields);
  });

  test('unsupported/unknown BPMN element types are silently absent from elements (not an error, but a real gap)', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <task id="generic1" name="Plain task"/>
        <complexGateway id="cg1"/>
        <endEvent id="e1"/>
      </process>`);
    const p = parseBpmn(xml);
    // Neither <task> (BPMN's abstract task type) nor <complexGateway> are in the
    // parser's elementTypes allow-list — they are simply never returned. Anything
    // that later references them by sourceRef/targetRef will hit getElementById
    // returning undefined.
    expect(p.elements.map(e => e.id)).toEqual(['s1', 'e1']);
  });

  test('whitespace-heavy / pretty-printed XML with attributes spanning many lines still parses', () => {
    const xml = WRAP(`
      <process id="p1">


        <startEvent
            id="s1"

            name="Start"
        />


        <userTask id="t1"
                  name="Task"
                  camunda:assignee="alice" />
      </process>`);
    const p = parseBpmn(xml);
    expect(p.elements.map(e => e.id)).toEqual(['s1', 't1']);
  });

  test('gateway default="flowId" attribute is captured as defaultFlow', () => {
    const xml = WRAP(`<process id="p1"><exclusiveGateway id="g1" default="f2"/></process>`);
    const el = parseBpmn(xml).elements[0];
    expect(el.defaultFlow).toBe('f2');
  });

  test('a nested formProperty extension element (Flowable/Camunda export) round-trips into formFields', () => {
    const xml = `<?xml version="1.0"?><definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:flowable="http://flowable.org/bpmn">
      <process id="p1">
        <userTask id="t1" name="T">
          <extensionElements>
            <flowable:formProperty id="urgency" name="Urgency" type="enum" required="true">
              <flowable:value id="low" name="Low"/>
              <flowable:value id="high" name="High"/>
            </flowable:formProperty>
          </extensionElements>
        </userTask>
      </process></definitions>`;
    const el = parseBpmn(xml).elements[0];
    expect(el.formFields).toHaveLength(1);
    expect(el.formFields![0]).toMatchObject({ key: 'urgency', label: 'Urgency', type: 'select', required: true });
    expect(el.formFields![0].options).toBe('low:Low,high:High');
  });

  test('elements are returned in true document order, not grouped by type', () => {
    const xml = WRAP(`
      <process id="p1">
        <userTask id="t1" name="First task"/>
        <startEvent id="s1"/>
        <endEvent id="e1"/>
        <userTask id="t2" name="Second task"/>
      </process>`);
    const p = parseBpmn(xml);
    expect(p.elements.map(e => e.id)).toEqual(['t1', 's1', 'e1', 't2']);
  });

  test('a userTask nested inside a subProcess is still discoverable (flattened), matching the runtime treating subProcess as opaque', () => {
    const xml = WRAP(`
      <process id="p1">
        <startEvent id="s1"/>
        <subProcess id="sub1" name="Sub">
          <userTask id="inner1" name="Inner task"/>
        </subProcess>
        <endEvent id="e1"/>
      </process>`);
    const p = parseBpmn(xml);
    expect(p.elements.map(e => e.id)).toEqual(['s1', 'sub1', 'inner1', 'e1']);
  });
});

describe('evaluateCondition — expression evaluation against process variables', () => {
  test('simple equality against a string variable', () => {
    expect(evaluateCondition('${decision == "approve"}', { decision: 'approve' })).toBe(true);
    expect(evaluateCondition('${decision == "approve"}', { decision: 'reject' })).toBe(false);
  });

  test('numeric comparisons', () => {
    expect(evaluateCondition('${amount >= 5000}', { amount: 6000 })).toBe(true);
    expect(evaluateCondition('${amount >= 5000}', { amount: 100 })).toBe(false);
  });

  test('#{ } wrapper is also accepted', () => {
    expect(evaluateCondition('#{amount < 100}', { amount: 50 })).toBe(true);
  });

  test('unknown/undefined variable resolves to null and the condition does not match', () => {
    expect(evaluateCondition('${missingVar == "x"}', {})).toBe(false);
  });

  test('malformed expression returns false instead of throwing', () => {
    expect(() => evaluateCondition('${this is not valid}}}', { a: 1 })).not.toThrow();
    expect(evaluateCondition('${this is not valid}}}', { a: 1 })).toBe(false);
  });

  test('empty condition is treated as always-true (unconditional flow)', () => {
    expect(evaluateCondition('', { anything: 1 })).toBe(true);
  });

  test('dotted path access into a nested variable', () => {
    expect(evaluateCondition('${user.role == "manager"}', { user: { role: 'manager' } })).toBe(true);
  });

  test('and/or/not keywords are translated to JS operators', () => {
    expect(evaluateCondition('${a == 1 and b == 2}', { a: 1, b: 2 })).toBe(true);
    expect(evaluateCondition('${a == 1 or b == 99}', { a: 1, b: 2 })).toBe(true);
  });

  test('string values containing operator-like substrings are not misparsed', () => {
    expect(evaluateCondition('${title == "a && b"}', { title: 'a && b' })).toBe(true);
  });
});
