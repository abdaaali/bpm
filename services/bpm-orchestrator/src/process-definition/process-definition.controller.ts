import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, Headers, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ProcessDefinitionService } from './process-definition.service';

@Controller('definitions')
export class ProcessDefinitionController {
  constructor(private readonly svc: ProcessDefinitionService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id']; }

  @Get()
  findAll(
    @Headers() h: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) { return this.svc.findAll(this.tenant(h), page, pageSize); }

  @Get('slug/:slug')
  findBySlug(@Headers() h: Record<string, string>, @Param('slug') slug: string) {
    return this.svc.findBySlug(this.tenant(h), slug);
  }

  @Get('slug/:slug/start-form')
  getStartForm(@Headers() h: Record<string, string>, @Param('slug') slug: string) {
    return this.svc.getStartForm(this.tenant(h), slug);
  }

  @Get(':id')
  findOne(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.findOne(this.tenant(h), id);
  }

  @Post()
  create(@Headers() h: Record<string, string>, @Body() dto: any) {
    return this.svc.create(this.tenant(h), dto, this.actor(h));
  }

  @Put(':id')
  update(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: any) {
    return this.svc.update(this.tenant(h), id, dto, this.actor(h));
  }

  @Post(':id/new-version')
  newVersion(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.createDraftVersion(this.tenant(h), id, this.actor(h));
  }

  @Post(':id/publish')
  publish(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.publish(this.tenant(h), id, this.actor(h));
  }

  @Post(':id/unpublish')
  unpublish(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.unpublish(this.tenant(h), id, this.actor(h));
  }

  @Post(':id/archive')
  archive(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.archive(this.tenant(h), id, this.actor(h));
  }

  @Delete(':id')
  remove(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.remove(this.tenant(h), id, this.actor(h));
  }
}
