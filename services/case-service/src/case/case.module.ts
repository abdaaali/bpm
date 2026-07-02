import { Module } from '@nestjs/common';
import { CaseService } from './case.service';
import { CaseController } from './case.controller';
import { SlaCaseSchedulerService } from './sla-scheduler.service';
import { RoutingService } from './routing.service';
import { RoutingController } from './routing.controller';
import { SlaConfigService } from '../sla-config/sla-config.service';
import { SlaConfigController } from '../sla-config/sla-config.controller';

@Module({
  providers: [CaseService, SlaCaseSchedulerService, RoutingService, SlaConfigService],
  controllers: [CaseController, RoutingController, SlaConfigController],
  exports: [CaseService],
})
export class CaseModule {}
