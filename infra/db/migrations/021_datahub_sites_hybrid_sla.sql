-- 021_datahub_sites_hybrid_sla.sql
-- Operational DataHub — Sites + travel conditions (the SLA-critical domain) — and
-- the case fields for the travel-aware Hybrid SLA. A site 4h away must not be
-- measured like one in the city; SLA = fixed operational targets + DataHub travel
-- allowance, snapshotted onto the case for historical reproducibility.

CREATE TABLE IF NOT EXISTS datahub_sites (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  site_code           VARCHAR(50)  NOT NULL,
  name                VARCHAR(200) NOT NULL,
  region              VARCHAR(100),
  access_class        VARCHAR(20)  NOT NULL DEFAULT 'urban'
                      CHECK (access_class IN ('urban','near_urban','remote','high_risk','restricted')),
  support_center      VARCHAR(100),                 -- dispatch origin
  base_travel_minutes INTEGER      NOT NULL DEFAULT 30,
  max_travel_minutes  INTEGER      NOT NULL DEFAULT 480,
  road_factor         NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  security_factor     NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  seasonal_factor     NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  access_delay_minutes INTEGER     NOT NULL DEFAULT 0,
  convoy_required     BOOLEAN      NOT NULL DEFAULT false,
  escort_required     BOOLEAN      NOT NULL DEFAULT false,
  working_hours       VARCHAR(20)  NOT NULL DEFAULT '24x7',
  sla_class           VARCHAR(20),
  version             INTEGER      NOT NULL DEFAULT 1,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT datahub_sites_code_unique UNIQUE (tenant_id, site_code)
);

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS affected_site_id UUID REFERENCES datahub_sites(id),
  ADD COLUMN IF NOT EXISTS sla_breakdown    JSONB;   -- snapshot of components + DataHub values used

-- ── Seed reference sites (urban → high-risk), illustrating travel-aware SLA ──
INSERT INTO datahub_sites
  (tenant_id, site_code, name, region, access_class, support_center, base_travel_minutes, max_travel_minutes,
   road_factor, security_factor, seasonal_factor, access_delay_minutes, convoy_required, escort_required, working_hours, sla_class)
VALUES
  ('a0000000-0000-0000-0000-000000000001','BTS-CITY-01','Central City BTS','Capital','urban','NOC-Central',30,180,1.0,1.0,1.0,10,false,false,'24x7','gold'),
  ('a0000000-0000-0000-0000-000000000001','BTS-NEAR-12','Ring-Road BTS','Capital','near_urban','NOC-Central',60,240,1.1,1.0,1.0,15,false,false,'24x7','gold'),
  ('a0000000-0000-0000-0000-000000000001','BTS-REMOTE-44','Desert Relay 44','Southern','remote','NOC-South',180,600,1.2,1.1,1.0,30,false,false,'24x7','silver'),
  ('a0000000-0000-0000-0000-000000000001','BTS-HIRISK-77','Border Tower 77','Frontier','high_risk','NOC-South',150,600,1.2,1.5,1.1,45,true,true,'24x7','silver')
ON CONFLICT (tenant_id, site_code) DO NOTHING;
