import { Module } from '@nestjs/common';
import { CaseController } from './case.controller';
import { AttachmentController } from './attachment.controller';

@Module({ controllers: [CaseController, AttachmentController] })
export class CaseModule {}
