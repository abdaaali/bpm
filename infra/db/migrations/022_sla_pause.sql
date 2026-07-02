-- 022_sla_pause.sql
-- Runtime SLA pause / exclusion (Telecom framework §16 — gross vs net time).
-- Stops the breach clock while a case is blocked by something outside the team's
-- control (customer dependency, awaiting parts/access, vendor, change window).
-- On resume, the remaining due dates are pushed out by the paused duration, so
-- net working time is what's measured. Every interval is logged for audit.

CREATE TABLE IF NOT EXISTS case_sla_pauses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL,
  case_id          UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  reason           VARCHAR(40) NOT NULL,         -- exclusion code (see PAUSE_REASONS)
  note             TEXT,
  paused_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resumed_at       TIMESTAMPTZ,                  -- null while the pause is open
  duration_minutes INTEGER,                      -- filled on resume
  paused_by        UUID,
  resumed_by       UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_case_sla_pauses_case ON case_sla_pauses(case_id);
-- At most one open (un-resumed) pause per case.
CREATE UNIQUE INDEX IF NOT EXISTS uq_case_sla_pause_open
  ON case_sla_pauses(case_id) WHERE resumed_at IS NULL;

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS sla_paused              BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_paused_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sla_paused_reason       VARCHAR(40),
  ADD COLUMN IF NOT EXISTS sla_paused_total_minutes INTEGER    NOT NULL DEFAULT 0;
