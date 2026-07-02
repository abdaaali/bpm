-- Migration 004: Cases / ITIL Objects

CREATE TABLE cases (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  case_number          VARCHAR(50)  NOT NULL,
  type                 VARCHAR(50)  NOT NULL
                       CHECK (type IN ('incident','problem','change','request','alarm')),
  title                VARCHAR(500) NOT NULL,
  description          TEXT,
  status               VARCHAR(50)  NOT NULL DEFAULT 'new'
                       CHECK (status IN ('new','open','in_progress','pending','pending_approval',
                                         'approved','rejected','resolved','closed','cancelled')),
  priority             VARCHAR(20)  NOT NULL DEFAULT 'medium'
                       CHECK (priority IN ('low','medium','high','critical')),
  impact               VARCHAR(20)  DEFAULT 'medium'
                       CHECK (impact IN ('low','medium','high','critical')),
  urgency              VARCHAR(20)  DEFAULT 'medium'
                       CHECK (urgency IN ('low','medium','high','critical')),
  category             VARCHAR(100),
  subcategory          VARCHAR(100),
  change_type          VARCHAR(50)  CHECK (change_type IN ('standard','normal','emergency')),
  risk_level           VARCHAR(20)  CHECK (risk_level IN ('low','medium','high','critical')),
  requester_id         UUID         NOT NULL REFERENCES users(id),
  assignee_id          UUID         REFERENCES users(id),
  assigned_team_id     UUID         REFERENCES org_units(id),
  process_instance_id  UUID         REFERENCES process_instances(id),
  approval_instance_id UUID         REFERENCES approval_instances(id),
  context              JSONB        NOT NULL DEFAULT '{}',
  sla_due_at           TIMESTAMPTZ,
  breached             BOOLEAN      NOT NULL DEFAULT false,
  resolved_at          TIMESTAMPTZ,
  closed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_cases_number   ON cases(tenant_id, case_number);
CREATE INDEX idx_cases_tenant          ON cases(tenant_id);
CREATE INDEX idx_cases_type            ON cases(type);
CREATE INDEX idx_cases_status          ON cases(status);
CREATE INDEX idx_cases_assignee        ON cases(assignee_id);
CREATE INDEX idx_cases_requester       ON cases(requester_id);
CREATE INDEX idx_cases_sla             ON cases(sla_due_at) WHERE breached = false;

-- Sequence counter per tenant/prefix
CREATE TABLE case_sequences (
  tenant_id UUID         NOT NULL REFERENCES tenants(id),
  prefix    VARCHAR(10)  NOT NULL,
  next_val  INTEGER      NOT NULL DEFAULT 1,
  PRIMARY KEY (tenant_id, prefix)
);

-- Case comments / work notes
CREATE TABLE case_comments (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id    UUID    NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  tenant_id  UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_id  UUID    NOT NULL REFERENCES users(id),
  body       TEXT    NOT NULL,
  internal   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comments_case ON case_comments(case_id);

-- Resolve forward-references to cases
ALTER TABLE tasks ADD CONSTRAINT fk_tasks_case
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

ALTER TABLE process_instances ADD CONSTRAINT fk_proc_inst_case
  FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE SET NULL;

-- Attachments (MinIO-backed)
CREATE TABLE attachments (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type   VARCHAR(100) NOT NULL,
  entity_id     UUID         NOT NULL,
  filename      VARCHAR(500) NOT NULL,
  content_type  VARCHAR(200),
  size_bytes    BIGINT,
  storage_path  TEXT         NOT NULL,
  uploaded_by   UUID         NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);
