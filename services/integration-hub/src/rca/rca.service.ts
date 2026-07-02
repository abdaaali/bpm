import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

// ── Lightweight pure-TypeScript k-means (no GPU, no external packages) ────────
function dist(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
}

function kmeans(pts: number[][], k: number, maxIter = 100): number[] {
  if (pts.length === 0) return [];
  const actualK = Math.min(k, pts.length);
  // deterministic seed: pick evenly spaced points
  let centroids = Array.from({ length: actualK }, (_, i) =>
    [...pts[Math.floor((i * pts.length) / actualK)]],
  );
  let labels = new Array(pts.length).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    const next = pts.map(p => {
      let best = 0, bestD = Infinity;
      centroids.forEach((c, ci) => { const d = dist(p, c); if (d < bestD) { bestD = d; best = ci; } });
      return best;
    });
    if (next.every((v, i) => v === labels[i])) break;
    labels = next;
    centroids = Array.from({ length: actualK }, (_, ki) => {
      const grp = pts.filter((_, i) => labels[i] === ki);
      if (!grp.length) return centroids[ki];
      return centroids[ki].map((_, j) => grp.reduce((s, p) => s + p[j], 0) / grp.length);
    });
  }
  return labels;
}

// ── Z-score anomaly detection ─────────────────────────────────────────────────
function zScoreAnnotate(vals: number[]) {
  if (!vals.length) return [];
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const std  = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
  return vals.map(v => ({
    value:     v,
    zScore:    std > 0 ? Math.round(((v - mean) / std) * 100) / 100 : 0,
    isAnomaly: std > 0 && Math.abs((v - mean) / std) > 2,
  }));
}

const SEVERITY_SCORE: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, unknown: 0 };

function clusterLabel(dominantSeverity: string, peakHour: number, sourceCount: number, breachRate: number): string {
  if (breachRate >= 50) return 'SLA-Impacting Pattern';
  if (sourceCount === 1) return 'Single-Source Cascade';
  if (dominantSeverity === 'critical' && peakHour < 6) return 'Off-hours Critical Burst';
  if (['medium', 'low'].includes(dominantSeverity) && peakHour >= 8 && peakHour <= 18) return 'Business Hours Noise';
  if (['high', 'critical'].includes(dominantSeverity)) return 'Multi-System Cascade';
  return 'Mixed Pattern';
}

@Injectable()
export class RcaService {
  constructor(private readonly db: DatabaseService) {}

  private clamp(days: number) { return Math.min(Math.max(days, 1), 90); }

  // ── Summary KPIs ────────────────────────────────────────────────────────────
  async getSummary(days: number) {
    const n = this.clamp(days);
    const r = await this.db.query(
      `SELECT
         COUNT(*)                                              AS total,
         COUNT(*) FILTER (WHERE status IN ('FIRING','OPEN'))  AS active,
         COUNT(*) FILTER (WHERE sla_status='BREACHED')        AS sla_breached,
         COUNT(*) FILTER (WHERE sla_status='AT_RISK')         AS at_risk
       FROM unified_alarms WHERE created_at > NOW() - INTERVAL '${n} days'`,
      [],
    );
    const topR = await this.db.query(
      `SELECT source_system, COUNT(*) AS cnt
       FROM unified_alarms WHERE created_at > NOW() - INTERVAL '${n} days'
         AND source_system IS NOT NULL
       GROUP BY source_system ORDER BY cnt DESC LIMIT 1`,
      [],
    );
    const row = r.rows[0];
    return {
      total:       parseInt(row.total || '0'),
      active:      parseInt(row.active || '0'),
      slaBreached: parseInt(row.sla_breached || '0'),
      atRisk:      parseInt(row.at_risk || '0'),
      topSource:   topR.rows[0]?.source_system || '—',
    };
  }

  // ── Pareto ──────────────────────────────────────────────────────────────────
  async getPareto(by: 'severity' | 'source_system' | 'category', days: number) {
    const n  = this.clamp(days);
    const dim = ['severity', 'source_system', 'category'].includes(by) ? by : 'severity';
    const r = await this.db.query(
      `SELECT
         COALESCE(${dim},'unknown') AS label,
         COUNT(*)                   AS cnt,
         ROUND(100.0 * COUNT(*) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct,
         ROUND(100.0 * SUM(COUNT(*)) OVER (
           ORDER BY COUNT(*) DESC ROWS UNBOUNDED PRECEDING
         ) / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS cumulative_pct
       FROM unified_alarms
       WHERE created_at > NOW() - INTERVAL '${n} days'
       GROUP BY ${dim}
       ORDER BY cnt DESC`,
      [],
    );
    return r.rows.map(row => ({
      label:         row.label,
      count:         parseInt(row.cnt),
      pct:           parseFloat(row.pct || '0'),
      cumulativePct: parseFloat(row.cumulative_pct || '0'),
    }));
  }

  // ── Anomaly Detection (z-score on hourly buckets) ───────────────────────────
  async getAnomalies(days: number) {
    const n = this.clamp(days);
    const r = await this.db.query(
      `SELECT DATE_TRUNC('hour', created_at) AS hour, COUNT(*) AS cnt
       FROM unified_alarms
       WHERE created_at > NOW() - INTERVAL '${n} days'
       GROUP BY DATE_TRUNC('hour', created_at)
       ORDER BY hour`,
      [],
    );
    const rows   = r.rows;
    const counts = rows.map(row => parseInt(row.cnt));
    const scored = zScoreAnnotate(counts);
    const anomalyCount = scored.filter(s => s.isAnomaly).length;
    return {
      anomalyCount,
      threshold: 2,
      points: rows.map((row, i) => ({
        hour:      new Date(row.hour).toISOString(),
        count:     counts[i],
        zScore:    scored[i].zScore,
        isAnomaly: scored[i].isAnomaly,
      })),
    };
  }

