import { Module } from '@nestjs/common';
import { SlaGatewayController } from './sla.controller';
import { ProxyModule } from '../proxy/proxy.module';

@Module({
  imports: [ProxyModule],
  controllers: [SlaGatewayController],
})
export class SlaGatewayModule {}
