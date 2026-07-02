-- Demo users + sample connectors (DEMO ONLY).
-- Loads only when LOAD_DEMO_SEEDS=true (see infra/db/init.sh). NOT loaded in
-- production — clients create their own users in Keycloak + the org module.
-- The platform admin lives in seeds/001_core_data.sql and always loads.

-- ─── Demo Users ─────────────────────────────────────────────────────────────
INSERT INTO users (id, tenant_id, keycloak_id, email, first_name, last_name, username, active) VALUES
  ('c0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','requester1-keycloak-id','requester1@democorp.com','Alice','Johnson', 'requester1', true),
  ('c0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','manager1-keycloak-id',  'manager1@democorp.com',  'Bob',  'Smith',   'manager1',   true),
  ('c0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','finance1-keycloak-id',  'finance1@democorp.com',  'Carol','Finance', 'finance1',   true),
  ('c0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','cab1-keycloak-id',      'cab1@democorp.com',      'Dave', 'CAB',     'cab1',       true),
  ('c0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','engineer1-keycloak-id', 'engineer1@democorp.com', 'Eve',  'Engineer','engineer1',  true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_org_assignments (user_id, tenant_id, org_unit_id, position_id, is_primary) VALUES
  ('c0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000006', true),
  ('c0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','e1000000-0000-0000-0000-000000000003', true),
  ('c0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000006','e1000000-0000-0000-0000-000000000004', true),
  ('c0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000006','e1000000-0000-0000-0000-000000000007', true),
  ('c0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000004','e1000000-0000-0000-0000-000000000005', true)
ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id, tenant_id) VALUES
  ('c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000006','d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- ─── Sample Connectors (demo) ───────────────────────────────────────────────
INSERT INTO connectors (tenant_id, name, type, config, trigger_config, status) VALUES
  ('a0000000-0000-0000-0000-000000000001','Generic REST Webhook','rest',
   '{"url": "https://httpbin.org/post", "method": "POST", "headers": {"Content-Type": "application/json"}}'::jsonb,'{}'::jsonb,'inactive'),
  ('a0000000-0000-0000-0000-000000000001','Kafka Event Publisher','kafka_producer',
   '{"topic": "bpm.external.events"}'::jsonb,'{}'::jsonb,'inactive'),
  ('a0000000-0000-0000-0000-000000000001','Hourly Health Check','cron',
   '{"url": "https://httpbin.org/get", "method": "GET"}'::jsonb,'{"schedule": "every_1h"}'::jsonb,'inactive');