  // ── K-Means Clustering ──────────────────────────────────────────────────────
  async getClusters(k: number, days: number) {
    const n      = this.clamp(days);
    const actualK = Math.min(Math.max(k, 2), 8);
    const r = await this.db.query(
      `SELECT
         COALESCE(severity,'unknown')       AS severity,
         EXTRACT(HOUR FROM created_at)      AS hour_of_day,
         COALESCE(source_system,'unknown')  AS source_system,
         COUNT(*)                           AS cnt,
         ROUND(100.0 * COUNT(*) FILTER (WHERE sla_status='BREACHED') / COUNT(*), 1) AS breach_rate
       FROM unified_alarms
       WHERE created_at > NOW() - INTERVAL '${n} days'
       GROUP BY severity, EXTRACT(HOUR FROM created_at), source_system
       ORDER BY cnt DESC`,
      [],
    );

    if (!r.rows.length) return { clusters: [] };

    // Build feature vectors: [severity_score_norm, hour_norm]
    const sources  = [...new Set(r.rows.map(row => row.source_system as string))];
    const points   = r.rows.map(row => [
      (SEVERITY_SCORE[row.severity] || 0) / 4,
      parseFloat(row.hour_of_day) / 23,
    ]);
    const labels   = kmeans(points, actualK);

    // Aggregate per cluster
    const clusterMap = new Map<number, any[]>();
    labels.forEach((lbl, i) => {
      if (!clusterMap.has(lbl)) clusterMap.set(lbl, []);
      clusterMap.get(lbl)!.push(r.rows[i]);
    });

    const clusters = Array.from(clusterMap.entries()).map(([id, rows]) => {
      const total      = rows.reduce((s, row) => s + parseInt(row.cnt), 0);
      const severities = rows.map(row => row.severity as string);
      const hours      = rows.map(row => parseFloat(row.hour_of_day));
      const srcs       = [...new Set(rows.map(row => row.source_system as string))];
      const avgBreach  = rows.reduce((s, row) => s + parseFloat(row.breach_rate || '0'), 0) / rows.length;

      const dominantSeverity = severities.sort((a, b) =>
        severities.filter(v => v === b).length - severities.filter(v => v === a).length,
      )[0];
      const avgHour = Math.round(hours.reduce((s, v) => s + v, 0) / hours.length);

      return {
        id,
        label:            clusterLabel(dominantSeverity, avgHour, srcs.length, avgBreach),
        dominantSeverity,
        peakHour:         avgHour,
        primarySource:    srcs[0],
        sourceCount:      srcs.length,
        alarmCount:       total,
        avgBreachRate:    Math.round(avgBreach * 10) / 10,
      };
    }).sort((a, b) => b.alarmCount - a.alarmCount);

    return { clusters };
  }

  // ── Co-occurrence Correlation ────────────────────────────────────────────────
  async getCorrelations(days: number) {
    const n = this.clamp(days);
    const r = await this.db.query(
      `WITH hourly AS (
         SELECT DATE_TRUNC('hour', created_at) AS h,
                COALESCE(source_system,'unknown') AS src,
                COUNT(*) AS cnt
         FROM unified_alarms
         WHERE created_at > NOW() - INTERVAL '${n} days'
         GROUP BY DATE_TRUNC('hour', created_at), source_system
       )
       SELECT
         a.src AS src_a, b.src AS src_b,
         COUNT(*)              AS co_hours,
         SUM(a.cnt + b.cnt)   AS total_events
       FROM hourly a
       JOIN hourly b ON a.h = b.h AND a.src < b.src
       GROUP BY a.src, b.src
       ORDER BY co_hours DESC
       LIMIT 15`,
      [],
    );
    return r.rows.map(row => ({
      sourceA:     row.src_a,
      sourceB:     row.src_b,
      coHours:     parseInt(row.co_hours),
      totalEvents: parseInt(row.total_events),
    }));
  }

  // ── Root Cause Ranking ───────────────────────────────────────────────────────
  async getTopCauses(days: number) {
    const n = this.clamp(days);
    const r = await this.db.query(
      `SELECT
         COALESCE(source_system,'unknown')          AS source_system,
         COALESCE(severity,'unknown')               AS severity,
         COALESCE(category,'unknown')               AS category,
         COUNT(*)                                   AS frequency,
         COUNT(DISTINCT COALESCE(host_name, site_id)) AS affected_hosts,
         COUNT(DISTINCT DATE_TRUNC('day', created_at)) AS active_days,
         ROUND(100.0 * COUNT(*) FILTER (WHERE sla_status='BREACHED') / NULLIF(COUNT(*), 0), 1) AS breach_rate
       FROM unified_alarms
       WHERE created_at > NOW() - INTERVAL '${n} days'
       GROUP BY source_system, severity, category
       ORDER BY frequency DESC, affected_hosts DESC
       LIMIT 10`,
      [],
    );
    return r.rows.map((row, i) => ({
      rank:          i + 1,
      sourceSystem:  row.source_system,
      severity:      row.severity,
      category:      row.category,
      frequency:     parseInt(row.frequency),
      affectedHosts: parseInt(row.affected_hosts),
      activeDays:    parseInt(row.active_days),
      breachRate:    parseFloat(row.breach_rate || '0'),
    }));
  }
}
