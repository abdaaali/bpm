import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const ORCH_URL = () => process.env.BPM_ORCHESTRATOR_URL || process.env.ORCHESTRATOR_URL || 'http://bpm-orchestrator:3003';

function hdrs(req: any) {
  return { Authorization: req.headers['authorization'] || '', 'X-Tenant-ID': req.tenantId || '', 'X-User-ID': req.user?.sub || '' };
}

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/reports')
export class ReportsController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('sources') @RequirePermission('analytics:read')
  sources(@Req() req: any) { return this.proxy.forward(ORCH_URL(), 'GET', '/reports/sources', undefined, hdrs(req)); }

  @Post('run') @RequirePermission('analytics:read')
  run(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORCH_URL(), 'POST', '/reports/run', b, hdrs(req)); }

  @Get('templates') @RequirePermission('analytics:read')
  listTemplates(@Req() req: any) { return this.proxy.forward(ORCH_URL(), 'GET', '/reports/templates', undefined, hdrs(req)); }

  @Get('templates/:id') @RequirePermission('analytics:read')
  getTemplate(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(ORCH_URL(), 'GET', `/reports/templates/${id}`, undefined, hdrs(req)); }

  @Post('templates') @RequirePermission('analytics:read')
  saveTemplate(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORCH_URL(), 'POST', '/reports/templates', b, hdrs(req)); }

  @Put('templates/:id') @RequirePermission('analytics:read')
  updateTemplate(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(ORCH_URL(), 'PUT', `/reports/templates/${id}`, b, hdrs(req)); }

  @Delete('templates/:id') @RequirePermission('analytics:read')
  deleteTemplate(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(ORCH_URL(), 'DELETE', `/reports/templates/${id}`, undefined, hdrs(req)); }
}
