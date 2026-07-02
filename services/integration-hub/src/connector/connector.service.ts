import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { AuditService } from '../audit/audit.service';
import { assertPublicUrl } from './url-guard';
import axios from 'axios';

@Injectable()
export class ConnectorService {
  private readonly logger = new Logger(ConnectorService.name);
  private cronJobs = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly db: DatabaseService,
    private readonly kafka: KafkaProducerService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, page = 1, pageSize = 20) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const [rows, count] = await Promise.all([
      this.db.query(
        `SELECT id, tenant_id, name, type, status, config->'url' as url, trigger_config, last_run_at, last_run_status, created_at
         FROM connectors WHERE tenant_id=$1 ORDER BY name LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      ),
      this.db.query(`SELECT COUNT(*) FROM connectors WHERE tenant_id=$1`, [tenantId]),
    ]);
    return { data: rows.rows, total: parseInt(count.rows[0].count), page, pageSize };
  }

  async findOne(tenantId: string, id: string) {
    const r = await this.db.query(`SELECT * FROM connectors WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    if (!r.rows.length) throw new NotFoundException('Connector not found');
    return r.rows[0];
  }

  async create(tenantId: string, dto: any, actorId?: string) {
    const r = await this.db.query(
      `INSERT INTO connectors(tenant_id, name, type, config, trigger_config, status)
       VALUES($1,$2,$3,$4,$5,'inactive') RETURNING *`,
      [tenantId, dto.name, dto.type, JSON.stringify(dto.config || {}), JSON.stringify(dto.trigger_config || {})],
    );
    const conn = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'connector', entityId: conn.id, action: 'created', actorId, afterState: { name: conn.name, type: conn.type } });
    await this.kafka.produce('bpm.connectors.updated', { event: 'connector.created', tenantId, connectorId: conn.id });
    return conn;
  }

  async update(tenantId: string, id: string, dto: any, actorId?: string) {
    const existing = await this.findOne(tenantId, id);
    const fields: string[] = ['updated_at=NOW()'];
    const vals: any[] = [id, tenantId];
    let i = 3;
    if (dto.name !== undefined)           { fields.push(`name=$${i++}`);           vals.push(dto.name); }
    if (dto.config !== undefined)         { fields.push(`config=$${i++}`);         vals.push(JSON.stringify(dto.config)); }
    if (dto.trigger_config !== undefined) { fields.push(`trigger_config=$${i++}`); vals.push(JSON.stringify(dto.trigger_config)); }
    const r = await this.db.query(`UPDATE connectors SET ${fields.join(',')} WHERE id=$1 AND tenant_id=$2 RETURNING *`, vals);
    await this.audit.log({ tenantId, entityType: 'connector', entityId: id, action: 'updated', actorId, beforeState: existing, afterState: r.rows[0] });
    return r.rows[0];
  }

  async activate(tenantId: string, id: string, actorId?: string) {
    const conn = await this.findOne(tenantId, id);
    await this.db.query(`UPDATE connectors SET status='active', updated_at=NOW() WHERE id=$1`, [id]);
    // Schedule cron if applicable
    if (conn.type === 'cron' && conn.trigger_config?.schedule) {
      this.scheduleCron(conn);
    }
    await this.audit.log({ tenantId, entityType: 'connector', entityId: id, action: 'activated', actorId });
    await this.kafka.produce('bpm.connectors.updated', { event: 'connector.activated', tenantId, connectorId: id });
    return this.findOne(tenantId, id);
  }

  async deactivate(tenantId: string, id: string, actorId?: string) {
    await this.db.query(`UPDATE connectors SET status='inactive', updated_at=NOW() WHERE id=$1`, [id]);
    this.clearCron(id);
    await this.audit.log({ tenantId, entityType: 'connector', entityId: id, action: 'deactivated', actorId });
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string, actorId?: string) {
    const conn = await this.findOne(tenantId, id);
    this.clearCron(id);
    await this.db.query(`DELETE FROM connectors WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    await this.audit.log({ tenantId, entityType: 'connector', entityId: id, action: 'deleted', actorId, beforeState: { name: conn.name } });
  }

  /** Execute a connector by ID manually or programmatically */
  async execute(tenantId: string, id: string, payload: any = {}, triggeredBy = 'manual') {
    const conn = await this.findOne(tenantId, id);
    const startTime = Date.now();
    let status = 'success';
    let responseBody: any = null;
    let errorMessage: string | null = null;

    try {
      if (conn.type === 'rest' || conn.type === 'webhook') {
        const cfg = conn.config;
        const method = (cfg.method || 'POST').toUpperCase();
        const url = this.interpolate(cfg.url, payload);
        // SSRF guard: only http(s) to a publicly-resolvable host — blocks cloud
        // metadata and internal services.
        await assertPublicUrl(url);
        const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(cfg.headers || {}) };
        if (cfg.auth_type === 'bearer' && cfg.auth_token) {
          headers['Authorization'] = `Bearer ${cfg.auth_token}`;
        } else if (cfg.auth_type === 'basic' && cfg.auth_username) {
          const encoded = Buffer.from(`${cfg.auth_username}:${cfg.auth_password}`).toString('base64');
          headers['Authorization'] = `Basic ${encoded}`;
        }
        const resp = await axios({ method, url, headers, data: payload, timeout: 30_000 });
        responseBody = resp.data;
      } else if (conn.type === 'kafka_producer') {
        const cfg = conn.config;
        await this.kafka.produce(cfg.topic, { ...payload, _connectorId: id });
        responseBody = { produced: true, topic: cfg.topic };
      } else {
        responseBody = { executed: true, type: conn.type };
      }
    } catch (e) {
      status = 'error';
      errorMessage = e.message;
      this.logger.error(`Connector ${conn.name} (${id}) failed: ${e.message}`);
    }

    const duration = Date.now() - startTime;
    await this.logExecution(tenantId, id, triggeredBy, payload, responseBody, status, errorMessage, duration);
    await this.db.query(`UPDATE connectors SET last_run_at=NOW(), last_run_status=$1, updated_at=NOW() WHERE id=$2`, [status, id]);
    return { status, duration, response: responseBody, error: errorMessage };
  }

  private async logExecution(tenantId: string, connectorId: string, triggeredBy: string, request: any, response: any, status: string, error: string | null, durationMs: number) {
    try {
      await this.db.query(
        `INSERT INTO connector_logs(tenant_id, connector_id, triggered_by, request_payload, response_payload, status, error_message, duration_ms)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [tenantId, connectorId, triggeredBy, JSON.stringify(request), JSON.stringify(response), status, error, durationMs],
      );
    } catch (e) { this.logger.error(`Log write failed: ${e.message}`); }
  }

  async getLogs(tenantId: string, connectorId: string, page = 1, pageSize = 50) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const [rows, count] = await Promise.all([
      this.db.query(
        `SELECT * FROM connector_logs WHERE tenant_id=$1 AND connector_id=$2 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
        [tenantId, connectorId, limit, offset],
      ),
      this.db.query(`SELECT COUNT(*) FROM connector_logs WHERE tenant_id=$1 AND connector_id=$2`, [tenantId, connectorId]),
    ]);
    return { data: rows.rows, total: parseInt(count.rows[0].count), page, pageSize };
  }

  /** Simple {{variable}} interpolation in URL templates */
  private interpolate(template: string, vars: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? ''));
  }

  /** Schedule a cron connector using setInterval approximation for simple intervals */
  private scheduleCron(connector: any) {
    this.clearCron(connector.id);
    const schedule = connector.trigger_config?.schedule;
    // Simple: support "every_Xm" or "every_Xh" patterns; full cron would need node-cron
    let ms = 0;
    const mMatch = schedule?.match(/every_(\d+)m/);
    const hMatch = schedule?.match(/every_(\d+)h/);
    if (mMatch) ms = parseInt(mMatch[1]) * 60_000;
    else if (hMatch) ms = parseInt(hMatch[1]) * 3_600_000;
    if (ms > 0) {
      const timer = setInterval(
        () => this.execute(connector.tenant_id, connector.id, {}, 'cron').catch(e => this.logger.error(e.message)),
        ms,
      );
      this.cronJobs.set(connector.id, timer);
      this.logger.log(`Cron scheduled for connector ${connector.id} every ${ms}ms`);
    }
  }

  private clearCron(id: string) {
    if (this.cronJobs.has(id)) {
      clearInterval(this.cronJobs.get(id)!);
      this.cronJobs.delete(id);
    }
  }

  /** On boot, reload all active cron connectors */
  async loadActiveCrons() {
    const r = await this.db.query(`SELECT * FROM connectors WHERE type='cron' AND status='active'`);
    for (const conn of r.rows) {
      this.scheduleCron(conn);
    }
    this.logger.log(`Loaded ${r.rows.length} active cron connectors`);
  }
}
