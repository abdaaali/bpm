import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { KafkaModule } from './kafka/kafka.module';
import { AuditModule } from './audit/audit.module';
import { ProcessDefinitionModule } from './process-definition/process-definition.module';
import { ProcessInstanceModule } from './process-instance/process-instance.module';
import { TaskModule } from './task/task.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { RcaModule } from './rca/rca.module';
import { ReportsModule } from './reports/reports.module';
import { DigestModule } from './digest/digest.module';
import { RetentionModule } from './retention/retention.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    KafkaModule,
    AuditModule,
    ProcessDefinitionModule,
    ProcessInstanceModule,
    TaskModule,
    HealthModule,
    MetricsModule,
    AnalyticsModule,
    RcaModule,
    ReportsModule,
    DigestModule,
    RetentionModule,
  ],
})
export class AppModule {}
