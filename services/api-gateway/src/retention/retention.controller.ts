import { Controller, Get, Post, Param, Query, Body, Req, UseGuards, UseInterceptors } from '@nestjs/common';
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

// Data-lifecycle administration. Viewing is gated audit:read (admin/manager);
// destructive actions (manual run, restore) require audit:manage — held only by
// the platform admin role (via '*').
@ApiTags('Retention')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/retention')
export class RetentionController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('status') @RequirePermission('audit:read')
  status(@Req() req: any) { return this.proxy.forward(ORCH_URL(), 'GET', '/retention/status', undefined, hdrs(req)); }

  @Get('runs') @RequirePermission('audit:read')
  runs(@Req() req: any, @Query() q: any) { return this.proxy.forward(ORCH_URL(), 'GET', '/retention/runs', undefined, hdrs(req), q); }

  @Post('run') @RequirePermission('audit:manage')
  run(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORCH_URL(), 'POST', '/retention/run', b || {}, hdrs(req)); }

  @Get('archived') @RequirePermission('audit:read')
  archived(@Req() req: any, @Query() q: any) { return this.proxy.forward(ORCH_URL(), 'GET', '/retention/archived', undefined, hdrs(req), q); }

  @Get('archived/:id') @RequirePermission('audit:read')
  getArchived(@Req() req: any, @Param('id') id: string, @Query() q: any) { return this.proxy.forward(ORCH_URL(), 'GET', `/retention/archived/${id}`, undefined, hdrs(req), q); }

  @Post('archived/:id/restore') @RequirePermission('audit:manage')
  restore(@Req() req: any, @Param('id') id: string, @Query() q: any) { return this.proxy.forward(ORCH_URL(), 'POST', `/retention/archived/${id}/restore`, {}, hdrs(req), q); }
}
