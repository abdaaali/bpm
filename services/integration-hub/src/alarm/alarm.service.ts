import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MdmEnrichmentService } from './mdm-enrichment.service';
import { SlaCalculatorService } from './sla-calculator.service';
import { BpmTicketService } from './bpm-ticket.service';
import { CaseSyncOutboxService } from './case-sync-outbox.service';
import { AlarmMetricsService } from './alarm-metrics.service';
import { normalizeZabbix } from './normalizers/zabbix.normalizer';
import { normalizeAlertmanager } from './normalizers/alertmanager.normalizer';
import { normalizeGrafana } from './normalizers/grafana.normalizer';
import { initPriorityMapper, mapPriority } from './normalizers/priority-mapper';
import { UnifiedAlarm, AlarmStatus, SlaCalculationResult } from './dto/unified-alarm.dto';

const ACTIVE_STATUSES = ['FIRING', 'OPEN'];

@Injectable()
export class AlarmService {
  private readonly logger = new Logger(AlarmService.name);

  private get dedupTtl()      { return parseInt(process.env.ALARM_DEDUP_TTL_SECONDS ?? '900', 10); }
  private get minSeverity()   { return (process.env.ALARM_MIN_SEVERITY_TO_TICKET ?? 'high').toLowerCase(); }
  private get enrichMode()    { return process.env.MDM_ENRICHMENT_MODE ?? 'async'; }
  private get slaEnabled()    { return (process.env.SLA_ENABLED ?? 'true') === 'true'; }

  private readonly SEVERITY_ORDER = ['critical', 'high', 'warning', 'info', 'unknown'];

  constructor(
    private readonly db:       DatabaseService,
    private readonly mdm:      MdmEnrichmentService,
    private readonly sla:      SlaCalculatorService,
    private readonly ticket:   BpmTicketService,
    private readonly metrics:  AlarmMetricsService,
    private readonly outbox:   CaseSyncOutboxService,
  ) {
    initPriorityMapper();
  }

  // ─── Ingestion Entry Points ─────────────────────────────────────────────

  async ingestZabbix(raw: Record<string, any>): Promise<IngestResult> {
    this.metrics.alarmsReceived.inc({ source: 'Zabbix' });
    const alarm = normalizeZabbix(raw);
    this.metrics.alarmsNormalized.inc({ source: 'Zabbix' });
    return this.processAlarm(alarm);
  }

  async ingestAlertmanager(raw: Record<string, any>): Promise<IngestResult[]> {
    this.metrics.alarmsReceived.inc({ source: 'Prometheus' });
    const alarms = normalizeAlertmanager(raw);
    this.metrics.alarmsNormalized.inc({ source: 'Prometheus' });
    return Promise.all(alarms.map(a => this.processAlarm(a)));
  }

  async ingestGrafana(raw: Record<string, any>): Promise<IngestResult[]> {
    this.metrics.alarmsReceived.inc({ source: 'Grafana' });
    const alarms = normalizeGrafana(raw);
    this.metrics.alarmsNormalized.inc({ source: 'Grafana' });
    return Promise.all(alarms.map(a => this.processAlarm(a)));
  }

  // ─── Core Processing Pipeline ────────────────────────────────────────────

  async processAlarm(alarm: UnifiedAlarm): Promise<IngestResult> {
    // Handle RESOLVED path separately
    if (alarm.status === 'RESOLVED') {
      return this.handleResolved(alarm);
    }

    // Check dedup
    const existing = await this.findActiveByDedupHash(alarm.dedup_hash);
    if (existing) {
      return this.handleDeduplicated(existing, alarm);
    }

    // New alarm
    const id = await this.insertAlarm(alarm);
    alarm = { ...alarm };

    // Enrichment
    if (this.enrichMode === 'sync_best_effort') {
      alarm = await this.enrichSync(id, alarm);
    } else {
      // async: enqueue and continue
      await this.enqueueEnrichment(id);
    }

    // SLA calculation (only if enrichment succeeded in sync mode)
    if (this.slaEnabled && alarm.sla_params) {
      const slaResult = this.computeSla(alarm);
      await this.saveSlaResult(id, slaResult);
      alarm = { ...alarm, ...slaResultToAlarm(slaResult) };
    }

    // Create BPM ticket if severity meets threshold
    if (this.shouldCreateTicket(alarm.severity)) {
      // Reload alarm with latest data (SLA fields)
      const saved = await this.findById(id);
      if (saved) {
        const ticketRef = await this.ticket.createTicket(saved);
        if (ticketRef) {
          await this.saveTicketMapping(alarm, id, ticketRef);
          this.metrics.ticketsCreated.inc();
        }
      }
    }

    return { action: 'created', id, deduplicated: false };
  }

