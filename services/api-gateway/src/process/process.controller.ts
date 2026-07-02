import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const BPM_URL = () => process.env.BPM_ORCHESTRATOR_URL || 'http://bpm-orchestrator:3003';

function hdrs(req: any) {
  return { Authorization: req.headers['authorization'] || '', 'X-Tenant-ID': req.tenantId || '', 'X-User-ID': req.user?.sub || '' };
}

@ApiTags('Processes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/processes')
export class ProcessController {
  constructor(private readonly proxy: ProxyService) {}

  @Post('definitions') @RequirePermission('processes:design') createDef(@Req() req: any, @Body() b: any) { return this.proxy.forward(BPM_URL(), 'POST', '/definitions', b, hdrs(req)); }
  @Get('definitions') @RequirePermission('processes:read') getDefs(@Req() req: any, @Query() q: any) { return this.proxy.forward(BPM_URL(), 'GET', '/definitions', undefined, hdrs(req), q); }
  @Get('definitions/:id') @RequirePermission('processes:read') getDef(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'GET', `/definitions/${id}`, undefined, hdrs(req)); }
  @Put('definitions/:id') @RequirePermission('processes:design') updateDef(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(BPM_URL(), 'PUT', `/definitions/${id}`, b, hdrs(req)); }
  @Post('definitions/:id/new-version') @RequirePermission('processes:design') newDefVersion(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'POST', `/definitions/${id}/new-version`, {}, hdrs(req)); }
  @Post('definitions/:id/publish')   @RequirePermission('processes:publish') publish(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'POST', `/definitions/${id}/publish`, {}, hdrs(req)); }
  @Post('definitions/:id/unpublish') @RequirePermission('processes:publish') unpublish(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'POST', `/definitions/${id}/unpublish`, {}, hdrs(req)); }
  @Post('definitions/:id/archive')   @RequirePermission('processes:publish') archive(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'POST', `/definitions/${id}/archive`, {}, hdrs(req)); }
  @Delete('definitions/:id')         @RequirePermission('processes:publish') deleteDef(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'DELETE', `/definitions/${id}`, undefined, hdrs(req)); }
  @Get('definitions/:id/steps') @RequirePermission('processes:read') getDefSteps(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'GET', `/definitions/${id}/steps`, undefined, hdrs(req)); }
  @Get('definitions/slug/:slug') @RequirePermission('processes:read') getDefBySlug(@Req() req: any, @Param('slug') slug: string) { return this.proxy.forward(BPM_URL(), 'GET', `/definitions/slug/${slug}`, undefined, hdrs(req)); }
  @Get('definitions/slug/:slug/start-form') @RequirePermission('cases:read') getStartForm(@Req() req: any, @Param('slug') slug: string) { return this.proxy.forward(BPM_URL(), 'GET', `/definitions/slug/${slug}/start-form`, undefined, hdrs(req)); }

  // Analytics
  @Get('analytics/summary')     @RequirePermission('analytics:read') analyticsSummary(@Req() req: any) { return this.proxy.forward(BPM_URL(), 'GET', '/analytics/summary', undefined, hdrs(req)); }
  @Get('analytics/by-definition') @RequirePermission('analytics:read') analyticsByDef(@Req() req: any) { return this.proxy.forward(BPM_URL(), 'GET', '/analytics/by-definition', undefined, hdrs(req)); }
  @Get('analytics/over-time')   @RequirePermission('analytics:read') analyticsOverTime(@Req() req: any, @Query() q: any) { return this.proxy.forward(BPM_URL(), 'GET', '/analytics/over-time', undefined, hdrs(req), q); }
  @Get('analytics/bottlenecks') @RequirePermission('analytics:read') analyticsBottlenecks(@Req() req: any) { return this.proxy.forward(BPM_URL(), 'GET', '/analytics/bottlenecks', undefined, hdrs(req)); }
  @Get('analytics/sla')         @RequirePermission('analytics:read') analyticsSla(@Req() req: any) { return this.proxy.forward(BPM_URL(), 'GET', '/analytics/sla', undefined, hdrs(req)); }
  @Get('analytics/workload')    @RequirePermission('analytics:read') analyticsWorkload(@Req() req: any) { return this.proxy.forward(BPM_URL(), 'GET', '/analytics/workload', undefined, hdrs(req)); }

  @Post('instances') @RequirePermission('cases:create') startInstance(@Req() req: any, @Body() b: any) { return this.proxy.forward(BPM_URL(), 'POST', '/instances', b, hdrs(req)); }
  @Get('instances') @RequirePermission('cases:read') getInstances(@Req() req: any, @Query() q: any) { return this.proxy.forward(BPM_URL(), 'GET', '/instances', undefined, hdrs(req), q); }
  @Get('instances/:id') @RequirePermission('cases:read') getInstance(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'GET', `/instances/${id}`, undefined, hdrs(req)); }
  @Post('instances/:id/cancel') @RequirePermission('cases:update') cancelInstance(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(BPM_URL(), 'POST', `/instances/${id}/cancel`, b, hdrs(req)); }
  @Patch('instances/:id/suspend') @RequirePermission('cases:update') suspendInstance(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'PATCH', `/instances/${id}/suspend`, {}, hdrs(req)); }
  @Patch('instances/:id/resume') @RequirePermission('cases:update') resumeInstance(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'PATCH', `/instances/${id}/resume`, {}, hdrs(req)); }
  @Patch('instances/:id/terminate') @RequirePermission('cases:update') terminateInstance(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(BPM_URL(), 'PATCH', `/instances/${id}/terminate`, b, hdrs(req)); }
  @Patch('instances/:id/variables') @RequirePermission('cases:update') updateVariables(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(BPM_URL(), 'PATCH', `/instances/${id}/variables`, b, hdrs(req)); }
  @Delete('instances/:id') @RequirePermission('cases:update') deleteInstance(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'DELETE', `/instances/${id}`, undefined, hdrs(req)); }
}

