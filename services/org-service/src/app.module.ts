import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { TenantModule } from './tenant/tenant.module';
import { OrgUnitModule } from './org-unit/org-unit.module';
import { PositionModule } from './position/position.module';
import { UserModule } from './user/user.module';
import { RoleModule } from './role/role.module';
import { KafkaModule } from './kafka/kafka.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    KafkaModule,
    AuditModule,
    TenantModule,
    OrgUnitModule,
    PositionModule,
    UserModule,
    RoleModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
