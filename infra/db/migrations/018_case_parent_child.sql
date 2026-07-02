-- 018_case_parent_child.sql
-- Parent-child relationships between cases (tickets). Enables assigning a Work
-- Order from a ticket as a child record, and the framework's cross-record links
-- (e.g. Problem ← Incidents, Asset Movement → Theft Case). Additive, idempotent.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS parent_case_id    UUID REFERENCES cases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS case_relationship VARCHAR(50);   -- semantic of the link to the parent (e.g. work_order, child_incident, caused_by)

CREATE INDEX IF NOT EXISTS idx_cases_parent ON cases(parent_case_id);

-- Allow 'work_order' as a case type so a WO can be a first-class child ticket.
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_type_check;
ALTER TABLE cases ADD CONSTRAINT cases_type_check CHECK (
  type IN ('incident','problem','change','request','alarm','work_order')
);
