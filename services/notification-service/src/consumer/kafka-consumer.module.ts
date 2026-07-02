import { Module } from '@nestjs/common';
import { KafkaConsumerService } from './kafka-consumer.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  providers: [KafkaConsumerService],
})
export class KafkaConsumerModule {}
