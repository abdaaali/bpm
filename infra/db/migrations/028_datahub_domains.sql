-- 028_datahub_domains.sql
-- DataHub extension domains beyond Sites: vendors, route matrix, calendars,
-- workforce, spares. Uniform shape (code/name + a typed `data` JSONB) so new
-- domains are cheap to add; queried generically by the DataHub service. The
-- route matrix additionally refines the travel-aware Hybrid SLA.

CREATE TABLE IF NOT EXISTS datahub_vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  code VARCHAR(60) NOT NULL, name VARCHAR(200) NOT NULL,
  data JSONB NOT NULL DEFAULT '{}', active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);
CREATE TABLE IF NOT EXISTS datahub_routes (LIKE datahub_vendors INCLUDING ALL);
CREATE TABLE IF NOT EXISTS datahub_calendars (LIKE datahub_vendors INCLUDING ALL);
CREATE TABLE IF NOT EXISTS datahub_workforce (LIKE datahub_vendors INCLUDING ALL);
CREATE TABLE IF NOT EXISTS datahub_spares (LIKE datahub_vendors INCLUDING ALL);

-- ── Seeds ──
INSERT INTO datahub_vendors (tenant_id, code, name, data) VALUES
 ('a0000000-0000-0000-0000-000000000001','VND-HUAWEI','Huawei Managed Services','{"category":"OEM","slaHours":4,"escalationEmail":"noc@huawei.example","escalationPhone":"+100","region":"National"}'),
 ('a0000000-0000-0000-0000-000000000001','VND-TOWERCO','TowerCo Field Ops','{"category":"Field","slaHours":8,"escalationEmail":"ops@towerco.example","escalationPhone":"+101","region":"Southern"}'),
 ('a0000000-0000-0000-0000-000000000001','VND-SECURE','SecureGuard Convoy','{"category":"Security","slaHours":6,"escalationEmail":"dispatch@secure.example","escalationPhone":"+102","region":"Frontier"}')
ON CONFLICT (tenant_id, code) DO NOTHING;

-- Route matrix (support center → site); refines per-site travel in the Hybrid SLA.
INSERT INTO datahub_routes (tenant_id, code, name, data) VALUES
 ('a0000000-0000-0000-0000-000000000001','RT-SOUTH-REMOTE44','NOC-South → Desert Relay 44','{"fromCenter":"NOC-South","toSiteCode":"BTS-REMOTE-44","distanceKm":240,"baseTravelMinutes":210,"roadFactor":1.3,"securityFactor":1.2}'),
 ('a0000000-0000-0000-0000-000000000001','RT-SOUTH-HIRISK77','NOC-South → Border Tower 77','{"fromCenter":"NOC-South","toSiteCode":"BTS-HIRISK-77","distanceKm":300,"baseTravelMinutes":180,"roadFactor":1.3,"securityFactor":1.6}')
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO datahub_calendars (tenant_id, code, name, data) VALUES
 ('a0000000-0000-0000-0000-000000000001','CAL-24X7','24x7 Operations','{"type":"24x7"}'),
 ('a0000000-0000-0000-0000-000000000001','CAL-BIZ','Business Hours','{"type":"business_hours","startHour":9,"endHour":17,"workdays":"Mon-Fri","blackouts":[]}')
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO datahub_workforce (tenant_id, code, name, data) VALUES
 ('a0000000-0000-0000-0000-000000000001','WF-SAMI','Sami Tariq','{"role":"field_engineer","skills":["BTS","Microwave"],"region":"Capital","available":true}'),
 ('a0000000-0000-0000-0000-000000000001','WF-RANA','Rana Aziz','{"role":"field_engineer","skills":["Power","Fiber"],"region":"Southern","available":true}')
ON CONFLICT (tenant_id, code) DO NOTHING;

INSERT INTO datahub_spares (tenant_id, code, name, data) VALUES
 ('a0000000-0000-0000-0000-000000000001','SP-RRU-2100','RRU 2100MHz','{"partType":"RRU","quantity":12,"location":"WH1","reorderLevel":4}'),
 ('a0000000-0000-0000-0000-000000000001','SP-BAT-48V','48V Battery String','{"partType":"Battery","quantity":3,"location":"WH1","reorderLevel":6}')
ON CONFLICT (tenant_id, code) DO NOTHING;
