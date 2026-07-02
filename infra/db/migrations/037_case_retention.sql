-- 037_case_retention.sql
-- Two-stage retention lifecycle for CLOSED cases/requests only:
--   live (closed)  --[ > archive_after ]-->  archived_cases  --[ > delete_after ]-->  purged
-- Stage 1 snapshots a closed case + its child records into archived_cases as
-- JSONB, then removes it from the live tables (FK cascades clean the children).
-- Stage 2 permanently deletes archive rows older than delete_after.
-- Only status='closed' cases are ever touched. audit_log is never affected.

CREATE TABLE IF NOT EXISTS archived_cases (
  id              UUID PRIMARY KEY,        -- original cases.id
  tenant_id       UUID NOT NULL,
  case_number     VARCHAR(50),
  type            VARCHAR(50),
  title           VARCHAR(500),
  status          VARCHAR(50),
  closed_at       TIMESTAMPTZ,
  case_created_at TIMESTAMPTZ,
  snapshot        JSONB NOT NULL,          -- { case, comments, rca, capa, vendor_escalations, links, work_orders }
  archived_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archived_cases_tenant ON archived_cases(tenant_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_archived_cases_number ON archived_cases(case_number);
CREATE INDEX IF NOT EXISTS idx_archived_cases_archived_at ON archived_cases(archived_at);

CREATE TABLE IF NOT EXISTS retention_runs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trigger            VARCHAR(20) NOT NULL DEFAULT 'scheduled',  -- scheduled | manual
  dry_run            BOOLEAN NOT NULL DEFAULT false,
  archive_after_days INT NOT NULL,
  delete_after_days  INT NOT NULL,
  candidates_archive INT NOT NULL DEFAULT 0,
  archived_count     INT NOT NULL DEFAULT 0,
  candidates_delete  INT NOT NULL DEFAULT 0,
  deleted_count      INT NOT NULL DEFAULT 0,
  duration_ms        INT,
  status             VARCHAR(20) NOT NULL DEFAULT 'success',    -- success | failed
  error              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_retention_runs_at ON retention_runs(run_at DESC);
