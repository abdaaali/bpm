-- Migration 003: BPM Process Definitions, Instances, and Tasks

CREATE TABLE process_definitions (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) NOT NULL,
  description   TEXT,
  category      VARCHAR(100),
  bpmn_xml      TEXT,
  config        JSONB        NOT NULL DEFAULT '{}',
  version       INTEGER      NOT NULL DEFAULT 1,
  status        VARCHAR(50)  NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','active','archived')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, slug, version)
);
CREATE INDEX idx_proc_defs_tenant ON process_definitions(tenant_id);
CREATE INDEX idx_proc_defs_slug   ON process_definitions(tenant_id, slug);
CREATE INDEX idx_proc_defs_status ON process_definitions(status);

CREATE TABLE process_instances (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  definition_id   UUID        NOT NULL REFERENCES process_definitions(id),
  business_key    VARCHAR(255),
  status          VARCHAR(50) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','suspended','terminated')),
  variables       JSONB       NOT NULL DEFAULT '{}',
  current_node_id VARCHAR(255),
  initiator_id    UUID        REFERENCES users(id),
  case_id         UUID,       -- FK added after cases table (migration 004)
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_proc_inst_tenant       ON process_instances(tenant_id);
CREATE INDEX idx_proc_inst_def          ON process_instances(definition_id);
CREATE INDEX idx_proc_inst_initiator    ON process_instances(initiator_id);
CREATE INDEX idx_proc_inst_status       ON process_instances(status);
CREATE INDEX idx_proc_inst_business_key ON process_instances(tenant_id, business_key);

CREATE TABLE tasks (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  process_instance_id UUID         REFERENCES process_instances(id) ON DELETE CASCADE,
  case_id             UUID,        -- FK added after cases table (migration 004)
  node_id             VARCHAR(255),
  name                VARCHAR(500) NOT NULL,
  type                VARCHAR(100) NOT NULL DEFAULT 'userTask',
  status              VARCHAR(50)  NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','in_progress','completed','cancelled','escalated')),
  assignee_id         UUID         REFERENCES users(id),
  candidate_groups    JSONB,
  form_key            VARCHAR(255),
  variables           JSONB        NOT NULL DEFAULT '{}',
  outcome             VARCHAR(100),
  due_at              TIMESTAMPTZ,
  sla_hours           NUMERIC,
  sla_breached        BOOLEAN      NOT NULL DEFAULT false,
  claimed_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  comments            JSONB        NOT NULL DEFAULT '[]',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tasks_tenant    ON tasks(tenant_id);
CREATE INDEX idx_tasks_assignee  ON tasks(assignee_id);
CREATE INDEX idx_tasks_process   ON tasks(process_instance_id);
CREATE INDEX idx_tasks_status    ON tasks(status);
CREATE INDEX idx_tasks_due       ON tasks(due_at);
CREATE INDEX idx_tasks_breach    ON tasks(sla_breached) WHERE sla_breached = false;
