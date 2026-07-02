-- 033_reschedule_response.sql
-- Close the reschedule loop: a contractor's reschedule_request was logged in
-- external_submissions but had no status and no way to be approved/rejected.
-- Add a response lifecycle so internal staff can decide and the contractor sees
-- the outcome on the work order.

ALTER TABLE external_submissions
  ADD COLUMN IF NOT EXISTS status        TEXT,
  ADD COLUMN IF NOT EXISTS responded_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS responded_by  UUID,
  ADD COLUMN IF NOT EXISTS response_note TEXT;

-- Existing reschedule requests surface as pending for review.
UPDATE external_submissions
   SET status = 'pending'
 WHERE submission_type = 'reschedule_request' AND status IS NULL;
