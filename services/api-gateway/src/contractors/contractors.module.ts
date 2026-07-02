import { Module } from '@nestjs/common';
import { ContractorsController } from './contractors.controller';
import { ProxyModule } from '../proxy/proxy.module';

@Module({
  imports: [ProxyModule],
  controllers: [ContractorsController],
})
export class ContractorsModule {}
