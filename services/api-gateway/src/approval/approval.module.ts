import { Module } from '@nestjs/common';
import { ApprovalController } from './approval.controller';

@Module({ controllers: [ApprovalController] })
export class ApprovalModule {}
