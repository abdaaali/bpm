import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

const ALLOWED_DIMS: Record<string, string> = {
  root_cause_category: 'root_cause_category',
  root_cause_subcategory: 'root_cause_subcategory',
  type: 'type',
  priority: 'priority',
  category: 'category',
};

@Injectable()
export class RcaService {
  constructor(private readonly db: DatabaseService) {}

  async getSummary(tenantId: string, days: number) {
    const r = await this.db.query(
      `SELECT
         COUNT(*)                                                                    AS total,
         COUNT(*) FILTER (WHERE status IN ('resolved','closed'))                    AS total_resolved,
         COUNT(*) FILTER (WHERE root_cause_category IS NOT NULL)                    AS with_root_cause,
         COUNT(*) FILTER (WHERE is_recurring = true)                                AS recurring,
         COUNT(*) FILTER (WHERE breached = true)                                    AS sla_breached,
         ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)
               FILTER (WHERE resolved_at IS NOT NULL), 1)                           AS avg_resolution_hours
       FROM cases WHERE tenant_id=$1 AND created_at > NOW()-($2 || ' days')::INTERVAL`,
      [tenantId, days],
    );
    const row = r.rows[0];
    // Top root cause subquery
    const topR = await this.db.query(
      `SELECT root_cause_category FROM cases
       WHERE tenant_id=$1 AND created_at > NOW()-($2 || ' days')::INTERVAL
         AND root_cause_category IS NOT NULL
       GROUP BY root_cause_category ORDER BY COUNT(*) DESC LIMIT 1`,
      [tenantId, days],
    );
    return {
      total: parseInt(row.total),
      totalResolved: parseInt(row.total_resolved),
      withRootCause: parseInt(row.with_root_cause),
      recurring: parseInt(row.recurring),
      slaBreached: parseInt(row.sla_breached),
      avgResolutionHours: parseFloat(row.avg_resolution_hours) || 0,
      topRootCause: topR.rows[0]?.root_cause_category || null,
    };
  }

  async getPareto(tenantId: string, by: string, days: number) {
    const dim = ALLOWED_DIMS[by] || 'root_cause_category';
    const r = await this.db.query(
      `SELECT
         ${dim} AS label,
         COUNT(*) AS cnt,
         ROUND(100.0*COUNT(*)/SUM(COUNT(*)) OVER(),1) AS pct,
         ROUND(100.0*SUM(COUNT(*)) OVER(ORDER BY COUNT(*) DESC
               ROWS UNBOUNDED PRECEDING)/SUM(COUNT(*)) OVER(),1) AS cumulative_pct
       FROM cases
       WHERE tenant_id=$1 AND created_at > NOW()-($2 || ' days')::INTERVAL
         AND ${dim} IS NOT NULL
       GROUP BY ${dim} ORDER BY cnt DESC`,
      [tenantId, days],
    );
    return r.rows.map(row => ({
      label: row.label,
      cnt: parseInt(row.cnt),
      pct: parseFloat(row.pct),
      cumulativePct: parseFloat(row.cumulative_pct),
    }));
  }

  async getTrends(tenantId: string, days: number) {
    const r = await this.db.query(
      `SELECT DATE_TRUNC('day', created_at)::date AS day,
              COALESCE(root_cause_category, 'Unclassified') AS category,
              COUNT(*) AS cnt
       FROM cases WHERE tenant_id=$1 AND created_at > NOW()-($2 || ' days')::INTERVAL
       GROUP BY DATE_TRUNC('day', created_at), COALESCE(root_cause_category, 'Unclassified')
       ORDER BY day, category`,
      [tenantId, days],
    );
    return r.rows.map(row => ({
      day: row.day,
      category: row.category,
      cnt: parseInt(row.cnt),
    }));
  }

  async getRepeatOffenders(tenantId: string, days: number) {
    const r = await this.db.query(
      `SELECT root_cause_category AS category, root_cause_subcategory AS subcategory,
              COUNT(*) AS occurrences,
              COUNT(*) FILTER (WHERE is_recurring=true) AS recurring_count,
              COUNT(DISTINCT DATE_TRUNC('week', created_at)) AS weeks_active,
              ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)
                    FILTER (WHERE resolved_at IS NOT NULL), 1) AS avg_resolution_hours,
              ROUND(100.0*COUNT(*) FILTER (WHERE breached=true)/COUNT(*), 1) AS breach_rate
       FROM cases WHERE tenant_id=$1 AND created_at > NOW()-($2 || ' days')::INTERVAL
         AND root_cause_category IS NOT NULL
       GROUP BY root_cause_category, root_cause_subcategory ORDER BY occurrences DESC LIMIT 15`,
      [tenantId, days],
    );
    return r.rows.map(row => ({
      category: row.category,
      subcategory: row.subcategory,
      occurrences: parseInt(row.occurrences),
      recurringCount: parseInt(row.recurring_count),
      weeksActive: parseInt(row.weeks_active),
      avgResolutionHours: parseFloat(row.avg_resolution_hours) || 0,
      breachRate: parseFloat(row.breach_rate) || 0,
    }));
  }

