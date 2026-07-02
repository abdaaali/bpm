-- ============================================================
-- Seed 004: Contractor Portal Demo Data
-- Telecom Operator demo scenario:
--   - 3 external companies
--   - 6 external users
--   - 5 sample work order assignments
-- Password for all external users: Contractor123!
-- BCrypt hash generated with salt rounds=10
-- ============================================================

-- ── External Companies ──────────────────────────────────────

INSERT INTO external_companies (id, tenant_id, company_name, company_type, parent_company_id,
  qualification_status, active, contact_email, contact_phone, region_scope, capabilities, created_at, updated_at)
VALUES
  (
    'b1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'Alpha Field Services',
    'contractor',
    NULL,
    'qualified',
    true,
    'operations@alpha-field.example.com',
    '+1-555-0100',
    ARRAY['North', 'Central', 'South'],
    ARRAY['RAN', 'transmission', 'power', 'civil', 'fiber'],
    NOW(), NOW()
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'Beta Tower Works',
    'subcontractor',
    'b1000000-0000-0000-0000-000000000001',   -- parent: Alpha Field Services
    'qualified',
    true,
    'contact@beta-tower.example.com',
    '+1-555-0200',
    ARRAY['North', 'Central'],
    ARRAY['civil', 'tower', 'grounding'],
    NOW(), NOW()
  ),
  (
    'b1000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'Gamma Power Services',
    'contractor',
    NULL,
    'qualified',
    true,
    'ops@gamma-power.example.com',
    '+1-555-0300',
    ARRAY['South', 'East'],
    ARRAY['power', 'generator', 'UPS', 'rectifier'],
    NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ── External Users ──────────────────────────────────────────
-- Password: Contractor123!
-- Hash: $2b$10$xqJwxWBTzr.TvCeIwBIUwOLDVBEoOHJZxHLsAj/G/FoRwElF1FIcq
-- (pre-computed bcrypt hash — replace with real hash in production)

INSERT INTO external_users (id, tenant_id, external_company_id, username, email, full_name,
  role, active, password_hash, mfa_enabled, created_at, updated_at)
VALUES
  -- Alpha Field Services
  (
    'e2000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'alpha.supervisor',
    'alpha.supervisor@alpha-field.example.com',
    'Ahmed Al-Hassan',
    'company_admin',
    true,
    '$2a$10$QgvLHKnrzfDQOjqnZTEureTRrjWyDcawd3VbrCCg0q.ArqU3hGegC',
    false,
    NOW(), NOW()
  ),
  (
    'e2000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000001',
    'alpha.tech1',
    'alpha.tech1@alpha-field.example.com',
    'Carlos Mendez',
    'technician',
    true,
    '$2a$10$QgvLHKnrzfDQOjqnZTEureTRrjWyDcawd3VbrCCg0q.ArqU3hGegC',
    false,
    NOW(), NOW()
  ),
  -- Beta Tower Works
  (
    'e2000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000002',
    'beta.supervisor',
    'beta.supervisor@beta-tower.example.com',
    'Yuki Tanaka',
    'supervisor',
    true,
    '$2a$10$QgvLHKnrzfDQOjqnZTEureTRrjWyDcawd3VbrCCg0q.ArqU3hGegC',
    false,
    NOW(), NOW()
  ),
  (
    'e2000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000002',
    'beta.tech1',
    'beta.tech1@beta-tower.example.com',
    'James Osei',
    'technician',
    true,
    '$2a$10$QgvLHKnrzfDQOjqnZTEureTRrjWyDcawd3VbrCCg0q.ArqU3hGegC',
    false,
    NOW(), NOW()
  ),
  -- Gamma Power Services
  (
    'e2000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000003',
    'gamma.supervisor',
    'gamma.supervisor@gamma-power.example.com',
    'Fatima Al-Rashidi',
    'supervisor',
    true,
    '$2a$10$QgvLHKnrzfDQOjqnZTEureTRrjWyDcawd3VbrCCg0q.ArqU3hGegC',
    false,
    NOW(), NOW()
  ),
  (
    'e2000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000001',
    'b1000000-0000-0000-0000-000000000003',
    'gamma.tech1',
    'gamma.tech1@gamma-power.example.com',
    'Marco Bianchi',
    'technician',
    true,
    '$2a$10$QgvLHKnrzfDQOjqnZTEureTRrjWyDcawd3VbrCCg0q.ArqU3hGegC',
    false,
    NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ── Sample Work Order Assignments ──────────────────────────
-- Link to first 5 available cases from the demo data

DO $$
DECLARE
  case_ids UUID[];
  internal_user_id UUID := 'c0000000-0000-0000-0000-000000000001'; -- admin user
BEGIN
  -- Get first 5 case IDs
  SELECT ARRAY(
    SELECT id FROM cases
    WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001'
    ORDER BY created_at ASC
    LIMIT 5
  ) INTO case_ids;

  -- Only insert if we have cases
  IF array_length(case_ids, 1) >= 1 THEN
    -- WO1: Generator preventive maintenance → Alpha, pending acceptance
    INSERT INTO work_order_assignments (id, tenant_id, case_id, assigned_company_id, assigned_user_id,
      assignment_type, assignment_status, assigned_by_internal_user_id, assigned_at, due_at,
      sla_hours, instructions, created_at, updated_at)
    VALUES (
      'f3000000-0000-0000-0000-000000000001',
      'a0000000-0000-0000-0000-000000000001',
      case_ids[1],
      'b1000000-0000-0000-0000-000000000001',   -- Alpha Field Services
      'e2000000-0000-0000-0000-000000000001',   -- alpha.supervisor
      'supervisor', 'pending',
      internal_user_id,
      NOW() - INTERVAL '2 days',
      NOW() + INTERVAL '3 days',
      48, 'Perform annual generator preventive maintenance. Check oil level, test auto-start, inspect batteries. Submit before/after photos.',
      NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
    ) ON CONFLICT (id) DO NOTHING;
  END IF;

  IF array_length(case_ids, 1) >= 2 THEN
    -- WO2: RAN equipment replacement → Alpha tech, in_progress
    INSERT INTO work_order_assignments (id, tenant_id, case_id, assigned_company_id, assigned_user_id,
      assignment_type, assignment_status, assigned_by_internal_user_id, assigned_at, accepted_at, due_at,
      sla_hours, instructions, created_at, updated_at)
    VALUES (
      'f3000000-0000-0000-0000-000000000002',
      'a0000000-0000-0000-0000-000000000001',
      case_ids[2],
      'b1000000-0000-0000-0000-000000000001',   -- Alpha Field Services
      'e2000000-0000-0000-0000-000000000002',   -- alpha.tech1
      'technician', 'in_progress',
      internal_user_id,
      NOW() - INTERVAL '1 day',
      NOW() - INTERVAL '12 hours',
      NOW() + INTERVAL '2 days',
      24, 'Replace faulty RRU unit. Capture old serial number and new serial number. Test RF output. Submit evidence photos.',
      NOW() - INTERVAL '1 day', NOW() - INTERVAL '12 hours'
    ) ON CONFLICT (id) DO NOTHING;
  END IF;

  IF array_length(case_ids, 1) >= 3 THEN
    -- WO3: Tower inspection → Beta Tower Works, submitted awaiting review
    INSERT INTO work_order_assignments (id, tenant_id, case_id, assigned_company_id, assigned_user_id,
      assignment_type, assignment_status, assigned_by_internal_user_id, assigned_at, accepted_at, completed_at, due_at,
      sla_hours, instructions, created_at, updated_at)
    VALUES (
      'f3000000-0000-0000-0000-000000000003',
      'a0000000-0000-0000-0000-000000000001',
      case_ids[3],
      'b1000000-0000-0000-0000-000000000002',   -- Beta Tower Works
      'e2000000-0000-0000-0000-000000000003',   -- beta.supervisor
      'supervisor', 'submitted',
      internal_user_id,
      NOW() - INTERVAL '5 days',
      NOW() - INTERVAL '4 days',
      NOW() - INTERVAL '1 day',
      NOW() - INTERVAL '2 days',
      72, 'Conduct full tower structural inspection. Check antenna mounting, earthing, lighting. Complete inspection checklist.',
      NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 day'
    ) ON CONFLICT (id) DO NOTHING;
  END IF;

  IF array_length(case_ids, 1) >= 4 THEN
    -- WO4: Power fault restoration → Gamma Power, rework_required
    INSERT INTO work_order_assignments (id, tenant_id, case_id, assigned_company_id, assigned_user_id,
      assignment_type, assignment_status, assigned_by_internal_user_id, assigned_at, accepted_at, due_at,
      sla_hours, instructions, rework_count, created_at, updated_at)
    VALUES (
      'f3000000-0000-0000-0000-000000000004',
      'a0000000-0000-0000-0000-000000000001',
      case_ids[4],
      'b1000000-0000-0000-0000-000000000003',   -- Gamma Power Services
      'e2000000-0000-0000-0000-000000000005',   -- gamma.supervisor
      'supervisor', 'rework_required',
      internal_user_id,
      NOW() - INTERVAL '3 days',
      NOW() - INTERVAL '2 days',
      NOW() - INTERVAL '6 hours',
      24, 'Restore power fault on site. Check rectifier alarms, replace blown fuses, test battery backup. Submission was incomplete - please resubmit with rectifier alarm screenshots.',
      1,
      NOW() - INTERVAL '3 days', NOW() - INTERVAL '6 hours'
    ) ON CONFLICT (id) DO NOTHING;
  END IF;

  IF array_length(case_ids, 1) >= 5 THEN
    -- WO5: Site access request → Alpha, closed/completed
    INSERT INTO work_order_assignments (id, tenant_id, case_id, assigned_company_id, assigned_user_id,
      assignment_type, assignment_status, assigned_by_internal_user_id, assigned_at, accepted_at, completed_at, due_at,
      sla_hours, instructions, created_at, updated_at)
    VALUES (
      'f3000000-0000-0000-0000-000000000005',
      'a0000000-0000-0000-0000-000000000001',
      case_ids[5],
      'b1000000-0000-0000-0000-000000000001',   -- Alpha Field Services
      'e2000000-0000-0000-0000-000000000001',   -- alpha.supervisor
      'company', 'closed',
      internal_user_id,
      NOW() - INTERVAL '7 days',
      NOW() - INTERVAL '6 days',
      NOW() - INTERVAL '5 days',
      NOW() - INTERVAL '4 days',
      24, 'Site access for cable tray inspection. Complete sign-in/sign-out register. Submit visit report.',
      NOW() - INTERVAL '7 days', NOW() - INTERVAL '5 days'
    ) ON CONFLICT (id) DO NOTHING;
  END IF;

END$$;

-- ── Demo Submissions for existing assignments ────────────────

-- Acceptance submission for WO2 (in_progress)
INSERT INTO external_submissions (id, tenant_id, assignment_id, submitted_by, submission_type, notes, submitted_at)
SELECT
  'a4000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000002',
  'e2000000-0000-0000-0000-000000000002',
  'acceptance',
  'Assignment accepted. Will start work tomorrow morning.',
  NOW() - INTERVAL '12 hours'
WHERE EXISTS (SELECT 1 FROM work_order_assignments WHERE id = 'f3000000-0000-0000-0000-000000000002')
ON CONFLICT (id) DO NOTHING;

-- Completion submission for WO3 (submitted)
INSERT INTO external_submissions (id, tenant_id, assignment_id, submitted_by, submission_type, notes, payload, submitted_at)
SELECT
  'a4000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000003',
  'e2000000-0000-0000-0000-000000000003',
  'completion',
  'Tower inspection completed. All structural elements in good condition. Antenna mounts secure. Earthing resistance within spec.',
  '{"checklist_complete": true, "earthing_resistance_ohm": 2.3, "antenna_count": 6, "issues_found": 0}'::jsonb,
  NOW() - INTERVAL '1 day'
WHERE EXISTS (SELECT 1 FROM work_order_assignments WHERE id = 'f3000000-0000-0000-0000-000000000003')
ON CONFLICT (id) DO NOTHING;

-- First completion attempt for WO4 (rework_required)
INSERT INTO external_submissions (id, tenant_id, assignment_id, submitted_by, submission_type, notes, submitted_at)
SELECT
  'a4000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000004',
  'e2000000-0000-0000-0000-000000000005',
  'completion',
  'Fuses replaced and power restored.',
  NOW() - INTERVAL '1 day'
WHERE EXISTS (SELECT 1 FROM work_order_assignments WHERE id = 'f3000000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

-- Closure submission for WO5 (closed)
INSERT INTO external_submissions (id, tenant_id, assignment_id, submitted_by, submission_type, notes, submitted_at)
SELECT
  'a4000000-0000-0000-0000-000000000004',
  'a0000000-0000-0000-0000-000000000001',
  'f3000000-0000-0000-0000-000000000005',
  'e2000000-0000-0000-0000-000000000001',
  'completion',
  'Cable tray inspection complete. No issues found. Visit register signed.',
  NOW() - INTERVAL '5 days'
WHERE EXISTS (SELECT 1 FROM work_order_assignments WHERE id = 'f3000000-0000-0000-0000-000000000005')
ON CONFLICT (id) DO NOTHING;

-- Rework request comment for WO4
INSERT INTO case_comments (id, case_id, tenant_id, author_id, body, internal, created_at, updated_at)
SELECT
  gen_random_uuid(),
  c.id,
  c.tenant_id,
  (SELECT id FROM users WHERE tenant_id = c.tenant_id LIMIT 1),
  '[Rework Requested] Submission was incomplete - please resubmit with rectifier alarm screenshots showing cleared alarms.',
  false,
  NOW() - INTERVAL '6 hours',
  NOW() - INTERVAL '6 hours'
FROM work_order_assignments woa
JOIN cases c ON c.id = woa.case_id
WHERE woa.id = 'f3000000-0000-0000-0000-000000000004';

-- ============================================================
-- Summary:
-- External companies: Alpha Field Services, Beta Tower Works, Gamma Power Services
-- External users: alpha.supervisor, alpha.tech1, beta.supervisor, beta.tech1, gamma.supervisor, gamma.tech1
-- Password: Contractor123!
-- URL: http://localhost:8081 (contractor portal)
-- ============================================================
