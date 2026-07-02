import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const HUB_URL = () => process.env.INTEGRATION_HUB_URL || 'http://integration-hub:3005';

function hdrs(req: any) {
  return { Authorization: req.headers['authorization'] || '', 'X-Tenant-ID': req.tenantId || '', 'X-User-ID': req.user?.sub || '' };
}

@ApiTags('Integration Hub')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@RequirePermission('connectors:manage')
@Controller('api/v1/integrations')
export class IntegrationController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('connectors') list(@Req() req: any, @Query() q: any) { return this.proxy.forward(HUB_URL(), 'GET', '/api/connectors', undefined, hdrs(req), q); }
  @Post('connectors') create(@Req() req: any, @Body() b: any) { return this.proxy.forward(HUB_URL(), 'POST', '/api/connectors', b, hdrs(req)); }
  @Get('connectors/:id') get(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(HUB_URL(), 'GET', `/api/connectors/${id}`, undefined, hdrs(req)); }
  @Put('connectors/:id') update(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(HUB_URL(), 'PUT', `/api/connectors/${id}`, b, hdrs(req)); }
  @Delete('connectors/:id') delete(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(HUB_URL(), 'DELETE', `/api/connectors/${id}`, undefined, hdrs(req)); }
  @Patch('connectors/:id/activate') activate(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(HUB_URL(), 'PATCH', `/api/connectors/${id}/activate`, {}, hdrs(req)); }
  @Patch('connectors/:id/deactivate') deactivate(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(HUB_URL(), 'PATCH', `/api/connectors/${id}/deactivate`, {}, hdrs(req)); }
  @Post('connectors/:id/test') test(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(HUB_URL(), 'POST', `/api/connectors/${id}/execute`, {}, hdrs(req)); }
  @Post('connectors/:id/trigger') trigger(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(HUB_URL(), 'POST', `/api/connectors/${id}/trigger`, b, hdrs(req)); }
  @Get('connectors/:id/logs') logs(@Req() req: any, @Param('id') id: string, @Query() q: any) { return this.proxy.forward(HUB_URL(), 'GET', `/api/connectors/${id}/logs`, undefined, hdrs(req), q); }
}
