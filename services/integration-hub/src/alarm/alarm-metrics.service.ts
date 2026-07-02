import { Injectable, OnModuleInit } from '@nestjs/common';
import { Counter, Gauge, register } from 'prom-client';

@Injectable()
export class AlarmMetricsService implements OnModuleInit {
  // Counters
  alarmsReceived!:          Counter<string>;
  alarmsNormalized!:        Counter<string>;
  alarmsDeduped!:           Counter<string>;
  ticketsCreated!:          Counter<string>;
  ticketsUpdated!:          Counter<string>;
  mdmEnrichmentSuccess!:    Counter<string>;
  mdmEnrichmentFail!:       Counter<string>;
  mdmCacheHit!:             Counter<string>;
  slaCalculated!:           Counter<string>;
  slaBreached!:             Counter<string>;
  slaAtRisk!:               Counter<string>;

  // Gauges
  activeAlarms!:            Gauge<string>;
  pendingEnrichmentJobs!:   Gauge<string>;

  onModuleInit(): void {
    const safe = <T extends Counter<string> | Gauge<string>>(
      fn: () => T,
    ): T => {
      try { return fn(); } catch { return fn(); /* metric already registered — just re-create */ }
    };

    this.alarmsReceived = safe(() => new Counter({
      name: 'alarms_received_total', help: 'Total alarms received', labelNames: ['source'],
    }));
    this.alarmsNormalized = safe(() => new Counter({
      name: 'alarms_normalized_total', help: 'Alarms successfully normalised', labelNames: ['source'],
    }));
    this.alarmsDeduped = safe(() => new Counter({
      name: 'alarms_deduped_total', help: 'Alarms deduplicated (no new ticket)', labelNames: ['source'],
    }));
    this.ticketsCreated = safe(() => new Counter({
      name: 'tickets_created_total', help: 'BPM tickets created from alarms', labelNames: [],
    }));
    this.ticketsUpdated = safe(() => new Counter({
      name: 'tickets_updated_total', help: 'BPM tickets updated', labelNames: [],
    }));
    this.mdmEnrichmentSuccess = safe(() => new Counter({
      name: 'mdm_enrichment_success_total', help: 'Successful MDM enrichment calls', labelNames: [],
    }));
    this.mdmEnrichmentFail = safe(() => new Counter({
      name: 'mdm_enrichment_fail_total', help: 'Failed MDM enrichment calls', labelNames: [],
    }));
    this.mdmCacheHit = safe(() => new Counter({
      name: 'mdm_cache_hit_total', help: 'MDM cache hits', labelNames: [],
    }));
    this.slaCalculated = safe(() => new Counter({
      name: 'sla_calculated_total', help: 'SLA calculations performed', labelNames: [],
    }));
    this.slaBreached = safe(() => new Counter({
      name: 'sla_breached_total', help: 'SLA breaches detected', labelNames: [],
    }));
    this.slaAtRisk = safe(() => new Counter({
      name: 'sla_at_risk_total', help: 'SLA at-risk transitions', labelNames: [],
    }));
    this.activeAlarms = safe(() => new Gauge({
      name: 'active_alarms_total', help: 'Currently active (FIRING/OPEN) alarms', labelNames: [],
    }));
    this.pendingEnrichmentJobs = safe(() => new Gauge({
      name: 'pending_enrichment_jobs', help: 'Pending async enrichment jobs', labelNames: [],
    }));
  }
}
