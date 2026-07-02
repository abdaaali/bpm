import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';
@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer; private connected = false;
  async onModuleInit() {
    const kafka = new Kafka({ clientId: 'approval-service', brokers: (process.env.KAFKA_BROKERS||'localhost:9092').split(','), retry: { retries: 3 } });
    this.producer = kafka.producer();
    try { await this.producer.connect(); this.connected = true; } catch(e) { this.logger.warn(`Kafka unavailable: ${e.message}`); }
  }
  async onModuleDestroy() { if (this.connected) await this.producer.disconnect().catch(()=>{}); }
  async produce(topic: string, message: any): Promise<void> {
    if (!this.connected) return;
    try { await this.producer.send({ topic, messages: [{ value: JSON.stringify(message) }] }); } catch(e) { this.logger.error(`Produce error: ${e.message}`); }
  }
}
