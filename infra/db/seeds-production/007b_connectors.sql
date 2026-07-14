-- Seed: QAST Example Connectors
--
-- Same 3 example connectors as seeds-demo/001_demo_users.sql, minus anything
-- demo-branded — these just illustrate the 3 available connector types
-- (rest, kafka_producer, cron) as a starting reference. All seeded 'inactive'
-- so nothing fires until an admin reviews and activates one. Real QAST
-- integrations get added later via Admin > Connectors.
INSERT INTO connectors (id, tenant_id, name, type, config, trigger_config, status) VALUES
  ('f2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Generic REST Webhook','rest',
   '{"url": "https://httpbin.org/post", "method": "POST", "headers": {"Content-Type": "application/json"}}'::jsonb,'{}'::jsonb,'inactive'),
  ('f2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Kafka Event Publisher','kafka_producer',
   '{"topic": "bpm.external.events"}'::jsonb,'{}'::jsonb,'inactive'),
  ('f2000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Hourly Health Check','cron',
   '{"url": "https://httpbin.org/get", "method": "GET"}'::jsonb,'{"schedule": "every_1h"}'::jsonb,'inactive')
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, type = EXCLUDED.type, config = EXCLUDED.config,
      trigger_config = EXCLUDED.trigger_config, updated_at = NOW();
