import { Controller, Get, Post, Param, Query, UseGuards, Req, Res, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { memoryStorage } from 'multer';

@Controller('api/ext/attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly svc: AttachmentsService) {}

  @Get(':assignmentId')
  listByAssignment(@Param('assignmentId') assignmentId: string, @Req() req: any) {
    const { tenant_id } = req.user;
    return this.svc.findByAssignment(assignmentId, tenant_id);
  }

  @Post(':assignmentId')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }))
  async upload(
    @Param('assignmentId') assignmentId: string,
    @UploadedFile() file: Express.Multer.File,
    @Query('attachmentType') attachmentType: string,
    @Query('visibilityScope') visibilityScope: string,
    @Req() req: any,
  ) {
    const { sub, company_id, tenant_id } = req.user;
    return this.svc.upload(assignmentId, sub, tenant_id, file, attachmentType, visibilityScope || 'shared');
  }

  @Get('download/:id')
  async download(@Param('id') id: string, @Req() req: any, @Res() res: any) {
    const { company_id, tenant_id } = req.user;
    const { url } = await this.svc.getDownloadUrl(id, company_id, tenant_id);
    res.redirect(url);
  }
}
