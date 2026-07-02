-- 016_case_sla_tiers.sql
-- Phase C4: structured, tiered SLA on cases.
--   response_due_at — first-response / acknowledge target
--   restore_due_at  — service-restore target (incident/alarm)
--   sla_profile     — which calendar the SLA was computed against (24x7 / business_hours / source label)
-- sla_due_at (existing) remains the primary resolve breach clock.
-- Additive and idempotent.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS sla_profile     VARCHAR(50),
  ADD COLUMN IF NOT EXISTS response_due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restore_due_at  TIMESTAMPTZ;