  async getProcessAnalysis(tenantId: string, days: number) {
    const r = await this.db.query(
      `SELECT c.type, c.priority, c.root_cause_category, c.root_cause_subcategory,
              COUNT(*) AS count,
              ROUND(AVG(EXTRACT(EPOCH FROM (c.resolved_at - c.created_at))/3600)
                    FILTER (WHERE c.resolved_at IS NOT NULL), 1) AS avg_resolution_hours,
              ROUND(100.0*COUNT(*) FILTER (WHERE c.breached=true)/COUNT(*), 1) AS breach_rate,
              pd.name AS process_name
       FROM cases c
       LEFT JOIN process_instances pi ON pi.id = c.process_instance_id
       LEFT JOIN process_definitions pd ON pd.id = pi.definition_id
       WHERE c.tenant_id=$1 AND c.created_at > NOW()-($2 || ' days')::INTERVAL
       GROUP BY c.type, c.priority, c.root_cause_category, c.root_cause_subcategory, pd.name
       ORDER BY count DESC LIMIT 20`,
      [tenantId, days],
    );
    return r.rows.map(row => ({
      type: row.type,
      priority: row.priority,
      rootCauseCategory: row.root_cause_category,
      rootCauseSubcategory: row.root_cause_subcategory,
      count: parseInt(row.count),
      avgResolutionHours: parseFloat(row.avg_resolution_hours) || 0,
      breachRate: parseFloat(row.breach_rate) || 0,
      processName: row.process_name,
    }));
  }

  async getResolutionTime(tenantId: string, days: number) {
    const r = await this.db.query(
      `SELECT COALESCE(root_cause_category, 'Unclassified') AS category,
              COUNT(*) FILTER (WHERE resolved_at IS NOT NULL) AS resolved_count,
              ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)
                    FILTER (WHERE resolved_at IS NOT NULL), 1) AS avg_hours,
              ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP
                    (ORDER BY EXTRACT(EPOCH FROM (resolved_at - created_at))/3600)
                    FILTER (WHERE resolved_at IS NOT NULL)::numeric, 1) AS median_hours
       FROM cases WHERE tenant_id=$1 AND created_at > NOW()-($2 || ' days')::INTERVAL
       GROUP BY COALESCE(root_cause_category, 'Unclassified')
       ORDER BY avg_hours DESC NULLS LAST`,
      [tenantId, days],
    );
    return r.rows.map(row => ({
      category: row.category,
      resolvedCount: parseInt(row.resolved_count),
      avgHours: parseFloat(row.avg_hours) || 0,
      medianHours: parseFloat(row.median_hours) || 0,
    }));
  }

  /**
   * Emerging-problem anomaly detection (offline, classical). Counts incidents/
   * faults per CI (affected service / host / site) over 30 days and flags CIs
   * whose volume is a statistical outlier via the MODIFIED Z-SCORE
   * (0.6745·(x−median)/MAD, robust to outliers — unlike mean/stdev). CIs with a
   * modified z above the threshold are surfaced as candidate emerging problems,
   * with a 7-day "recent" count so a rising trend is visible.
   */
  async getEmergingProblems(tenantId: string, threshold = 3.5) {
    const r = await this.db.query(
      `SELECT ci, count(*)::int AS total,
              count(*) FILTER (WHERE created_at > NOW()-INTERVAL '7 days')::int AS recent
         FROM (
           SELECT COALESCE(NULLIF(context->>'affectedService',''), NULLIF(context->>'affectedHostId',''),
                           NULLIF(context->>'siteCode','')) AS ci, created_at
             FROM cases
            WHERE tenant_id=$1 AND type IN ('incident','fault')
              AND created_at > NOW()-INTERVAL '30 days'
         ) x
        WHERE ci IS NOT NULL
        GROUP BY ci`,
      [tenantId],
    );
    const counts = r.rows.map(row => row.total);
    if (counts.length < 3) return { threshold, median: 0, mad: 0, anomalies: [] };
    const med = median(counts);
    const mad = median(counts.map(c => Math.abs(c - med))) || 0;
    const anomalies = r.rows
      .map(row => {
        const z = mad > 0 ? (0.6745 * (row.total - med)) / mad : 0;
        return { ci: row.ci, total: row.total, recent: row.recent, modifiedZ: +z.toFixed(2) };
      })
      .filter(a => a.modifiedZ >= threshold && a.total > med)
      .sort((a, b) => b.modifiedZ - a.modifiedZ)
      .slice(0, 10);
    return { threshold, median: med, mad: +mad.toFixed(2), ciCount: counts.length, anomalies };
  }
}

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
