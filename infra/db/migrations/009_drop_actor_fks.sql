-- Migration 009: Drop FK constraints on actor/assignee/author columns
-- Keycloak user UUIDs differ from the seeded DB user UUIDs.
-- These columns store identity references (Keycloak sub) that are valid UUIDs
-- but do not need referential integrity against the local users table.

ALTER TABLE cases               DROP CONSTRAINT IF EXISTS cases_assignee_id_fkey;
ALTER TABLE cases               DROP CONSTRAINT IF EXISTS cases_requester_id_fkey;
ALTER TABLE tasks               DROP CONSTRAINT IF EXISTS tasks_assignee_id_fkey;
ALTER TABLE audit_log           DROP CONSTRAINT IF EXISTS audit_log_actor_id_fkey;
ALTER TABLE case_comments        DROP CONSTRAINT IF EXISTS case_comments_author_id_fkey;
ALTER TABLE process_instances   DROP CONSTRAINT IF EXISTS process_instances_initiator_id_fkey;
ALTER TABLE approval_instances  DROP CONSTRAINT IF EXISTS approval_instances_requester_id_fkey;
ALTER TABLE approval_policies   DROP CONSTRAINT IF EXISTS approval_policies_created_by_fkey;
ALTER TABLE approval_step_decisions DROP CONSTRAINT IF EXISTS approval_step_decisions_approver_id_fkey;
ALTER TABLE approval_step_decisions DROP CONSTRAINT IF EXISTS approval_step_decisions_delegated_from_fkey;
ALTER TABLE attachments         DROP CONSTRAINT IF EXISTS attachments_uploaded_by_fkey;
ALTER TABLE notifications       DROP CONSTRAINT IF EXISTS notifications_recipient_id_fkey;
