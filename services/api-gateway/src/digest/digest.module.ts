import { Module } from '@nestjs/common';
import { DigestController } from './digest.controller';

@Module({
  controllers: [DigestController],
})
export class DigestModule {}
