import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DatabaseService } from '../database/database.service';

const MAX_ATTEMPTS = 6;

/**
 * C5 — durable alarm⇄case synchronisation.
 *
 * Alarm→case state changes are enqueued here (not fire-and-forget HTTP) and a
 * worker delivers them with exponential backoff + dead-letter, so a transient
 * case-service outage never loses an alarm resolution. reconcile() repairs any
 * drift in both directions (alarm resolved but case open → enqueue resolve;
 * case resolved by a human but the mapping is stale → ack the mapping).
 */
@Injectable()
export class CaseSyncOutboxService {
  private readonly logger = new Logger(CaseSyncOutboxService.name);
  constructor(private readonly db: DatabaseService) {}

  private get caseUrl() { return (process.env.CASE_SERVICE_URL || 'http://case-service:3004').replace(/\/$/, ''); }
  private get tenant()  { return process.env.DEFAULT_TENANT_ID ?? 'a0000000-0000-0000-0000-000000000001'; }
  private get sysUser() { return process.env.ALARM_SYSTEM_USER_ID ?? 'system'; }

  async enqueue(ticketId: string, action: string, payload: Record<string, any> = {}): Promise<void> {
    await this.db.query(
      `INSERT INTO case_sync_outbox(ticket_id, action, payload) VALUES($1,$2,$3)`,
      [ticketId, action, JSON.stringify(payload)],
    );
  }

  /** Deliver due pending rows; backoff on failure, dead-letter after MAX_ATTEMPTS. */
  async processPending(limit = 50): Promise<{ delivered: number; retried: number; dead: number }> {
    const res = await this.db.query(
      `SELECT * FROM case_sync_outbox
        WHERE status='pending' AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at ASC LIMIT $1`,
      [limit],
    );
    let delivered = 0, retried = 0, dead = 0;
    for (const row of res.rows) {
      try {
        await this.deliver(row);
        await this.db.query(
          `UPDATE case_sync_outbox SET status='delivered', attempts=attempts+1, updated_at=NOW() WHERE id=$1`,
          [row.id],
        );
        if (row.action === 'resolve') {
          await this.db.query(
            `UPDATE alarm_ticket_map SET ticket_status='resolved', resolved_at=NOW(), updated_at=NOW()
              WHERE ticket_id=$1 AND COALESCE(ticket_status,'') <> 'resolved'`,
            [row.ticket_id],
          );
        }
        delivered++;
      } catch (e: any) {
        const attempts = row.attempts + 1;
        const msg = (e.response?.data?.message || e.message || 'unknown').slice(0, 500);
        if (attempts >= MAX_ATTEMPTS) {
          await this.db.query(
            `UPDATE case_sync_outbox SET status='dead', attempts=$2, last_error=$3, updated_at=NOW() WHERE id=$1`,
            [row.id, attempts, msg],
          );
          this.logger.error(`Outbox ${row.id} (${row.action} ${row.ticket_id}) dead-lettered after ${attempts} attempts: ${msg}`);
          dead++;
        } else {
          const backoffSec = Math.min(300, Math.pow(2, attempts) * 5); // 10,20,40,80,160,300
          await this.db.query(
            `UPDATE case_sync_outbox SET attempts=$2, last_error=$3,
                    next_attempt_at = NOW() + ($4 || ' seconds')::interval, updated_at=NOW()
              WHERE id=$1`,
            [row.id, attempts, msg, String(backoffSec)],
          );
          retried++;
        }
      }
    }
    return { delivered, retried, dead };
  }

  private async deliver(row: any): Promise<void> {
    const headers = { 'Content-Type': 'application/json', 'X-Tenant-ID': this.tenant, 'X-User-ID': this.sysUser };
    if (row.action === 'resolve') {
      // Idempotent: if the case is already terminal, treat as delivered. (A
      // missing/unreachable case throws below and is retried, as it should be.)
      const cur = await axios
        .get(`${this.caseUrl}/api/cases/${row.ticket_id}`, { headers, timeout: 10_000 })
        .then(r => r.data);
      if (['resolved', 'closed', 'cancelled'].includes(cur?.status)) return;
      await axios.patch(
        `${this.caseUrl}/api/cases/${row.ticket_id}/transition`,
        { status: 'resolved', comment: row.payload?.comment || 'Alarm resolved (auto)' },
        { headers, timeout: 10_000 },
      );
      return;
    }
    throw new Error(`Unknown outbox action: ${row.action}`);
  }

  /** Repair alarm⇄case drift in both directions. */
  async reconcile(): Promise<{ enqueued: number; acked: number }> {
    // alarm RESOLVED/CLOSED but its case is still open and nothing queued → enqueue a resolve
    const drift = await this.db.query(
      `SELECT m.ticket_id
         FROM alarm_ticket_map m
         JOIN unified_alarms a ON a.id = m.unified_alarm_id
         JOIN cases c ON c.id::text = m.ticket_id
        WHERE a.status IN ('RESOLVED','CLOSED')
          AND c.status NOT IN ('resolved','closed','cancelled')
          AND COALESCE(m.ticket_status,'') <> 'resolved'
          AND NOT EXISTS (
            SELECT 1 FROM case_sync_outbox o
             WHERE o.ticket_id = m.ticket_id AND o.action='resolve' AND o.status='pending')`,
    );
    for (const row of drift.rows) {
      await this.enqueue(row.ticket_id, 'resolve', { comment: 'Reconciliation: alarm resolved, closing linked case', reconcile: true });
    }
    // case resolved/closed by a human but the alarm mapping is stale → ack it (case→alarm feedback)
    const ack = await this.db.query(
      `UPDATE alarm_ticket_map m
          SET ticket_status='resolved', resolved_at=NOW(), updated_at=NOW()
         FROM cases c
        WHERE c.id::text = m.ticket_id
          AND c.status IN ('resolved','closed')
          AND COALESCE(m.ticket_status,'') <> 'resolved'
        RETURNING m.id`,
    );
    return { enqueued: drift.rows.length, acked: ack.rows.length };
  }
}
