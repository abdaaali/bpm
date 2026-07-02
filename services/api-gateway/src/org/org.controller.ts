import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const ORG_URL = () => process.env.ORG_SERVICE_URL || 'http://org-service:3001';

function hdrs(req: any) {
  return {
    Authorization: req.headers['authorization'] || '',
    'X-Tenant-ID': req.tenantId || '',
    'X-User-ID': req.user?.sub || '',
  };
}

@ApiTags('Organization')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1')
export class OrgController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('tenants') getTenants(@Req() req: any, @Query() q: any) { return this.proxy.forward(ORG_URL(), 'GET', '/tenants', undefined, hdrs(req), q); }
  @RequirePermission('org:manage')
  @Post('tenants') createTenant(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'POST', '/tenants', b, hdrs(req)); }

  @Get('org-units/tree') getTree(@Req() req: any, @Query() q: any) { return this.proxy.forward(ORG_URL(), 'GET', '/org-units/tree', undefined, hdrs(req), q); }
  @Get('org-units') getOrgUnits(@Req() req: any, @Query() q: any) { return this.proxy.forward(ORG_URL(), 'GET', '/org-units', undefined, hdrs(req), q); }
  @RequirePermission('org:manage')
  @Post('org-units') createOrgUnit(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'POST', '/org-units', b, hdrs(req)); }
  @Get('org-units/:id') getOrgUnit(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(ORG_URL(), 'GET', `/org-units/${id}`, undefined, hdrs(req)); }
  @RequirePermission('org:manage')
  @Put('org-units/:id') updateOrgUnit(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'PUT', `/org-units/${id}`, b, hdrs(req)); }
  @RequirePermission('org:manage')
  @Delete('org-units/:id') deleteOrgUnit(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(ORG_URL(), 'DELETE', `/org-units/${id}`, undefined, hdrs(req)); }
  @Get('org-units/:id/manager-chain') getManagerChain(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(ORG_URL(), 'GET', `/org-units/${id}/manager-chain`, undefined, hdrs(req)); }

  @Get('users') getUsers(@Req() req: any, @Query() q: any) { return this.proxy.forward(ORG_URL(), 'GET', '/users', undefined, hdrs(req), q); }
  @RequirePermission('org:manage')
  @Post('users') createUser(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'POST', '/users', b, hdrs(req)); }
  @Get('users/:id') getUser(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(ORG_URL(), 'GET', `/users/${id}`, undefined, hdrs(req)); }
  @RequirePermission('org:manage')
  @Put('users/:id') updateUser(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'PUT', `/users/${id}`, b, hdrs(req)); }
  @RequirePermission('org:manage')
  @Delete('users/:id') deactivateUser(@Req() req: any, @Param('id') id: string, @Query() q: any) { return this.proxy.forward(ORG_URL(), 'DELETE', `/users/${id}`, undefined, hdrs(req), q); }
  @RequirePermission('org:manage')
  @Post('users/:id/roles') assignRole(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'POST', `/users/${id}/roles`, b, hdrs(req)); }
  @RequirePermission('org:manage')
  @Delete('users/:id/roles/:roleId') removeRole(@Req() req: any, @Param('id') id: string, @Param('roleId') roleId: string) { return this.proxy.forward(ORG_URL(), 'DELETE', `/users/${id}/roles/${roleId}`, undefined, hdrs(req)); }
  @RequirePermission('org:manage')
  @Post('users/:id/assignments') assignOrgUnit(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'POST', `/users/${id}/assignments`, b, hdrs(req)); }
  @Get('users/:id/managers') getUserManagers(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(ORG_URL(), 'GET', `/users/${id}/managers`, undefined, hdrs(req)); }
  @Get('users/:id/hierarchy') getUserHierarchy(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(ORG_URL(), 'GET', `/users/${id}/hierarchy`, undefined, hdrs(req)); }

  @Get('positions') getPositions(@Req() req: any, @Query() q: any) { return this.proxy.forward(ORG_URL(), 'GET', '/positions', undefined, hdrs(req), q); }
  @RequirePermission('org:manage')
  @Post('positions') createPosition(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'POST', '/positions', b, hdrs(req)); }
  @RequirePermission('org:manage')
  @Put('positions/:id') updatePosition(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'PUT', `/positions/${id}`, b, hdrs(req)); }

  @Get('roles') getRoles(@Req() req: any, @Query() q: any) { return this.proxy.forward(ORG_URL(), 'GET', '/roles', undefined, hdrs(req), q); }
  @RequirePermission('org:manage')
  @Post('roles') createRole(@Req() req: any, @Body() b: any) { return this.proxy.forward(ORG_URL(), 'POST', '/roles', b, hdrs(req)); }
}
