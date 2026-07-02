import { Module } from '@nestjs/common';
import { RcaService } from './rca.service';
import { RcaController } from './rca.controller';

@Module({
  providers: [RcaService],
  controllers: [RcaController],
})
export class RcaModule {}
