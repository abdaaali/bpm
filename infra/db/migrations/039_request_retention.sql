-- 039_request_retention.sql
-- Extend the retention lifecycle to catalog "requests" — i.e. process_instances
-- in a terminal state (completed / terminated). Same two-stage flow as cases:
--   live (terminal) --[ > archive_after ]--> archived_process_instances --[ > delete_after ]--> purged
-- Safety: cases.process_instance_id is ON DELETE NO ACTION, so a process instance
-- is only archived once NO case references it (the case is archived first, or it
-- never had one). tasks cascade-delete with the instance.

CREATE TABLE IF NOT EXISTS archived_process_instances (
  id                 UUID PRIMARY KEY,        -- original process_instances.id
  tenant_id          UUID NOT NULL,
  definition_id      UUID,
  business_key       VARCHAR(255),
  status             VARCHAR(50),
  started_at         TIMESTAMPTZ,
  completed_at       TIMESTAMPTZ,
  snapshot           JSONB NOT NULL,          -- { instance, tasks }
  archived_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archived_pi_tenant ON archived_process_instances(tenant_id, archived_at DESC);
CREATE INDEX IF NOT EXISTS idx_archived_pi_key ON archived_process_instances(business_key);
CREATE INDEX IF NOT EXISTS idx_archived_pi_archived_at ON archived_process_instances(archived_at);

-- Per-entity breakdown for runs (existing count columns remain the combined totals).
ALTER TABLE retention_runs ADD COLUMN IF NOT EXISTS details JSONB NOT NULL DEFAULT '{}';
