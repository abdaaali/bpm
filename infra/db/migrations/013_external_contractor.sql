-- ============================================================
-- Migration 013: External Contractor Portal
-- Creates tables for contractor companies, users, work order
-- assignments, submissions, attachments, and audit trail.
-- ============================================================

-- ── External Companies ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_companies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  company_name          TEXT NOT NULL,
  company_type          TEXT NOT NULL DEFAULT 'contractor'
                        CHECK (company_type IN ('contractor','subcontractor','vendor','partner')),
  parent_company_id     UUID REFERENCES external_companies(id) ON DELETE SET NULL,
  qualification_status  TEXT NOT NULL DEFAULT 'pending'
                        CHECK (qualification_status IN ('active','suspended','pending','expired')),
  active                BOOLEAN NOT NULL DEFAULT true,
  contact_email         TEXT,
  contact_phone         TEXT,
  region_scope          TEXT[] DEFAULT '{}',
  capabilities          TEXT[] DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_companies_tenant ON external_companies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ext_companies_type   ON external_companies(tenant_id, company_type);
CREATE INDEX IF NOT EXISTS idx_ext_companies_active ON external_companies(tenant_id, active);

-- ── External Users ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  external_company_id   UUID NOT NULL REFERENCES external_companies(id) ON DELETE CASCADE,
  username              TEXT NOT NULL,
  email                 TEXT NOT NULL,
  full_name             TEXT NOT NULL,
  role                  TEXT NOT NULL DEFAULT 'technician'
                        CHECK (role IN ('company_admin','supervisor','technician','viewer')),
  active                BOOLEAN NOT NULL DEFAULT true,
  password_hash         TEXT NOT NULL,
  last_login_at         TIMESTAMPTZ,
  mfa_enabled           BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email),
  UNIQUE (tenant_id, username)
);

