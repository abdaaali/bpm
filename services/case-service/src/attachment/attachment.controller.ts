import { Controller, Get, Post, Delete, Param, Headers, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentService } from './attachment.service';

@Controller()
export class AttachmentController {
  constructor(private readonly svc: AttachmentService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id'] || ''; }

  @Get('attachments/:id/url')
  presign(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.getPresignedUrl(this.tenant(h), id).then(url => ({ url }));
  }

  @Delete('attachments/:id')
  remove(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.remove(this.tenant(h), id).then(() => ({ ok: true }));
  }

  @Get(':entityType/:entityId/attachments')
  list(@Headers() h: Record<string, string>, @Param('entityType') et: string, @Param('entityId') eid: string) {
    return this.svc.list(this.tenant(h), et, eid);
  }

  @Post(':entityType/:entityId/attachments')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @Headers() h: Record<string, string>,
    @Param('entityType') et: string,
    @Param('entityId') eid: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.upload(this.tenant(h), et, eid, file, this.actor(h));
  }
}
