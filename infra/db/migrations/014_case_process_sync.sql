-- 014_case_process_sync.sql
-- Phase C1: keep tasks linked to their case.
--
-- createTask() now stamps tasks.case_id from the owning process instance.
-- This backfills tasks created before that change so existing rows inherit the
-- case link from their instance. Additive and idempotent.

UPDATE tasks t
   SET case_id = pi.case_id
  FROM process_instances pi
 WHERE t.process_instance_id = pi.id
   AND t.case_id IS NULL
   AND pi.case_id IS NOT NULL;

-- Helpful index for case → tasks lookups (no-op if it already exists).
CREATE INDEX IF NOT EXISTS idx_tasks_case ON tasks(case_id);
