import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DataHubService } from './datahub.service';
import { DataHubController } from './datahub.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [DataHubController],
  providers: [DataHubService],
  exports: [DataHubService],
})
export class DataHubModule {}
