import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, UseInterceptors } from '@nestjs/common';
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

/** Operational DataHub — Sites + travel conditions feeding the Hybrid SLA.
 *  Reads open to any authenticated user; writes require mdm:write. */
@ApiTags('DataHub')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/datahub')
export class DataHubGatewayController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('sites')
  listSites(@Req() req: any, @Query() q: any) {
    return this.proxy.forward(CASE_URL(), 'GET', '/api/datahub/sites', undefined, hdrs(req), q);
  }

  @Get('sites/:id')
  getSite(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(CASE_URL(), 'GET', `/api/datahub/sites/${id}`, undefined, hdrs(req));
  }

  @Get('sites/:id/sla-preview')
  preview(@Req() req: any, @Param('id') id: string, @Query() q: any) {
    return this.proxy.forward(CASE_URL(), 'GET', `/api/datahub/sites/${id}/sla-preview`, undefined, hdrs(req), q);
  }

  @RequirePermission('mdm:write')
  @Post('sites')
  createSite(@Req() req: any, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'POST', '/api/datahub/sites', b, hdrs(req));
  }

  @RequirePermission('mdm:write')
  @Put('sites/:id')
  updateSite(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PUT', `/api/datahub/sites/${id}`, b, hdrs(req));
  }

  @RequirePermission('mdm:write')
  @Delete('sites/:id')
  deleteSite(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(CASE_URL(), 'DELETE', `/api/datahub/sites/${id}`, undefined, hdrs(req));
  }

  // ── Generic extension domains ──
  @Get('domains')
  domains(@Req() req: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/datahub/domains', undefined, hdrs(req)); }

  @Get('domains/:domain')
  listDomain(@Req() req: any, @Param('domain') domain: string, @Query() q: any) {
    return this.proxy.forward(CASE_URL(), 'GET', `/api/datahub/domains/${domain}`, undefined, hdrs(req), q);
  }

  @RequirePermission('mdm:write')
  @Post('domains/:domain')
  createItem(@Req() req: any, @Param('domain') domain: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'POST', `/api/datahub/domains/${domain}`, b, hdrs(req));
  }

  @RequirePermission('mdm:write')
  @Put('domains/:domain/:id')
  updateItem(@Req() req: any, @Param('domain') domain: string, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PUT', `/api/datahub/domains/${domain}/${id}`, b, hdrs(req));
  }

  @RequirePermission('mdm:write')
  @Delete('domains/:domain/:id')
  deleteItem(@Req() req: any, @Param('domain') domain: string, @Param('id') id: string) {
    return this.proxy.forward(CASE_URL(), 'DELETE', `/api/datahub/domains/${domain}/${id}`, undefined, hdrs(req));
  }
}
