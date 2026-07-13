import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Req, UseInterceptors } from '@nestjs/common';
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
    'X-User-Roles': (req.user?.roles || []).join(','),
  };
}

@ApiTags('Cases')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/cases')
export class CaseController {
  constructor(private readonly proxy: ProxyService) {}

  @Post() @RequirePermission('cases:create') create(@Req() req: any, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'POST', '/api/cases', b, hdrs(req)); }
  @Get() @RequirePermission('cases:read') list(@Req() req: any, @Query() q: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/cases', undefined, hdrs(req), q); }
  @Get('stats') @RequirePermission('cases:read') stats(@Req() req: any, @Query() q: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/cases/stats', undefined, hdrs(req), q); }
  @Get('ops-overview') @RequirePermission('cases:read') opsOverview(@Req() req: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/cases/ops-overview', undefined, hdrs(req)); }
  @Get('my-queue/stats') @RequirePermission('cases:read') myQueueStats(@Req() req: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/cases/my-queue/stats', undefined, hdrs(req)); }
  @Get('my-work') @RequirePermission('cases:read') myWork(@Req() req: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/cases/my-work', undefined, hdrs(req)); }
  @Get('by-division') @RequirePermission('cases:read') byDivision(@Req() req: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/cases/by-division', undefined, hdrs(req)); }
  @Get('by-department') @RequirePermission('cases:read') byDepartment(@Req() req: any, @Query() q: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/cases/by-department', undefined, hdrs(req), q); }
  @Get('my-queue') @RequirePermission('cases:read') myQueue(@Req() req: any, @Query() q: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/cases/my-queue', undefined, hdrs(req), q); }
  @Get('meta/link-types') @RequirePermission('cases:read') linkTypes(@Req() req: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/cases/meta/link-types', undefined, hdrs(req)); }
  @Get(':id') @RequirePermission('cases:read') getCase(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}`, undefined, hdrs(req)); }
  @Put(':id') @RequirePermission('cases:update') update(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'PUT', `/api/cases/${id}`, b, hdrs(req)); }
  @Patch(':id/transition') @RequirePermission('cases:update') transition(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'PATCH', `/api/cases/${id}/transition`, b, hdrs(req)); }
  @Post(':id/claim') @RequirePermission('cases:update') claim(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'POST', `/api/cases/${id}/claim`, {}, hdrs(req)); }
  @Get('meta/sla-pause-reasons') @RequirePermission('cases:read') slaPauseReasons(@Req() req: any) { return this.proxy.forward(CASE_URL(), 'GET', '/api/cases/meta/sla-pause-reasons', undefined, hdrs(req)); }
  @Post(':id/sla/pause') @RequirePermission('cases:update') pauseSla(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'POST', `/api/cases/${id}/sla/pause`, b, hdrs(req)); }
  @Post(':id/sla/resume') @RequirePermission('cases:update') resumeSla(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'POST', `/api/cases/${id}/sla/resume`, b, hdrs(req)); }
  @Get(':id/sla/pauses') @RequirePermission('cases:read') getSlaPauses(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}/sla/pauses`, undefined, hdrs(req)); }
  @Post(':id/declare-major') @RequirePermission('cases:update') declareMajor(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'POST', `/api/cases/${id}/declare-major`, b, hdrs(req)); }
  @Get(':id/vendor-escalations') @RequirePermission('cases:read') getVendorEsc(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}/vendor-escalations`, undefined, hdrs(req)); }
  @Post(':id/vendor-escalations') @RequirePermission('cases:update') raiseVendorEsc(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'POST', `/api/cases/${id}/vendor-escalations`, b, hdrs(req)); }
  @Patch(':id/vendor-escalations/:eid') @RequirePermission('cases:update') updateVendorEsc(@Req() req: any, @Param('id') id: string, @Param('eid') eid: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'PATCH', `/api/cases/${id}/vendor-escalations/${eid}`, b, hdrs(req)); }
  @Get(':id/rca') @RequirePermission('cases:read') getRca(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}/rca`, undefined, hdrs(req)); }
  @Get(':id/rca/similar') @RequirePermission('cases:read') rcaSimilar(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}/rca/similar`, undefined, hdrs(req)); }
  @Get(':id/rca/suggest') @RequirePermission('cases:read') rcaSuggest(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}/rca/suggest`, undefined, hdrs(req)); }
  @Put(':id/rca') @RequirePermission('cases:update') saveRca(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'PUT', `/api/cases/${id}/rca`, b, hdrs(req)); }
  @Get(':id/capa') @RequirePermission('cases:read') listCapa(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}/capa`, undefined, hdrs(req)); }
  @Post(':id/capa') @RequirePermission('cases:update') addCapa(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'POST', `/api/cases/${id}/capa`, b, hdrs(req)); }
  @Patch(':id/capa/:aid') @RequirePermission('cases:update') updateCapa(@Req() req: any, @Param('id') id: string, @Param('aid') aid: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'PATCH', `/api/cases/${id}/capa/${aid}`, b, hdrs(req)); }
  @Patch(':id/assign') @RequirePermission('cases:assign') assign(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'PATCH', `/api/cases/${id}/assign`, b, hdrs(req)); }
  @Post(':id/comments') @RequirePermission('cases:update') addComment(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'POST', `/api/cases/${id}/comments`, b, hdrs(req)); }
  @Get(':id/comments') @RequirePermission('cases:read') getComments(@Req() req: any, @Param('id') id: string, @Query() q: any) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}/comments`, undefined, hdrs(req), q); }
  @Get(':id/children') @RequirePermission('cases:read') getChildren(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}/children`, undefined, hdrs(req)); }
  @Post(':id/work-orders') @RequirePermission('cases:workorder') createWorkOrder(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'POST', `/api/cases/${id}/work-orders`, b, hdrs(req)); }
  @Get(':id/links') @RequirePermission('cases:read') getLinks(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}/links`, undefined, hdrs(req)); }
  @Post(':id/links') @RequirePermission('cases:link') addLink(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(CASE_URL(), 'POST', `/api/cases/${id}/links`, b, hdrs(req)); }
  @Delete(':id/links/:linkId') @RequirePermission('cases:link') removeLink(@Req() req: any, @Param('id') id: string, @Param('linkId') linkId: string) { return this.proxy.forward(CASE_URL(), 'DELETE', `/api/cases/${id}/links/${linkId}`, undefined, hdrs(req)); }
  @Get(':id/timeline') @RequirePermission('cases:read') timeline(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(CASE_URL(), 'GET', `/api/cases/${id}/timeline`, undefined, hdrs(req)); }
}
