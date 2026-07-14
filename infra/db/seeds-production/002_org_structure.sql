-- Seed: QAST Org Structure (org_units + positions)
--
-- Real org chart:
--   QAST (company)
--   ├── IT (division)
--   │     └── OSS/BI (department) — one manager owns both child teams
--   │           ├── BI (team)
--   │           └── OSS (team)
--   └── FM (division)
--         └── FM Safety & Security (department)
--               └── FM Security (team)
--
-- A manager's position lives at the PARENT org unit of the team(s) they own
-- (not one row per team) — confirmed via OrgUnitService.getManagerChain(),
-- which walks up org_units.parent_id and matches an is_manager position at
-- any ancestor level, so a department-level assignment correctly resolves as
-- the approving manager for every child team. See the plan file for the full
-- reasoning. Actual people are attached to these positions by
-- provision-users.mjs (via the org-service API, not raw SQL — see that file
-- for why), which runs after this seed and migrations have applied.

-- ─── Org Units ────────────────────────────────────────────────────────────
INSERT INTO org_units (id, tenant_id, parent_id, type, name, code, level, path, active) VALUES
  ('b1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001', NULL,                                   'company',    'QAST',                     'QAST',       0, '/b1000000-0000-0000-0000-000000000001', true),
  ('b1000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001', 'division',   'IT',                       'IT-DIV',     1, '/b1000000-0000-0000-0000-000000000001/b1000000-0000-0000-0000-000000000002', true),
  ('b1000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002', 'department', 'OSS/BI',                   'OSSBI-DEPT', 2, '/b1000000-0000-0000-0000-000000000001/b1000000-0000-0000-0000-000000000002/b1000000-0000-0000-0000-000000000003', true),
  ('b1000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003', 'team',       'BI',                       'BI-TEAM',    3, '/b1000000-0000-0000-0000-000000000001/b1000000-0000-0000-0000-000000000002/b1000000-0000-0000-0000-000000000003/b1000000-0000-0000-0000-000000000004', true),
  ('b1000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003', 'team',       'OSS',                      'OSS-TEAM',   3, '/b1000000-0000-0000-0000-000000000001/b1000000-0000-0000-0000-000000000002/b1000000-0000-0000-0000-000000000003/b1000000-0000-0000-0000-000000000005', true),
  ('b1000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001', 'division',   'FM',                       'FM-DIV',     1, '/b1000000-0000-0000-0000-000000000001/b1000000-0000-0000-0000-000000000006', true),
  ('b1000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000006', 'department', 'FM Safety & Security',     'FMSEC-DEPT', 2, '/b1000000-0000-0000-0000-000000000001/b1000000-0000-0000-0000-000000000006/b1000000-0000-0000-0000-000000000007', true),
  ('b1000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000007', 'team',       'FM Security',              'FMSEC-TEAM', 3, '/b1000000-0000-0000-0000-000000000001/b1000000-0000-0000-0000-000000000006/b1000000-0000-0000-0000-000000000007/b1000000-0000-0000-0000-000000000008', true)
ON CONFLICT (tenant_id, code) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, type = EXCLUDED.type, name = EXCLUDED.name,
      level = EXCLUDED.level, path = EXCLUDED.path, active = EXCLUDED.active;

-- ─── Positions ────────────────────────────────────────────────────────────
-- One manager-tier position per level (GM/Director/Manager/Team Leader), plus
-- one non-manager "Specialist" position per team (covers both "specialist"
-- and "trainee" — trainee is a label only, carried in the user's metadata by
-- provision-users.mjs, not a separate position/role).
INSERT INTO positions (id, tenant_id, org_unit_id, name, level, is_manager, active) VALUES
  ('c1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','GM',                              10, true,  true),
  ('c1000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000002','IT Director',                     9,  true,  true),
  ('c1000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000006','FM Director',                     9,  true,  true),
  ('c1000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000003','OSS/BI Manager',                  7,  true,  true),
  ('c1000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000007','FM Safety & Security Manager',    7,  true,  true),
  ('c1000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000004','BI Team Leader',                  5,  true,  true),
  ('c1000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000005','OSS Team Leader',                 5,  true,  true),
  ('c1000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000008','FM Security Team Leader',         5,  true,  true),
  ('c1000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000004','BI Specialist',                   3,  false, true),
  ('c1000000-0000-0000-0000-000000000010','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000005','OSS Specialist',                  3,  false, true),
  ('c1000000-0000-0000-0000-000000000011','a0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000008','FM Security Specialist',          3,  false, true)
ON CONFLICT (id) DO UPDATE
  SET org_unit_id = EXCLUDED.org_unit_id, name = EXCLUDED.name,
      level = EXCLUDED.level, is_manager = EXCLUDED.is_manager, active = EXCLUDED.active;
