import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { KafkaModule } from './kafka/kafka.module';
import { AuditModule } from './audit/audit.module';
import { ResolverModule } from './resolver/resolver.module';
import { PolicyModule } from './policy/policy.module';
import { InstanceModule } from './instance/instance.module';
import { DelegationModule } from './delegation/delegation.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    KafkaModule,
    AuditModule,
    ResolverModule,
    PolicyModule,
    InstanceModule,
    DelegationModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
