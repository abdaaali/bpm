import { Module } from '@nestjs/common';
import { AttachmentService } from './attachment.service';
import { AttachmentController } from './attachment.controller';

@Module({
  providers: [AttachmentService],
  controllers: [AttachmentController],
  exports: [AttachmentService],
})
export class AttachmentModule {}
