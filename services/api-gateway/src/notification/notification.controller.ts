import { Controller, Get, Post, Put, Patch, Body, Param, Query, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const NOTIF_URL = () => process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3006';

function hdrs(req: any) {
  return { Authorization: req.headers['authorization'] || '', 'X-Tenant-ID': req.tenantId || '', 'X-User-ID': req.user?.sub || '' };
}

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/notifications')
export class NotificationController {
  constructor(private readonly proxy: ProxyService) {}

  // Own-notification endpoints stay open to any authenticated user.
  @Get() list(@Req() req: any, @Query() q: any) { return this.proxy.forward(NOTIF_URL(), 'GET', '/api/notifications', undefined, hdrs(req), q); }
  @Get('count') count(@Req() req: any) { return this.proxy.forward(NOTIF_URL(), 'GET', '/api/notifications/count', undefined, hdrs(req)); }
  @Patch('read') markRead(@Req() req: any, @Body() b: any) { return this.proxy.forward(NOTIF_URL(), 'PATCH', '/api/notifications/read', b, hdrs(req)); }
  // Sending arbitrary notifications + editing templates is privileged.
  @Post('send') @RequirePermission('notifications:manage') send(@Req() req: any, @Body() b: any) { return this.proxy.forward(NOTIF_URL(), 'POST', '/api/notifications/send', b, hdrs(req)); }
  @Get('templates') @RequirePermission('notifications:manage') listTemplates(@Req() req: any) { return this.proxy.forward(NOTIF_URL(), 'GET', '/api/templates', undefined, hdrs(req)); }
  @Get('templates/:slug') @RequirePermission('notifications:manage') getTemplate(@Req() req: any, @Param('slug') slug: string) { return this.proxy.forward(NOTIF_URL(), 'GET', `/api/templates/${slug}`, undefined, hdrs(req)); }
  @Put('templates/:slug') @RequirePermission('notifications:manage') upsertTemplate(@Req() req: any, @Param('slug') slug: string, @Body() b: any) { return this.proxy.forward(NOTIF_URL(), 'PUT', `/api/templates/${slug}`, b, hdrs(req)); }
}
