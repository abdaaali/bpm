import { Module } from '@nestjs/common';
import { RcaController } from './rca.controller';

@Module({
  controllers: [RcaController],
})
export class RcaModule {}
