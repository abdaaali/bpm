import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { DatabaseService } from '../database/database.service';

const NOTIFICATION_URL = () => process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006';

export const DIGEST_SECTIONS = [
  { key: 'operational_dashboard', label: 'Operational Dashboard' },
  { key: 'telecom_operations', label: 'Telecom Operations' },
  { key: 'approval_workflows', label: 'Approval Workflows' },
  { key: 'backlog_overview', label: 'Backlog & Cumulative Totals' },
];

interface RecipientDto { email: string; type?: string; }
interface ConfigDto { enabled?: boolean; channel?: string; scheduleType?: string; sections?: string[]; }

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  constructor(private readonly db: DatabaseService) {}

  // ── Config ───────────────────────────────────────────────────────────────
  async getConfig(tenantId: string) {
    const r = await this.db.query(`SELECT * FROM digest_config WHERE tenant_id = $1`, [tenantId]);
    if (!r.rows[0]) {
      const ins = await this.db.query(
        `INSERT INTO digest_config (tenant_id) VALUES ($1)
         ON CONFLICT (tenant_id) DO UPDATE SET tenant_id = EXCLUDED.tenant_id RETURNING *`,
        [tenantId],
      );
      return this.shapeConfig(ins.rows[0]);
    }
    return this.shapeConfig(r.rows[0]);
  }

  private shapeConfig(row: any) {
    return {
      enabled: row.enabled,
      channel: row.channel,
      scheduleType: row.schedule_type,
      sections: row.sections || [],
      availableSections: DIGEST_SECTIONS,
      updatedAt: row.updated_at,
    };
  }

  async updateConfig(tenantId: string, dto: ConfigDto) {
    const current = await this.getConfig(tenantId);
    const enabled = dto.enabled ?? current.enabled;
    const channel = dto.channel ?? current.channel;
    const scheduleType = dto.scheduleType ?? current.scheduleType;
    const sections = Array.isArray(dto.sections) ? dto.sections : current.sections;
    const valid = sections.filter((s) => DIGEST_SECTIONS.some((d) => d.key === s));
    const r = await this.db.query(
      `INSERT INTO digest_config (tenant_id, enabled, channel, schedule_type, sections, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (tenant_id) DO UPDATE
         SET enabled = $2, channel = $3, schedule_type = $4, sections = $5, updated_at = NOW()
       RETURNING *`,
      [tenantId, enabled, channel, scheduleType, JSON.stringify(valid)],
    );
    return this.shapeConfig(r.rows[0]);
  }

  // ── Overview ─────────────────────────────────────────────────────────────
  async getOverview(tenantId: string) {
    const config = await this.getConfig(tenantId);
    const lastRunR = await this.db.query(
      `SELECT run_code, type, status, created_at FROM digest_runs
       WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
    );
    const last = lastRunR.rows[0];
    return {
      title: 'Weekly Management Digest',
      subtitle: 'Automated governance reporting — scheduled delivery to management recipients',
      enabled: config.enabled,
      scheduleStatus: config.enabled ? 'Active' : 'Paused',
      deliveryChannel: String(config.channel || 'email').toUpperCase(),
      scheduleLabel: this.scheduleLabel(config.scheduleType),
      lastRun: last ? { status: last.status, runCode: last.run_code, at: last.created_at } : null,
      smtpConfigured: !!(process.env.SMTP_HOST && process.env.SMTP_HOST.trim()),
    };
  }

  private scheduleLabel(t: string) {
    return t === 'weekly_monday_8' ? 'Weekly (Monday 8:00 AM)' : t;
  }

  // ── Recipients ───────────────────────────────────────────────────────────
  async listRecipients(tenantId: string) {
    const r = await this.db.query(
      `SELECT id, email, type, created_at FROM digest_recipients WHERE tenant_id = $1 ORDER BY created_at ASC`,
      [tenantId],
    );
    return r.rows;
  }

  async addRecipient(tenantId: string, dto: RecipientDto) {
    const email = (dto?.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('A valid email is required');
    const r = await this.db.query(
      `INSERT INTO digest_recipients (tenant_id, email, type) VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, email) DO UPDATE SET type = EXCLUDED.type RETURNING id, email, type, created_at`,
      [tenantId, email, dto.type || 'email'],
    );
    return r.rows[0];
  }

  async removeRecipient(tenantId: string, id: string) {
    const r = await this.db.query(
      `DELETE FROM digest_recipients WHERE tenant_id = $1 AND id = $2 RETURNING id`,
      [tenantId, id],
    );
    if (!r.rows[0]) throw new NotFoundException('Recipient not found');
    return { deleted: true, id };
  }

  // ── Run history ──────────────────────────────────────────────────────────
  async listRuns(tenantId: string) {
    const r = await this.db.query(
      `SELECT id, run_code, type, status, recipients, subject, created_at
       FROM digest_runs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 200`,
      [tenantId],
    );
    return r.rows;
  }

  async getRun(tenantId: string, id: string) {
    const r = await this.db.query(`SELECT * FROM digest_runs WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
    if (!r.rows[0]) throw new NotFoundException('Run not found');
    return r.rows[0];
  }

  // ── Content generation ───────────────────────────────────────────────────
  async preview(tenantId: string) {
    const config = await this.getConfig(tenantId);
    return this.generateContent(tenantId, config.sections);
  }

  private async generateContent(tenantId: string, sections: string[]) {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    const since = from.toISOString();   // exact window start shared by label + queries
    const period = `${from.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`;
    const blocks: string[] = [];

    if (sections.includes('operational_dashboard')) blocks.push(await this.sectionOperational(tenantId, since));
    if (sections.includes('telecom_operations')) blocks.push(await this.sectionTelecom(tenantId, since));
    if (sections.includes('approval_workflows')) blocks.push(await this.sectionApprovals(tenantId, since));
    if (sections.includes('backlog_overview')) blocks.push(await this.sectionBacklog(tenantId, since));

    const subject = `Weekly Management Digest — ${now.toISOString().slice(0, 10)}`;
    // Table-based, inline-styled markup for broad email-client support — desktop
    // Outlook (Word engine) ignores max-width / margin:auto / opacity / border-radius,
    // so layout uses a fixed-width table centered via align, bgcolor attributes,
    // and solid colors instead of opacity.
    const bodyHtml = `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f5f7;margin:0;padding:0;">
        <tr>
          <td align="center" style="padding:16px;">
            <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;">
              <tr>
                <td bgcolor="#1565c0" style="background-color:#1565c0;padding:20px 24px;">
                  <div style="font-size:20px;font-weight:bold;color:#ffffff;line-height:1.2;">Weekly Management Digest</div>
                  <div style="font-size:13px;color:#cfe0f5;padding-top:4px;">Reporting period: ${period}</div>
                </td>
              </tr>
              <tr>
                <td bgcolor="#ffffff" style="background-color:#ffffff;border:1px solid #e0e0e0;border-top:none;padding:8px 24px 24px;">
                  ${blocks.join('') || '<p style="color:#777;">No sections selected.</p>'}
                  <div style="color:#999;font-size:12px;margin-top:24px;border-top:1px solid #eeeeee;padding-top:12px;">
                    Generated automatically by the BPM Portal. Manage this digest under Dashboards &rarr; Management Digest.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>`;
    return { subject, bodyHtml, period };
  }

  private kpiTable(title: string, rows: [string, string | number][], caption = '“This week” = activity in the reporting period; “now” = current backlog snapshot.') {
    const cells = rows.map(([k, v]) =>
      `<tr>
         <td style="padding:6px 10px;color:#555555;border-bottom:1px solid #f0f0f0;">${k}</td>
         <td align="right" style="padding:6px 10px;font-weight:bold;text-align:right;border-bottom:1px solid #f0f0f0;">${v}</td>
       </tr>`).join('');
    return `<div style="margin-top:20px;">
      <div style="font-size:15px;color:#1565c0;font-weight:bold;margin-bottom:4px;">${title}</div>
      <div style="font-size:11px;color:#999999;margin-bottom:8px;">${caption}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;border:1px solid #eeeeee;">${cells}</table>
    </div>`;
  }

  // Flow metrics are scoped to the reporting window ($2 = window start);
  // backlog metrics are point-in-time snapshots, labelled "(now)".
  private async sectionOperational(tenantId: string, since: string) {
    const inst = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE started_at >= $2::timestamptz) started_week,
              COUNT(*) FILTER (WHERE completed_at >= $2::timestamptz AND status='completed') completed_week,
              COUNT(*) FILTER (WHERE status='active') active_now
       FROM process_instances WHERE tenant_id=$1`, [tenantId, since]);
    const tasks = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE completed_at >= $2::timestamptz) completed_week,
              COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')) open_now,
              COUNT(*) FILTER (WHERE sla_breached AND status NOT IN ('completed','cancelled')) breached_now
       FROM tasks WHERE tenant_id=$1`, [tenantId, since]);
    const i = inst.rows[0], t = tasks.rows[0];
    return this.kpiTable('Operational Dashboard', [
      ['Process instances started (this week)', i.started_week],
      ['Process instances completed (this week)', i.completed_week],
      ['Tasks completed (this week)', t.completed_week],
      ['Currently active instances (now)', i.active_now],
      ['Open tasks (now)', t.open_now],
      ['SLA-breached open tasks (now)', t.breached_now],
    ]);
  }

  private async sectionTelecom(tenantId: string, since: string) {
    const c = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE created_at >= $2::timestamptz) opened_week,
              COUNT(*) FILTER (WHERE resolved_at >= $2::timestamptz) resolved_week,
              COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed','cancelled')) open_now,
              COUNT(*) FILTER (WHERE breached AND status NOT IN ('resolved','closed','cancelled')) breached_now
       FROM cases WHERE tenant_id=$1`, [tenantId, since]);
    const byType = await this.db.query(
      `SELECT type, COUNT(*) opened
       FROM cases WHERE tenant_id=$1 AND created_at >= $2::timestamptz
       GROUP BY type ORDER BY opened DESC LIMIT 5`, [tenantId, since]);
    const row = c.rows[0];
    const top = byType.rows.map((b: any) => [`Opened ${b.type} (this week)`, b.opened] as [string, number]);
    return this.kpiTable('Telecom Operations', [
      ['Cases opened (this week)', row.opened_week],
      ['Cases resolved (this week)', row.resolved_week],
      ['Currently open cases (now)', row.open_now],
      ['SLA-breached open cases (now)', row.breached_now],
      ...top,
    ]);
  }

  private async sectionApprovals(tenantId: string, since: string) {
    const a = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE started_at >= $2::timestamptz) submitted_week,
              COUNT(*) FILTER (WHERE completed_at >= $2::timestamptz AND status='approved') approved_week,
              COUNT(*) FILTER (WHERE completed_at >= $2::timestamptz AND status='rejected') rejected_week,
              COUNT(*) FILTER (WHERE status='pending') pending_now
       FROM approval_instances WHERE tenant_id=$1`, [tenantId, since]);
    const r = a.rows[0];
    return this.kpiTable('Approval Workflows', [
      ['Submitted for approval (this week)', r.submitted_week],
      ['Approved (this week)', r.approved_week],
      ['Rejected (this week)', r.rejected_week],
      ['Pending approvals (now)', r.pending_now],
    ]);
  }

  // Cumulative backlog across the platform (all-time active counts + aging),
  // plus the net case backlog delta this week — the delivery-pressure signal:
  // opened minus resolved > 0 means work is piling up faster than it clears.
  private async sectionBacklog(tenantId: string, since: string) {
    const inst = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE status='active') active FROM process_instances WHERE tenant_id=$1`, [tenantId]);
    const tasks = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')) open_tasks,
              COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND due_at < NOW()) overdue_tasks
       FROM tasks WHERE tenant_id=$1`, [tenantId]);
    const cases = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE is_open) open_cases,
              COUNT(*) FILTER (WHERE is_open AND breached) breached_cases,
              COALESCE(ROUND(EXTRACT(EPOCH FROM (NOW() - MIN(created_at) FILTER (WHERE is_open))) / 86400.0)::int, 0) oldest_days,
              COUNT(*) FILTER (WHERE created_at >= $2::timestamptz) opened_week,
              COUNT(*) FILTER (WHERE resolved_at >= $2::timestamptz) resolved_week
       FROM (SELECT created_at, resolved_at, breached,
                    (status NOT IN ('resolved','closed','cancelled')) AS is_open
             FROM cases WHERE tenant_id=$1) s`, [tenantId, since]);
    const appr = await this.db.query(
      `SELECT COUNT(*) FILTER (WHERE status='pending') pending FROM approval_instances WHERE tenant_id=$1`, [tenantId]);

    const i = inst.rows[0], t = tasks.rows[0], c = cases.rows[0], a = appr.rows[0];
    const net = Number(c.opened_week) - Number(c.resolved_week);
    const netLabel = net > 0 ? `▲ +${net} (backlog growing)` : net < 0 ? `▼ ${net} (backlog shrinking)` : '0 (steady)';

    return this.kpiTable('Backlog & Cumulative Totals', [
      ['Active process instances (total)', i.active],
      ['Open tasks (total)', t.open_tasks],
      ['Overdue tasks (past due)', t.overdue_tasks],
      ['Open cases (total)', c.open_cases],
      ['SLA-breached open cases (total)', c.breached_cases],
      ['Oldest open case age (days)', c.oldest_days],
      ['Pending approvals (total)', a.pending],
      ['Net case backlog change (this week)', netLabel],
    ], 'Cumulative all-time active backlog — high or rising values, aging, or a growing net change signal delivery pressure.');
  }

  // ── Delivery ─────────────────────────────────────────────────────────────
  async generateAndSend(tenantId: string, type: 'SCHEDULED' | 'MANUAL_SEND', actorId?: string | null) {
    const config = await this.getConfig(tenantId);
    const recipients = await this.listRecipients(tenantId);
    const { subject, bodyHtml } = await this.generateContent(tenantId, config.sections);

    let status: 'SENT' | 'FAILED' = 'SENT';
    let error: string | null = null;
    try {
      const res = await this.deliver(recipients, subject, bodyHtml);
      if (res.sent === 0 && res.failed > 0) {
        status = 'FAILED';
        error = `All ${res.failed} recipient(s) failed. Last error: ${res.lastError || 'unknown'}`;
      } else if (res.failed > 0) {
        error = `${res.sent} delivered, ${res.failed} failed. Last error: ${res.lastError || 'unknown'}`;
      }
    } catch (e: any) {
      status = 'FAILED';
      error = e?.message || 'delivery failed';
      this.logger.error(`Digest delivery failed: ${error}`);
    }

    const runCode = `DGST-${Date.now()}`;
    const r = await this.db.query(
      `INSERT INTO digest_runs (tenant_id, run_code, type, status, recipients, subject, body_html, error)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [tenantId, runCode, type, status, JSON.stringify(recipients.map((x: any) => x.email)), subject, bodyHtml, error],
    );
    return r.rows[0];
  }

  private async deliver(recipients: any[], subject: string, bodyHtml: string) {
    let sent = 0, failed = 0, lastError: string | null = null;
    for (const rec of recipients) {
      // The digest is an email report — deliver directly to each configured
      // address via notification-service (which owns SMTP). Run history is the
      // audit trail, so no per-recipient in-app record is needed.
      try {
        await axios.post(
          `${NOTIFICATION_URL()}/api/notifications/email`,
          { to: rec.email, subject, html: bodyHtml },
          { headers: { 'Content-Type': 'application/json' }, timeout: 20_000 },
        );
        sent++;
      } catch (e: any) {
        failed++;
        lastError = e?.response?.data?.message || e?.message || 'send failed';
        this.logger.error(`Digest email to ${rec.email} failed: ${lastError}`);
      }
    }
    return { sent, failed, lastError };
  }

  // ── Scheduler: every Monday 08:00 ─────────────────────────────────────────
  @Cron('0 0 8 * * 1')
  async runWeekly() {
    try {
      const cfgs = await this.db.query(`SELECT tenant_id FROM digest_config WHERE enabled = true`);
      for (const c of cfgs.rows) {
        try { await this.generateAndSend(c.tenant_id, 'SCHEDULED', null); }
        catch (e: any) { this.logger.error(`Weekly digest failed for tenant ${c.tenant_id}: ${e?.message}`); }
      }
      if (cfgs.rows.length) this.logger.log(`Weekly digest dispatched for ${cfgs.rows.length} tenant(s)`);
    } catch (e: any) {
      this.logger.error(`Weekly digest scheduler error: ${e?.message}`);
    }
  }
}
