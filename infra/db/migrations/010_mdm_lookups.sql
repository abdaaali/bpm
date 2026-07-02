-- MDM configurable lookup values (regions, vendors, clusters, etc.)
CREATE TABLE IF NOT EXISTS mdm_lookups (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  type         VARCHAR(64)  NOT NULL,
  value        VARCHAR(255) NOT NULL,
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (type, value)
);

CREATE INDEX IF NOT EXISTS idx_mdm_lookups_type ON mdm_lookups (type);

-- Seed common values
INSERT INTO mdm_lookups (type, value, sort_order) VALUES
  -- Regions
  ('region', 'AMER',        10),
  ('region', 'EMEA',        20),
  ('region', 'APAC',        30),
  ('region', 'LATAM',       40),
  -- Technology Domains
  ('technology_domain', 'Server',      10),
  ('technology_domain', 'Network',     20),
  ('technology_domain', 'Storage',     30),
  ('technology_domain', 'Database',    40),
  ('technology_domain', 'Application', 50),
  ('technology_domain', 'Security',    60),
  -- Vendors
  ('vendor', 'Dell',    10),
  ('vendor', 'HP',      20),
  ('vendor', 'Cisco',   30),
  ('vendor', 'IBM',     40),
  ('vendor', 'VMware',  50),
  -- Clusters
  ('cluster', 'PROD-01',    10),
  ('cluster', 'PROD-02',    20),
  ('cluster', 'DR-01',      30),
  ('cluster', 'DEV-01',     40),
  -- SLA Classes
  ('sla_class', 'Platinum', 10),
  ('sla_class', 'Gold',     20),
  ('sla_class', 'Silver',   30),
  ('sla_class', 'Bronze',   40),
  -- Assignment Groups
  ('assignment_group', 'Infrastructure', 10),
  ('assignment_group', 'Network Ops',    20),
  ('assignment_group', 'DBA Team',       30),
  ('assignment_group', 'App Support',    40),
  -- On-Call Groups
  ('oncall_group', 'NOC',         10),
  ('oncall_group', 'Infra-Oncall', 20),
  ('oncall_group', 'DBA-Oncall',  30)
ON CONFLICT (type, value) DO NOTHING;
