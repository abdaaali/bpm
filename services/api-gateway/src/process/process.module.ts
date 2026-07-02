import { Module } from '@nestjs/common';
import { ProcessController, TaskController } from './process.controller';

@Module({ controllers: [ProcessController, TaskController] })
export class ProcessModule {}
