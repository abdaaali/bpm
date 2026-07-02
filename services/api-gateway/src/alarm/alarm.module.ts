import { Module } from '@nestjs/common';
import { AlarmController } from './alarm.controller';

@Module({
  controllers: [AlarmController],
})
export class AlarmModule {}
