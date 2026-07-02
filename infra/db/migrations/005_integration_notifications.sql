-- Migration 005: Integration Hub + Notifications

CREATE TABLE connectors (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name             VARCHAR(255) NOT NULL,
  type             VARCHAR(50)  NOT NULL
                   CHECK (type IN ('rest','webhook','kafka_producer','cron')),
  config           JSONB        NOT NULL DEFAULT '{}',
  trigger_config   JSONB        NOT NULL DEFAULT '{}',
  status           VARCHAR(50)  NOT NULL DEFAULT 'inactive'
                   CHECK (status IN ('active','inactive','error')),
  last_run_at      TIMESTAMPTZ,
  last_run_status  VARCHAR(50),
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_connectors_tenant ON connectors(tenant_id);
CREATE INDEX idx_connectors_type   ON connectors(type);
CREATE INDEX idx_connectors_status ON connectors(status);

CREATE TABLE connector_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id     UUID        NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  triggered_by     VARCHAR(100),
  request_payload  JSONB,
  response_payload JSONB,
  status           VARCHAR(50) NOT NULL CHECK (status IN ('success','error','retrying')),
  error_message    TEXT,
  duration_ms      INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_connector_logs_connector ON connector_logs(connector_id);
CREATE INDEX idx_connector_logs_tenant    ON connector_logs(tenant_id);

CREATE TABLE notification_templates (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) NOT NULL,
  channel     VARCHAR(50)  NOT NULL DEFAULT 'in_app'
              CHECK (channel IN ('email','in_app','both')),
  subject     VARCHAR(500),
  body        TEXT         NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, slug)
);
CREATE INDEX idx_notif_templates_tenant ON notification_templates(tenant_id);

CREATE TABLE notifications (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  recipient_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel          VARCHAR(50) NOT NULL DEFAULT 'in_app',
  subject          VARCHAR(500),
  body             TEXT,
  entity_type      VARCHAR(100),
  entity_id        UUID,
  delivery_status  VARCHAR(50) NOT NULL DEFAULT 'delivered',
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_recipient ON notifications(tenant_id, recipient_id, read_at);
CREATE INDEX idx_notif_entity    ON notifications(entity_type, entity_id);
