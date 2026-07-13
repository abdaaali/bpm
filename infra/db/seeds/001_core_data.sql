-- Seed: Demo Data
-- Fixed UUIDs for cross-referencing

-- ─── Tenant ───────────────────────────────────────────────────────────────
-- Base tenant is created in migration 001 (so tenant-scoped migration reference
-- data has a valid FK). Re-assert it idempotently here to keep the seed
-- self-contained and authoritative for the tenant's display data.
INSERT INTO tenants (id, name, slug, settings, active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Demo Corp', 'demo', '{"timezone":"UTC","currency":"USD"}', true)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, slug = EXCLUDED.slug,
      settings = EXCLUDED.settings, active = EXCLUDED.active;

-- ─── Org Units ────────────────────────────────────────────────────────────
INSERT INTO org_units (id, tenant_id, parent_id, type, name, code, level, path, active) VALUES
  ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001', NULL,                                     'company',    'Demo Corp',        'DEMO',     0, '/b0000000-0000-0000-0000-000000000001', true),
  ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',   'division',   'IT Division',      'IT-DIV',   1, '/b0000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000002', true),
  ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002',   'department', 'IT Department',    'IT-DEPT',  2, '/b0000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000002/b0000000-0000-0000-0000-000000000003', true),
  ('b0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003',   'team',       'Infrastructure Team','INFRA',  3, '/b0000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000002/b0000000-0000-0000-0000-000000000003/b0000000-0000-0000-0000-000000000004', true),
  ('b0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001',   'division',   'Business Division', 'BIZ-DIV', 1, '/b0000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000005', true),
  ('b0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000005',   'department', 'Finance Department','FIN-DEPT',2, '/b0000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000005/b0000000-0000-0000-0000-000000000006', true),
  ('b0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000006',   'team',       'Finance Team',     'FIN-TEAM', 3, '/b0000000-0000-0000-0000-000000000001/b0000000-0000-0000-0000-000000000005/b0000000-0000-0000-0000-000000000006/b0000000-0000-0000-0000-000000000007', true);

-- ─── Positions ────────────────────────────────────────────────────────────
INSERT INTO positions (id, tenant_id, org_unit_id, name, level, is_manager, active) VALUES
  ('e1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','CEO',                  10, true,  true),
  ('e1000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','IT Director',          8,  true,  true),
  ('e1000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','IT Manager',           6,  true,  true),
  ('e1000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000006','Finance Controller',   7,  true,  true),
  ('e1000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000004','IT Engineer',          3,  false, true),
  ('e1000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000004','IT Requester',         2,  false, true),
  ('e1000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000006','CAB Member',           5,  false, true);

-- ─── Roles ────────────────────────────────────────────────────────────────
INSERT INTO roles (id, tenant_id, name, key, permissions, system_role) VALUES
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Administrator',    'admin',              '["*"]',                          true),
  ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Requester',        'requester',          '["cases:create","tasks:view"]',  false),
  ('d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Manager',          'manager',            '["cases:*","tasks:*","approvals:approve"]', false),
  ('d0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','Finance Controller','finance_controller', '["approvals:approve","cases:view","reports:*"]', false),
  ('d0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','CAB Member',       'cab_member',         '["approvals:approve","cases:view"]', false),
  ('d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','IT Engineer',      'it_engineer',        '["tasks:*","cases:view","cases:update"]', false);

-- ─── Users ────────────────────────────────────────────────────────────────
-- Platform admin only (reference). Demo users live in seeds-demo/ and load only
-- when LOAD_DEMO_SEEDS=true. The admin's keycloak_id must match the Keycloak user.
INSERT INTO users (id, tenant_id, keycloak_id, email, first_name, last_name, username, active) VALUES
  ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','admin-keycloak-id',     'admin@democorp.com',     'Admin',     'User',    'admin',      true);

-- ─── User Org Assignments ─────────────────────────────────────────────────
INSERT INTO user_org_assignments (user_id, tenant_id, org_unit_id, position_id, is_primary) VALUES
  ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','e1000000-0000-0000-0000-000000000001', true);

-- ─── User Roles ───────────────────────────────────────────────────────────
INSERT INTO user_roles (user_id, role_id, tenant_id) VALUES
  ('c0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001');

-- ─── Approval Policies ────────────────────────────────────────────────────
INSERT INTO approval_policies (id, tenant_id, name, description, process_key, active, steps, conditions, created_by) VALUES
(
  'e0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Purchase Request Approval',
  'Approval chain for purchase requests based on amount thresholds',
  'purchase_request',
  true,
  '[
    {
      "id": "step_manager",
      "label": "Line Manager",
      "type": "hierarchy",
      "hierarchyLevel": 1,
      "parallel": false,
      "slaHours": 24,
      "escalationAfterHours": 48,
      "escalationLevel": 1,
      "condition": null
    },
    {
      "id": "step_dept_head",
      "label": "Department Head",
      "type": "hierarchy",
      "hierarchyLevel": 2,
      "parallel": false,
      "slaHours": 48,
      "escalationAfterHours": 72,
      "escalationLevel": 1,
      "condition": {"field": "amount", "operator": ">=", "value": 5000}
    },
    {
      "id": "step_finance",
      "label": "Finance Controller",
      "type": "role",
      "roleKey": "finance_controller",
      "parallel": false,
      "slaHours": 72,
      "escalationAfterHours": 96,
      "escalationLevel": 1,
      "condition": {"field": "amount", "operator": ">=", "value": 10000}
    }
  ]'::jsonb,
  '{}'::jsonb,
  'c0000000-0000-0000-0000-000000000001'
),
(
  'e0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'Change Management CAB Approval',
  'CAB review for normal and emergency changes',
  'change_management',
  true,
  '[
    {
      "id": "step_manager",
      "label": "IT Manager",
      "type": "hierarchy",
      "hierarchyLevel": 1,
      "parallel": false,
      "slaHours": 24,
      "condition": null
    },
    {
      "id": "step_cab",
      "label": "CAB Review",
      "type": "role",
      "roleKey": "cab_member",
      "parallel": true,
      "slaHours": 48,
      "condition": {"field": "risk_level", "operator": "in", "value": ["high","critical"]}
    },
    {
      "id": "step_director",
      "label": "IT Director",
      "type": "hierarchy",
      "hierarchyLevel": 2,
      "parallel": false,
      "slaHours": 72,
      "condition": {"field": "change_type", "operator": "=", "value": "emergency"}
    }
  ]'::jsonb,
  '{}'::jsonb,
  'c0000000-0000-0000-0000-000000000001'
),
(
  'e0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'Incident Escalation Policy',
  'Auto-escalation for P1/P2 incidents based on SLA breach',
  'incident_management',
  true,
  '[
    {
      "id": "step_engineer",
      "label": "IT Engineer",
      "type": "role",
      "roleKey": "it_engineer",
      "parallel": false,
      "slaHours": 1,
      "escalationAfterHours": 1,
      "escalationLevel": 1,
      "condition": null
    },
    {
      "id": "step_manager",
      "label": "IT Manager (escalated)",
      "type": "hierarchy",
      "hierarchyLevel": 1,
      "parallel": false,
      "slaHours": 2,
      "condition": {"field": "priority", "operator": "in", "value": ["high","critical"]}
    }
  ]'::jsonb,
  '{}'::jsonb,
  'c0000000-0000-0000-0000-000000000001'
);

