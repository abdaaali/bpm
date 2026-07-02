import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { KafkaModule } from './kafka/kafka.module';
import { TemplateModule } from './template/template.module';
import { NotificationModule } from './notification/notification.module';
import { KafkaConsumerModule } from './consumer/kafka-consumer.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    KafkaModule,
    TemplateModule,
    NotificationModule,
    KafkaConsumerModule,
    HealthModule,
    MetricsModule,
  ],
})
export class AppModule {}
