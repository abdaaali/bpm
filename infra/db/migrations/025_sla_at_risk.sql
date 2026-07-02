-- 025_sla_at_risk.sql
-- Proactive SLA-at-risk warning: flag a case (once) when its resolve clock is
-- close to breaching, so the assignee is nudged BEFORE the SLA is missed. The
-- flag is cleared when the clock is resumed (due date pushed out) so it can
-- re-evaluate. Idempotent.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS sla_at_risk    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sla_at_risk_at TIMESTAMPTZ;

INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Case SLA At Risk', 'case_sla_at_risk', 'both',
   'SLA AT RISK: {{caseNumber}} ({{upper priority}}) due {{datetime dueAt}}',
   '<p>Case <strong>{{caseNumber}}</strong> is approaching its SLA target and is <strong>at risk</strong> of breaching.</p>
    <ul>
      <li><strong>Type:</strong> {{type}}</li>
      <li><strong>Priority:</strong> {{upper priority}}</li>
      <li><strong>Resolve by:</strong> {{datetime dueAt}}</li>
      {{#if minutesLeft}}<li><strong>Time remaining:</strong> ~{{minutesLeft}} min</li>{{/if}}
    </ul>
    <p>Please action this case now to avoid a breach.</p>')
ON CONFLICT (tenant_id, slug) DO UPDATE
  SET name = EXCLUDED.name, channel = EXCLUDED.channel,
      subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = NOW();
