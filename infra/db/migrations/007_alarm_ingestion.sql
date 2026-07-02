-- ============================================================
-- 007_alarm_ingestion.sql
-- Unified Alarm Ingestion + MDM Enrichment + SLA Calculation
-- ============================================================

-- unified_alarms: canonical normalised alarm records
CREATE TABLE IF NOT EXISTS unified_alarms (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  source_system          VARCHAR(50) NOT NULL,            -- Zabbix | Prometheus | Grafana
  alarm_id               VARCHAR(255) NOT NULL,

  -- Classification
  severity               VARCHAR(50) NOT NULL DEFAULT 'unknown',
  priority               VARCHAR(10) NOT NULL DEFAULT 'P5',

  -- Description
  title                  TEXT        NOT NULL,
  description            TEXT,

  -- Location / Asset
  site_id                VARCHAR(255),
  host_name              VARCHAR(255),
  service_name           VARCHAR(255),
  category               VARCHAR(100),

  -- Timing
  first_occurrence       TIMESTAMPTZ NOT NULL,
  last_occurrence        TIMESTAMPTZ NOT NULL,

  -- State
  status                 VARCHAR(20)  NOT NULL DEFAULT 'FIRING',  -- FIRING|RESOLVED|OPEN|CLOSED
  probable_cause         TEXT,
  event_count            INTEGER      NOT NULL DEFAULT 1,

  -- Correlation / dedup
  correlation_id         VARCHAR(64),
  dedup_hash             VARCHAR(64)  NOT NULL,

  -- Raw payload (full original body for audit + RCA)
  raw_payload            JSONB        NOT NULL DEFAULT '{}',

  -- MDM enrichment (promoted columns for fast filtering)
  canonical_site_id      UUID,
  canonical_asset_id     UUID,
  canonical_service_id   UUID,
  region                 VARCHAR(100),
  cluster                VARCHAR(100),
  vendor                 VARCHAR(100),
  technology_domain      VARCHAR(100),
  assignment_group       VARCHAR(255),
  oncall_group           VARCHAR(255),
  sla_class              VARCHAR(100),
  location_path          TEXT,
  enrichment             JSONB,                           -- full MDM response snapshot

  -- SLA parameters (all MDM SLA fields + overrides, stored as jsonb)
  sla_params             JSONB,

  -- SLA calculated outputs (promoted for query performance)
  response_due_at        TIMESTAMPTZ,
  onsite_due_at          TIMESTAMPTZ,
  restore_due_at         TIMESTAMPTZ,
  sla_breach_at          TIMESTAMPTZ,
  sla_remaining_seconds  INTEGER,
  sla_status             VARCHAR(20) DEFAULT 'NOT_APPLICABLE',  -- ON_TRACK|AT_RISK|BREACHED|PAUSED|NOT_APPLICABLE
  sla_last_calculated_at TIMESTAMPTZ,

  -- Audit
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique active-alarm dedup index (partial: only for open/firing alarms)
CREATE UNIQUE INDEX IF NOT EXISTS idx_unified_alarms_dedup_active
  ON unified_alarms(dedup_hash)
  WHERE status IN ('FIRING', 'OPEN');

CREATE INDEX IF NOT EXISTS idx_unified_alarms_source_alarm   ON unified_alarms(source_system, alarm_id);
CREATE INDEX IF NOT EXISTS idx_unified_alarms_site_status    ON unified_alarms(site_id, status);
CREATE INDEX IF NOT EXISTS idx_unified_alarms_canonical_site ON unified_alarms(canonical_site_id, status);
CREATE INDEX IF NOT EXISTS idx_unified_alarms_sla_status     ON unified_alarms(sla_status);
CREATE INDEX IF NOT EXISTS idx_unified_alarms_sla_breach     ON unified_alarms(sla_breach_at);
CREATE INDEX IF NOT EXISTS idx_unified_alarms_updated        ON unified_alarms(updated_at);
CREATE INDEX IF NOT EXISTS idx_unified_alarms_status         ON unified_alarms(status);
CREATE INDEX IF NOT EXISTS idx_unified_alarms_correlation    ON unified_alarms(correlation_id);


-- alarm_ticket_map: maps each alarm to its BPM ticket
CREATE TABLE IF NOT EXISTS alarm_ticket_map (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_system    VARCHAR(50)  NOT NULL,
  alarm_id         VARCHAR(255) NOT NULL,
  unified_alarm_id UUID        NOT NULL REFERENCES unified_alarms(id) ON DELETE CASCADE,
  ticket_id        VARCHAR(255),
  ticket_number    VARCHAR(100),
  ticket_status    VARCHAR(50),
  sla_status       VARCHAR(20),
  response_due_at  TIMESTAMPTZ,
  restore_due_at   TIMESTAMPTZ,
  sla_breach_at    TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alarm_ticket_map_alarm
  ON alarm_ticket_map(source_system, alarm_id);
CREATE INDEX IF NOT EXISTS idx_alarm_ticket_map_ticket   ON alarm_ticket_map(ticket_id);
CREATE INDEX IF NOT EXISTS idx_alarm_ticket_map_uuid     ON alarm_ticket_map(unified_alarm_id);


-- alarm_enrichment_jobs: async MDM enrichment queue
CREATE TABLE IF NOT EXISTS alarm_enrichment_jobs (
  id               UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
  unified_alarm_id UUID       NOT NULL REFERENCES unified_alarms(id) ON DELETE CASCADE,
  status           VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|processing|done|failed
  attempts         INTEGER     NOT NULL DEFAULT 0,
  last_error       TEXT,
  scheduled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_status ON alarm_enrichment_jobs(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_enrichment_jobs_alarm  ON alarm_enrichment_jobs(unified_alarm_id);
