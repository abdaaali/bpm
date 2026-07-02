import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { ConnectorService } from '../connector/connector.service';

const TOPICS = ['bpm.service.task', 'bpm.case.created', 'bpm.connectors.updated'];

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Consumer;
  private connected = false;

  constructor(private readonly connectorSvc: ConnectorService) {}

  async onModuleInit() {
    const kafka = new Kafka({
      clientId: 'integration-hub-consumer',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: { retries: 5 },
    });
    this.consumer = kafka.consumer({ groupId: 'integration-hub-group' });
    try {
      await this.consumer.connect();
      await this.consumer.subscribe({ topics: TOPICS, fromBeginning: false });
      this.connected = true;
      await this.consumer.run({ eachMessage: (msg) => this.handle(msg) });
      this.logger.log(`Kafka consumer subscribed: ${TOPICS.join(', ')}`);
    } catch (e) {
      this.logger.warn(`Kafka consumer failed to start: ${e.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.connected) await this.consumer.disconnect().catch(() => {});
  }

  private async handle({ topic, message }: EachMessagePayload) {
    try {
      const payload = JSON.parse(message.value?.toString() || '{}');
      if (topic === 'bpm.service.task' && payload.serviceType === 'connector') {
        // Execute a specific connector when a BPMN service task fires
        const { tenantId, config } = payload;
        if (config?.connectorId && tenantId) {
          await this.connectorSvc.execute(tenantId, config.connectorId, payload, 'bpmn_service_task');
        }
      }
      // For bpm.case.created: find active webhook connectors with trigger on case events
      if (topic === 'bpm.case.created') {
        const { tenantId } = payload;
        if (tenantId) {
          const r = await (this.connectorSvc as any).db.query(
            `SELECT id FROM connectors WHERE tenant_id=$1 AND type='webhook' AND status='active'
             AND trigger_config->>'on' = 'case.created'`,
            [tenantId],
          );
          for (const row of r.rows) {
            await this.connectorSvc.execute(tenantId, row.id, payload, 'event_trigger').catch(e => this.logger.error(e.message));
          }
        }
      }
    } catch (e) {
      this.logger.error(`Consumer error [${topic}]: ${e.message}`);
    }
  }
}
