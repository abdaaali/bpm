-- Seed: Production Tenant (QAST)
--
-- Reuses the canonical tenant id 'a0000000-0000-0000-0000-000000000001' rather
-- than minting a new one. That id is hardcoded as the fallback tenant across
-- every microservice (JWT-claim-missing default in api-gateway's jwt.strategy.ts,
-- and the `x-tenant-id` header default in every org-service/case-service/
-- bpm-orchestrator/approval-service/notification-service controller) — this
-- platform is single-tenant in practice. Migration 001 already inserts this row
-- with name 'Demo Corp'; this idempotently renames it to QAST, matching the
-- exact rename pattern seeds/001_core_data.sql already uses for the demo tenant.
INSERT INTO tenants (id, name, slug, settings, active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'QAST', 'qast', '{"timezone":"Africa/Khartoum","currency":"USD"}', true)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name, slug = EXCLUDED.slug,
      settings = EXCLUDED.settings, active = EXCLUDED.active;
