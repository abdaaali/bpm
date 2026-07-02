-- 036_management_digest.sql
-- Weekly Management Digest: scheduled governance report delivered by email.
-- One config row per tenant, a recipient list, and an immutable run history.
-- Digest content is generated live from analytics/cases/approvals; only the
-- rendered HTML of each run is persisted (in digest_runs.body_html) for replay.

CREATE TABLE IF NOT EXISTS digest_config (
  tenant_id     UUID         PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled       BOOLEAN      NOT NULL DEFAULT true,
  channel       VARCHAR(20)  NOT NULL DEFAULT 'email',
  schedule_type VARCHAR(40)  NOT NULL DEFAULT 'weekly_monday_8',
  sections      JSONB        NOT NULL DEFAULT '["operational_dashboard","telecom_operations","approval_workflows","backlog_overview"]',
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS digest_recipients (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email      VARCHAR(320) NOT NULL,
  type       VARCHAR(20)  NOT NULL DEFAULT 'email',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS digest_runs (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_code   VARCHAR(40)  NOT NULL,
  type       VARCHAR(20)  NOT NULL,                 -- SCHEDULED | MANUAL_SEND
  status     VARCHAR(20)  NOT NULL DEFAULT 'SENT',  -- SENT | FAILED
  recipients JSONB        NOT NULL DEFAULT '[]',
  subject    TEXT,
  body_html  TEXT,
  error      TEXT,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_digest_runs_tenant ON digest_runs(tenant_id, created_at DESC);

-- Default config for the demo tenant.
INSERT INTO digest_config (tenant_id)
VALUES ('a0000000-0000-0000-0000-000000000001')
ON CONFLICT (tenant_id) DO NOTHING;

-- Sample management recipient for the demo tenant.
INSERT INTO digest_recipients (tenant_id, email, type)
VALUES ('a0000000-0000-0000-0000-000000000001', 'a.meissa@sd.zain.com', 'email')
ON CONFLICT (tenant_id, email) DO NOTHING;

-- Email template used for delivery (raw-HTML passthrough via triple-stache).
INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body)
SELECT 'a0000000-0000-0000-0000-000000000001', 'Weekly Management Digest', 'weekly_management_digest', 'both', '{{subject}}', '{{{bodyHtml}}}'
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE tenant_id = 'a0000000-0000-0000-0000-000000000001' AND slug = 'weekly_management_digest'
);
