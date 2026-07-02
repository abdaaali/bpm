import { Module } from '@nestjs/common';
import { DataHubGatewayController } from './datahub.controller';
import { ProxyModule } from '../proxy/proxy.module';

@Module({
  imports: [ProxyModule],
  controllers: [DataHubGatewayController],
})
export class DataHubGatewayModule {}
