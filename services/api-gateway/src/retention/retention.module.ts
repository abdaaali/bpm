import { Module } from '@nestjs/common';
import { RetentionController } from './retention.controller';

@Module({
  controllers: [RetentionController],
})
export class RetentionModule {}