@ApiTags('Tasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/tasks')
export class TaskController {
  constructor(private readonly proxy: ProxyService) {}

  @Get() @RequirePermission('tasks:read') getTasks(@Req() req: any, @Query() q: any) { return this.proxy.forward(BPM_URL(), 'GET', '/tasks', undefined, hdrs(req), q); }
  @Get('stats') @RequirePermission('tasks:read') getStats(@Req() req: any, @Query() q: any) { return this.proxy.forward(BPM_URL(), 'GET', '/tasks/stats', undefined, hdrs(req), q); }
  @Get(':id') @RequirePermission('tasks:read') getTask(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'GET', `/tasks/${id}`, undefined, hdrs(req)); }
  @Patch(':id/claim') @RequirePermission('tasks:claim') claim(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(BPM_URL(), 'PATCH', `/tasks/${id}/claim`, b, hdrs(req)); }
  @Post(':id/complete') @RequirePermission('tasks:complete') complete(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(BPM_URL(), 'POST', `/tasks/${id}/complete`, b, hdrs(req)); }
  @Post(':id/escalate') @RequirePermission('tasks:complete') escalate(@Req() req: any, @Param('id') id: string) { return this.proxy.forward(BPM_URL(), 'POST', `/tasks/${id}/escalate`, {}, hdrs(req)); }
  @Patch(':id/reassign') @RequirePermission('tasks:reassign') reassign(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(BPM_URL(), 'PATCH', `/tasks/${id}/reassign`, b, hdrs(req)); }
  @Post(':id/comment') @RequirePermission('tasks:read') addComment(@Req() req: any, @Param('id') id: string, @Body() b: any) { return this.proxy.forward(BPM_URL(), 'POST', `/tasks/${id}/comment`, b, hdrs(req)); }
}
