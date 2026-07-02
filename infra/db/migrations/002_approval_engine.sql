-- Migration 002: Approval Engine

-- Approval Policies
CREATE TABLE approval_policies (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name         VARCHAR(255) NOT NULL,
  description  TEXT,
  process_key  VARCHAR(100),
  version      INTEGER      NOT NULL DEFAULT 1,
  active       BOOLEAN      NOT NULL DEFAULT true,
  steps        JSONB        NOT NULL DEFAULT '[]',
  conditions   JSONB        NOT NULL DEFAULT '{}',
  created_by   UUID         REFERENCES users(id),
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_approval_policies_tenant ON approval_policies(tenant_id);

-- Approval Instances (one per submitted approval request)
CREATE TABLE approval_instances (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_id           UUID        NOT NULL REFERENCES approval_policies(id),
  entity_type         VARCHAR(100) NOT NULL,
  entity_id           UUID        NOT NULL,
  requester_id        UUID        NOT NULL REFERENCES users(id),
  context             JSONB       NOT NULL DEFAULT '{}',
  status              VARCHAR(50) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','cancelled','escalated')),
  resolved_steps      JSONB       NOT NULL DEFAULT '[]',  -- immutable snapshot of who will approve
  current_step_index  INTEGER     NOT NULL DEFAULT 0,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_approval_inst_tenant ON approval_instances(tenant_id);
CREATE INDEX idx_approval_inst_entity ON approval_instances(entity_type, entity_id);
CREATE INDEX idx_approval_inst_status ON approval_instances(status);
CREATE INDEX idx_approval_inst_req    ON approval_instances(requester_id);

-- Individual step decisions
CREATE TABLE approval_step_decisions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id     UUID        NOT NULL REFERENCES approval_instances(id) ON DELETE CASCADE,
  tenant_id       UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  step_index      INTEGER     NOT NULL,
  step_id         VARCHAR(100) NOT NULL,
  approver_id     UUID        NOT NULL REFERENCES users(id),
  delegated_from  UUID        REFERENCES users(id),
  decision        VARCHAR(50) CHECK (decision IN ('approved','rejected','delegated','escalated')),
  comment         TEXT,
  decided_at      TIMESTAMPTZ,
  due_at          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_asd_instance  ON approval_step_decisions(instance_id);
CREATE INDEX idx_asd_approver  ON approval_step_decisions(approver_id);
CREATE INDEX idx_asd_undecided ON approval_step_decisions(approver_id, decided_at)
  WHERE decided_at IS NULL;

-- Delegation (out-of-office / temporary delegation)
CREATE TABLE delegations (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delegator_id  UUID    NOT NULL REFERENCES users(id),
  delegate_id   UUID    NOT NULL REFERENCES users(id),
  reason        TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  start_date    DATE    NOT NULL,
  end_date      DATE    NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date),
  CHECK (delegator_id != delegate_id)
);
CREATE INDEX idx_delegations_delegator ON delegations(delegator_id);
CREATE INDEX idx_delegations_active    ON delegations(active, start_date, end_date);
