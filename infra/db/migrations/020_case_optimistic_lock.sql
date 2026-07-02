-- 020_case_optimistic_lock.sql
-- Phase 0.3: optimistic concurrency control on cases. With ~20 operators, two
-- people can edit the same case at once; without this, the second save silently
-- overwrites the first (lost update). Every mutation bumps `version`; a writer
-- that supplies a stale `expected_version` is rejected (HTTP 409). Idempotent.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
