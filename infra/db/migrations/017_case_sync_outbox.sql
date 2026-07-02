-- 017_case_sync_outbox.sql
-- Phase C5: durable alarm⇄case synchronisation outbox.
-- Alarm-driven case state changes are enqueued here and delivered by the
-- integration-hub worker with exponential backoff + dead-letter, so a transient
-- case-service outage never loses an alarm resolution. Idempotent.

CREATE TABLE IF NOT EXISTS case_sync_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id       VARCHAR(255) NOT NULL,             -- case id
  action          VARCHAR(30)  NOT NULL,             -- 'resolve'
  payload         JSONB        NOT NULL DEFAULT '{}',
  status          VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | delivered | dead
  attempts        INT          NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outbox_due ON case_sync_outbox(status, next_attempt_at);
