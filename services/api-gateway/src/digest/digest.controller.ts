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

@ApiTags('Digest')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/digest')
export class DigestController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('overview') @RequirePermission('analytics:read')
  overview(@Req() req: any) { return this.proxy.forward(ORCH_URL(), 'GET', '/digest/overview', undefined, hdrs(req)); }

  @Get('config') @RequirePermission('analytics:read')
  getConfig(@Req() req: any) { return this.proxy.forward(ORCH_URL(), 'GET', '/digest/config', undefined, hdrs(req)); }

  @Put('config') @RequirePermission('notifications:manage')
  updateConfig(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORCH_URL(), 'PUT', '/digest/config', b, hdrs(req)); }

  @Get('recipients') @RequirePermission('analytics:read')
  recipients(@Req() req: any) { return this.proxy.forward(ORCH_URL(), 'GET', '/digest/recipients', undefined, hdrs(req)); }

  @Post('recipients') @RequirePermission('notifications:manage')
  addRecipient(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORCH_URL(), 'POST', '/digest/recipients', b, hdrs(req)); }

  @Delete('recipients/:id') @RequirePermission('notifications:manage')
  removeRecipient(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(ORCH_URL(), 'DELETE', `/digest/recipients/${id}`, undefined, hdrs(req)); }

  @Get('runs') @RequirePermission('analytics:read')
  runs(@Req() req: any) { return this.proxy.forward(ORCH_URL(), 'GET', '/digest/runs', undefined, hdrs(req)); }

  @Get('runs/:id') @RequirePermission('analytics:read')
  run(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(ORCH_URL(), 'GET', `/digest/runs/${id}`, undefined, hdrs(req)); }

  @Post('preview') @RequirePermission('analytics:read')
  preview(@Req() req: any) { return this.proxy.forward(ORCH_URL(), 'POST', '/digest/preview', {}, hdrs(req)); }

  @Post('send') @RequirePermission('notifications:manage')
  send(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORCH_URL(), 'POST', '/digest/send', b || {}, hdrs(req)); }
}
