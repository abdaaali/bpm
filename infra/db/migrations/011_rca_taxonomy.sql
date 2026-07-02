-- Migration 011: Root Cause Analysis taxonomy + cases columns

-- Root cause taxonomy lookup table
CREATE TABLE IF NOT EXISTS root_cause_taxonomy (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  category      VARCHAR(100) NOT NULL,
  subcategory   VARCHAR(100) NOT NULL,
  description   TEXT,
  UNIQUE(category, subcategory)
);

-- Seed with ITIL-aligned taxonomy (8 categories, 32 subcategories)
INSERT INTO root_cause_taxonomy(category, subcategory) VALUES
  ('Hardware',      'Server Failure'),
  ('Hardware',      'Network Equipment'),
  ('Hardware',      'Storage Failure'),
  ('Hardware',      'Power Supply'),
  ('Software',      'Application Bug'),
  ('Software',      'OS/Kernel Issue'),
  ('Software',      'Configuration Error'),
  ('Software',      'Dependency Failure'),
  ('Network',       'Connectivity Loss'),
  ('Network',       'Bandwidth Saturation'),
  ('Network',       'DNS/Routing Issue'),
  ('Network',       'Firewall/ACL'),
  ('Security',      'Unauthorized Access'),
  ('Security',      'Vulnerability Exploit'),
  ('Security',      'Policy Violation'),
  ('Security',      'Malware/Ransomware'),
  ('Process',       'Procedure Not Followed'),
  ('Process',       'Missing Runbook'),
  ('Process',       'Approval Delay'),
  ('Process',       'Handoff Failure'),
  ('Capacity',      'CPU Overload'),
  ('Capacity',      'Memory Exhaustion'),
  ('Capacity',      'Disk Full'),
  ('Capacity',      'License Limit'),
  ('Third Party',   'Vendor Outage'),
  ('Third Party',   'SaaS Degradation'),
  ('Third Party',   'ISP Issue'),
  ('Third Party',   'Cloud Provider'),
  ('Change',        'Failed Deployment'),
  ('Change',        'Unplanned Change'),
  ('Change',        'Rollback Required'),
  ('Unknown',       'Under Investigation')
ON CONFLICT(category, subcategory) DO NOTHING;

-- Add root cause fields to cases table
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS root_cause_category    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS root_cause_subcategory VARCHAR(100),
  ADD COLUMN IF NOT EXISTS root_cause_description TEXT,
  ADD COLUMN IF NOT EXISTS is_recurring           BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_cases_rca_category ON cases(root_cause_category)
  WHERE root_cause_category IS NOT NULL;
