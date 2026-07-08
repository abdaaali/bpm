-- Tracks fork "cohorts" spawned by parallel/inclusive gateways so the matching
-- converging gateway waits for exactly the branches that were actually
-- activated before proceeding, instead of re-firing once per arriving branch.
CREATE TABLE gateway_forks (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id     UUID         NOT NULL REFERENCES process_instances(id) ON DELETE CASCADE,
  fork_node_id    VARCHAR(255) NOT NULL,
  expected_count  INTEGER      NOT NULL,
  -- Links a nested fork back to the branch of its parent fork it lives on, so
  -- that branch's continuation is correctly re-attributed after this inner
  -- join resolves.
  parent_fork_id  UUID         REFERENCES gateway_forks(id) ON DELETE CASCADE,
  parent_flow_id  VARCHAR(255),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_gateway_forks_instance ON gateway_forks(instance_id);

-- One row per branch that has reached a given join node for a fork cohort.
-- The unique constraint makes arrival recording idempotent against retries.
CREATE TABLE gateway_arrivals (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  fork_id       UUID         NOT NULL REFERENCES gateway_forks(id) ON DELETE CASCADE,
  join_node_id  VARCHAR(255) NOT NULL,
  flow_id       VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(fork_id, join_node_id, flow_id)
);

-- Which fork cohort / activated flow a task's branch belongs to, so the
-- branch's fork context survives the (possibly long) wait for the task to
-- be completed by a human, and can resume correctly at the join.
ALTER TABLE tasks ADD COLUMN fork_id UUID;
ALTER TABLE tasks ADD COLUMN flow_id VARCHAR(255);
