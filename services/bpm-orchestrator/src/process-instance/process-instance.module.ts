import { Module } from '@nestjs/common';
import { ProcessInstanceService } from './process-instance.service';
import { ProcessInstanceController } from './process-instance.controller';
import { ProcessDefinitionModule } from '../process-definition/process-definition.module';

@Module({
  imports: [ProcessDefinitionModule],
  providers: [ProcessInstanceService],
  controllers: [ProcessInstanceController],
  exports: [ProcessInstanceService],
})
export class ProcessInstanceModule {}