CREATE INDEX IF NOT EXISTS idx_ext_users_tenant   ON external_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ext_users_company  ON external_users(external_company_id);
CREATE INDEX IF NOT EXISTS idx_ext_users_email    ON external_users(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_ext_users_active   ON external_users(tenant_id, active);

-- ── Work Order Assignments ──────────────────────────────────

CREATE TABLE IF NOT EXISTS work_order_assignments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   UUID NOT NULL REFERENCES tenants(id),
  case_id                     UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  assigned_company_id         UUID NOT NULL REFERENCES external_companies(id),
  assigned_user_id            UUID REFERENCES external_users(id),
  assignment_type             TEXT NOT NULL DEFAULT 'company'
                              CHECK (assignment_type IN ('company','supervisor','technician','team')),
  assignment_status           TEXT NOT NULL DEFAULT 'pending'
                              CHECK (assignment_status IN (
                                'pending','accepted','rejected','in_progress',
                                'submitted','rework_required','closed','closed_cancelled'
                              )),
  assigned_by_internal_user_id UUID,
  assigned_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at                      TIMESTAMPTZ,
  accepted_at                 TIMESTAMPTZ,
  rejected_at                 TIMESTAMPTZ,
  rejection_reason            TEXT,
  completed_at                TIMESTAMPTZ,
  rework_count                INT NOT NULL DEFAULT 0,
  instructions                TEXT,
  sla_hours                   INT NOT NULL DEFAULT 24,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_woa_tenant         ON work_order_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_woa_case           ON work_order_assignments(case_id);
CREATE INDEX IF NOT EXISTS idx_woa_company        ON work_order_assignments(assigned_company_id);
CREATE INDEX IF NOT EXISTS idx_woa_user           ON work_order_assignments(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_woa_status         ON work_order_assignments(tenant_id, assignment_status);
CREATE INDEX IF NOT EXISTS idx_woa_due            ON work_order_assignments(due_at);

-- ── External Submissions ────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_submissions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  assignment_id    UUID NOT NULL REFERENCES work_order_assignments(id) ON DELETE CASCADE,
  submitted_by     UUID REFERENCES external_users(id),
  submission_type  TEXT NOT NULL
                   CHECK (submission_type IN (
                     'acceptance','rejection','progress_update','completion',
                     'clarification_request','reschedule_request','rework_submission'
                   )),
  notes            TEXT,
  payload          JSONB DEFAULT '{}',
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_subs_assignment ON external_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_ext_subs_tenant     ON external_submissions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ext_subs_type       ON external_submissions(assignment_id, submission_type);

-- ── Portal Visibility Rules ─────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_visibility_rules (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID NOT NULL REFERENCES tenants(id),
  process_definition_id     UUID,
  task_definition_key       TEXT,
  visible_to_external       BOOLEAN NOT NULL DEFAULT false,
  external_form_template    JSONB DEFAULT '{}',
  external_actions          TEXT[] DEFAULT '{}',
  comment_visibility        TEXT NOT NULL DEFAULT 'external_only'
                            CHECK (comment_visibility IN ('all','external_only','none')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pvr_tenant ON portal_visibility_rules(tenant_id);

-- ── External Attachments ────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_attachments (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL REFERENCES tenants(id),
  assignment_id        UUID NOT NULL REFERENCES work_order_assignments(id) ON DELETE CASCADE,
  uploaded_by          UUID REFERENCES external_users(id),
  file_name            TEXT NOT NULL,
  object_key           TEXT NOT NULL,
  attachment_type      TEXT NOT NULL DEFAULT 'other'
                       CHECK (attachment_type IN ('photo','document','report','signature','other')),
  visibility_scope     TEXT NOT NULL DEFAULT 'shared'
                       CHECK (visibility_scope IN ('internal_only','shared','contractor_only')),
  malware_scan_status  TEXT NOT NULL DEFAULT 'pending'
                       CHECK (malware_scan_status IN ('pending','clean','infected','skipped')),
  file_size_bytes      BIGINT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_att_assignment ON external_attachments(assignment_id);
CREATE INDEX IF NOT EXISTS idx_ext_att_tenant     ON external_attachments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ext_att_scope      ON external_attachments(assignment_id, visibility_scope);

-- ── External Audit Log ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS external_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('external_user','internal_user','system')),
  actor_id      UUID,
  actor_name    TEXT,
  action        TEXT NOT NULL,
  resource_type TEXT,
  resource_id   UUID,
  details       JSONB DEFAULT '{}',
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ext_audit_tenant    ON external_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ext_audit_actor     ON external_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_ext_audit_action    ON external_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_ext_audit_resource  ON external_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_ext_audit_created   ON external_audit_log(created_at);

-- ── Add 'dispatched_external' and 'pending_review' to cases status ──

-- The cases table uses a CHECK constraint; we need to add new statuses.
-- Check if constraint exists before altering:
DO $$
BEGIN
  -- Drop old check constraint if it exists (cases table status check)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cases_status_check'
      AND conrelid = 'cases'::regclass
  ) THEN
    ALTER TABLE cases DROP CONSTRAINT cases_status_check;
  END IF;

  -- Re-add with extended statuses including contractor portal states
  ALTER TABLE cases ADD CONSTRAINT cases_status_check
    CHECK (status IN (
      'new','open','in_progress','pending','pending_approval','approved',
      'pending_review','dispatched_external',
      'resolved','closed','cancelled'
    ));
EXCEPTION WHEN OTHERS THEN
  -- If constraint doesn't exist or table doesn't match, skip gracefully
  RAISE NOTICE 'cases status constraint update skipped: %', SQLERRM;
END$$;

-- ── Summary ─────────────────────────────────────────────────
-- Tables created:
--   external_companies        (contractor/subcontractor company registry)
--   external_users            (contractor portal user accounts)
--   work_order_assignments    (dispatch records linking cases to contractors)
--   external_submissions      (actions taken by contractors)
--   portal_visibility_rules   (per-process field/action visibility config)
--   external_attachments      (files uploaded by contractors via MinIO)
--   external_audit_log        (full audit trail for external portal)
-- Cases table: extended with 'dispatched_external' and 'pending_review' statuses
