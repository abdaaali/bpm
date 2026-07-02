import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'; import { Kafka, Producer } from 'kafkajs';
@Injectable() export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger=new Logger(KafkaProducerService.name); private producer: Producer; private connected=false;
  async onModuleInit() { const k=new Kafka({clientId:'integration-hub',brokers:(process.env.KAFKA_BROKERS||'localhost:9092').split(','),retry:{retries:3}}); this.producer=k.producer(); try{await this.producer.connect();this.connected=true;}catch(e){this.logger.warn(`Kafka: ${e.message}`);} }
  async onModuleDestroy() { if(this.connected) await this.producer.disconnect().catch(()=>{}); }
  async produce(t:string,m:any){if(!this.connected)return;try{await this.producer.send({topic:t,messages:[{value:JSON.stringify(m)}]});}catch(e){this.logger.error(e.message);}}
}
