-- Migration 006: Immutable Audit Log

CREATE TABLE audit_log (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type  VARCHAR(100) NOT NULL,
  entity_id    UUID         NOT NULL,
  action       VARCHAR(100) NOT NULL,
  actor_id     UUID         REFERENCES users(id),
  actor_email  VARCHAR(255),
  before_state JSONB,
  after_state  JSONB,
  diff         JSONB,
  ip_address   INET,
  user_agent   TEXT,
  metadata     JSONB        DEFAULT '{}',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_tenant  ON audit_log(tenant_id);
CREATE INDEX idx_audit_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_actor   ON audit_log(actor_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- Immutability rules
CREATE OR REPLACE RULE audit_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE OR REPLACE RULE audit_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;
