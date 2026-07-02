-- 030_rca_capa.sql
-- RCA Level-2: a formal Root Cause Analysis record per case (method + structured
-- analysis + root-cause statement + review state) and CAPA — Corrective And
-- Preventive Actions with owners, due dates and an effectiveness review. Builds
-- on the Level-1 taxonomy fields already on `cases`. Typically used from Problem
-- records and major-incident PIRs.

CREATE TABLE IF NOT EXISTS rca_records (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID NOT NULL,
  case_id              UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  method               VARCHAR(20) NOT NULL DEFAULT 'five_whys'
                       CHECK (method IN ('five_whys','fishbone','fault_tree','timeline','generic')),
  summary              TEXT,
  analysis             JSONB NOT NULL DEFAULT '{}',   -- method-specific structure
  root_cause_statement TEXT,
  status               VARCHAR(20) NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft','under_review','approved')),
  created_by           UUID,
  reviewed_by          UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id)                                   -- one formal RCA per case
);

CREATE TABLE IF NOT EXISTS capa_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL,
  case_id             UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  rca_id              UUID REFERENCES rca_records(id) ON DELETE SET NULL,
  action_type         VARCHAR(12) NOT NULL CHECK (action_type IN ('corrective','preventive')),
  description         TEXT NOT NULL,
  owner_id            UUID,
  due_at              TIMESTAMPTZ,
  status              VARCHAR(15) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','in_progress','done','verified','cancelled')),
  effectiveness       VARCHAR(12) NOT NULL DEFAULT 'pending'
                      CHECK (effectiveness IN ('pending','effective','ineffective')),
  effectiveness_notes TEXT,
  verified_by         UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_capa_case ON capa_actions(case_id);
CREATE INDEX IF NOT EXISTS idx_capa_open ON capa_actions(tenant_id, status) WHERE status IN ('open','in_progress','done');
