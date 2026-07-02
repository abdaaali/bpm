import { Controller, Get, Post, Put, Delete, Body, Param, Headers } from '@nestjs/common';
import { DigestService } from './digest.service';

@Controller('digest')
export class DigestController {
  constructor(private readonly svc: DigestService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private user(h: Record<string, string>) { return h['x-user-id'] || null; }

  @Get('overview')
  overview(@Headers() h: Record<string, string>) { return this.svc.getOverview(this.tenant(h)); }

  @Get('config')
  getConfig(@Headers() h: Record<string, string>) { return this.svc.getConfig(this.tenant(h)); }

  @Put('config')
  updateConfig(@Headers() h: Record<string, string>, @Body() b: any) { return this.svc.updateConfig(this.tenant(h), b); }

  @Get('recipients')
  recipients(@Headers() h: Record<string, string>) { return this.svc.listRecipients(this.tenant(h)); }

  @Post('recipients')
  addRecipient(@Headers() h: Record<string, string>, @Body() b: any) { return this.svc.addRecipient(this.tenant(h), b); }

  @Delete('recipients/:id')
  removeRecipient(@Headers() h: Record<string, string>, @Param('id') id: string) { return this.svc.removeRecipient(this.tenant(h), id); }

  @Get('runs')
  runs(@Headers() h: Record<string, string>) { return this.svc.listRuns(this.tenant(h)); }

  @Get('runs/:id')
  run(@Headers() h: Record<string, string>, @Param('id') id: string) { return this.svc.getRun(this.tenant(h), id); }

  @Post('preview')
  preview(@Headers() h: Record<string, string>) { return this.svc.preview(this.tenant(h)); }

  @Post('send')
  send(@Headers() h: Record<string, string>, @Body() b: any) {
    return this.svc.generateAndSend(this.tenant(h), b?.type === 'SCHEDULED' ? 'SCHEDULED' : 'MANUAL_SEND', this.user(h));
  }
}
