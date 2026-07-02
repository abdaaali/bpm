import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { AlarmService } from './alarm.service';
import { AlarmMetricsService } from './alarm-metrics.service';
import { MdmEnrichmentService } from './mdm-enrichment.service';
import { CaseSyncOutboxService } from './case-sync-outbox.service';

@Injectable()
export class AlarmWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AlarmWorkerService.name);
  private slaTimer?: NodeJS.Timeout;
  private enrichTimer?: NodeJS.Timeout;
  private cacheTimer?: NodeJS.Timeout;
  private outboxTimer?: NodeJS.Timeout;
  private reconcileTimer?: NodeJS.Timeout;

  constructor(
    private readonly alarmSvc: AlarmService,
    private readonly metrics:  AlarmMetricsService,
    private readonly mdm:      MdmEnrichmentService,
    private readonly outbox:   CaseSyncOutboxService,
  ) {}

  onModuleInit(): void {
    const slaIntervalMs = parseInt(process.env.SLA_UPDATE_INTERVAL_SECONDS ?? '60', 10) * 1000;
    const enrichIntervalMs = 30_000; // process enrichment jobs every 30s
    const outboxIntervalMs = 15_000; // deliver case-sync outbox every 15s

    this.slaTimer = setInterval(() => this.runSlaUpdate(), slaIntervalMs);
    this.enrichTimer = setInterval(() => this.runEnrichmentWorker(), enrichIntervalMs);
    this.cacheTimer = setInterval(() => this.mdm.evictExpired(), 300_000); // evict MDM cache every 5m
    this.outboxTimer = setInterval(() => this.runOutbox(), outboxIntervalMs);
    this.reconcileTimer = setInterval(() => this.runReconcile(), 300_000); // reconcile drift every 5m

    this.logger.log(`AlarmWorker started: SLA@${slaIntervalMs}ms, Enrichment@${enrichIntervalMs}ms, Outbox@${outboxIntervalMs}ms`);

    // Run once shortly after startup
    setTimeout(() => this.runEnrichmentWorker(), 5_000);
    setTimeout(() => this.runOutbox(), 6_000);
  }

  onModuleDestroy(): void {
    if (this.slaTimer)       clearInterval(this.slaTimer);
    if (this.enrichTimer)    clearInterval(this.enrichTimer);
    if (this.cacheTimer)     clearInterval(this.cacheTimer);
    if (this.outboxTimer)    clearInterval(this.outboxTimer);
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
  }

  private async runOutbox(): Promise<void> {
    try {
      const r = await this.outbox.processPending(50);
      if (r.delivered || r.dead) this.logger.log(`Outbox: ${r.delivered} delivered, ${r.retried} retried, ${r.dead} dead`);
    } catch (e) {
      this.logger.error(`Outbox worker failed: ${e.message}`);
    }
  }

  private async runReconcile(): Promise<void> {
    try {
      const r = await this.outbox.reconcile();
      if (r.enqueued || r.acked) this.logger.log(`Reconcile: ${r.enqueued} enqueued, ${r.acked} acked`);
    } catch (e) {
      this.logger.error(`Reconcile worker failed: ${e.message}`);
    }
  }

  private async runSlaUpdate(): Promise<void> {
    try {
      await this.alarmSvc.refreshActiveSla();
    } catch (e) {
      this.logger.error(`SLA update cycle failed: ${e.message}`);
    }
  }

  private async runEnrichmentWorker(): Promise<void> {
    try {
      const jobs = await this.alarmSvc.getPendingEnrichmentJobs(20);
      if (jobs.length === 0) return;

      this.logger.log(`Processing ${jobs.length} enrichment jobs`);
      for (const job of jobs) {
        await this.alarmSvc.runEnrichmentJob(job.id, job.unified_alarm_id);
      }

      // Update gauge
      const pending = await this.alarmSvc.getPendingEnrichmentCount();
      this.metrics.pendingEnrichmentJobs.set(pending);
    } catch (e) {
      this.logger.error(`Enrichment worker failed: ${e.message}`);
    }
  }
}
