-- ============================================================
-- 008_mdm_hosts.sql
-- Local MDM Host Registry (used as fallback when MDM_BASE_URL is not set)
-- ============================================================

CREATE TABLE IF NOT EXISTS mdm_hosts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  host_name             VARCHAR(255) NOT NULL,
  ip_address            VARCHAR(50),
  site_id               VARCHAR(255),

  -- MDM canonical / routing fields
  canonical_site_id     VARCHAR(255),
  region                VARCHAR(100),
  cluster               VARCHAR(100),
  vendor                VARCHAR(100),
  technology_domain     VARCHAR(100),
  assignment_group      VARCHAR(255),
  oncall_group          VARCHAR(255),
  sla_class             VARCHAR(100),
  location_path         TEXT,

  -- SLA parameters
  sla_profile_id        VARCHAR(100),
  sla_calendar_id       VARCHAR(100),
  sla_timezone          VARCHAR(100) DEFAULT 'UTC',
  response_time_minutes INTEGER,
  onsite_time_minutes   INTEGER,
  restore_time_minutes  INTEGER,
  travel_time_minutes   INTEGER,
  access_time_minutes   INTEGER,
  access_restrictions   TEXT,

  -- Extra
  notes                 TEXT,
  tags                  JSONB DEFAULT '[]'::jsonb,
  is_active             BOOLEAN NOT NULL DEFAULT true,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mdm_hosts_hostname ON mdm_hosts(host_name);
CREATE INDEX IF NOT EXISTS idx_mdm_hosts_site_id        ON mdm_hosts(site_id);
CREATE INDEX IF NOT EXISTS idx_mdm_hosts_region         ON mdm_hosts(region);
CREATE INDEX IF NOT EXISTS idx_mdm_hosts_active         ON mdm_hosts(is_active);
