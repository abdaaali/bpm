import { Controller, Get, Put, Body, Param, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const CASE_URL = () => process.env.CASE_SERVICE_URL || 'http://case-service:3004';

function hdrs(req: any) {
  return {
    Authorization: req.headers['authorization'] || '',
    'X-Tenant-ID': req.tenantId || '',
    'X-User-ID': req.user?.sub || '',
  };
}

/** SLA Policies — configurable response/resolve/restore targets and class
 *  multipliers. Reads open to any authenticated user; writes require mdm:write. */
@ApiTags('SLA')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@RequirePermission('cases:read')
@Controller('api/v1/sla')
export class SlaGatewayController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('targets')
  listTargets(@Req() req: any) {
    return this.proxy.forward(CASE_URL(), 'GET', '/api/sla/targets', undefined, hdrs(req));
  }

  @Put('targets/:type/:priority')
  @RequirePermission('mdm:write')
  upsertTarget(@Req() req: any, @Param('type') type: string, @Param('priority') priority: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PUT', `/api/sla/targets/${type}/${priority}`, b, hdrs(req));
  }

  @Get('class-factors')
  listFactors(@Req() req: any) {
    return this.proxy.forward(CASE_URL(), 'GET', '/api/sla/class-factors', undefined, hdrs(req));
  }

  @Put('class-factors/:key')
  @RequirePermission('mdm:write')
  upsertFactor(@Req() req: any, @Param('key') key: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PUT', `/api/sla/class-factors/${key}`, b, hdrs(req));
  }
}
