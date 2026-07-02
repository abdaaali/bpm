-- Migration 001: Tenants and Organization Structure
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Tenants (multi-tenancy root)
CREATE TABLE tenants (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  settings    JSONB        NOT NULL DEFAULT '{}',
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Base tenant (multi-tenancy root). Created here so later migrations that seed
-- tenant-scoped reference data (023 notification templates, 024/025 SLA, 028
-- datahub domains, 029 vendor escalation, …) have a valid tenant FK — migrations
-- run before core seeds. The core seed re-asserts this row idempotently.
INSERT INTO tenants (id, name, slug, settings, active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Demo Corp', 'demo', '{"timezone":"UTC","currency":"USD"}', true)
ON CONFLICT (id) DO NOTHING;

-- Organization units: Company → Division → Department → Section → Team
CREATE TABLE org_units (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  parent_id   UUID         REFERENCES org_units(id) ON DELETE SET NULL,
  type        VARCHAR(50)  NOT NULL CHECK (type IN ('company','division','department','section','team')),
  name        VARCHAR(255) NOT NULL,
  code        VARCHAR(100),
  level       INTEGER      NOT NULL DEFAULT 0,
  path        TEXT,        -- materialized path e.g. /uuid1/uuid2/uuid3
  metadata    JSONB        NOT NULL DEFAULT '{}',
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);
CREATE INDEX idx_org_units_tenant   ON org_units(tenant_id);
CREATE INDEX idx_org_units_parent   ON org_units(parent_id);
CREATE INDEX idx_org_units_path_trgm ON org_units USING gin(path gin_trgm_ops);

-- Positions (roles/titles within org units)
CREATE TABLE positions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  org_unit_id UUID         NOT NULL REFERENCES org_units(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  level       INTEGER      NOT NULL DEFAULT 0,
  is_manager  BOOLEAN      NOT NULL DEFAULT false,
  metadata    JSONB        NOT NULL DEFAULT '{}',
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_positions_org_unit ON positions(org_unit_id);
CREATE INDEX idx_positions_tenant   ON positions(tenant_id);

-- RBAC Roles
CREATE TABLE roles (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  key         VARCHAR(100) NOT NULL,
  permissions JSONB        NOT NULL DEFAULT '[]',
  description TEXT,
  system_role BOOLEAN      NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, key)
);

-- Users
CREATE TABLE users (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  keycloak_id  VARCHAR(255) UNIQUE,
  email        VARCHAR(255) NOT NULL,
  first_name   VARCHAR(100) NOT NULL,
  last_name    VARCHAR(100) NOT NULL,
  username     VARCHAR(100) NOT NULL,
  avatar_url   TEXT,
  metadata     JSONB        NOT NULL DEFAULT '{}',
  active       BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, email),
  UNIQUE(tenant_id, username)
);
CREATE INDEX idx_users_tenant    ON users(tenant_id);
CREATE INDEX idx_users_keycloak  ON users(keycloak_id);

-- User → OrgUnit assignments
CREATE TABLE user_org_assignments (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id     UUID    NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  org_unit_id   UUID    NOT NULL REFERENCES org_units(id) ON DELETE CASCADE,
  position_id   UUID    REFERENCES positions(id) ON DELETE SET NULL,
  is_primary    BOOLEAN NOT NULL DEFAULT false,
  effective_from DATE   NOT NULL DEFAULT CURRENT_DATE,
  effective_to  DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_uoa_user    ON user_org_assignments(user_id);
CREATE INDEX idx_uoa_unit    ON user_org_assignments(org_unit_id);
CREATE INDEX idx_uoa_tenant  ON user_org_assignments(tenant_id);

-- User → Role assignments
CREATE TABLE user_roles (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);
