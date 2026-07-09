// Shared BPMN fixtures + seeded ids used across the E2E suite. Kept in one
// place so each spec file only has to name the fixture it needs, not repeat
// the raw XML.

/**
 * Deliberately has NEITHER `xmlns:camunda` NOR `camunda:formFields` anywhere —
 * this is exactly the previously-broken scenario for the Start Event form
 * fields bug (an existing process opened for editing, before its first form
 * field is ever added). The fix is only proven if the first field added in the
 * UI survives Save, reload, and Publish — not just for a brand-new process
 * created from the in-app empty template (which already declares
 * xmlns:camunda and would pass even with the bug present).
 */
export const NO_NAMESPACE_START_EVENT_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" name="E2E Regression Process" isExecutable="true">
    <startEvent id="StartEvent_1" name="Start">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <userTask id="Activity_1" name="Review">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
    </userTask>
    <endEvent id="EndEvent_1" name="End">
      <incoming>Flow_2</incoming>
    </endEvent>
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1"/>
    <sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="152" y="82" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1"><dc:Bounds x="250" y="60" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="412" y="82" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="188" y="100"/><di:waypoint x="250" y="100"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="350" y="100"/><di:waypoint x="412" y="100"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

/**
 * Already declares xmlns:camunda and a single-field camunda:formFields on the
 * Start Event ("urgency", type select, required, options low/high) — created
 * directly via API (bypassing the Process Studio UI) so Service Catalog / My
 * Requests tests don't depend on the UI field-authoring flow under test in
 * process-studio-start-event-fields.spec.ts.
 */
export function publishedBpmnWithUrgencyField(): string {
  const formFields = encodeURIComponent(JSON.stringify([
    { key: 'urgency', label: 'Urgency', type: 'select', required: true, options: 'low,high' },
  ]));
  return `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" name="E2E Catalog Process" isExecutable="true">
    <startEvent id="StartEvent_1" name="Start" camunda:formFields="${formFields}">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <userTask id="Activity_1" name="Review">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
    </userTask>
    <endEvent id="EndEvent_1" name="End">
      <incoming>Flow_2</incoming>
    </endEvent>
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1"/>
    <sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="152" y="82" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1"><dc:Bounds x="250" y="60" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="412" y="82" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="188" y="100"/><di:waypoint x="250" y="100"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="350" y="100"/><di:waypoint x="412" y="100"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;
}

/**
 * Fork -> UserTask "Branch A" + UserTask "Branch B" -> ParallelGateway join
 * -> UserTask "Final" -> End. Used to prove: (1) the join waits for both
 * branches before creating "Final", (2) "Final" is created exactly once
 * (no duplicate downstream execution), (3) completing a branch task twice
 * doesn't double-fire the join.
 */
export const PARALLEL_JOIN_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" name="E2E Parallel Join Process" isExecutable="true">
    <startEvent id="StartEvent_1"><outgoing>Flow_start</outgoing></startEvent>
    <parallelGateway id="Fork_1">
      <incoming>Flow_start</incoming>
      <outgoing>Flow_toA</outgoing>
      <outgoing>Flow_toB</outgoing>
    </parallelGateway>
    <userTask id="TaskA" name="Branch A"><incoming>Flow_toA</incoming><outgoing>Flow_aToJoin</outgoing></userTask>
    <userTask id="TaskB" name="Branch B"><incoming>Flow_toB</incoming><outgoing>Flow_bToJoin</outgoing></userTask>
    <parallelGateway id="Join_1">
      <incoming>Flow_aToJoin</incoming>
      <incoming>Flow_bToJoin</incoming>
      <outgoing>Flow_toFinal</outgoing>
    </parallelGateway>
    <userTask id="TaskFinal" name="Final"><incoming>Flow_toFinal</incoming><outgoing>Flow_toEnd</outgoing></userTask>
    <endEvent id="EndEvent_1"><incoming>Flow_toEnd</incoming></endEvent>
    <sequenceFlow id="Flow_start" sourceRef="StartEvent_1" targetRef="Fork_1"/>
    <sequenceFlow id="Flow_toA" sourceRef="Fork_1" targetRef="TaskA"/>
    <sequenceFlow id="Flow_toB" sourceRef="Fork_1" targetRef="TaskB"/>
    <sequenceFlow id="Flow_aToJoin" sourceRef="TaskA" targetRef="Join_1"/>
    <sequenceFlow id="Flow_bToJoin" sourceRef="TaskB" targetRef="Join_1"/>
    <sequenceFlow id="Flow_toFinal" sourceRef="Join_1" targetRef="TaskFinal"/>
    <sequenceFlow id="Flow_toEnd" sourceRef="TaskFinal" targetRef="EndEvent_1"/>
  </process>
</definitions>`;

/**
 * Fork -> UserTask "Branch A" (-> join -> End), and Fork -> EndEvent "Early
 * End" directly (bypassing the join). Reproduces Bug 2: before the fix,
 * reaching ANY end event marked the whole process instance 'completed'
 * regardless of sibling branches still in flight — so starting this process
 * would mark it 'completed' immediately, even though Branch A's task is still
 * pending. See gateway-join-synchronization.spec.ts for the assertion and
 * process-instance.service.ts's advance() for the fix.
 */
export const EARLY_END_BRANCH_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" name="E2E Early End Branch Process" isExecutable="true">
    <startEvent id="StartEvent_1"><outgoing>Flow_start</outgoing></startEvent>
    <parallelGateway id="Fork_1">
      <incoming>Flow_start</incoming>
      <outgoing>Flow_toA</outgoing>
      <outgoing>Flow_toEarlyEnd</outgoing>
    </parallelGateway>
    <userTask id="TaskA" name="Branch A"><incoming>Flow_toA</incoming><outgoing>Flow_aToEnd</outgoing></userTask>
    <endEvent id="EndEvent_main"><incoming>Flow_aToEnd</incoming></endEvent>
    <endEvent id="EndEvent_early" name="Early End"><incoming>Flow_toEarlyEnd</incoming></endEvent>
    <sequenceFlow id="Flow_start" sourceRef="StartEvent_1" targetRef="Fork_1"/>
    <sequenceFlow id="Flow_toA" sourceRef="Fork_1" targetRef="TaskA"/>
    <sequenceFlow id="Flow_toEarlyEnd" sourceRef="Fork_1" targetRef="EndEvent_early"/>
    <sequenceFlow id="Flow_aToEnd" sourceRef="TaskA" targetRef="EndEvent_main"/>
  </process>
</definitions>`;

/** Contractor demo work order (alpha.tech1), seeded 'in_progress' — see infra/db/seeds-demo/004_contractor_demo.sql. */
export const WO2_ID = 'f3000000-0000-0000-0000-000000000002';
