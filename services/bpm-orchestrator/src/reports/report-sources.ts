/**
 * Report data-source registry.
 *
 * This is the security boundary for the report runner: only columns/expressions
 * declared here can ever be SELECTed, filtered or sorted. User input selects
 * keys from this registry — it is never used as a SQL identifier. Every value
 * still flows through parameterized placeholders.
 */

export type ColType = 'string' | 'number' | 'date' | 'bool';

export interface ReportColumn {
  key: string;
  label: string;
  expr: string;          // safe, fixed SQL expression (table-qualified)
  type: ColType;
  filterable?: boolean;  // default true
  sortable?: boolean;    // default true
}

export interface ReportSource {
  key: string;
  label: string;
  from: string;          // table + alias + LEFT JOINs
  alias: string;         // primary table alias (carries tenant_id)
  defaultOrder: string;  // fallback ORDER BY expression
  columns: ReportColumn[];
  defaultColumns: string[];
}

const fullName = (a: string) =>
  `NULLIF(TRIM(CONCAT(${a}.first_name, ' ', ${a}.last_name)), '')`;

export const REPORT_SOURCES: Record<string, ReportSource> = {
  cases: {
    key: 'cases',
    label: 'Cases',
    alias: 'c',
    from: `cases c
      LEFT JOIN users ru     ON ru.id = c.requester_id
      LEFT JOIN users au     ON au.id = c.assignee_id
      LEFT JOIN org_units tu ON tu.id = c.assigned_team_id`,
    defaultOrder: 'c.created_at DESC',
    defaultColumns: ['case_number', 'title', 'type', 'status', 'priority', 'assignee', 'created_at'],
    columns: [
      { key: 'case_number', label: 'Case #',        expr: 'c.case_number', type: 'string' },
      { key: 'title',       label: 'Title',         expr: 'c.title',       type: 'string' },
      { key: 'type',        label: 'Type',          expr: 'c.type',        type: 'string' },
      { key: 'status',      label: 'Status',        expr: 'c.status',      type: 'string' },
      { key: 'priority',    label: 'Priority',      expr: 'c.priority',    type: 'string' },
      { key: 'impact',      label: 'Impact',        expr: 'c.impact',      type: 'string' },
      { key: 'urgency',     label: 'Urgency',       expr: 'c.urgency',     type: 'string' },
      { key: 'category',    label: 'Category',      expr: 'c.category',    type: 'string' },
      { key: 'subcategory', label: 'Subcategory',   expr: 'c.subcategory', type: 'string' },
      { key: 'change_type', label: 'Change Type',   expr: 'c.change_type', type: 'string' },
      { key: 'risk_level',  label: 'Risk Level',    expr: 'c.risk_level',  type: 'string' },
      { key: 'requester',   label: 'Requester',     expr: fullName('ru'),  type: 'string' },
      { key: 'assignee',    label: 'Assignee',      expr: fullName('au'),  type: 'string' },
      { key: 'team',        label: 'Team',          expr: 'tu.name',       type: 'string' },
      { key: 'breached',    label: 'SLA Breached',  expr: 'c.breached',    type: 'bool' },
      { key: 'sla_due_at',  label: 'SLA Due',       expr: 'c.sla_due_at',  type: 'date' },
      { key: 'resolved_at', label: 'Resolved At',   expr: 'c.resolved_at', type: 'date' },
      { key: 'closed_at',   label: 'Closed At',     expr: 'c.closed_at',   type: 'date' },
      { key: 'created_at',  label: 'Created At',     expr: 'c.created_at',  type: 'date' },
      { key: 'updated_at',  label: 'Updated At',     expr: 'c.updated_at',  type: 'date' },
    ],
  },

  process_instances: {
    key: 'process_instances',
    label: 'Process Instances',
    alias: 'pi',
    from: `process_instances pi
      LEFT JOIN process_definitions pd ON pd.id = pi.definition_id
      LEFT JOIN users iu               ON iu.id = pi.initiator_id`,
    defaultOrder: 'pi.started_at DESC',
    defaultColumns: ['process', 'business_key', 'status', 'initiator', 'started_at', 'completed_at'],
    columns: [
      { key: 'process',          label: 'Process',           expr: 'pd.name',            type: 'string' },
      { key: 'category',         label: 'Category',          expr: 'pd.category',        type: 'string' },
      { key: 'business_key',     label: 'Business Key',      expr: 'pi.business_key',    type: 'string' },
      { key: 'status',           label: 'Status',            expr: 'pi.status',          type: 'string' },
      { key: 'initiator',        label: 'Initiator',         expr: fullName('iu'),       type: 'string' },
      { key: 'current_node',     label: 'Current Node',      expr: 'pi.current_node_id', type: 'string' },
      { key: 'started_at',       label: 'Started At',        expr: 'pi.started_at',      type: 'date' },
      { key: 'completed_at',     label: 'Completed At',      expr: 'pi.completed_at',    type: 'date' },
      { key: 'updated_at',       label: 'Updated At',        expr: 'pi.updated_at',      type: 'date' },
      { key: 'cycle_time_hours', label: 'Cycle Time (h)',
        expr: 'ROUND(EXTRACT(EPOCH FROM (COALESCE(pi.completed_at, NOW()) - pi.started_at)) / 3600.0, 2)',
        type: 'number', filterable: false },
    ],
  },

  tasks: {
    key: 'tasks',
    label: 'Tasks',
    alias: 't',
    from: `tasks t
      LEFT JOIN users ta                ON ta.id = t.assignee_id
      LEFT JOIN process_instances tpi   ON tpi.id = t.process_instance_id
      LEFT JOIN process_definitions tpd ON tpd.id = tpi.definition_id`,
    defaultOrder: 't.created_at DESC',
    defaultColumns: ['name', 'process', 'status', 'assignee', 'due_at', 'completed_at'],
    columns: [
      { key: 'name',         label: 'Task',          expr: 't.name',         type: 'string' },
      { key: 'process',      label: 'Process',       expr: 'tpd.name',       type: 'string' },
      { key: 'type',         label: 'Type',          expr: 't.type',         type: 'string' },
      { key: 'status',       label: 'Status',        expr: 't.status',       type: 'string' },
      { key: 'assignee',     label: 'Assignee',      expr: fullName('ta'),   type: 'string' },
      { key: 'outcome',      label: 'Outcome',       expr: 't.outcome',      type: 'string' },
      { key: 'due_at',       label: 'Due At',        expr: 't.due_at',       type: 'date' },
      { key: 'sla_hours',    label: 'SLA Hours',     expr: 't.sla_hours',    type: 'number' },
      { key: 'sla_breached', label: 'SLA Breached',  expr: 't.sla_breached', type: 'bool' },
      { key: 'claimed_at',   label: 'Claimed At',    expr: 't.claimed_at',   type: 'date' },
      { key: 'completed_at', label: 'Completed At',  expr: 't.completed_at', type: 'date' },
      { key: 'created_at',   label: 'Created At',     expr: 't.created_at',   type: 'date' },
    ],
  },
};
