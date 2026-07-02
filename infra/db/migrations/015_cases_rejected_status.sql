-- 015_cases_rejected_status.sql
-- The case state machine (case.service VALID_TRANSITIONS) supports a 'rejected'
-- status (pending_approval → rejected, used by C2 approval decisions), but a
-- later migration rebuilt cases_status_check without it. Realign the DB
-- constraint with the code so rejections persist. Idempotent.

ALTER TABLE cases DROP CONSTRAINT IF EXISTS cases_status_check;
ALTER TABLE cases ADD CONSTRAINT cases_status_check CHECK (status IN (
  'new','open','in_progress','pending','pending_approval','approved','rejected',
  'pending_review','dispatched_external','resolved','closed','cancelled'
));
