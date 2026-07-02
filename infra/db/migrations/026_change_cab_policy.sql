-- 026_change_cab_policy.sql
-- Fix: the change_management approval policy had its CAB step gated on
-- risk_level in (high,critical) and a hierarchy step needing a manager chain, so
-- a normal change (or a requester with no manager) resolved ZERO approvers and
-- parked the case forever with nothing to approve. CAB review is the change gate
-- and must apply to every change; the director step stays emergency-only.
-- The CAB step is parallel=true (any one CAB member's approval advances) — a
-- role step resolves to ALL cab_members, and with parallel=false it would
-- (incorrectly) require every member to approve before the case could proceed.

UPDATE approval_policies
   SET steps = '[
        {"id":"step_cab","type":"role","label":"CAB Review","roleKey":"cab_member","parallel":true,"slaHours":48,"condition":null},
        {"id":"step_director","type":"hierarchy","label":"IT Director","hierarchyLevel":2,"parallel":false,"slaHours":72,"condition":{"field":"change_type","value":"emergency","operator":"="}}
      ]'::jsonb,
       updated_at = NOW()
 WHERE process_key = 'change_management';
