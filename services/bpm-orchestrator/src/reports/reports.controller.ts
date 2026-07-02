import { Controller, Get, Post, Put, Delete, Body, Param, Headers } from '@nestjs/common';
import { ReportsService, RunDto } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private user(h: Record<string, string>) { return h['x-user-id'] || null; }

  @Get('sources')
  sources() { return this.svc.getSources(); }

  @Post('run')
  run(@Headers() h: Record<string, string>, @Body() body: RunDto) { return this.svc.run(this.tenant(h), body); }

  @Get('templates')
  listTemplates(@Headers() h: Record<string, string>) { return this.svc.listTemplates(this.tenant(h)); }

  @Get('templates/:id')
  getTemplate(@Headers() h: Record<string, string>, @Param('id') id: string) { return this.svc.getTemplate(this.tenant(h), id); }

  @Post('templates')
  saveTemplate(@Headers() h: Record<string, string>, @Body() body: any) { return this.svc.saveTemplate(this.tenant(h), this.user(h), body); }

  @Put('templates/:id')
  updateTemplate(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() body: any) { return this.svc.updateTemplate(this.tenant(h), id, body); }

  @Delete('templates/:id')
  deleteTemplate(@Headers() h: Record<string, string>, @Param('id') id: string) { return this.svc.deleteTemplate(this.tenant(h), id); }
}
