-- 031_rca_ml_phase1.sql
-- Offline RCA assist (Phase 1) — no LLM, no internet. Enables trigram text
-- similarity so the platform can find similar past cases and do weighted k-NN
-- root-cause suggestion entirely inside Postgres. (Anomaly detection / robust
-- z-score is computed in Node from aggregate SQL — no schema needed.)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- GiST trigram index over the case's searchable text, so similarity ordering
-- scales as the case history grows.
CREATE INDEX IF NOT EXISTS idx_cases_text_trgm
  ON cases USING gist ((lower(title || ' ' || coalesce(description, ''))) gist_trgm_ops);
