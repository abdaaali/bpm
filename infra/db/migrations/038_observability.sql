-- 038_observability.sql
-- Read-only login role for Grafana's Administration dashboard. SELECT-only on
-- the whole public schema (current + future tables). Password must match the
-- GRAFANA_DB_PASSWORD env passed to the grafana container (default below).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
    CREATE ROLE grafana_ro LOGIN PASSWORD 'grafana_ro_2024';
  END IF;
END$$;

GRANT CONNECT ON DATABASE bpm_db TO grafana_ro;
GRANT USAGE ON SCHEMA public TO grafana_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grafana_ro;
