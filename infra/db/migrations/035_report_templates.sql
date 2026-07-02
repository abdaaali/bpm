-- 035_report_templates.sql
-- Report Generator: saved report templates (data source + column/filter/sort config).
-- Reports themselves are run live against existing tables; only the reusable
-- definition is persisted here. created_by stores the caller identity (Keycloak
-- sub) as opaque text — no users(id) FK so it tolerates non-internal identities.

CREATE TABLE IF NOT EXISTS report_templates (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  data_source  VARCHAR(60)  NOT NULL,
  config       JSONB        NOT NULL DEFAULT '{}',  -- { columns, filters, sort, limit }
  created_by   VARCHAR(255),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_tenant ON report_templates(tenant_id);
