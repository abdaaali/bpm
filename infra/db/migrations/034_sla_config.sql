-- 034_sla_config.sql
-- Configurable SLA: base targets (response/resolve/restore hours by type+priority)
-- and SLA-class multipliers, editable from Administration → SLA Policies.
-- Rows here are OVERRIDES; the code defaults (TARGETS / SLA_CLASS_FACTOR in
-- sla.ts) are the fallback, so the effective SLA is unchanged until a value is
-- edited. No seed is needed — the API returns code defaults merged with overrides.

CREATE TABLE IF NOT EXISTS sla_targets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type           VARCHAR(40) NOT NULL,
  priority       VARCHAR(20) NOT NULL,
  response_hours NUMERIC(8,2) NOT NULL,
  resolve_hours  NUMERIC(8,2) NOT NULL,
  restore_hours  NUMERIC(8,2),               -- nullable: only field/incident types restore
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, type, priority)
);

CREATE TABLE IF NOT EXISTS sla_class_factors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  class_key  VARCHAR(40) NOT NULL,
  factor     NUMERIC(6,3) NOT NULL,           -- multiplier: <1 tighter, >1 looser
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, class_key)
);

CREATE INDEX IF NOT EXISTS idx_sla_targets_tenant       ON sla_targets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sla_class_factors_tenant ON sla_class_factors(tenant_id);
