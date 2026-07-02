import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private producer: Producer;
  private connected = false;

  async onModuleInit() {
    const brokers = (process.env.KAFKA_BROKERS || 'localhost:9092').split(',');
    const kafka = new Kafka({ clientId: 'org-service', brokers, retry: { retries: 3 } });
    this.producer = kafka.producer();
    try { await this.producer.connect(); this.connected = true; this.logger.log('Kafka connected'); }
    catch (err) { this.logger.warn(`Kafka unavailable: ${err.message}`); }
  }

  async onModuleDestroy() {
    if (this.connected) await this.producer.disconnect().catch(() => {});
  }

  async produce(topic: string, message: any): Promise<void> {
    if (!this.connected) return;
    try { await this.producer.send({ topic, messages: [{ value: JSON.stringify(message) }] }); }
    catch (err) { this.logger.error(`Produce error: ${err.message}`); }
  }
}
