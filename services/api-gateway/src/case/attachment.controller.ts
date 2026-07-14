import { Controller, Get, Post, Delete, Param, Req, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import axios from 'axios';
// A namespace import, not a default import: this service's tsconfig has
// esModuleInterop off, so `import FormData from 'form-data'` compiles to
// `form_data_1.default` at runtime — which doesn't exist on this package's
// plain CommonJS export (`module.exports = FormData`) and throws
// "form_data_1.default is not a constructor" on every upload. `import * as`
// binds directly to the CJS export instead, which is the constructor itself.
import * as FormData from 'form-data';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';

const CASE_URL = () => process.env.CASE_SERVICE_URL || 'http://case-service:3004';

function hdrs(req: any) {
  return {
    'X-Tenant-ID': req.tenantId || '',
    'X-User-ID': req.user?.sub || '',
  };
}

// Bridges frontend-portal to case-service's existing generic attachment
// endpoints. A dedicated controller (not ProxyService.forward, which
// hardcodes Content-Type: application/json) because multipart uploads need
// the file re-packaged into a fresh multipart body for the upstream request.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/attachments')
export class AttachmentController {
  @Get(':entityType/:entityId')
  @RequirePermission('cases:read')
  async list(@Req() req: any, @Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    const res = await axios.get(`${CASE_URL()}/api/${entityType}/${entityId}/attachments`, { headers: hdrs(req) });
    return res.data;
  }

  @Post(':entityType/:entityId')
  @RequirePermission('cases:update')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  async upload(
    @Req() req: any,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const form = new FormData();
    form.append('file', file.buffer, { filename: file.originalname, contentType: file.mimetype });
    const res = await axios.post(`${CASE_URL()}/api/${entityType}/${entityId}/attachments`, form, {
      headers: { ...hdrs(req), ...form.getHeaders() },
    });
    return res.data;
  }

  @Get('file/:id/url')
  @RequirePermission('cases:read')
  async presign(@Req() req: any, @Param('id') id: string) {
    const res = await axios.get(`${CASE_URL()}/api/attachments/${id}/url`, { headers: hdrs(req) });
    return res.data;
  }

  @Delete('file/:id')
  @RequirePermission('cases:update')
  async remove(@Req() req: any, @Param('id') id: string) {
    const res = await axios.delete(`${CASE_URL()}/api/attachments/${id}`, { headers: hdrs(req) });
    return res.data;
  }
}