  private async handleDeduplicated(
    existing: DbAlarmRow,
    incoming: UnifiedAlarm,
  ): Promise<IngestResult> {
    this.metrics.alarmsDeduped.inc({ source: incoming.source_system });
    this.logger.log(`Dedup hit for hash ${incoming.dedup_hash} → alarm ${existing.id}`);

    // Append raw payload + update timestamps / count
    await this.db.query(
      `UPDATE unified_alarms
       SET last_occurrence = $1,
           event_count     = event_count + 1,
           raw_payload     = jsonb_set(raw_payload, '{_history}',
                               COALESCE(raw_payload->'_history', '[]'::jsonb) || $2::jsonb),
           updated_at      = NOW()
       WHERE id = $3`,
      [incoming.last_occurrence, JSON.stringify([incoming.raw_payload]), existing.id],
    );

    // Refresh SLA remaining
    if (this.slaEnabled && existing.sla_params) {
      const slaParams = typeof existing.sla_params === 'string'
        ? JSON.parse(existing.sla_params)
        : existing.sla_params;
      const slaResult = this.sla.calculate(slaParams, new Date(existing.first_occurrence));
      await this.saveSlaResult(existing.id, slaResult);
      this.metrics.slaCalculated.inc();
    }

    // Update ticket if exists
    const mapping = await this.findTicketMapping(existing.id);
    if (mapping?.ticket_id) {
      await this.ticket.updateTicket(mapping.ticket_id, {
        metadata: {
          last_occurrence: incoming.last_occurrence,
          event_count:     (existing.event_count ?? 1) + 1,
          sla_status:      existing.sla_status,
        },
      });
      this.metrics.ticketsUpdated.inc();
    }

    return { action: 'deduplicated', id: existing.id, deduplicated: true };
  }

  private async handleResolved(alarm: UnifiedAlarm): Promise<IngestResult> {
    // Find active alarm by source_system + alarm_id
    const r = await this.db.query(
      `SELECT * FROM unified_alarms
       WHERE source_system = $1 AND alarm_id = $2 AND status = ANY($3::text[])
       ORDER BY created_at DESC LIMIT 1`,
      [alarm.source_system, alarm.alarm_id, ACTIVE_STATUSES],
    );

    if (!r.rows.length) {
      // No active alarm found; still persist the RESOLVED event
      const id = await this.insertAlarm(alarm);
      return { action: 'resolved_no_match', id, deduplicated: false };
    }

    const existing: DbAlarmRow = r.rows[0];
    await this.db.query(
      `UPDATE unified_alarms
       SET status         = 'RESOLVED',
           last_occurrence = $1,
           updated_at      = NOW()
       WHERE id = $2`,
      [alarm.last_occurrence, existing.id],
    );

    // Close ticket — enqueue durably so a transient case-service outage can't
    // lose the resolution. The worker delivers with retry and marks the mapping
    // resolved on success.
    const mapping = await this.findTicketMapping(existing.id);
    if (mapping?.ticket_id) {
      await this.outbox.enqueue(mapping.ticket_id, 'resolve', {
        alarmId: alarm.alarm_id,
        source: alarm.source_system,
        comment: `Alarm resolved by ${alarm.source_system}. Alarm ID: ${alarm.alarm_id}`,
      });
      this.metrics.ticketsUpdated.inc();
    }

    return { action: 'resolved', id: existing.id, deduplicated: false };
  }

  // ─── Enrichment ──────────────────────────────────────────────────────────

