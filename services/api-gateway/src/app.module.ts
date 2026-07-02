import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ProxyModule } from './proxy/proxy.module';
import { OrgModule } from './org/org.module';
import { ApprovalModule } from './approval/approval.module';
import { ProcessModule } from './process/process.module';
import { CaseModule } from './case/case.module';
import { IntegrationModule } from './integration/integration.module';
import { NotificationModule } from './notification/notification.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuditModule } from './audit/audit.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { AlarmModule } from './alarm/alarm.module';
import { MdmModule } from './mdm/mdm.module';
import { RcaModule } from './rca/rca.module';
import { ContractorsModule } from './contractors/contractors.module';
import { DataHubGatewayModule } from './datahub/datahub.module';
import { SlaGatewayModule } from './sla/sla.module';
import { MeModule } from './me/me.module';
import { ReportsModule } from './reports/reports.module';
import { DigestModule } from './digest/digest.module';
import { RetentionModule } from './retention/retention.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    AuthModule,
    ProxyModule,
    OrgModule,
    ApprovalModule,
    ProcessModule,
    CaseModule,
    IntegrationModule,
    NotificationModule,
    DashboardModule,
    AuditModule,
    HealthModule,
    MetricsModule,
    AlarmModule,
    MdmModule,
    RcaModule,
    ContractorsModule,
    DataHubGatewayModule,
    SlaGatewayModule,
    MeModule,
    ReportsModule,
    DigestModule,
    RetentionModule,
  ],
})
export class AppModule {}
