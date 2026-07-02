import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { UnifiedAlarm } from './dto/unified-alarm.dto';

@Injectable()
export class BpmTicketService {
  private readonly logger = new Logger(BpmTicketService.name);

  private get caseServiceUrl() {
    return (process.env.CASE_SERVICE_URL || 'http://case-service:3004').replace(/\/$/, '');
  }

  private get dryRun() { return (process.env.ALARM_DRY_RUN ?? 'false') === 'true'; }

  /** Build and POST an incident ticket to case-service. Returns created case object. */
  async createTicket(alarm: UnifiedAlarm): Promise<{ ticket_id: string; ticket_number: string } | null> {
    const payload = this.buildTicketPayload(alarm);

    if (this.dryRun) {
      this.logger.log(`[DRY RUN] Would create ticket: ${JSON.stringify(payload)}`);
      return null;
    }

    try {
      const resp = await axios.post(`${this.caseServiceUrl}/api/cases`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': process.env.DEFAULT_TENANT_ID ?? 'a0000000-0000-0000-0000-000000000001',
          'X-User-ID':   process.env.ALARM_SYSTEM_USER_ID ?? 'system',
          'X-Source':    'alarm-ingestion',
        },
        timeout: 10_000,
      });

      const cs = resp.data;
      this.logger.log(`Ticket created: ${cs.case_number ?? cs.id} for alarm ${alarm.alarm_id}`);
      return { ticket_id: String(cs.id), ticket_number: String(cs.case_number ?? cs.id) };
    } catch (e) {
      this.logger.error(`Failed to create BPM ticket for alarm ${alarm.alarm_id}: ${e.message}`);
      return null;
    }
  }

  /** Update an existing ticket with enrichment data / SLA snapshot */
  async updateTicket(ticketId: string, patch: Record<string, any>): Promise<void> {
    if (this.dryRun) {
      this.logger.log(`[DRY RUN] Would update ticket ${ticketId}: ${JSON.stringify(patch)}`);
      return;
    }
    try {
      await axios.patch(`${this.caseServiceUrl}/api/cases/${ticketId}`, patch, {
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': process.env.DEFAULT_TENANT_ID ?? 'a0000000-0000-0000-0000-000000000001',
          'X-User-ID':   process.env.ALARM_SYSTEM_USER_ID ?? 'system',
        },
        timeout: 10_000,
      });
    } catch (e) {
      this.logger.error(`Failed to update ticket ${ticketId}: ${e.message}`);
    }
  }

  /** Resolve/close a ticket when alarm is resolved */
  async resolveTicket(ticketId: string, alarm: UnifiedAlarm): Promise<void> {
    if (this.dryRun) {
      this.logger.log(`[DRY RUN] Would resolve ticket ${ticketId}`);
      return;
    }
    try {
      // Attempt status transition to 'resolved'
      await axios.patch(
        `${this.caseServiceUrl}/api/cases/${ticketId}/transition`,
        { status: 'resolved', comment: `Alarm resolved by ${alarm.source_system}. Alarm ID: ${alarm.alarm_id}` },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': process.env.DEFAULT_TENANT_ID ?? 'a0000000-0000-0000-0000-000000000001',
            'X-User-ID':   process.env.ALARM_SYSTEM_USER_ID ?? 'system',
          },
          timeout: 10_000,
        },
      );
    } catch (e) {
      // Fallback: try simple status PATCH
      try {
        await this.updateTicket(ticketId, { status: 'resolved' });
      } catch { /* non-fatal */ }
      this.logger.warn(`resolveTicket fallback used for ${ticketId}: ${e.message}`);
    }
  }

  private buildTicketPayload(alarm: UnifiedAlarm): Record<string, any> {
    return {
      tenant_id:   process.env.DEFAULT_TENANT_ID ?? 'a0000000-0000-0000-0000-000000000001',
      type:        'alarm',
      title:       alarm.title,
      description: [
        alarm.description,
        `Source: ${alarm.source_system} | Alarm ID: ${alarm.alarm_id}`,
        alarm.probable_cause ? `Probable cause: ${alarm.probable_cause}` : '',
        alarm.correlation_id ? `Correlation ID: ${alarm.correlation_id}` : '',
      ].filter(Boolean).join('\n'),
      priority:    this.mapPriorityToCase(alarm.priority),
      // Routing
      category:    alarm.category ?? 'Other',
      // C4 — pass the MDM-aware SLA as structured case fields so it is persisted
      // (and drives breach detection) instead of being buried in metadata.
      sla_due_at:      alarm.restore_due_at ?? alarm.response_due_at ?? undefined,
      response_due_at: alarm.response_due_at ?? undefined,
      restore_due_at:  alarm.restore_due_at ?? undefined,
      sla_profile:     alarm.sla_params?.sla_profile_id ?? 'alarm',
      sla_class:       alarm.sla_class ?? undefined,
      // Raw identifiers
      metadata: {
        source_system:        alarm.source_system,
        alarm_id:             alarm.alarm_id,
        severity:             alarm.severity,
        priority:             alarm.priority,
        site_id:              alarm.site_id,
        host_name:            alarm.host_name,
        service_name:         alarm.service_name,
        first_occurrence:     alarm.first_occurrence,
        last_occurrence:      alarm.last_occurrence,
        dedup_hash:           alarm.dedup_hash,
        correlation_id:       alarm.correlation_id,
        // MDM routing fields (may be null if not yet enriched)
        canonical_site_id:    alarm.canonical_site_id,
        region:               alarm.region,
        assignment_group:     alarm.assignment_group,
        oncall_group:         alarm.oncall_group,
        sla_class:            alarm.sla_class,
        // SLA outputs
        sla_profile_id:       alarm.sla_params?.sla_profile_id,
        sla_calendar_id:      alarm.sla_params?.sla_calendar_id,
        sla_timezone:         alarm.sla_params?.sla_timezone,
        response_due_at:      alarm.response_due_at,
        onsite_due_at:        alarm.onsite_due_at,
        restore_due_at:       alarm.restore_due_at,
        sla_breach_at:        alarm.sla_breach_at,
        sla_status:           alarm.sla_status,
        travel_time_minutes:  alarm.sla_params?.travel_time_minutes,
        access_time_minutes:  alarm.sla_params?.access_time_minutes,
      },
    };
  }

  /** Maps P1..P5 to case-service priority strings */
  private mapPriorityToCase(p: string): string {
    const map: Record<string, string> = { P1: 'critical', P2: 'high', P3: 'medium', P4: 'low', P5: 'low' };
    return map[p] ?? 'medium';
  }
}
