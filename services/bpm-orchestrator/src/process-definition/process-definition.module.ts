import { Module } from '@nestjs/common';
import { ProcessDefinitionService } from './process-definition.service';
import { ProcessDefinitionController } from './process-definition.controller';

@Module({
  providers: [ProcessDefinitionService],
  controllers: [ProcessDefinitionController],
  exports: [ProcessDefinitionService],
})
export class ProcessDefinitionModule {}
