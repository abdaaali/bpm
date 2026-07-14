-- Seed: QAST Roles (12-role template)
--
-- Same as seeds/001_core_data.sql's demo roles, with one intentional
-- divergence: IT Engineer gains analytics:read here. This role is assigned to
-- QAST's BI/OSS specialists/trainees (see provision-users.mjs) — BI staff
-- need Reports access (every /api/v1/reports/* route requires analytics:read),
-- which the demo baseline's IT Engineer doesn't grant since it was never used
-- for a BI-flavored team there. Role assignment for biadmin and the real
-- people happens via provision-users.mjs (POST /users with roleIds), not here.
INSERT INTO roles (id, tenant_id, name, key, permissions, system_role) VALUES
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Administrator',     'admin',              '["*"]', true),
  ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Requester',         'requester',          '["cases:read","cases:create","tasks:read","processes:read"]', false),
  ('d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Manager',           'manager',            '["cases:read","cases:create","cases:update","cases:assign","cases:resolve","cases:close","cases:link","cases:workorder","tasks:*","approvals:*","processes:read","rca:*","mdm:read","mdm:write","contractors:read","contractors:dispatch","contractors:manage","org:read","audit:read","notifications:manage","analytics:read"]', false),
  ('d0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','Finance Controller','finance_controller', '["cases:read","approvals:read","approvals:decide","tasks:read","processes:read"]', false),
  ('d0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','CAB Member',        'cab_member',         '["cases:read","approvals:read","approvals:decide","tasks:read","processes:read"]', false),
  ('d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','IT Engineer',       'it_engineer',        '["cases:read","cases:update","cases:workorder","tasks:read","tasks:claim","tasks:complete","processes:read","mdm:read","analytics:read"]', false),
  ('d0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','NOC Operator',      'noc',                '["cases:read","cases:create","cases:update","cases:assign","cases:resolve","cases:link","cases:workorder","tasks:*","processes:read","rca:read","mdm:read","analytics:read"]', false),
  ('d0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','Field Engineer',    'field_engineer',     '["cases:read","cases:update","cases:workorder","tasks:read","tasks:claim","tasks:complete","processes:read","mdm:read"]', false),
  ('d0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','Security Operations','security',          '["cases:read","cases:create","cases:update","cases:resolve","cases:close","cases:link","tasks:*","processes:read","rca:*","analytics:read"]', false),
  ('d0000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001','Logistics',         'logistics',          '["cases:read","cases:create","cases:update","cases:workorder","cases:link","tasks:*","processes:read","contractors:read","contractors:dispatch","mdm:read"]', false),
  ('d0000000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000001','Approver',          'approver',           '["cases:read","approvals:read","approvals:decide","tasks:read","processes:read"]', false),
  ('d0000000-0000-0000-0000-000000000012','a0000000-0000-0000-0000-000000000001','Process Designer',  'process_designer',   '["processes:*","cases:read","analytics:read"]', false)
ON CONFLICT (tenant_id, key) DO UPDATE
  SET name = EXCLUDED.name, permissions = EXCLUDED.permissions, system_role = EXCLUDED.system_role;
