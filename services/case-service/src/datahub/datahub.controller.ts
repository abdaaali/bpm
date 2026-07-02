import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers } from '@nestjs/common';
import { DataHubService } from './datahub.service';

@Controller('datahub')
export class DataHubController {
  constructor(private readonly svc: DataHubService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }

  @Get('sites')
  listSites(@Headers() h: Record<string, string>,
            @Query('access_class') access_class?: string,
            @Query('region') region?: string,
            @Query('search') search?: string) {
    return this.svc.listSites(this.tenant(h), { access_class, region, search });
  }

  @Get('sites/:id')
  getSite(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.getSite(this.tenant(h), id);
  }

  @Get('sites/:id/sla-preview')
  preview(@Headers() h: Record<string, string>, @Param('id') id: string,
          @Query('type') type?: string, @Query('priority') priority?: string,
          @Query('sla_class') slaClass?: string) {
    return this.svc.previewSla(this.tenant(h), id, type, priority, slaClass);
  }

  @Post('sites')
  createSite(@Headers() h: Record<string, string>, @Body() dto: any) {
    return this.svc.createSite(this.tenant(h), dto);
  }

  @Put('sites/:id')
  updateSite(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: any) {
    return this.svc.updateSite(this.tenant(h), id, dto);
  }

  @Delete('sites/:id')
  deleteSite(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.deleteSite(this.tenant(h), id);
  }

  // ── Generic extension domains ──
  @Get('domains')
  domains() { return this.svc.domains(); }

  @Get('domains/:domain')
  listDomain(@Headers() h: Record<string, string>, @Param('domain') domain: string, @Query('search') search?: string) {
    return this.svc.listDomain(this.tenant(h), domain, search);
  }

  @Post('domains/:domain')
  createItem(@Headers() h: Record<string, string>, @Param('domain') domain: string, @Body() dto: any) {
    return this.svc.createDomainItem(this.tenant(h), domain, dto);
  }

  @Put('domains/:domain/:id')
  updateItem(@Headers() h: Record<string, string>, @Param('domain') domain: string, @Param('id') id: string, @Body() dto: any) {
    return this.svc.updateDomainItem(this.tenant(h), domain, id, dto);
  }

  @Delete('domains/:domain/:id')
  deleteItem(@Headers() h: Record<string, string>, @Param('domain') domain: string, @Param('id') id: string) {
    return this.svc.deleteDomainItem(this.tenant(h), domain, id);
  }
}
