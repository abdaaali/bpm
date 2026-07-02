import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { KafkaModule } from './kafka/kafka.module';
import { AuditModule } from './audit/audit.module';
import { CaseModule } from './case/case.module';
import { AttachmentModule } from './attachment/attachment.module';
import { ContractorModule } from './contractor/contractor.module';
import { DataHubModule } from './datahub/datahub.module';
import { RcaModule } from './rca/rca.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    KafkaModule,
    AuditModule,
    CaseModule,
    AttachmentModule,
    ContractorModule,
    DataHubModule,
    RcaModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
