import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: DatabaseService) {}

  async getSummary(tenantId: string) {
    const [instR, taskR] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*)                                                                    AS total,
           COUNT(*) FILTER (WHERE status = 'active')                                  AS active,
           COUNT(*) FILTER (WHERE status = 'completed')                               AS completed,
           COUNT(*) FILTER (WHERE status = 'suspended')                               AS suspended,
           COUNT(*) FILTER (WHERE status = 'terminated')                              AS terminated,
           COUNT(*) FILTER (WHERE status = 'completed'
                              AND started_at >= NOW() - INTERVAL '30 days')           AS completed_month,
           ROUND(AVG(
             EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600
           ) FILTER (WHERE status = 'completed' AND completed_at IS NOT NULL), 1)     AS avg_cycle_hours
         FROM process_instances WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled'))             AS open_tasks,
           COUNT(*) FILTER (WHERE status = 'in_progress')                             AS in_progress,
           COUNT(*) FILTER (WHERE sla_breached = true
                              AND status NOT IN ('completed','cancelled'))             AS sla_breached,
           COUNT(*) FILTER (WHERE due_at < NOW()
                              AND status NOT IN ('completed','cancelled'))             AS overdue
         FROM tasks WHERE tenant_id = $1`,
        [tenantId],
      ),
    ]);

    const i = instR.rows[0];
    const t = taskR.rows[0];
    const completed = parseInt(i.completed);
    const total     = parseInt(i.total);

    return {
      instances: {
        total,
        active:             parseInt(i.active),
        completed,
        suspended:          parseInt(i.suspended),
        terminated:         parseInt(i.terminated),
        completedThisMonth: parseInt(i.completed_month),
      },
      tasks: {
        open:       parseInt(t.open_tasks),
        inProgress: parseInt(t.in_progress),
        slaBreached: parseInt(t.sla_breached),
        overdue:    parseInt(t.overdue),
      },
      avgCycleHours:  i.avg_cycle_hours ? parseFloat(i.avg_cycle_hours) : null,
      completionRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
    };
  }

  async getByDefinition(tenantId: string) {
    const r = await this.db.query(
      `SELECT
         pd.id, pd.name, pd.slug,
         COUNT(pi.id)                                                                            AS total,
         COUNT(pi.id) FILTER (WHERE pi.status = 'active')                                       AS active,
         COUNT(pi.id) FILTER (WHERE pi.status = 'completed')                                    AS completed,
         COUNT(pi.id) FILTER (WHERE pi.status = 'terminated')                                   AS terminated,
         ROUND(AVG(
           EXTRACT(EPOCH FROM (pi.completed_at - pi.started_at)) / 3600
         ) FILTER (WHERE pi.status = 'completed' AND pi.completed_at IS NOT NULL), 1)           AS avg_hours
       FROM process_definitions pd
       LEFT JOIN process_instances pi
              ON pi.definition_id = pd.id AND pi.tenant_id = $1
       WHERE pd.tenant_id = $1
       GROUP BY pd.id, pd.name, pd.slug
       ORDER BY total DESC
       LIMIT 15`,
      [tenantId],
    );
    return r.rows.map(row => ({
      id:        row.id,
      name:      row.name,
      slug:      row.slug,
      total:     parseInt(row.total),
      active:    parseInt(row.active),
      completed: parseInt(row.completed),
      terminated: parseInt(row.terminated),
      avgHours:  row.avg_hours ? parseFloat(row.avg_hours) : null,
    }));
  }

  async getOverTime(tenantId: string, days = 30) {
    const r = await this.db.query(
      `WITH day_series AS (
         SELECT generate_series(
           (NOW() - ($2::int || ' days')::interval)::date,
           NOW()::date,
           '1 day'::interval
         )::date AS day
       ),
       counts AS (
         SELECT
           started_at::date AS day,
           COUNT(*)                                           AS started,
           COUNT(*) FILTER (WHERE status = 'completed')      AS completed
         FROM process_instances
         WHERE tenant_id = $1
           AND started_at >= NOW() - ($2::int || ' days')::interval
         GROUP BY started_at::date
       )
       SELECT
         TO_CHAR(ds.day, 'Mon DD') AS label,
         COALESCE(c.started,   0)  AS started,
         COALESCE(c.completed, 0)  AS completed
       FROM day_series ds
       LEFT JOIN counts c ON c.day = ds.day
       ORDER BY ds.day ASC`,
      [tenantId, days],
    );
    return r.rows.map(row => ({
      label:     row.label,
      started:   parseInt(row.started),
      completed: parseInt(row.completed),
    }));
  }

  async getBottlenecks(tenantId: string) {
    const r = await this.db.query(
      `SELECT
         t.node_id,
         t.name                                                               AS task_name,
         pd.name                                                              AS process_name,
         COUNT(*)                                                             AS count,
         ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - t.created_at)) / 3600), 1)   AS avg_age_hours
       FROM tasks t
       LEFT JOIN process_instances pi ON pi.id = t.process_instance_id
       LEFT JOIN process_definitions pd ON pd.id = pi.definition_id
       WHERE t.tenant_id = $1
         AND t.status IN ('pending', 'in_progress')
       GROUP BY t.node_id, t.name, pd.name
       ORDER BY count DESC
       LIMIT 10`,
      [tenantId],
    );
    return r.rows.map(row => ({
      nodeId:      row.node_id,
      taskName:    row.task_name,
      processName: row.process_name,
      count:       parseInt(row.count),
      avgAgeHours: row.avg_age_hours ? parseFloat(row.avg_age_hours) : 0,
    }));
  }

  async getSlaCompliance(tenantId: string) {
    const r = await this.db.query(
      `SELECT
         pd.name                                                            AS process_name,
         COUNT(t.id)                                                        AS total_tasks,
         COUNT(t.id) FILTER (WHERE t.sla_breached = true)                  AS breached,
         ROUND(
           100.0 * COUNT(t.id) FILTER (WHERE t.sla_breached = true)
                 / NULLIF(COUNT(t.id), 0), 1
         )                                                                  AS breach_rate
       FROM tasks t
       JOIN process_instances pi ON pi.id = t.process_instance_id
       JOIN process_definitions pd ON pd.id = pi.definition_id
       WHERE t.tenant_id = $1 AND t.due_at IS NOT NULL
       GROUP BY pd.id, pd.name
       HAVING COUNT(t.id) > 0
       ORDER BY breach_rate DESC NULLS LAST`,
      [tenantId],
    );
    return r.rows.map(row => {
      const breachRate = row.breach_rate ? parseFloat(row.breach_rate) : 0;
      return {
        processName:    row.process_name,
        totalTasks:     parseInt(row.total_tasks),
        breached:       parseInt(row.breached),
        breachRate,
        complianceRate: Math.round((100 - breachRate) * 10) / 10,
      };
    });
  }

  async getWorkload(tenantId: string) {
    const r = await this.db.query(
      `SELECT
         u.id                                                                  AS user_id,
         COALESCE(u.first_name || ' ' || u.last_name, u.username)             AS name,
         u.email,
         COUNT(t.id)                                                           AS total,
         COUNT(t.id) FILTER (WHERE t.status = 'pending')                      AS pending,
         COUNT(t.id) FILTER (WHERE t.status = 'in_progress')                  AS in_progress,
         COUNT(t.id) FILTER (WHERE t.sla_breached = true)                     AS sla_breached,
         COUNT(t.id) FILTER (
           WHERE t.due_at < NOW()
             AND t.status NOT IN ('completed', 'cancelled')
         )                                                                     AS overdue
       FROM tasks t
       JOIN users u ON u.id = t.assignee_id
       WHERE t.tenant_id = $1
         AND t.status NOT IN ('completed', 'cancelled')
       GROUP BY u.id, u.first_name, u.last_name, u.username, u.email
       ORDER BY total DESC
       LIMIT 20`,
      [tenantId],
    );
    return r.rows.map(row => ({
      userId:     row.user_id,
      name:       row.name,
      email:      row.email,
      total:      parseInt(row.total),
      pending:    parseInt(row.pending),
      inProgress: parseInt(row.in_progress),
      slaBreached: parseInt(row.sla_breached),
      overdue:    parseInt(row.overdue),
    }));
  }
}
