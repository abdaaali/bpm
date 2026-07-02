-- 023_notification_templates.sql
-- Operational notification templates for the launch processes. Rewrites the
-- terse demo seeds into branded, variable-rich messages and sets sensible
-- channels (email+in_app for things needing action; in_app for acknowledgements).
-- Idempotent: ON CONFLICT(tenant_id,slug) refreshes content in place.
-- Bodies are Handlebars (helpers: upper/lower/date/datetime/ifEq).

INSERT INTO notification_templates (tenant_id, name, slug, channel, subject, body) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Case Logged', 'case_created', 'in_app',
   'Logged: {{caseNumber}} — {{title}}',
   '<p>Your {{type}} <strong>{{caseNumber}}</strong> has been logged.</p>
    <ul><li><strong>Title:</strong> {{title}}</li><li><strong>Priority:</strong> {{upper priority}}</li></ul>
    <p>You can follow progress from your Workplace.</p>'),

  ('a0000000-0000-0000-0000-000000000001', 'Case Assigned', 'case_assigned', 'both',
   '[{{upper priority}}] {{caseNumber}} assigned to you',
   '<p>Case <strong>{{caseNumber}}</strong> has been assigned to you.</p>
    <ul>
      <li><strong>Title:</strong> {{title}}</li>
      <li><strong>Type:</strong> {{type}}</li>
      <li><strong>Priority:</strong> {{upper priority}}</li>
      {{#if siteCode}}<li><strong>Site:</strong> {{siteCode}}</li>{{/if}}
      {{#if slaDueAt}}<li><strong>Resolve by:</strong> {{datetime slaDueAt}}</li>{{/if}}
    </ul>
    <p>Please acknowledge and begin work from your Workplace.</p>'),

  ('a0000000-0000-0000-0000-000000000001', 'Case Resolved', 'case_resolved', 'both',
   'Resolved: {{caseNumber}} — {{title}}',
   '<p>Case <strong>{{caseNumber}}</strong> ({{title}}) has been resolved.</p>
    {{#if resolutionCode}}<p><strong>Resolution:</strong> {{resolutionCode}}</p>{{/if}}
    {{#if resolutionNotes}}<p>{{resolutionNotes}}</p>{{/if}}
    <p>If the issue is not resolved to your satisfaction, you can reopen it from your Workplace.</p>'),

  ('a0000000-0000-0000-0000-000000000001', 'Case SLA Breach', 'case_sla_breach', 'both',
   'SLA BREACH: {{caseNumber}} ({{upper priority}})',
   '<p><strong>Case {{caseNumber}}</strong> has breached its SLA.</p>
    <ul><li><strong>Type:</strong> {{type}}</li><li><strong>Target was:</strong> {{datetime dueAt}}</li></ul>
    <p>This case needs immediate attention.</p>'),

  ('a0000000-0000-0000-0000-000000000001', 'Approval Requested', 'approval_requested', 'both',
   'Approval needed: {{title}}',
   '<p>Your approval is required.</p>
    <ul>
      {{#if title}}<li><strong>Request:</strong> {{title}}</li>{{/if}}
      {{#if stepName}}<li><strong>Step:</strong> {{stepName}}</li>{{/if}}
      {{#if caseNumber}}<li><strong>Case:</strong> {{caseNumber}}</li>{{/if}}
      {{#if dueAt}}<li><strong>Decide by:</strong> {{datetime dueAt}}</li>{{/if}}
    </ul>
    <p>Review and decide from your Approvals inbox.</p>'),

  ('a0000000-0000-0000-0000-000000000001', 'Approval Decision', 'approval_decision', 'both',
   '{{#ifEq decision "approved"}}Approved{{else}}Rejected{{/ifEq}}: your request {{caseNumber}}',
   '<p>Your request {{#if caseNumber}}<strong>{{caseNumber}}</strong> {{/if}}has been
      <strong>{{upper decision}}</strong>.</p>
    {{#ifEq decision "rejected"}}{{#if reason}}<p><strong>Reason:</strong> {{reason}}</p>{{/if}}{{/ifEq}}
    {{#ifEq decision "approved"}}<p>Work will now proceed.</p>{{/ifEq}}'),

  ('a0000000-0000-0000-0000-000000000001', 'Task Assigned', 'task_assigned', 'both',
   'New task: {{taskName}}',
   '<p>You have a new task: <strong>{{taskName}}</strong>.</p>
    {{#if caseNumber}}<p>Related to case {{caseNumber}}.</p>{{/if}}
    <p>Open it from your Workplace to begin.</p>'),

  ('a0000000-0000-0000-0000-000000000001', 'Task Reassigned', 'task_reassigned', 'in_app',
   'Task reassigned to you: {{taskName}}',
   '<p>Task <strong>{{taskName}}</strong> has been reassigned to you.</p>
    <p>Open it from your Workplace.</p>'),

  ('a0000000-0000-0000-0000-000000000001', 'Task SLA Breach', 'task_sla_breach', 'both',
   'SLA BREACH: task {{taskName}}',
   '<p>Task <strong>{{taskName}}</strong> has breached its SLA.</p>
    <p><strong>Target was:</strong> {{datetime dueAt}}. Please action immediately.</p>')
ON CONFLICT (tenant_id, slug) DO UPDATE
  SET name = EXCLUDED.name, channel = EXCLUDED.channel,
      subject = EXCLUDED.subject, body = EXCLUDED.body, updated_at = NOW();
