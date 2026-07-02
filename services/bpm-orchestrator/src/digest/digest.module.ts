import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DigestController } from './digest.controller';
import { DigestService } from './digest.service';

@Module({
  imports: [DatabaseModule],
  controllers: [DigestController],
  providers: [DigestService],
})
export class DigestModule {}
