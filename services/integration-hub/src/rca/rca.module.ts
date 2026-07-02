import { Module } from '@nestjs/common';
import { RcaController } from './rca.controller';
import { RcaService } from './rca.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [RcaController],
  providers: [RcaService],
})
export class RcaModule {}
