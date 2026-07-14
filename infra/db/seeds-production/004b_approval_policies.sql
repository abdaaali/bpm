-- Seed: QAST Approval Policies
--
-- Same 3 policies as seeds/001_core_data.sql (Purchase Request, Change
-- Management CAB, Incident Escalation) — the process definitions' manager-
-- approval steps route through these via approval-service's hierarchyLevel/
-- roleKey resolution (getManagerChain), so the processes need these to
-- actually route approvals to real people. Same tenant id as before (see
-- 001_tenant.sql) — no re-pointing needed. Idempotent via fixed ids +
-- ON CONFLICT(id) DO UPDATE. created_by left NULL — no fixed admin user id
-- to reference (biadmin's id is Keycloak/API-generated, not fixed) and the
-- column is nullable.
INSERT INTO approval_policies (id, tenant_id, name, description, process_key, active, steps, conditions, created_by) VALUES
(
  'e1000000-0000-0000-0000-000000000001',
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
  NULL
),
(
  'e1000000-0000-0000-0000-000000000002',
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
  NULL
),
(
  'e1000000-0000-0000-0000-000000000003',
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
  NULL
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, process_key = EXCLUDED.process_key,
      active = EXCLUDED.active, steps = EXCLUDED.steps, conditions = EXCLUDED.conditions, updated_at = NOW();