  async enrichSync(id: string, alarm: UnifiedAlarm): Promise<UnifiedAlarm> {
    try {
      const result = await this.mdm.enrich(alarm.site_id, alarm.host_name, alarm.source_system, alarm.raw_payload as any);
      if (result) {
        this.metrics.mdmEnrichmentSuccess.inc();
        await this.applyEnrichment(id, result);
        return {
          ...alarm,
          canonical_site_id:   result.canonical_site_id,
          canonical_asset_id:  result.canonical_asset_id,
          canonical_service_id: result.canonical_service_id,
          region:              result.region,
          cluster:             result.cluster,
          vendor:              result.vendor,
          technology_domain:   result.technology_domain,
          assignment_group:    result.assignment_group,
          oncall_group:        result.oncall_group,
          sla_class:           result.sla_class,
          location_path:       result.location_path,
          enrichment:          result.raw_response,
          sla_params:          result.sla,
        };
      }
    } catch (e) {
      this.metrics.mdmEnrichmentFail.inc();
      this.logger.warn(`Sync enrichment error for ${id}: ${e.message}`);
    }
    return alarm;
  }

  async runEnrichmentJob(jobId: string, alarmId: string): Promise<void> {
    // Mark as processing
    await this.db.query(
      `UPDATE alarm_enrichment_jobs SET status='processing', attempts=attempts+1, updated_at=NOW() WHERE id=$1`,
      [jobId],
    );

    try {
      const r = await this.db.query(`SELECT * FROM unified_alarms WHERE id=$1`, [alarmId]);
      if (!r.rows.length) throw new Error('Alarm not found');
      const alarm: DbAlarmRow = r.rows[0];

      const result = await this.mdm.enrich(
        alarm.site_id ?? '', alarm.host_name ?? '', alarm.source_system, {},
      );

      if (result) {
        this.metrics.mdmEnrichmentSuccess.inc();
        await this.applyEnrichment(alarmId, result);

        // Compute SLA after enrichment
        if (this.slaEnabled && result.sla) {
          const slaResult = this.sla.calculate(result.sla, new Date(alarm.first_occurrence));
          await this.saveSlaResult(alarmId, slaResult);
          this.metrics.slaCalculated.inc();

          // Update ticket with enrichment + SLA
          const mapping = await this.findTicketMapping(alarmId);
          if (mapping?.ticket_id) {
            await this.ticket.updateTicket(mapping.ticket_id, {
              metadata: {
                assignment_group: result.assignment_group,
                oncall_group:     result.oncall_group,
                region:           result.region,
                sla_status:       slaResult.sla_status,
                sla_breach_at:    slaResult.sla_breach_at?.toISOString(),
                restore_due_at:   slaResult.restore_due_at?.toISOString(),
              },
            });
            this.metrics.ticketsUpdated.inc();
          }
        }
      } else {
        this.metrics.mdmEnrichmentFail.inc();
      }

      await this.db.query(
        `UPDATE alarm_enrichment_jobs SET status='done', processed_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [jobId],
      );
    } catch (e) {
      this.logger.error(`Enrichment job ${jobId} failed: ${e.message}`);
      await this.db.query(
        `UPDATE alarm_enrichment_jobs SET status='failed', last_error=$1, processed_at=NOW(), updated_at=NOW() WHERE id=$2`,
        [e.message, jobId],
      );
    }
  }

  private async applyEnrichment(alarmId: string, result: any): Promise<void> {
    await this.db.query(
      `UPDATE unified_alarms
       SET canonical_site_id  = $1,
           canonical_asset_id = $2,
           canonical_service_id = $3,
           region             = $4,
           cluster            = $5,
           vendor             = $6,
           technology_domain  = $7,
           assignment_group   = $8,
           oncall_group       = $9,
           sla_class          = $10,
           location_path      = $11,
           enrichment         = $12::jsonb,
           sla_params         = $13::jsonb,
           updated_at         = NOW()
       WHERE id = $14`,
      [
        result.canonical_site_id  ?? null,
        result.canonical_asset_id ?? null,
        result.canonical_service_id ?? null,
        result.region             ?? null,
        result.cluster            ?? null,
        result.vendor             ?? null,
        result.technology_domain  ?? null,
        result.assignment_group   ?? null,
        result.oncall_group       ?? null,
        result.sla_class          ?? null,
        result.location_path      ?? null,
        JSON.stringify(result.raw_response ?? {}),
        result.sla ? JSON.stringify(result.sla) : null,
        alarmId,
      ],
    );
  }

  // ─── SLA ─────────────────────────────────────────────────────────────────

  computeSla(alarm: UnifiedAlarm): SlaCalculationResult {
    if (!alarm.sla_params) {
      return { sla_status: 'NOT_APPLICABLE', sla_last_calculated_at: new Date() };
    }
    const startAt = this.determineSlaStart(alarm);
    const result = this.sla.calculate(alarm.sla_params, startAt);
    this.metrics.slaCalculated.inc();
    if (result.sla_status === 'BREACHED') this.metrics.slaBreached.inc();
    if (result.sla_status === 'AT_RISK')  this.metrics.slaAtRisk.inc();
    return result;
  }

  private determineSlaStart(alarm: UnifiedAlarm): Date {
    const rule = alarm.sla_params?.sla_start_rule ?? 'alarm_first_occurrence';
    if (rule === 'alarm_first_occurrence') return new Date(alarm.first_occurrence);
    // ticket_created / ack_time: fall back to first_occurrence if not available
    return new Date(alarm.first_occurrence);
  }

  private async saveSlaResult(alarmId: string, r: SlaCalculationResult): Promise<void> {
    await this.db.query(
      `UPDATE unified_alarms
       SET response_due_at        = $1,
           onsite_due_at          = $2,
           restore_due_at         = $3,
           sla_breach_at          = $4,
           sla_remaining_seconds  = $5,
           sla_status             = $6,
           sla_last_calculated_at = $7,
           updated_at             = NOW()
       WHERE id = $8`,
      [
        r.response_due_at  ?? null,
        r.onsite_due_at    ?? null,
        r.restore_due_at   ?? null,
        r.sla_breach_at    ?? null,
        r.sla_remaining_seconds ?? null,
        r.sla_status,
        r.sla_last_calculated_at,
        alarmId,
      ],
    );
  }

  /** Periodic SLA refresh: called by alarm-worker */
  async refreshActiveSla(): Promise<void> {
    const r = await this.db.query(
      `SELECT id, source_system, alarm_id, first_occurrence, sla_params, sla_status
       FROM unified_alarms
       WHERE status = ANY($1::text[])
         AND sla_params IS NOT NULL
         AND (sla_last_calculated_at IS NULL OR sla_last_calculated_at < NOW() - INTERVAL '1 minute')
       LIMIT 500`,
      [ACTIVE_STATUSES],
    );

    for (const row of r.rows) {
      try {
        const slaParams = typeof row.sla_params === 'string' ? JSON.parse(row.sla_params) : row.sla_params;
        const prevStatus = row.sla_status;
        const result = this.sla.calculate(slaParams, new Date(row.first_occurrence));
        await this.saveSlaResult(row.id, result);

        if (result.sla_status === 'BREACHED') this.metrics.slaBreached.inc();
        if (result.sla_status === 'AT_RISK')  this.metrics.slaAtRisk.inc();

        // Update ticket SLA snapshot if status changed
        if (prevStatus !== result.sla_status) {
          const mapping = await this.findTicketMapping(row.id);
          if (mapping?.ticket_id) {
            await this.ticket.updateTicket(mapping.ticket_id, {
              metadata: {
                sla_status:           result.sla_status,
                sla_remaining_seconds: result.sla_remaining_seconds,
                sla_breach_at:        result.sla_breach_at?.toISOString(),
              },
            });
            this.metrics.ticketsUpdated.inc();
          }
        }
      } catch (e) {
        this.logger.warn(`SLA refresh failed for alarm ${row.id}: ${e.message}`);
      }
    }

    // Update metrics gauge
    const activeCount = await this.db.query(
      `SELECT COUNT(*) FROM unified_alarms WHERE status = ANY($1::text[])`,
      [ACTIVE_STATUSES],
    );
    this.metrics.activeAlarms.set(parseInt(activeCount.rows[0].count, 10));
  }

  // ─── Ticket mapping ──────────────────────────────────────────────────────

  private async saveTicketMapping(
    alarm: UnifiedAlarm,
    alarmDbId: string,
    ref: { ticket_id: string; ticket_number: string },
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO alarm_ticket_map
         (source_system, alarm_id, unified_alarm_id, ticket_id, ticket_number, ticket_status,
          sla_status, response_due_at, restore_due_at, sla_breach_at)
       VALUES ($1,$2,$3,$4,$5,'open',$6,$7,$8,$9)
       ON CONFLICT (source_system, alarm_id) DO UPDATE
         SET ticket_id=$4, ticket_number=$5, ticket_status='open',
             sla_status=$6, response_due_at=$7, restore_due_at=$8, sla_breach_at=$9,
             updated_at=NOW()`,
      [
        alarm.source_system, alarm.alarm_id, alarmDbId,
        ref.ticket_id, ref.ticket_number,
        alarm.sla_status ?? 'NOT_APPLICABLE',
        alarm.response_due_at ?? null,
        alarm.restore_due_at  ?? null,
        alarm.sla_breach_at   ?? null,
      ],
    );
  }

  private async findTicketMapping(alarmDbId: string): Promise<any> {
    const r = await this.db.query(
      `SELECT * FROM alarm_ticket_map WHERE unified_alarm_id=$1 LIMIT 1`,
      [alarmDbId],
    );
    return r.rows[0] ?? null;
  }

  // ─── DB helpers ──────────────────────────────────────────────────────────

  private async findActiveByDedupHash(dedupHash: string): Promise<DbAlarmRow | null> {
    const ttl = this.dedupTtl;
    const r = await this.db.query(
      `SELECT * FROM unified_alarms
       WHERE dedup_hash = $1
         AND status = ANY($2::text[])
         AND created_at > NOW() - ($3 || ' seconds')::INTERVAL
       ORDER BY created_at DESC
       LIMIT 1`,
      [dedupHash, ACTIVE_STATUSES, String(ttl)],
    );
    return r.rows[0] ?? null;
  }

  private async insertAlarm(alarm: UnifiedAlarm): Promise<string> {
    const r = await this.db.query(
      `INSERT INTO unified_alarms
         (source_system, alarm_id, severity, priority, title, description,
          site_id, host_name, service_name, category,
          first_occurrence, last_occurrence, status, probable_cause,
          event_count, correlation_id, dedup_hash, raw_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)
       RETURNING id`,
      [
        alarm.source_system,
        alarm.alarm_id,
        alarm.severity,
        alarm.priority,
        alarm.title,
        alarm.description ?? '',
        alarm.site_id ?? '',
        alarm.host_name ?? '',
        alarm.service_name ?? null,
        alarm.category ?? 'Other',
        alarm.first_occurrence,
        alarm.last_occurrence,
        alarm.status,
        alarm.probable_cause ?? null,
        alarm.event_count,
        alarm.correlation_id,
        alarm.dedup_hash,
        JSON.stringify(alarm.raw_payload),
      ],
    );
    return r.rows[0].id as string;
  }

  async findById(id: string): Promise<UnifiedAlarm | null> {
    const r = await this.db.query(`SELECT * FROM unified_alarms WHERE id=$1`, [id]);
    return r.rows[0] ? this.rowToAlarm(r.rows[0]) : null;
  }

  async list(page = 1, pageSize = 20, filters: AlarmFilters = {}): Promise<{ data: any[]; total: number; page: number; pageSize: number }> {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const conditions: string[] = [];
    const vals: any[] = [];
    let i = 1;

    if (filters.status) { conditions.push(`status=$${i++}`); vals.push(filters.status); }
    if (filters.source_system) { conditions.push(`source_system=$${i++}`); vals.push(filters.source_system); }
    if (filters.severity) { conditions.push(`severity=$${i++}`); vals.push(filters.severity); }
    if (filters.site_id) { conditions.push(`site_id=$${i++}`); vals.push(filters.site_id); }
    if (filters.sla_status) { conditions.push(`sla_status=$${i++}`); vals.push(filters.sla_status); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows, count] = await Promise.all([
      this.db.query(`SELECT * FROM unified_alarms ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`, [...vals, limit, offset]),
      this.db.query(`SELECT COUNT(*) FROM unified_alarms ${where}`, vals),
    ]);
    return { data: rows.rows, total: parseInt(count.rows[0].count, 10), page, pageSize };
  }

  async getTicketMapping(alarmDbId: string): Promise<any> {
    return this.findTicketMapping(alarmDbId);
  }

  private async enqueueEnrichment(alarmId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO alarm_enrichment_jobs(unified_alarm_id) VALUES($1)`,
      [alarmId],
    );
  }

  async getPendingEnrichmentJobs(limit = 50): Promise<any[]> {
    const r = await this.db.query(
      `SELECT * FROM alarm_enrichment_jobs
       WHERE status = 'pending' AND attempts < 3
       ORDER BY scheduled_at ASC
       LIMIT $1`,
      [limit],
    );
    return r.rows;
  }

  async getPendingEnrichmentCount(): Promise<number> {
    const r = await this.db.query(`SELECT COUNT(*) FROM alarm_enrichment_jobs WHERE status='pending'`);
    return parseInt(r.rows[0].count, 10);
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  private shouldCreateTicket(severity: string): boolean {
    const order = this.SEVERITY_ORDER;
    const minIdx = order.indexOf(this.minSeverity);
    const sevIdx = order.indexOf(severity.toLowerCase());
    if (minIdx === -1 || sevIdx === -1) return sevIdx <= 1; // default: critical+high
    return sevIdx <= minIdx;
  }

  private rowToAlarm(row: DbAlarmRow): UnifiedAlarm {
    return {
      alarm_id:       row.alarm_id,
      source_system:  row.source_system as any,
      severity:       row.severity,
      priority:       row.priority,
      title:          row.title,
      description:    row.description ?? '',
      site_id:        row.site_id ?? '',
      host_name:      row.host_name ?? '',
      service_name:   row.service_name,
      category:       row.category,
      first_occurrence: row.first_occurrence?.toISOString?.() ?? String(row.first_occurrence),
      last_occurrence:  row.last_occurrence?.toISOString?.()  ?? String(row.last_occurrence),
      status:         row.status as any,
      probable_cause: row.probable_cause,
      event_count:    row.event_count,
      correlation_id: row.correlation_id ?? '',
      dedup_hash:     row.dedup_hash,
      raw_payload:    typeof row.raw_payload === 'string' ? JSON.parse(row.raw_payload) : (row.raw_payload ?? {}),
      canonical_site_id: row.canonical_site_id,
      canonical_asset_id: row.canonical_asset_id,
      canonical_service_id: row.canonical_service_id,
      region:         row.region,
      cluster:        row.cluster,
      vendor:         row.vendor,
      technology_domain: row.technology_domain,
      assignment_group: row.assignment_group,
      oncall_group:   row.oncall_group,
      sla_class:      row.sla_class,
      location_path:  row.location_path,
      enrichment:     row.enrichment,
      sla_params:     row.sla_params,
      response_due_at:  row.response_due_at?.toISOString?.(),
      onsite_due_at:    row.onsite_due_at?.toISOString?.(),
      restore_due_at:   row.restore_due_at?.toISOString?.(),
      sla_breach_at:    row.sla_breach_at?.toISOString?.(),
      sla_remaining_seconds: row.sla_remaining_seconds,
      sla_status:     row.sla_status as any,
      sla_last_calculated_at: row.sla_last_calculated_at?.toISOString?.(),
    };
  }
}

function slaResultToAlarm(r: SlaCalculationResult): Partial<UnifiedAlarm> {
  return {
    response_due_at:  r.response_due_at?.toISOString(),
    onsite_due_at:    r.onsite_due_at?.toISOString(),
    restore_due_at:   r.restore_due_at?.toISOString(),
    sla_breach_at:    r.sla_breach_at?.toISOString(),
    sla_remaining_seconds: r.sla_remaining_seconds,
    sla_status:       r.sla_status,
    sla_last_calculated_at: r.sla_last_calculated_at?.toISOString(),
  };
}

// ─── Local types ─────────────────────────────────────────────────────────────

interface DbAlarmRow {
  id: string;
  source_system: string;
  alarm_id: string;
  severity: string;
  priority: string;
  title: string;
  description: string;
  site_id: string;
  host_name: string;
  service_name?: string;
  category?: string;
  first_occurrence: any;
  last_occurrence: any;
  status: string;
  probable_cause?: string;
  event_count: number;
  correlation_id?: string;
  dedup_hash: string;
  raw_payload: any;
  canonical_site_id?: string;
  canonical_asset_id?: string;
  canonical_service_id?: string;
  region?: string;
  cluster?: string;
  vendor?: string;
  technology_domain?: string;
  assignment_group?: string;
  oncall_group?: string;
  sla_class?: string;
  location_path?: string;
  enrichment?: any;
  sla_params?: any;
  response_due_at?: any;
  onsite_due_at?: any;
  restore_due_at?: any;
  sla_breach_at?: any;
  sla_remaining_seconds?: number;
  sla_status?: string;
  sla_last_calculated_at?: any;
}

interface AlarmFilters {
  status?: string;
  source_system?: string;
  severity?: string;
  site_id?: string;
  sla_status?: string;
}

export interface IngestResult {
  action: 'created' | 'deduplicated' | 'resolved' | 'resolved_no_match';
  id: string;
  deduplicated: boolean;
}
