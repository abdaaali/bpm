import { Controller, Get, Post, Patch, Body, Param, Query, Headers, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { NotificationService } from './notification.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly svc: NotificationService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id'] || ''; }

  @Get()
  findMine(
    @Headers() h: Record<string, string>,
    @Query('unread', new DefaultValuePipe('false')) unread: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(30), ParseIntPipe) pageSize: number,
  ) { return this.svc.findForUser(this.tenant(h), this.actor(h), unread === 'true', page, pageSize); }

  @Get('count')
  count(@Headers() h: Record<string, string>) {
    return this.svc.getUnreadCount(this.tenant(h), this.actor(h)).then(count => ({ count }));
  }

  @Patch('read')
  markRead(@Headers() h: Record<string, string>, @Body() body: { ids?: string[] }) {
    return this.svc.markRead(this.tenant(h), this.actor(h), body.ids || []);
  }

  @Post('send')
  send(@Headers() h: Record<string, string>, @Body() dto: any) {
    return this.svc.send({ ...dto, tenantId: this.tenant(h) }).then(() => ({ ok: true }));
  }

  // Raw email to any address (internal use: reports/digests). Returns {sent}.
  @Post('email')
  email(@Body() dto: { to: string; subject: string; html: string }) {
    return this.svc.sendEmail(dto.to, dto.subject, dto.html);
  }
}
