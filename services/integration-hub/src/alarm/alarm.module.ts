import { Module } from '@nestjs/common';
import { AlarmIngestionController } from './alarm-ingestion.controller';
import { AlarmQueryController } from './alarm-query.controller';
import { AlarmService } from './alarm.service';
import { AlarmWorkerService } from './alarm-worker.service';
import { AlarmMetricsService } from './alarm-metrics.service';
import { MdmEnrichmentService } from './mdm-enrichment.service';
import { SlaCalculatorService } from './sla-calculator.service';
import { BpmTicketService } from './bpm-ticket.service';
import { CaseSyncOutboxService } from './case-sync-outbox.service';
import { OutboxController } from './outbox.controller';

@Module({
  controllers: [AlarmIngestionController, AlarmQueryController, OutboxController],
  providers: [
    AlarmService,
    AlarmWorkerService,
    AlarmMetricsService,
    MdmEnrichmentService,
    SlaCalculatorService,
    BpmTicketService,
    CaseSyncOutboxService,
  ],
  exports: [AlarmService],
})
export class AlarmModule {}
