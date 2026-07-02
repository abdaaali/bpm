import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RetentionController } from './retention.controller';
import { RetentionService } from './retention.service';

@Module({
  imports: [DatabaseModule],
  controllers: [RetentionController],
  providers: [RetentionService],
})
export class RetentionModule {}