-- ─── Process Definitions ──────────────────────────────────────────────────
INSERT INTO process_definitions (id, tenant_id, slug, name, description, category, bpmn_xml, config, version, status) VALUES
(
  'f0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'purchase_request',
  'Purchase Request',
  'End-to-end purchase request process with amount-based approval chain',
  'Business',
  '<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             xmlns:camunda="http://activiti.org/bpmn"
             targetNamespace="http://bpm.demo/purchase_request">
  <process id="purchase_request" name="Purchase Request" isExecutable="true">
    <startEvent id="start" name="Submit Request" camunda:formFields="%5B%7B%22key%22%3A%22title%22%2C%22label%22%3A%22Title%22%2C%22type%22%3A%22text%22%2C%22required%22%3Atrue%7D%2C%7B%22key%22%3A%22amount%22%2C%22label%22%3A%22Amount%20(USD)%22%2C%22type%22%3A%22number%22%2C%22required%22%3Atrue%7D%2C%7B%22key%22%3A%22category%22%2C%22label%22%3A%22Category%22%2C%22type%22%3A%22select%22%2C%22required%22%3Atrue%2C%22options%22%3A%22it_equipment%3AIT%20Equipment%2Csoftware%3ASoftware%20%2F%20Licenses%2Cservices%3AProfessional%20Services%2Coffice_supplies%3AOffice%20Supplies%2Ctravel%3ATravel%2Ctraining%3ATraining%2Cother%3AOther%22%7D%2C%7B%22key%22%3A%22vendor%22%2C%22label%22%3A%22Preferred%20vendor%20%2F%20supplier%22%2C%22type%22%3A%22text%22%2C%22required%22%3Afalse%7D%2C%7B%22key%22%3A%22neededBy%22%2C%22label%22%3A%22Needed%20by%22%2C%22type%22%3A%22date%22%2C%22required%22%3Afalse%7D%2C%7B%22key%22%3A%22justification%22%2C%22label%22%3A%22Justification%22%2C%22type%22%3A%22textarea%22%2C%22required%22%3Atrue%7D%5D"/>
    <sequenceFlow id="sf1" sourceRef="start" targetRef="approval_gateway"/>
    <userTask id="approval_gateway" name="Manager Approval" camunda:candidateGroups="manager" camunda:formKey="approval">
      <extensionElements>
        <!-- id renamed from "decision" (reserved — the engine always injects its
             own `decision`/`approved` variables after this formKey="approval"
             task resolves, see process-instance.service.ts approvalResult()).
             The gateway conditions below intentionally still read the
             engine-injected `decision`, NOT this field — do not rename them. -->
        <camunda:formProperty id="approval_decision" name="Decision" type="enum" required="true">
          <camunda:value id="approve" name="Approve"/>
          <camunda:value id="reject" name="Reject"/>
        </camunda:formProperty>
        <camunda:formProperty id="comment" name="Comment" type="textarea" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="sf3" sourceRef="approval_gateway" targetRef="decision_gw"/>
    <exclusiveGateway id="decision_gw" name="Approved?"/>
    <sequenceFlow id="sf4" sourceRef="decision_gw" targetRef="fulfill_request">
      <conditionExpression>${decision == "approve"}</conditionExpression>
    </sequenceFlow>
    <sequenceFlow id="sf5" sourceRef="decision_gw" targetRef="rejection_task">
      <conditionExpression>${decision == "reject"}</conditionExpression>
    </sequenceFlow>
    <userTask id="fulfill_request" name="Fulfill Request" camunda:candidateGroups="it_engineer">
      <extensionElements>
        <camunda:formProperty id="fulfillmentStatus" name="Fulfillment status" type="enum" required="true">
          <camunda:value id="ordered" name="Ordered"/>
          <camunda:value id="delivered" name="Delivered"/>
          <camunda:value id="completed" name="Completed"/>
          <camunda:value id="partial" name="Partially fulfilled"/>
        </camunda:formProperty>
        <camunda:formProperty id="poNumber" name="Purchase order number" type="string" required="false"/>
        <camunda:formProperty id="confirmedVendor" name="Vendor / supplier" type="string" required="false"/>
        <camunda:formProperty id="actualCost" name="Actual cost (USD)" type="long" required="false"/>
        <camunda:formProperty id="fulfillmentNotes" name="Fulfillment notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="sf6" sourceRef="fulfill_request" targetRef="end_approved"/>
    <userTask id="rejection_task" name="Notify Rejection" camunda:candidateGroups="requester">
      <extensionElements>
        <camunda:formProperty id="rejectionReason" name="Rejection reason communicated" type="textarea" required="true"/>
        <camunda:formProperty id="resubmitGuidance" name="Guidance for resubmission" type="textarea" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="sf7" sourceRef="rejection_task" targetRef="end_rejected"/>
    <endEvent id="end_approved" name="Request Fulfilled"/>
    <endEvent id="end_rejected" name="Request Rejected"/>
  </process>
</definitions>',
  '{}'::jsonb,
  1,
  'active'
),
(
  'f0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'change_management',
  'Change Management',
  'ITIL Change Management with CAB approval and PIR',
  'ITIL',
  '<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="change_management" name="Change Management" isExecutable="true">
    <startEvent camunda:formFields="%5B%7B%22key%22%3A%20%22changeCategory%22%2C%20%22label%22%3A%20%22Change%20category%22%2C%20%22type%22%3A%20%22select%22%2C%20%22required%22%3A%20true%2C%20%22options%22%3A%20%22standard%2Cnormal%2Cemergency%22%7D%2C%20%7B%22key%22%3A%20%22changeWindow%22%2C%20%22label%22%3A%20%22Proposed%20change%20window%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22servicesImpacted%22%2C%20%22label%22%3A%20%22Services%20impacted%22%2C%20%22type%22%3A%20%22textarea%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22downtimeExpected%22%2C%20%22label%22%3A%20%22Service%20downtime%20expected%22%2C%20%22type%22%3A%20%22checkbox%22%2C%20%22required%22%3A%20false%7D%5D"  id="start"/>
    <sequenceFlow id="c1" sourceRef="start" targetRef="assess"/>
    <userTask id="assess" name="Assess Change and Risk" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="changeType" name="Change type" type="enum" required="true">
          <camunda:value id="standard" name="Standard - pre-approved"/>
          <camunda:value id="normal" name="Normal - requires CAB"/>
          <camunda:value id="emergency" name="Emergency"/>
        </camunda:formProperty>
        <camunda:formProperty id="riskLevel" name="Risk level" type="enum" required="true">
          <camunda:value id="low" name="Low"/>
          <camunda:value id="medium" name="Medium"/>
          <camunda:value id="high" name="High"/>
        </camunda:formProperty>
        <camunda:formProperty id="impactAssessment" name="Impact assessment" type="textarea" required="true"/>
        <camunda:formProperty id="implementationPlan" name="Implementation plan" type="textarea" required="true"/>
        <camunda:formProperty id="backoutPlan" name="Backout plan" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="c2" sourceRef="assess" targetRef="cab_approval"/>
    <userTask id="cab_approval" name="CAB Approval" camunda:candidateGroups="cab_member" camunda:formKey="approval"/>
    <sequenceFlow id="c3" sourceRef="cab_approval" targetRef="dec_gw"/>
    <exclusiveGateway id="dec_gw" name="Approved"/>
    <sequenceFlow id="c4" sourceRef="dec_gw" targetRef="implement"><conditionExpression>${decision == "approve"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="c5" sourceRef="dec_gw" targetRef="notify_reject"><conditionExpression>${decision == "reject"}</conditionExpression></sequenceFlow>
    <userTask id="implement" name="Implement Change" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="implementationOutcome" name="Implementation outcome" type="enum" required="true">
          <camunda:value id="success" name="Completed successfully"/>
          <camunda:value id="partial" name="Completed with issues"/>
          <camunda:value id="failed" name="Failed - backout executed"/>
        </camunda:formProperty>
        <camunda:formProperty id="workPerformed" name="Work performed" type="textarea" required="true"/>
        <camunda:formProperty id="deviationsFromPlan" name="Deviations from plan (if any)" type="textarea" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="c6" sourceRef="implement" targetRef="validate_change"/>
    <userTask id="validate_change" name="Validate and Verify" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="verificationResult" name="Verification result" type="enum" required="true">
          <camunda:value id="verified" name="Verified - operating normally"/>
          <camunda:value id="issues_found" name="Issues found"/>
        </camunda:formProperty>
        <camunda:formProperty id="verificationNotes" name="Verification notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="c7" sourceRef="validate_change" targetRef="close_change"/>
    <userTask id="close_change" name="Close Change" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="changeOutcome" name="Change outcome" type="enum" required="true">
          <camunda:value id="successful" name="Successful"/>
          <camunda:value id="successful_with_issues" name="Successful with issues"/>
          <camunda:value id="backed_out" name="Backed out"/>
          <camunda:value id="failed" name="Failed"/>
        </camunda:formProperty>
        <camunda:formProperty id="pirRequired" name="Post-implementation review required?" type="enum" required="true">
          <camunda:value id="yes" name="Yes"/>
          <camunda:value id="no" name="No"/>
        </camunda:formProperty>
        <camunda:formProperty id="closureNotes" name="Closure summary" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="c8" sourceRef="close_change" targetRef="end_done"/>
    <endEvent id="end_done"/>
    <userTask id="notify_reject" name="Notify Rejection" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="rejectionReason" name="Rejection reason communicated" type="textarea" required="true"/>
        <camunda:formProperty id="resubmitGuidance" name="Guidance for resubmission" type="textarea" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="c9" sourceRef="notify_reject" targetRef="end_rejected"/>
    <endEvent id="end_rejected"/>
  </process>
</definitions>',
  '{}'::jsonb,
  1,
  'active'
),
(
  'f0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'incident_management',
  'Incident Management',
  'ITIL Incident lifecycle with SLA timers and escalation',
  'ITIL',
  '<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="incident_management" name="Incident Management" isExecutable="true">
    <startEvent camunda:formFields="%5B%7B%22key%22%3A%20%22affectedService%22%2C%20%22label%22%3A%20%22Affected%20service%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22usersImpacted%22%2C%20%22label%22%3A%20%22Users%20impacted%22%2C%20%22type%22%3A%20%22select%22%2C%20%22required%22%3A%20true%2C%20%22options%22%3A%20%22single%2Cdepartment%2Csite%2Corg_wide%22%7D%2C%20%7B%22key%22%3A%20%22businessImpact%22%2C%20%22label%22%3A%20%22Business%20impact%22%2C%20%22type%22%3A%20%22textarea%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22workaroundAvailable%22%2C%20%22label%22%3A%20%22Workaround%20available%22%2C%20%22type%22%3A%20%22checkbox%22%2C%20%22required%22%3A%20false%7D%5D"  id="start" name="Incident Reported"/>
    <sequenceFlow id="i1" sourceRef="start" targetRef="triage"/>
    <userTask id="triage" name="Triage Incident" camunda:candidateGroups="it_engineer">
      <extensionElements>
        <camunda:formProperty id="priority" name="Priority" type="enum" required="true">
          <camunda:value id="critical" name="P1 - Critical"/>
          <camunda:value id="high" name="P2 - High"/>
          <camunda:value id="medium" name="P3 - Medium"/>
          <camunda:value id="low" name="P4 - Low"/>
        </camunda:formProperty>
        <camunda:formProperty id="category" name="Category" type="enum" required="true">
          <camunda:value id="hardware" name="Hardware"/>
          <camunda:value id="software" name="Software"/>
          <camunda:value id="network" name="Network"/>
          <camunda:value id="database" name="Database"/>
          <camunda:value id="security" name="Security"/>
          <camunda:value id="application" name="Application"/>
          <camunda:value id="facilities" name="Facilities"/>
          <camunda:value id="other" name="Other"/>
        </camunda:formProperty>
        <camunda:formProperty id="majorIncident" name="Declare Major Incident?" type="enum" required="true">
          <camunda:value id="no" name="No - normal handling"/>
          <camunda:value id="yes" name="Yes - P1 Major Incident"/>
        </camunda:formProperty>
        <camunda:formProperty id="triageNotes" name="Triage assessment and initial diagnosis" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="i2" sourceRef="triage" targetRef="mi_gw"/>
    <exclusiveGateway id="mi_gw" name="Major Incident?"/>
    <sequenceFlow id="i3" sourceRef="mi_gw" targetRef="assign"><conditionExpression>${majorIncident == "no"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="i4" sourceRef="mi_gw" targetRef="declare_mi"><conditionExpression>${majorIncident == "yes"}</conditionExpression></sequenceFlow>

    <userTask id="assign" name="Assign to Engineer" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="assignedEngineer" name="Engineer assigned (name)" type="string" required="true"/>
        <camunda:formProperty id="targetResolution" name="Target resolution date" type="date" required="true"/>
        <camunda:formProperty id="assignmentNotes" name="Assignment notes and instructions" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="i5" sourceRef="assign" targetRef="investigate"/>
    <userTask id="investigate" name="Investigate" camunda:candidateGroups="it_engineer">
      <extensionElements>
        <camunda:formProperty id="diagnosisType" name="Diagnosis" type="enum" required="true">
          <camunda:value id="confirmed" name="Confirmed root cause"/>
          <camunda:value id="workaround" name="Workaround applied"/>
          <camunda:value id="escalate" name="Needs escalation"/>
          <camunda:value id="inconclusive" name="Inconclusive - continue"/>
        </camunda:formProperty>
        <camunda:formProperty id="investigationFindings" name="Investigation findings" type="textarea" required="true"/>
        <camunda:formProperty id="rootCause" name="Identified or suspected root cause" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="i6" sourceRef="investigate" targetRef="resolve"/>
    <userTask id="resolve" name="Resolve Incident" camunda:candidateGroups="it_engineer">
      <extensionElements>
        <camunda:formProperty id="resolved" name="Resolved?" type="enum" required="true">
          <camunda:value id="yes" name="Yes"/>
          <camunda:value id="no" name="No - keep investigating"/>
        </camunda:formProperty>
        <camunda:formProperty id="resolutionCode" name="Resolution code" type="enum" required="true">
          <camunda:value id="fixed" name="Fixed - permanent"/>
          <camunda:value id="workaround" name="Workaround applied"/>
          <camunda:value id="config" name="Configuration change"/>
          <camunda:value id="restart" name="Restart or reset"/>
          <camunda:value id="hardware" name="Hardware replaced"/>
          <camunda:value id="patch" name="Software patch"/>
          <camunda:value id="no_fault" name="No fault found"/>
          <camunda:value id="duplicate" name="Duplicate"/>
        </camunda:formProperty>
        <camunda:formProperty id="resolutionNotes" name="Resolution summary - what was done" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="i7" sourceRef="resolve" targetRef="resolve_gw"/>
    <exclusiveGateway id="resolve_gw" name="Resolved?"/>
    <sequenceFlow id="i8" sourceRef="resolve_gw" targetRef="close"><conditionExpression>${resolved == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="i9" sourceRef="resolve_gw" targetRef="investigate"><conditionExpression>${resolved == "no"}</conditionExpression></sequenceFlow>

    <!-- Major Incident (P1) branch -->
    <userTask id="declare_mi" name="Declare Major Incident and Assign MIM" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="mimName" name="Major Incident Manager assigned" type="string" required="true"/>
        <camunda:formProperty id="severity" name="Severity" type="enum" required="true">
          <camunda:value id="sev1" name="SEV1 - critical business impact"/>
          <camunda:value id="sev2" name="SEV2 - major business impact"/>
        </camunda:formProperty>
        <camunda:formProperty id="declarationNotes" name="Reason for MI declaration and scope" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="m1" sourceRef="declare_mi" targetRef="engage_bridge"/>
    <userTask id="engage_bridge" name="Open Incident Bridge and Notify Stakeholders" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="bridgeReference" name="Bridge link or conference number" type="string" required="true"/>
        <camunda:formProperty id="stakeholdersNotified" name="Stakeholders and teams notified" type="textarea" required="true"/>
        <camunda:formProperty id="commsNotes" name="Initial communication issued" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="m2" sourceRef="engage_bridge" targetRef="mi_recovery"/>
    <userTask id="mi_recovery" name="Technical Recovery" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="restored" name="Service Restored?" type="enum" required="true">
          <camunda:value id="yes" name="Yes - service restored"/>
          <camunda:value id="no" name="No - recovery ongoing"/>
        </camunda:formProperty>
        <camunda:formProperty id="recoveryActions" name="Recovery actions performed" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="m3" sourceRef="mi_recovery" targetRef="mi_gw2"/>
    <exclusiveGateway id="mi_gw2" name="Service Restored?"/>
    <sequenceFlow id="m4" sourceRef="mi_gw2" targetRef="mi_review"><conditionExpression>${restored == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="m5" sourceRef="mi_gw2" targetRef="mi_update"><conditionExpression>${restored == "no"}</conditionExpression></sequenceFlow>
    <userTask id="mi_update" name="Stakeholder Update" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="updateMessage" name="Stakeholder update issued" type="textarea" required="true"/>
        <camunda:formProperty id="nextUpdateEta" name="Next update ETA" type="string" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="m6" sourceRef="mi_update" targetRef="mi_recovery"/>
    <userTask id="mi_review" name="Post-Incident Review (PIR)" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="confirmedRootCause" name="Confirmed root cause" type="textarea" required="true"/>
        <camunda:formProperty id="correctiveActions" name="Corrective actions taken" type="textarea" required="true"/>
        <camunda:formProperty id="preventiveActions" name="Preventive actions and improvements" type="textarea" required="true"/>
        <camunda:formProperty id="raiseProblem" name="Raise a Problem record?" type="enum" required="true">
          <camunda:value id="yes" name="Yes - raise Problem"/>
          <camunda:value id="no" name="No"/>
        </camunda:formProperty>
      </extensionElements>
    </userTask>
    <sequenceFlow id="m7" sourceRef="mi_review" targetRef="close"/>

    <userTask id="close" name="Close Incident" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="closureCategory" name="Closure category" type="enum" required="true">
          <camunda:value id="resolved_permanent" name="Resolved permanently"/>
          <camunda:value id="resolved_workaround" name="Resolved with workaround"/>
          <camunda:value id="known_error" name="Known error"/>
          <camunda:value id="no_fault" name="No fault found"/>
          <camunda:value id="duplicate" name="Duplicate"/>
        </camunda:formProperty>
        <camunda:formProperty id="customerConfirmed" name="Customer confirmed resolution?" type="enum" required="true">
          <camunda:value id="yes" name="Yes"/>
          <camunda:value id="no" name="No"/>
          <camunda:value id="na" name="Not applicable"/>
        </camunda:formProperty>
        <camunda:formProperty id="closureNotes" name="Closure summary" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="i10" sourceRef="close" targetRef="end"/>
    <endEvent id="end" name="Incident Closed"/>
  </process>
</definitions>',
  '{}'::jsonb,
  1,
  'active'
);

-- ── Additional demo processes (consolidated from runtime; rich per-phase forms) ──
INSERT INTO process_definitions (id, tenant_id, slug, name, description, category, bpmn_xml, config, version, status) VALUES
(
  'f0000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'problem_management',
  'Problem Management',
  'ITIL Problem Management - root cause analysis, known error and permanent fix',
  'Service Operations',
  $BPMN$<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="problem_management" name="Problem Management" isExecutable="true">
    <startEvent camunda:formFields="%5B%7B%22key%22%3A%20%22affectedService%22%2C%20%22label%22%3A%20%22Affected%20service%20/%20CI%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22problemImpact%22%2C%20%22label%22%3A%20%22Impact%20scope%22%2C%20%22type%22%3A%20%22select%22%2C%20%22required%22%3A%20true%2C%20%22options%22%3A%20%22single_site%2Cmulti_site%2Ccore_network%2Ccustomer_affecting%22%7D%2C%20%7B%22key%22%3A%20%22symptom%22%2C%20%22label%22%3A%20%22Recurring%20symptom%22%2C%20%22type%22%3A%20%22textarea%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22relatedIncidents%22%2C%20%22label%22%3A%20%22Related%20incident%20references%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20false%7D%5D"  id="start" name="Problem Logged"/>
    <sequenceFlow id="p1" sourceRef="start" targetRef="investigate"/>
    <userTask id="investigate" name="Root Cause Investigation" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="rootCauseFound" name="Root cause identified?" type="enum" required="true">
          <camunda:value id="yes" name="Yes - root cause found"/>
          <camunda:value id="no" name="No - keep investigating"/>
        </camunda:formProperty>
        <camunda:formProperty id="rootCauseCategory" name="Root cause category" type="enum" required="false">
          <camunda:value id="hardware" name="Hardware"/>
          <camunda:value id="software" name="Software / firmware"/>
          <camunda:value id="config" name="Configuration"/>
          <camunda:value id="capacity" name="Capacity / performance"/>
          <camunda:value id="human_error" name="Human error"/>
          <camunda:value id="process" name="Process"/>
          <camunda:value id="external" name="External / third party"/>
          <camunda:value id="unknown" name="Unknown"/>
        </camunda:formProperty>
        <camunda:formProperty id="investigationFindings" name="Investigation findings" type="textarea" required="true"/>
        <camunda:formProperty id="rootCauseDescription" name="Root cause description" type="textarea" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="p2" sourceRef="investigate" targetRef="rca_gw"/>
    <exclusiveGateway id="rca_gw" name="Root Cause Found?"/>
    <sequenceFlow id="p3" sourceRef="rca_gw" targetRef="document_ke"><conditionExpression>${rootCauseFound == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="p4" sourceRef="rca_gw" targetRef="investigate"><conditionExpression>${rootCauseFound == "no"}</conditionExpression></sequenceFlow>
    <userTask id="document_ke" name="Document Known Error and Workaround" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="permanentFix" name="Permanent fix required?" type="enum" required="true">
          <camunda:value id="yes" name="Yes - raise a fix"/>
          <camunda:value id="no" name="No - accept workaround and monitor"/>
        </camunda:formProperty>
        <camunda:formProperty id="knownError" name="Known error description" type="textarea" required="true"/>
        <camunda:formProperty id="workaround" name="Workaround" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="p5" sourceRef="document_ke" targetRef="fix_gw"/>
    <exclusiveGateway id="fix_gw" name="Permanent Fix?"/>
    <sequenceFlow id="p6" sourceRef="fix_gw" targetRef="implement_fix"><conditionExpression>${permanentFix == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="p7" sourceRef="fix_gw" targetRef="monitor"><conditionExpression>${permanentFix == "no"}</conditionExpression></sequenceFlow>
    <userTask id="implement_fix" name="Implement Permanent Fix" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="fixResult" name="Fix result" type="enum" required="true">
          <camunda:value id="implemented" name="Implemented"/>
          <camunda:value id="deferred" name="Deferred"/>
          <camunda:value id="failed" name="Failed"/>
        </camunda:formProperty>
        <camunda:formProperty id="fixDescription" name="Fix description" type="textarea" required="true"/>
        <camunda:formProperty id="changeReference" name="Related change record (if raised)" type="string" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="p8" sourceRef="implement_fix" targetRef="validate_fix"/>
    <userTask id="validate_fix" name="Validate Fix" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="validationResult" name="Validation result" type="enum" required="true">
          <camunda:value id="confirmed" name="Confirmed - problem resolved"/>
          <camunda:value id="not_confirmed" name="Not confirmed"/>
        </camunda:formProperty>
        <camunda:formProperty id="validationNotes" name="Validation notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="p9" sourceRef="validate_fix" targetRef="close_problem"/>
    <userTask id="monitor" name="Monitor Workaround" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="monitoringOutcome" name="Monitoring outcome" type="enum" required="true">
          <camunda:value id="stable" name="Stable - workaround holding"/>
          <camunda:value id="recurred" name="Recurred"/>
        </camunda:formProperty>
        <camunda:formProperty id="monitoringPeriod" name="Monitoring period" type="string" required="false"/>
        <camunda:formProperty id="monitoringNotes" name="Monitoring notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="p10" sourceRef="monitor" targetRef="close_problem"/>
    <userTask id="close_problem" name="Review and Close Problem" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="closureCategory" name="Closure category" type="enum" required="true">
          <camunda:value id="resolved_permanent" name="Resolved - permanent fix"/>
          <camunda:value id="workaround_accepted" name="Workaround accepted"/>
          <camunda:value id="duplicate" name="Duplicate"/>
          <camunda:value id="no_longer_occurs" name="No longer occurs"/>
        </camunda:formProperty>
        <camunda:formProperty id="recurrencePrevented" name="Recurrence prevented?" type="enum" required="true">
          <camunda:value id="yes" name="Yes"/>
          <camunda:value id="no" name="No"/>
        </camunda:formProperty>
        <camunda:formProperty id="closureNotes" name="Closure summary" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="p11" sourceRef="close_problem" targetRef="end"/>
    <endEvent id="end" name="Problem Closed"/>
  </process>
</definitions>$BPMN$,
  '{}'::jsonb,
  1,
  'active'
),
(
  'f0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  'fault_management',
  'Fault Management',
  'Network fault lifecycle - validate, classify, diagnose, restore and RCA',
  'Service Operations',
  $BPMN$<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="fault_management" name="Fault Management" isExecutable="true">
    <startEvent camunda:formFields="%5B%7B%22key%22%3A%20%22serviceAffected%22%2C%20%22label%22%3A%20%22Service%20/%20element%20affected%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22faultImpact%22%2C%20%22label%22%3A%20%22Impact%20scope%22%2C%20%22type%22%3A%20%22select%22%2C%20%22required%22%3A%20true%2C%20%22options%22%3A%20%22single_site%2Cmulti_site%2Ccore_network%2Ccustomer_affecting%22%7D%2C%20%7B%22key%22%3A%20%22symptom%22%2C%20%22label%22%3A%20%22Observed%20symptom%22%2C%20%22type%22%3A%20%22textarea%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22alarmRef%22%2C%20%22label%22%3A%20%22Alarm%20/%20NMS%20reference%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20false%7D%2C%20%7B%22key%22%3A%20%22accessRequired%22%2C%20%22label%22%3A%20%22Site%20access%20/%20escort%20required%22%2C%20%22type%22%3A%20%22checkbox%22%2C%20%22required%22%3A%20false%7D%5D"  id="start"/>
    <sequenceFlow id="s1" sourceRef="start" targetRef="validate"/>
    <userTask id="validate" name="Validate Fault" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="faultConfirmed" name="Fault confirmed?" type="enum" required="true">
          <camunda:value id="confirmed" name="Confirmed - genuine fault"/>
          <camunda:value id="false_positive" name="False positive"/>
          <camunda:value id="duplicate" name="Duplicate of existing fault"/>
        </camunda:formProperty>
        <camunda:formProperty id="validationNotes" name="Validation notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s2" sourceRef="validate" targetRef="classify"/>
    <userTask id="classify" name="Classify and Assess Impact" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="faultCategory" name="Fault category" type="enum" required="true">
          <camunda:value id="transmission" name="Transmission"/>
          <camunda:value id="power" name="Power"/>
          <camunda:value id="hardware" name="Hardware"/>
          <camunda:value id="software" name="Software"/>
          <camunda:value id="environmental" name="Environmental"/>
          <camunda:value id="external" name="External / third party"/>
          <camunda:value id="capacity" name="Capacity"/>
          <camunda:value id="other" name="Other"/>
        </camunda:formProperty>
        <camunda:formProperty id="severity" name="Severity" type="enum" required="true">
          <camunda:value id="critical" name="Critical"/>
          <camunda:value id="major" name="Major"/>
          <camunda:value id="minor" name="Minor"/>
          <camunda:value id="warning" name="Warning"/>
        </camunda:formProperty>
        <camunda:formProperty id="classificationNotes" name="Impact assessment" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s3" sourceRef="classify" targetRef="assign"/>
    <userTask id="assign" name="Assign Support Group" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="supportGroup" name="Support group" type="enum" required="true">
          <camunda:value id="noc" name="NOC"/>
          <camunda:value id="field_ops" name="Field Operations"/>
          <camunda:value id="transmission" name="Transmission team"/>
          <camunda:value id="power" name="Power team"/>
          <camunda:value id="ip_core" name="IP / Core"/>
          <camunda:value id="vendor" name="Vendor"/>
        </camunda:formProperty>
        <camunda:formProperty id="assignedTo" name="Assigned engineer (name)" type="string" required="false"/>
        <camunda:formProperty id="assignmentNotes" name="Assignment notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s4" sourceRef="assign" targetRef="diagnose"/>
    <userTask id="diagnose" name="Initial Diagnosis" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="resolution" name="Resolution path" type="enum" required="true">
          <camunda:value id="resolved" name="Can resolve - proceed to repair"/>
          <camunda:value id="exception" name="Cannot resolve now - request exception"/>
        </camunda:formProperty>
        <camunda:formProperty id="diagnosisFindings" name="Diagnosis findings" type="textarea" required="true"/>
        <camunda:formProperty id="suspectedCause" name="Suspected cause" type="textarea" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s5" sourceRef="diagnose" targetRef="res_gw"/>
    <exclusiveGateway id="res_gw" name="Resolution Path"/>
    <sequenceFlow id="s6" sourceRef="res_gw" targetRef="repair"><conditionExpression>${resolution == "resolved"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="s7" sourceRef="res_gw" targetRef="exc_request"><conditionExpression>${resolution == "exception"}</conditionExpression></sequenceFlow>
    <userTask id="repair" name="Restoration and Repair" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="serviceRestored" name="Service restored?" type="enum" required="true">
          <camunda:value id="yes" name="Yes - service restored"/>
          <camunda:value id="no" name="No - partial / pending"/>
        </camunda:formProperty>
        <camunda:formProperty id="restorationActions" name="Restoration and repair actions" type="textarea" required="true"/>
        <camunda:formProperty id="partsUsed" name="Parts replaced (if any)" type="string" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s8" sourceRef="repair" targetRef="tech_val"/>
    <userTask id="tech_val" name="Technical Validation" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="validationResult" name="Validation result" type="enum" required="true">
          <camunda:value id="passed" name="Passed - operating normally"/>
          <camunda:value id="failed" name="Failed - reopen"/>
        </camunda:formProperty>
        <camunda:formProperty id="techValidationNotes" name="Validation notes" type="textarea" required="true"/>
        <camunda:formProperty id="monitoringPeriod" name="Monitoring period" type="string" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s9" sourceRef="tech_val" targetRef="close"/>
    <userTask id="close" name="Root Cause and Closure" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="rootCauseCategory" name="Root cause category" type="enum" required="true">
          <camunda:value id="hardware" name="Hardware"/>
          <camunda:value id="software" name="Software / firmware"/>
          <camunda:value id="config" name="Configuration"/>
          <camunda:value id="power" name="Power"/>
          <camunda:value id="transmission" name="Transmission"/>
          <camunda:value id="environmental" name="Environmental"/>
          <camunda:value id="human_error" name="Human error"/>
          <camunda:value id="external" name="External / third party"/>
          <camunda:value id="unknown" name="Unknown"/>
        </camunda:formProperty>
        <camunda:formProperty id="rootCauseDescription" name="Root cause description" type="textarea" required="true"/>
        <camunda:formProperty id="preventiveAction" name="Preventive action" type="textarea" required="false"/>
        <camunda:formProperty id="closureNotes" name="Closure summary" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s10" sourceRef="close" targetRef="end_ok"/>
    <endEvent id="end_ok"/>
    <userTask id="exc_request" name="Request Exception" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="riskOfException" name="Risk of exception" type="enum" required="true">
          <camunda:value id="low" name="Low"/>
          <camunda:value id="medium" name="Medium"/>
          <camunda:value id="high" name="High"/>
        </camunda:formProperty>
        <camunda:formProperty id="exceptionReason" name="Reason exception is needed" type="textarea" required="true"/>
        <camunda:formProperty id="proposedWorkaround" name="Proposed workaround" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s11" sourceRef="exc_request" targetRef="exc_review"/>
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
    <userTask id="exc_monitor" name="Exception Monitoring and Scheduled Review" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="reviewDate" name="Scheduled review date" type="date" required="true"/>
        <camunda:formProperty id="monitoringPlan" name="Monitoring plan" type="textarea" required="true"/>
        <camunda:formProperty id="excMonitoringNotes" name="Monitoring notes" type="textarea" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s15" sourceRef="exc_monitor" targetRef="end_exc"/>
    <endEvent id="end_exc"/>
  </process>
</definitions>$BPMN$,
  '{}'::jsonb,
  1,
  'active'
),
(
  'f0000000-0000-0000-0000-000000000006',
  'a0000000-0000-0000-0000-000000000001',
  'asset_movement',
  'Asset Movement',
  'Asset movement and transfer authorization',
  'Field & Logistics',
  $BPMN$<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="asset_movement" name="Asset Movement" isExecutable="true">
    <startEvent camunda:formFields="%5B%7B%22key%22%3A%20%22assetRef%22%2C%20%22label%22%3A%20%22Asset%20reference%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22fromSite%22%2C%20%22label%22%3A%20%22From%20site%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22toSite%22%2C%20%22label%22%3A%20%22To%20site%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22escortRequired%22%2C%20%22label%22%3A%20%22Security%20escort%20required%22%2C%20%22type%22%3A%20%22checkbox%22%2C%20%22required%22%3A%20false%7D%5D"  id="start" name="Movement Requested"/>
    <sequenceFlow id="a1" sourceRef="start" targetRef="validate_req"/>
    <userTask id="validate_req" name="Validate Movement Request" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="validationOutcome" name="Validation outcome" type="enum" required="true">
          <camunda:value id="valid" name="Valid - proceed"/>
          <camunda:value id="invalid" name="Invalid - reject"/>
        </camunda:formProperty>
        <camunda:formProperty id="validationNotes" name="Validation notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="a2" sourceRef="validate_req" targetRef="approve"/>
    <userTask id="approve" name="Approve Movement" camunda:candidateGroups="manager">
      <extensionElements>
        <camunda:formProperty id="approved" name="Approved?" type="enum" required="true">
          <camunda:value id="yes" name="Yes"/>
          <camunda:value id="no" name="No - reject"/>
        </camunda:formProperty>
              <camunda:formProperty id="approvalNotes" name="Approval notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="a3" sourceRef="approve" targetRef="appr_gw"/>
    <exclusiveGateway id="appr_gw" name="Approved?"/>
    <sequenceFlow id="a4" sourceRef="appr_gw" targetRef="dispatch_asset"><conditionExpression>${approved == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="a5" sourceRef="appr_gw" targetRef="notify_reject"><conditionExpression>${approved == "no"}</conditionExpression></sequenceFlow>
    <userTask id="dispatch_asset" name="Prepare and Dispatch" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="dispatchMethod" name="Dispatch method" type="enum" required="true">
          <camunda:value id="road" name="Road"/>
          <camunda:value id="air" name="Air"/>
          <camunda:value id="courier" name="Courier"/>
          <camunda:value id="internal" name="Internal transfer"/>
        </camunda:formProperty>
        <camunda:formProperty id="carrier" name="Carrier / driver" type="string" required="false"/>
        <camunda:formProperty id="dispatchNotes" name="Dispatch notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="a6" sourceRef="dispatch_asset" targetRef="in_transit"/>
    <userTask id="in_transit" name="In Transit Tracking" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="transitStatus" name="Transit status" type="enum" required="true">
          <camunda:value id="in_transit" name="In transit"/>
          <camunda:value id="delayed" name="Delayed"/>
          <camunda:value id="incident" name="Incident en route"/>
        </camunda:formProperty>
        <camunda:formProperty id="currentLocation" name="Current location" type="string" required="false"/>
        <camunda:formProperty id="transitNotes" name="Transit notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="a7" sourceRef="in_transit" targetRef="receive"/>
    <userTask id="receive" name="Receive at Destination" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="receivedCondition" name="Received condition" type="enum" required="true">
          <camunda:value id="good" name="Good"/>
          <camunda:value id="damaged" name="Damaged"/>
          <camunda:value id="discrepancy" name="Discrepancy"/>
        </camunda:formProperty>
        <camunda:formProperty id="receiptNotes" name="Receipt notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="a8" sourceRef="receive" targetRef="reconcile"/>
    <userTask id="reconcile" name="Reconcile Asset Register" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="registerUpdated" name="Asset register updated?" type="enum" required="true">
          <camunda:value id="yes" name="Yes"/>
          <camunda:value id="no" name="No"/>
        </camunda:formProperty>
        <camunda:formProperty id="reconciliationNotes" name="Reconciliation notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="a9" sourceRef="reconcile" targetRef="end_ok"/>
    <endEvent id="end_ok" name="Closed"/>
    <userTask id="notify_reject" name="Notify Rejection" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="rejectionReason" name="Rejection reason communicated" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="a10" sourceRef="notify_reject" targetRef="end_rej"/>
    <endEvent id="end_rej" name="Rejected"/>
  </process>
</definitions>$BPMN$,
  '{}'::jsonb,
  1,
  'active'
),
(
  'f0000000-0000-0000-0000-000000000007',
  'a0000000-0000-0000-0000-000000000001',
  'convoy',
  'Convoy',
  'Convoy planning and security clearance',
  'Field & Logistics',
  $BPMN$<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="convoy" name="Convoy" isExecutable="true">
    <startEvent camunda:formFields="%5B%7B%22key%22%3A%20%22route%22%2C%20%22label%22%3A%20%22Route%20%28origin%20to%20destination%29%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22departureWindow%22%2C%20%22label%22%3A%20%22Departure%20window%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22vehicles%22%2C%20%22label%22%3A%20%22Vehicles%22%2C%20%22type%22%3A%20%22number%22%2C%20%22required%22%3A%20false%7D%2C%20%7B%22key%22%3A%20%22highRisk%22%2C%20%22label%22%3A%20%22High-risk%20corridor%22%2C%20%22type%22%3A%20%22checkbox%22%2C%20%22required%22%3A%20false%7D%5D"  id="start" name="Convoy Requested"/>
    <sequenceFlow id="v1" sourceRef="start" targetRef="plan"/>
    <userTask id="plan" name="Plan Convoy" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="routePlan" name="Route plan and rest stops" type="textarea" required="true"/>
        <camunda:formProperty id="estimatedDuration" name="Estimated duration" type="string" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="v2" sourceRef="plan" targetRef="clearance"/>
    <userTask id="clearance" name="Security Clearance" camunda:candidateGroups="security">
      <extensionElements>
        <camunda:formProperty id="cleared" name="Cleared to travel?" type="enum" required="true">
          <camunda:value id="yes" name="Yes - cleared"/>
          <camunda:value id="no" name="No - revise plan"/>
        </camunda:formProperty>
              <camunda:formProperty id="threatAssessment" name="Threat assessment" type="textarea" required="true"/>
        <camunda:formProperty id="clearanceConditions" name="Clearance conditions" type="textarea" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="v3" sourceRef="clearance" targetRef="clr_gw"/>
    <exclusiveGateway id="clr_gw" name="Cleared?"/>
    <sequenceFlow id="v4" sourceRef="clr_gw" targetRef="assign_escort"><conditionExpression>${cleared == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="v5" sourceRef="clr_gw" targetRef="plan"><conditionExpression>${cleared == "no"}</conditionExpression></sequenceFlow>
    <userTask id="assign_escort" name="Assign Escort" camunda:candidateGroups="security">
      <extensionElements>
        <camunda:formProperty id="escortTeam" name="Escort team" type="string" required="true"/>
        <camunda:formProperty id="escortVehicles" name="Escort vehicles" type="number" required="false"/>
        <camunda:formProperty id="escortNotes" name="Escort notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="v6" sourceRef="assign_escort" targetRef="travel"/>
    <userTask id="travel" name="Execute Travel" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="travelOutcome" name="Travel outcome" type="enum" required="true">
          <camunda:value id="completed" name="Completed"/>
          <camunda:value id="incident" name="Incident en route"/>
          <camunda:value id="aborted" name="Aborted"/>
        </camunda:formProperty>
        <camunda:formProperty id="incidentsEnRoute" name="Incidents en route (if any)" type="textarea" required="false"/>
        <camunda:formProperty id="travelNotes" name="Travel notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="v7" sourceRef="travel" targetRef="arrival"/>
    <userTask id="arrival" name="Confirm Arrival" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="arrivalConfirmed" name="Arrival confirmed?" type="enum" required="true">
          <camunda:value id="yes" name="Yes"/>
          <camunda:value id="no" name="No"/>
        </camunda:formProperty>
        <camunda:formProperty id="arrivalNotes" name="Arrival notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="v8" sourceRef="arrival" targetRef="end"/>
    <endEvent id="end" name="Closed"/>
  </process>
</definitions>$BPMN$,
  '{}'::jsonb,
  1,
  'active'
),
(
  'f0000000-0000-0000-0000-000000000008',
  'a0000000-0000-0000-0000-000000000001',
  'pdt',
  'Performance Degradation',
  'Performance degradation triage and remediation',
  'Service Operations',
  $BPMN$<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="pdt" name="Performance Degradation" isExecutable="true">
    <startEvent camunda:formFields="%5B%7B%22key%22%3A%20%22kpi%22%2C%20%22label%22%3A%20%22Degraded%20KPI%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22affectedElement%22%2C%20%22label%22%3A%20%22Affected%20element%20/%20cell%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22threshold%22%2C%20%22label%22%3A%20%22Threshold%20breached%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20false%7D%5D"  id="start" name="Degradation Detected"/>
    <sequenceFlow id="d1" sourceRef="start" targetRef="analyze"/>
    <userTask id="analyze" name="Analyze Performance" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="actionNeeded" name="Tuning required?" type="enum" required="true">
          <camunda:value id="yes" name="Yes - tune"/>
          <camunda:value id="no" name="No - within tolerance"/>
        </camunda:formProperty>
              <camunda:formProperty id="degradationCause" name="Degradation cause" type="textarea" required="true"/>
        <camunda:formProperty id="analysisFindings" name="Analysis findings" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="d2" sourceRef="analyze" targetRef="pdt_gw"/>
    <exclusiveGateway id="pdt_gw" name="Tuning Needed?"/>
    <sequenceFlow id="d3" sourceRef="pdt_gw" targetRef="tune"><conditionExpression>${actionNeeded == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="d4" sourceRef="pdt_gw" targetRef="close"><conditionExpression>${actionNeeded == "no"}</conditionExpression></sequenceFlow>
    <userTask id="tune" name="Apply Optimisation" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="optimisationApplied" name="Optimisation applied" type="textarea" required="true"/>
        <camunda:formProperty id="parametersChanged" name="Parameters changed" type="string" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="d5" sourceRef="tune" targetRef="validate"/>
    <userTask id="validate" name="Validate Improvement" camunda:candidateGroups="noc">
      <extensionElements>
        <camunda:formProperty id="improvementConfirmed" name="Improvement confirmed?" type="enum" required="true">
          <camunda:value id="improved" name="Improved"/>
          <camunda:value id="no_change" name="No change"/>
          <camunda:value id="worse" name="Worse"/>
        </camunda:formProperty>
        <camunda:formProperty id="validationNotes" name="Validation notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="d6" sourceRef="validate" targetRef="close"/>
    <userTask id="close" name="Close" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="closureNotes" name="Closure summary" type="textarea" required="true"/>
        <camunda:formProperty id="residualRisk" name="Residual risk" type="string" required="false"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="d7" sourceRef="close" targetRef="end"/>
    <endEvent id="end" name="Closed"/>
  </process>
</definitions>$BPMN$,
  '{}'::jsonb,
  1,
  'active'
),
(
  'f0000000-0000-0000-0000-000000000009',
  'a0000000-0000-0000-0000-000000000001',
  'security_audit',
  'Security Audit',
  'Security audit execution and findings closure',
  'Security Operations',
  $BPMN$<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="security_audit" name="Security Audit" isExecutable="true">
    <startEvent camunda:formFields="%5B%7B%22key%22%3A%20%22auditScope%22%2C%20%22label%22%3A%20%22Audit%20scope%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22auditType%22%2C%20%22label%22%3A%20%22Audit%20type%22%2C%20%22type%22%3A%20%22select%22%2C%20%22required%22%3A%20true%2C%20%22options%22%3A%20%22physical_security%2Caccess_control%2Ccompliance%2Csite_survey%22%7D%2C%20%7B%22key%22%3A%20%22siteCode%22%2C%20%22label%22%3A%20%22Site%20/%20area%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%5D"  id="start" name="Audit Raised"/>
    <sequenceFlow id="u1" sourceRef="start" targetRef="schedule"/>
    <userTask id="schedule" name="Schedule Audit" camunda:candidateGroups="security">
      <extensionElements>
        <camunda:formProperty id="auditDate" name="Audit date" type="date" required="true"/>
        <camunda:formProperty id="auditTeam" name="Audit team" type="string" required="false"/>
        <camunda:formProperty id="scheduleNotes" name="Scheduling notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="u2" sourceRef="schedule" targetRef="conduct"/>
    <userTask id="conduct" name="Conduct Audit" camunda:candidateGroups="security">
      <extensionElements>
        <camunda:formProperty id="findings" name="Findings raised?" type="enum" required="true">
          <camunda:value id="yes" name="Yes - remediation needed"/>
          <camunda:value id="no" name="No - compliant"/>
        </camunda:formProperty>
              <camunda:formProperty id="severity" name="Highest finding severity" type="enum" required="false">
          <camunda:value id="low" name="Low"/>
          <camunda:value id="medium" name="Medium"/>
          <camunda:value id="high" name="High"/>
          <camunda:value id="critical" name="Critical"/>
        </camunda:formProperty>
        <camunda:formProperty id="findingsSummary" name="Findings summary" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="u3" sourceRef="conduct" targetRef="find_gw"/>
    <exclusiveGateway id="find_gw" name="Findings?"/>
    <sequenceFlow id="u4" sourceRef="find_gw" targetRef="remediate"><conditionExpression>${findings == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="u5" sourceRef="find_gw" targetRef="close"><conditionExpression>${findings == "no"}</conditionExpression></sequenceFlow>
    <userTask id="remediate" name="Remediate Findings" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="remediationStatus" name="Remediation status" type="enum" required="true">
          <camunda:value id="completed" name="Completed"/>
          <camunda:value id="partial" name="Partial"/>
          <camunda:value id="deferred" name="Deferred"/>
        </camunda:formProperty>
        <camunda:formProperty id="remediationActions" name="Remediation actions" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="u6" sourceRef="remediate" targetRef="verify"/>
    <userTask id="verify" name="Verify Remediation" camunda:candidateGroups="security">
      <extensionElements>
        <camunda:formProperty id="verificationResult" name="Verification result" type="enum" required="true">
          <camunda:value id="passed" name="Passed"/>
          <camunda:value id="failed" name="Failed"/>
        </camunda:formProperty>
        <camunda:formProperty id="verificationNotes" name="Verification notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="u7" sourceRef="verify" targetRef="close"/>
    <userTask id="close" name="Close Audit" camunda:candidateGroups="security">
      <extensionElements>
        <camunda:formProperty id="auditOutcome" name="Audit outcome" type="enum" required="true">
          <camunda:value id="compliant" name="Compliant"/>
          <camunda:value id="compliant_with_actions" name="Compliant with actions"/>
          <camunda:value id="non_compliant" name="Non-compliant"/>
        </camunda:formProperty>
        <camunda:formProperty id="closureNotes" name="Closure summary" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="u8" sourceRef="close" targetRef="end"/>
    <endEvent id="end" name="Closed"/>
  </process>
</definitions>$BPMN$,
  '{}'::jsonb,
  1,
  'active'
),
(
  'f0000000-0000-0000-0000-00000000000a',
  'a0000000-0000-0000-0000-000000000001',
  'spare_parts',
  'Spare Parts',
  'Spare parts request and fulfillment',
  'Field & Logistics',
  $BPMN$<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="spare_parts" name="Spare Parts" isExecutable="true">
    <startEvent camunda:formFields="%5B%7B%22key%22%3A%20%22partType%22%2C%20%22label%22%3A%20%22Part%20/%20component%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22quantity%22%2C%20%22label%22%3A%20%22Quantity%22%2C%20%22type%22%3A%20%22number%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22siteCode%22%2C%20%22label%22%3A%20%22Destination%20site%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22faultyAssetRef%22%2C%20%22label%22%3A%20%22Faulty%20asset%20reference%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20false%7D%5D"  id="start" name="Part Requested"/>
    <sequenceFlow id="s1" sourceRef="start" targetRef="stock_check"/>
    <userTask id="stock_check" name="Stock Check" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="inStock" name="In stock?" type="enum" required="true">
          <camunda:value id="yes" name="Yes - issue from stock"/>
          <camunda:value id="no" name="No - procure"/>
        </camunda:formProperty>
              <camunda:formProperty id="availableQty" name="Available quantity" type="number" required="false"/>
        <camunda:formProperty id="stockNotes" name="Stock check notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s2" sourceRef="stock_check" targetRef="stock_gw"/>
    <exclusiveGateway id="stock_gw" name="In Stock?"/>
    <sequenceFlow id="s3" sourceRef="stock_gw" targetRef="issue_part"><conditionExpression>${inStock == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="s4" sourceRef="stock_gw" targetRef="procure"><conditionExpression>${inStock == "no"}</conditionExpression></sequenceFlow>
    <userTask id="procure" name="Procure Part" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="poNumber" name="Purchase order number" type="string" required="false"/>
        <camunda:formProperty id="supplier" name="Supplier" type="string" required="false"/>
        <camunda:formProperty id="expectedDelivery" name="Expected delivery" type="date" required="false"/>
        <camunda:formProperty id="procurementNotes" name="Procurement notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s5" sourceRef="procure" targetRef="issue_part"/>
    <userTask id="issue_part" name="Issue Part" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="issuedQty" name="Quantity issued" type="number" required="true"/>
        <camunda:formProperty id="batchSerial" name="Batch / serial" type="string" required="false"/>
        <camunda:formProperty id="issueNotes" name="Issue notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s6" sourceRef="issue_part" targetRef="dispatch"/>
    <userTask id="dispatch" name="Dispatch to Site" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="dispatchMethod" name="Dispatch method" type="enum" required="true">
          <camunda:value id="road" name="Road"/>
          <camunda:value id="courier" name="Courier"/>
          <camunda:value id="internal" name="Internal"/>
        </camunda:formProperty>
        <camunda:formProperty id="trackingRef" name="Tracking reference" type="string" required="false"/>
        <camunda:formProperty id="dispatchNotes" name="Dispatch notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s7" sourceRef="dispatch" targetRef="install"/>
    <userTask id="install" name="Install / Replace" camunda:candidateGroups="field_engineer">
      <extensionElements>
        <camunda:formProperty id="installOutcome" name="Install outcome" type="enum" required="true">
          <camunda:value id="installed" name="Installed"/>
          <camunda:value id="failed" name="Failed"/>
          <camunda:value id="pending" name="Pending"/>
        </camunda:formProperty>
        <camunda:formProperty id="installNotes" name="Installation notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s8" sourceRef="install" targetRef="return_faulty"/>
    <userTask id="return_faulty" name="Return Faulty Part" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="returnStatus" name="Return status" type="enum" required="true">
          <camunda:value id="returned" name="Returned to store"/>
          <camunda:value id="rma_raised" name="RMA raised"/>
          <camunda:value id="scrapped" name="Scrapped"/>
          <camunda:value id="na" name="Not applicable"/>
        </camunda:formProperty>
        <camunda:formProperty id="returnNotes" name="Return notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="s9" sourceRef="return_faulty" targetRef="end"/>
    <endEvent id="end" name="Closed"/>
  </process>
</definitions>$BPMN$,
  '{}'::jsonb,
  1,
  'active'
),
(
  'f0000000-0000-0000-0000-00000000000b',
  'a0000000-0000-0000-0000-000000000001',
  'theft',
  'Theft',
  'Theft incident reporting and investigation',
  'Security Operations',
  $BPMN$<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:camunda="http://activiti.org/bpmn" targetNamespace="http://bpm.local">
  <process id="theft" name="Theft" isExecutable="true">
    <startEvent camunda:formFields="%5B%7B%22key%22%3A%20%22assetRef%22%2C%20%22label%22%3A%20%22Stolen%20/%20missing%20asset%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22siteCode%22%2C%20%22label%22%3A%20%22Site%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20true%7D%2C%20%7B%22key%22%3A%20%22discoveredBy%22%2C%20%22label%22%3A%20%22Discovered%20by%22%2C%20%22type%22%3A%20%22text%22%2C%20%22required%22%3A%20false%7D%2C%20%7B%22key%22%3A%20%22incidentSummary%22%2C%20%22label%22%3A%20%22What%20happened%22%2C%20%22type%22%3A%20%22textarea%22%2C%20%22required%22%3A%20true%7D%5D"  id="start" name="Theft Reported"/>
    <sequenceFlow id="t1" sourceRef="start" targetRef="secure_scene"/>
    <userTask id="secure_scene" name="Secure Scene and Assess" camunda:candidateGroups="security">
      <extensionElements>
        <camunda:formProperty id="sceneSecured" name="Scene secured?" type="enum" required="true">
          <camunda:value id="yes" name="Yes"/>
          <camunda:value id="no" name="No"/>
        </camunda:formProperty>
        <camunda:formProperty id="initialAssessment" name="Initial assessment" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="t2" sourceRef="secure_scene" targetRef="investigate"/>
    <userTask id="investigate" name="Investigate" camunda:candidateGroups="security">
      <extensionElements>
        <camunda:formProperty id="recovered" name="Asset recovered?" type="enum" required="true">
          <camunda:value id="yes" name="Yes - recovered"/>
          <camunda:value id="no" name="No - file report"/>
        </camunda:formProperty>
              <camunda:formProperty id="suspectedCause" name="Suspected cause" type="enum" required="false">
          <camunda:value id="break_in" name="Break-in"/>
          <camunda:value id="insider" name="Insider"/>
          <camunda:value id="vandalism" name="Vandalism"/>
          <camunda:value id="unknown" name="Unknown"/>
        </camunda:formProperty>
        <camunda:formProperty id="investigationFindings" name="Investigation findings" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="t3" sourceRef="investigate" targetRef="rec_gw"/>
    <exclusiveGateway id="rec_gw" name="Recovered?"/>
    <sequenceFlow id="t4" sourceRef="rec_gw" targetRef="recover"><conditionExpression>${recovered == "yes"}</conditionExpression></sequenceFlow>
    <sequenceFlow id="t5" sourceRef="rec_gw" targetRef="file_fir"><conditionExpression>${recovered == "no"}</conditionExpression></sequenceFlow>
    <userTask id="recover" name="Recover and Reinstate Asset" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="assetCondition" name="Recovered asset condition" type="enum" required="true">
          <camunda:value id="good" name="Good"/>
          <camunda:value id="damaged" name="Damaged"/>
        </camunda:formProperty>
        <camunda:formProperty id="recoveryDetails" name="Recovery details" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="t6" sourceRef="recover" targetRef="close"/>
    <userTask id="file_fir" name="File Police Report (FIR)" camunda:candidateGroups="security">
      <extensionElements>
        <camunda:formProperty id="firNumber" name="FIR / report number" type="string" required="true"/>
        <camunda:formProperty id="policeStation" name="Police station" type="string" required="false"/>
        <camunda:formProperty id="firNotes" name="Report notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="t7" sourceRef="file_fir" targetRef="write_off"/>
    <userTask id="write_off" name="Asset Write-Off" camunda:candidateGroups="logistics">
      <extensionElements>
        <camunda:formProperty id="writeOffValue" name="Write-off value" type="number" required="false"/>
        <camunda:formProperty id="writeOffApproved" name="Write-off approved?" type="enum" required="true">
          <camunda:value id="yes" name="Yes"/>
          <camunda:value id="no" name="No"/>
        </camunda:formProperty>
        <camunda:formProperty id="writeOffNotes" name="Write-off notes" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="t8" sourceRef="write_off" targetRef="close"/>
    <userTask id="close" name="Review and Close" camunda:candidateGroups="security">
      <extensionElements>
        <camunda:formProperty id="rootCause" name="Root cause" type="textarea" required="true"/>
        <camunda:formProperty id="preventiveMeasures" name="Preventive measures" type="textarea" required="true"/>
        <camunda:formProperty id="closureNotes" name="Closure summary" type="textarea" required="true"/>
      </extensionElements>
    </userTask>
    <sequenceFlow id="t9" sourceRef="close" targetRef="end"/>
    <endEvent id="end" name="Closed"/>
  </process>
</definitions>$BPMN$,
  '{}'::jsonb,
  1,
  'active'
);

-- ─── Case Sequences ───────────────────────────────────────────────────────
INSERT INTO case_sequences (tenant_id, prefix, next_val) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'INC', 1001),
  ('a0000000-0000-0000-0000-000000000001', 'CHG', 1001),
  ('a0000000-0000-0000-0000-000000000001', 'PRB', 1001),
  ('a0000000-0000-0000-0000-000000000001', 'REQ', 1001);

-- ─── Notification Templates ───────────────────────────────────────────────
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Case Created',       'case_created',       'in_app', 'New case created: {{caseNumber}}',        '<p>Case <strong>{{caseNumber}}</strong> has been created. Type: {{type}}, Priority: {{priority}}.</p>'),
  ('a0000000-0000-0000-0000-000000000001', 'Case Assigned',      'case_assigned',      'in_app', 'Case assigned to you',                    '<p>You have been assigned to case <strong>{{caseId}}</strong>.</p>'),
  ('a0000000-0000-0000-0000-000000000001', 'Case SLA Breach',    'case_sla_breach',    'in_app', 'SLA Breach: {{caseNumber}}',              '<p>Case {{caseNumber}} has breached its SLA. Due: {{dueAt}}.</p>'),
  ('a0000000-0000-0000-0000-000000000001', 'Approval Requested', 'approval_requested', 'in_app', 'Approval required: {{instanceId}}',       '<p>Your approval is required for instance <strong>{{instanceId}}</strong>, step: {{stepName}}. Due: {{dueAt}}.</p>'),
  ('a0000000-0000-0000-0000-000000000001', 'Task Assigned',      'task_assigned',      'in_app', 'New task: {{taskName}}',                  '<p>You have a new task: <strong>{{taskName}}</strong>.</p>'),
  ('a0000000-0000-0000-0000-000000000001', 'Task Reassigned',    'task_reassigned',    'in_app', 'Task reassigned to you',                  '<p>Task <strong>{{taskId}}</strong> has been reassigned to you.</p>'),
  ('a0000000-0000-0000-0000-000000000001', 'Task SLA Breach',    'task_sla_breach',    'in_app', 'SLA Breach: {{taskName}}',                '<p>Task "{{taskName}}" has breached its SLA. Due: {{dueAt}}.</p>')
-- Migrations 023/024/025/029 also seed these tenant-scoped templates and run
-- first; keep the canonical migration copies and skip any that already exist.
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- (Sample connectors moved to seeds-demo/ — demo-only.)
