-- 019_case_links_and_process_types.sql
-- Telecom Managed Service framework foundation:
--   (1) the 9 operational process types as first-class case types
--   (2) a generic case_links table for associative cross-record relationships
--       (Problem ←investigates→ Incidents, Asset Movement →spawned→ Theft,
--        Asset Movement →requires→ Convoy, etc.), distinct from the hierarchical
--        parent_case_id (parent-child / Work Orders).
-- Additive and idempotent.

-- (1) Expand the case type taxonomy. Existing ITSM/WO types retained.
ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_type_check;
ALTER TABLE cases ADD CONSTRAINT cases_type_check CHECK (type IN (
  -- existing
  'incident','problem','change','request','alarm','work_order',
  -- telecom managed-service processes
  'fault','pdt','theft','security_audit','asset_movement','convoy','spare_part'
));

-- (2) Associative links between cases (many-to-many, typed, directional).
CREATE TABLE IF NOT EXISTS case_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL,
  from_case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  to_case_id   UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  link_type    VARCHAR(50) NOT NULL DEFAULT 'related_to',
  created_by   UUID,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT case_links_unique UNIQUE (from_case_id, to_case_id, link_type),
  CONSTRAINT case_links_no_self CHECK (from_case_id <> to_case_id)
);

CREATE INDEX IF NOT EXISTS idx_case_links_from ON case_links(from_case_id);
CREATE INDEX IF NOT EXISTS idx_case_links_to   ON case_links(to_case_id);
