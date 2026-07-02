import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  Req, UseGuards, UseInterceptors, HttpCode, HttpStatus, Res, Header,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const HUB_URL = () => process.env.INTEGRATION_HUB_URL || 'http://integration-hub:3005';

function hdrs(req: any): Record<string, string> {
  return {
    Authorization: req.headers['authorization'] || '',
    'X-Tenant-ID': req.tenantId || '',
    'X-User-ID':   req.user?.sub || '',
  };
}

@ApiTags('MDM Hosts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/mdm/hosts')
export class MdmController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('stats')
  @ApiOperation({ summary: 'MDM host statistics' })
  stats(@Req() req: any) {
    return this.proxy.forward(HUB_URL(), 'GET', '/api/mdm/hosts/stats', undefined, hdrs(req));
  }

  @Get('filter-options')
  @ApiOperation({ summary: 'Filter dropdown options' })
  filterOptions(@Req() req: any) {
    return this.proxy.forward(HUB_URL(), 'GET', '/api/mdm/hosts/filter-options', undefined, hdrs(req));
  }

  @Get('export')
  @ApiOperation({ summary: 'Export hosts as JSON file' })
  exportHosts(@Req() req: any) {
    return this.proxy.forward(HUB_URL(), 'GET', '/api/mdm/hosts/export', undefined, hdrs(req));
  }

  @RequirePermission('mdm:write')
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk import hosts from JSON array' })
  importHosts(@Req() req: any, @Body() body: any) {
    return this.proxy.forward(HUB_URL(), 'POST', '/api/mdm/hosts/import', body, hdrs(req));
  }

  @Get()
  @ApiOperation({ summary: 'List hosts' })
  list(@Req() req: any, @Query() q: any) {
    return this.proxy.forward(HUB_URL(), 'GET', '/api/mdm/hosts', undefined, hdrs(req), q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get host by ID' })
  get(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(HUB_URL(), 'GET', `/api/mdm/hosts/${id}`, undefined, hdrs(req));
  }

  @RequirePermission('mdm:write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create host' })
  create(@Req() req: any, @Body() body: any) {
    return this.proxy.forward(HUB_URL(), 'POST', '/api/mdm/hosts', body, hdrs(req));
  }

  @RequirePermission('mdm:write')
  @Put(':id')
  @ApiOperation({ summary: 'Update host' })
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.proxy.forward(HUB_URL(), 'PUT', `/api/mdm/hosts/${id}`, body, hdrs(req));
  }

  @RequirePermission('mdm:write')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete host' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(HUB_URL(), 'DELETE', `/api/mdm/hosts/${id}`, undefined, hdrs(req));
  }
}
