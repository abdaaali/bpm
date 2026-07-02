-- 027_auto_links.sql
-- Rule-driven cross-process auto-linking. When a case matches a known pattern,
-- the platform creates a related case of the right type and links them — e.g.
-- an asset movement needing an escort spawns a Convoy, recurring incidents
-- spawn a Problem, an audit's missing asset spawns a Theft case. The created
-- case is marked with the rule that produced it (provenance + dedup).

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS auto_rule VARCHAR(60);   -- rule id that auto-created this case

CREATE INDEX IF NOT EXISTS idx_cases_auto_rule ON cases(tenant_id, auto_rule) WHERE auto_rule IS NOT NULL;
