-- 032_fix_qualification_status.sql
-- Bug: adding a contractor company with status "Qualified" or "Disqualified"
-- returned 500. The contractor UI offers pending/qualified/disqualified/
-- suspended, but 013's CHECK only allowed active/suspended/pending/expired, so
-- those values violated the constraint. Align the DB to the UI vocabulary and
-- migrate existing rows (active → qualified, expired → disqualified).

ALTER TABLE external_companies
  DROP CONSTRAINT IF EXISTS external_companies_qualification_status_check;

UPDATE external_companies SET qualification_status = 'qualified'    WHERE qualification_status = 'active';
UPDATE external_companies SET qualification_status = 'disqualified' WHERE qualification_status = 'expired';

ALTER TABLE external_companies
  ADD CONSTRAINT external_companies_qualification_status_check
  CHECK (qualification_status IN ('pending','qualified','disqualified','suspended'));
