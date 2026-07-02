-- Migration 012: Ivanti-style type-specific case fields

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS known_error          BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS workaround           TEXT,
  ADD COLUMN IF NOT EXISTS implementation_plan  TEXT,
  ADD COLUMN IF NOT EXISTS backout_plan         TEXT,
  ADD COLUMN IF NOT EXISTS planned_start_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS planned_end_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS catalog_item         VARCHAR(200),
  ADD COLUMN IF NOT EXISTS resolution_code      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS resolution_notes     TEXT,
  ADD COLUMN IF NOT EXISTS escalated            BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at         TIMESTAMPTZ;
-- Note: cases.process_instance_id already exists from migration 004
