-- 024_major_incident.sql
-- Major Incident (P1) support: a declared-MI flag + Major Incident Manager on the
-- case, and stakeholder notification templates. Declaring escalates the case,
-- assigns a coordinator and fans out to management; resolving spawns a
-- Post-Incident Review problem record. Idempotent.

ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS major_incident    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS declared_major_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mim_id            UUID;        -- Major Incident Manager

INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Major Incident Declared', 'major_incident_declared', 'both',
   'MAJOR INCIDENT DECLARED: {{caseNumber}} — {{title}}',
   '<p style="color:#b71c1c"><strong>A MAJOR INCIDENT has been declared.</strong></p>
    <ul>
      <li><strong>Reference:</strong> {{caseNumber}}</li>
      <li><strong>Summary:</strong> {{title}}</li>
      <li><strong>Priority:</strong> {{upper priority}}</li>
      {{#if siteCode}}<li><strong>Site:</strong> {{siteCode}}</li>{{/if}}
      {{#if mimName}}<li><strong>Major Incident Manager:</strong> {{mimName}}</li>{{/if}}
      {{#if reason}}<li><strong>Reason:</strong> {{reason}}</li>{{/if}}
    </ul>
    <p>Join the incident bridge and stand by for coordination.</p>'),

  ('a0000000-0000-0000-0000-000000000001', 'Major Incident Resolved', 'major_incident_resolved', 'both',
   'Major Incident RESOLVED: {{caseNumber}} — {{title}}',
   '<p>The major incident <strong>{{caseNumber}}</strong> ({{title}}) has been resolved.</p>
    {{#if resolutionNotes}}<p><strong>Resolution:</strong> {{resolutionNotes}}</p>{{/if}}
    {{#if pirNumber}}<p>A Post-Incident Review has been opened: <strong>{{pirNumber}}</strong>.</p>{{/if}}
    <p>Thank you for your response.</p>')
ON CONFLICT (tenant_id, slug) DO UPDATE
  SET name = EXCLUDED.name, channel = EXCLUDED.channel,
      subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = NOW();
