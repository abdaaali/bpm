import { Controller, Get, Post, Put, Body, Param, Query, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const APPROVAL_URL = () => process.env.APPROVAL_SERVICE_URL || 'http://approval-service:3002';

function hdrs(req: any) {
  return { Authorization: req.headers['authorization'] || '', 'X-Tenant-ID': req.tenantId || '', 'X-User-ID': req.user?.sub || '' };
}

@ApiTags('Approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/approval')
export class ApprovalController {
  constructor(private readonly proxy: ProxyService) {}

  @Post('policies') @RequirePermission('approvals:manage') createPolicy(@Req() req: any, @Body() b: any) { return this.proxy.forward(APPROVAL_URL(), 'POST', '/policies', b, hdrs(req)); }
  @Get('policies') @RequirePermission('approvals:read') getPolicies(@Req() req: any, @Query() q: any) { return this.proxy.forward(APPROVAL_URL(), 'GET', '/policies', undefined, hdrs(req), q); }
  @Get('policies/:id') @RequirePermission('approvals:read') getPolicy(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(APPROVAL_URL(), 'GET', `/policies/${id}`, undefined, hdrs(req)); }
  @Put('policies/:id') @RequirePermission('approvals:manage') updatePolicy(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(APPROVAL_URL(), 'PUT', `/policies/${id}`, b, hdrs(req)); }
  @Post('policies/simulate') @RequirePermission('approvals:read') simulate(@Req() req: any, @Body() b: any) { return this.proxy.forward(APPROVAL_URL(), 'POST', '/policies/simulate', b, hdrs(req)); }

  @Post('instances') @RequirePermission('approvals:read') createInstance(@Req() req: any, @Body() b: any) { return this.proxy.forward(APPROVAL_URL(), 'POST', '/instances', b, hdrs(req)); }
  @Get('instances') @RequirePermission('approvals:read') getInstances(@Req() req: any, @Query() q: any) { return this.proxy.forward(APPROVAL_URL(), 'GET', '/instances', undefined, hdrs(req), q); }
  @Get('instances/pending') @RequirePermission('approvals:read') getPending(@Req() req: any, @Query() q: any) { return this.proxy.forward(APPROVAL_URL(), 'GET', '/instances/pending', undefined, hdrs(req), q); }
  @Get('instances/:id') @RequirePermission('approvals:read') getInstance(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(APPROVAL_URL(), 'GET', `/instances/${id}`, undefined, hdrs(req)); }
  @Post('instances/:id/steps/:stepId/approve') @RequirePermission('approvals:decide') approve(@Req() req: any, @Param('id') id: string, @Param('stepId') sid: string, @Body() b: any) { return this.proxy.forward(APPROVAL_URL(), 'POST', `/instances/${id}/steps/${sid}/approve`, b, hdrs(req)); }
  @Post('instances/:id/steps/:stepId/reject') @RequirePermission('approvals:decide') reject(@Req() req: any, @Param('id') id: string, @Param('stepId') sid: string, @Body() b: any) { return this.proxy.forward(APPROVAL_URL(), 'POST', `/instances/${id}/steps/${sid}/reject`, b, hdrs(req)); }

  @Post('delegations') @RequirePermission('approvals:read') createDelegation(@Req() req: any, @Body() b: any) { return this.proxy.forward(APPROVAL_URL(), 'POST', '/delegations', b, hdrs(req)); }
  @Get('delegations') @RequirePermission('approvals:read') getDelegations(@Req() req: any, @Query() q: any) { return this.proxy.forward(APPROVAL_URL(), 'GET', '/delegations', undefined, hdrs(req), q); }
  @Put('delegations/:id') @RequirePermission('approvals:read') updateDelegation(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(APPROVAL_URL(), 'PUT', `/delegations/${id}`, b, hdrs(req)); }
}
