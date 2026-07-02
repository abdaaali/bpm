import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { CompanyModule } from './company/company.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // External portal gets stricter rate limiting than internal
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    AuthModule,
    WorkOrdersModule,
    SubmissionsModule,
    AttachmentsModule,
    CompanyModule,
    HealthModule,
  ],
})
export class AppModule {}
