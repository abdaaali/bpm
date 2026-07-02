-- 029_vendor_escalation.sql
-- Shared Vendor Escalation — a capability invocable from ANY case/process: hand a
-- case off to a third-party vendor with their own SLA clock and contacts, track
-- it to resolution, and (optionally) pause the case SLA while waiting on them.
-- Vendor reference data comes from datahub_vendors.

CREATE TABLE IF NOT EXISTS case_vendor_escalations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL,
  case_id           UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  vendor_code       VARCHAR(60) NOT NULL,
  vendor_name       VARCHAR(200),
  reason            TEXT,
  notes             TEXT,
  status            VARCHAR(20) NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','acknowledged','resolved','cancelled')),
  contact_email     VARCHAR(200),
  contact_phone     VARCHAR(50),
  vendor_sla_hours  INTEGER,
  vendor_sla_due_at TIMESTAMPTZ,
  paused_case       BOOLEAN NOT NULL DEFAULT false,   -- did we pause the case SLA for this?
  raised_by         UUID,
  raised_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at   TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vendor_esc_case ON case_vendor_escalations(case_id);
CREATE INDEX IF NOT EXISTS idx_vendor_esc_open ON case_vendor_escalations(tenant_id, status) WHERE status IN ('open','acknowledged');

INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Vendor Escalation Raised', 'vendor_escalation_raised', 'both',
   'Vendor escalation: {{vendorName}} on {{caseNumber}}',
   '<p>Case <strong>{{caseNumber}}</strong> has been escalated to vendor <strong>{{vendorName}}</strong>.</p>
    <ul>
      {{#if reason}}<li><strong>Reason:</strong> {{reason}}</li>{{/if}}
      {{#if vendorSlaDueAt}}<li><strong>Vendor SLA due:</strong> {{datetime vendorSlaDueAt}}</li>{{/if}}
      {{#if contactEmail}}<li><strong>Vendor contact:</strong> {{contactEmail}}{{#if contactPhone}} · {{contactPhone}}{{/if}}</li>{{/if}}
    </ul>
    <p>Track the vendor response from the case.</p>'),

  ('a0000000-0000-0000-0000-000000000001', 'Vendor Escalation Resolved', 'vendor_escalation_resolved', 'in_app',
   'Vendor escalation resolved: {{vendorName}} on {{caseNumber}}',
   '<p>The vendor escalation to <strong>{{vendorName}}</strong> on case {{caseNumber}} has been resolved.</p>
    {{#if notes}}<p>{{notes}}</p>{{/if}}')
ON CONFLICT (tenant_id, slug) DO UPDATE
  SET name = EXCLUDED.name, channel = EXCLUDED.channel,
      subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = NOW();
