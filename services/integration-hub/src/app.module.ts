import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { KafkaModule } from './kafka/kafka.module';
import { AuditModule } from './audit/audit.module';
import { ConnectorModule } from './connector/connector.module';
import { KafkaConsumerModule } from './consumer/kafka-consumer.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { AlarmModule } from './alarm/alarm.module';
import { MdmHostsModule } from './mdm/mdm-hosts.module';
import { RcaModule } from './rca/rca.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    KafkaModule,
    AuditModule,
    ConnectorModule,
    KafkaConsumerModule,
    HealthModule,
    MetricsModule,
    AlarmModule,
    MdmHostsModule,
    RcaModule,
  ],
})
export class AppModule {}
