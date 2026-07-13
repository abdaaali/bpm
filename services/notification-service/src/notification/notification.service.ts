import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TemplateService } from '../template/template.service';
import * as nodemailer from 'nodemailer';

export interface SendNotificationDto {
  tenantId: string;
  recipientId: string;
  recipientEmail?: string;
  templateSlug: string;
  variables: Record<string, any>;
  entityType?: string;
  entityId?: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private mailer: nodemailer.Transporter | null = null;

  constructor(
    private readonly db: DatabaseService,
    private readonly templateSvc: TemplateService,
  ) {
    if (process.env.SMTP_HOST) {
      // rejectUnauthorized=false lets STARTTLS succeed against relays whose cert
      // does not match the host (common on shared/submission ports like 2525).
      const rejectUnauthorized = process.env.SMTP_REJECT_UNAUTHORIZED !== 'false';
      this.mailer = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        tls: { rejectUnauthorized },
      });
      this.logger.log(`SMTP transport configured: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || '587'} (tls.rejectUnauthorized=${rejectUnauthorized})`);
    }
  }

  async send(dto: SendNotificationDto): Promise<void> {
    let rendered: { subject: string; body: string; channel: string; isActive: boolean };
    try {
      rendered = await this.templateSvc.render(dto.tenantId, dto.templateSlug, dto.variables);
    } catch (e) {
      this.logger.warn(`Template '${dto.templateSlug}' not found — using fallback`);
      rendered = {
        subject: dto.variables.subject || 'BPM Notification',
        body: JSON.stringify(dto.variables),
        channel: 'in_app',
        isActive: true,
      };
    }

    if (!rendered.isActive) {
      this.logger.log(`Template '${dto.templateSlug}' is deactivated — notification suppressed`);
      return;
    }

    // Always persist as in_app notification
    await this.db.query(
      `INSERT INTO notifications(tenant_id, recipient_id, channel, subject, body, entity_type, entity_id)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [dto.tenantId, dto.recipientId, rendered.channel, rendered.subject, rendered.body, dto.entityType || null, dto.entityId || null],
    );

    // Email delivery
    if ((rendered.channel === 'email' || rendered.channel === 'both') && dto.recipientEmail && this.mailer) {
      try {
        const fromAddr = process.env.SMTP_FROM || 'noreply@bpm.local';
        const fromName = (process.env.SMTP_FROM_NAME || '').trim();
        await this.mailer.sendMail({
          from: fromName ? `"${fromName}" <${fromAddr}>` : fromAddr,
          to: dto.recipientEmail,
          subject: rendered.subject,
          html: rendered.body,
        });
      } catch (e) {
        this.logger.error(`Email send failed to ${dto.recipientEmail}: ${e.message}`);
        await this.db.query(`UPDATE notifications SET delivery_status='failed', updated_at=NOW() WHERE recipient_id=$1 AND subject=$2 AND created_at > NOW()-INTERVAL '5 seconds'`, [dto.recipientId, rendered.subject]);
      }
    }
  }

  /**
   * Send a raw email to any address (no in-app record, no platform user
   * required). Used for reports/digests delivered to management mailboxes.
   * Throws on transport failure so callers can record an accurate status.
   */
  async sendEmail(to: string, subject: string, html: string): Promise<{ sent: boolean }> {
    if (!this.mailer) throw new Error('SMTP is not configured (SMTP_HOST unset)');
    if (!to) throw new Error('recipient address required');
    const fromAddr = process.env.SMTP_FROM || 'noreply@bpm.local';
    const fromName = (process.env.SMTP_FROM_NAME || '').trim();
    await this.mailer.sendMail({
      from: fromName ? `"${fromName}" <${fromAddr}>` : fromAddr,
      to,
      subject,
      html,
    });
    return { sent: true };
  }

  async findForUser(tenantId: string, userId: string, unreadOnly = false, page = 1, pageSize = 30) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const readCond = unreadOnly ? `AND n.read_at IS NULL` : '';
    const [rows, count] = await Promise.all([
      this.db.query(
        `SELECT * FROM notifications n WHERE n.tenant_id=$1 AND n.recipient_id=$2 ${readCond}
         ORDER BY n.created_at DESC LIMIT $3 OFFSET $4`,
        [tenantId, userId, limit, offset],
      ),
      this.db.query(`SELECT COUNT(*) FROM notifications n WHERE n.tenant_id=$1 AND n.recipient_id=$2 ${readCond}`, [tenantId, userId]),
    ]);
    return { data: rows.rows, total: parseInt(count.rows[0].count), page, pageSize };
  }

  async markRead(tenantId: string, userId: string, ids: string[]) {
    if (!ids.length) {
      // Mark all unread
      await this.db.query(`UPDATE notifications SET read_at=NOW() WHERE tenant_id=$1 AND recipient_id=$2 AND read_at IS NULL`, [tenantId, userId]);
    } else {
      await this.db.query(
        `UPDATE notifications SET read_at=NOW() WHERE tenant_id=$1 AND recipient_id=$2 AND id=ANY($3::uuid[])`,
        [tenantId, userId, ids],
      );
    }
    return { ok: true };
  }

  async getUnreadCount(tenantId: string, userId: string): Promise<number> {
    const r = await this.db.query(
      `SELECT COUNT(*) FROM notifications WHERE tenant_id=$1 AND recipient_id=$2 AND read_at IS NULL`,
      [tenantId, userId],
    );
    return parseInt(r.rows[0].count);
  }
}
