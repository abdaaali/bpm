import { Module } from '@nestjs/common';
import { TaskService } from './task.service';
import { TaskController } from './task.controller';
import { SlaSchedulerService } from './sla-scheduler.service';
import { ProcessInstanceModule } from '../process-instance/process-instance.module';

@Module({
  imports: [ProcessInstanceModule],
  providers: [TaskService, SlaSchedulerService],
  controllers: [TaskController],
  exports: [TaskService],
})
export class TaskModule {}
