import { Module, Global } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

@Global()
@Module({
  providers: [ProxyService, KafkaProducerService],
  exports: [ProxyService],
})
export class ProxyModule {}
