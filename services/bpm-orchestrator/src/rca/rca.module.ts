import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RcaService } from './rca.service';
import { RcaController } from './rca.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [RcaController],
  providers: [RcaService],
})
export class RcaModule {}
