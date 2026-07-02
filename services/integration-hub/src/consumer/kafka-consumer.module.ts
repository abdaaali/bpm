import { Module } from '@nestjs/common';
import { KafkaConsumerService } from './kafka-consumer.service';
import { ConnectorModule } from '../connector/connector.module';

@Module({
  imports: [ConnectorModule],
  providers: [KafkaConsumerService],
})
export class KafkaConsumerModule {}
