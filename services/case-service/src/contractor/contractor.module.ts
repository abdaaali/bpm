import { Module } from '@nestjs/common';
import { ContractorController } from './contractor.controller';
import { ContractorService } from './contractor.service';
import { DatabaseModule } from '../database/database.module';
import { CaseModule } from '../case/case.module';

@Module({
  imports: [DatabaseModule, CaseModule], // CaseModule exports CaseService for state-machine transitions
  controllers: [ContractorController],
  providers: [ContractorService],
  exports: [ContractorService],
})
export class ContractorModule {}
