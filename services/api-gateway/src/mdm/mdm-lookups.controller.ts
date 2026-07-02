import {
  Controller, Get, Post, Delete, Body, Param, Query,
  Req, UseGuards, UseInterceptors, HttpCode, HttpStatus,
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

@ApiTags('MDM Lookups')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@RequirePermission('mdm:read')
@Controller('api/v1/mdm/lookups')
export class MdmLookupsGatewayController {
  constructor(private readonly proxy: ProxyService) {}

  @Get()
  @ApiOperation({ summary: 'List lookup values' })
  list(@Req() req: any, @Query() q: any) {
    return this.proxy.forward(HUB_URL(), 'GET', '/api/mdm/lookups', undefined, hdrs(req), q);
  }

  @Post()
  @RequirePermission('mdm:write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a lookup value' })
  add(@Req() req: any, @Body() body: any) {
    return this.proxy.forward(HUB_URL(), 'POST', '/api/mdm/lookups', body, hdrs(req));
  }

  @Delete(':id')
  @RequirePermission('mdm:write')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a lookup value' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(HUB_URL(), 'DELETE', `/api/mdm/lookups/${id}`, undefined, hdrs(req));
  }
}
