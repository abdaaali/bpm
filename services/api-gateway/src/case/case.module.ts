import { Module } from '@nestjs/common';
import { CaseController } from './case.controller';

@Module({ controllers: [CaseController] })
export class CaseModule {}
