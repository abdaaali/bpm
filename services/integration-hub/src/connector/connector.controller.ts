import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, Headers, ParseIntPipe, DefaultValuePipe, OnModuleInit } from '@nestjs/common';
import { ConnectorService } from './connector.service';

@Controller('connectors')
export class ConnectorController implements OnModuleInit {
  constructor(private readonly svc: ConnectorService) {}

  async onModuleInit() { await this.svc.loadActiveCrons(); }

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id']; }

  @Get()
  findAll(
    @Headers() h: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) { return this.svc.findAll(this.tenant(h), page, pageSize); }

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

  @Patch(':id/activate')
  activate(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.activate(this.tenant(h), id, this.actor(h));
  }

  @Patch(':id/deactivate')
  deactivate(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.deactivate(this.tenant(h), id, this.actor(h));
  }

  @Delete(':id')
  remove(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.remove(this.tenant(h), id, this.actor(h)).then(() => ({ ok: true }));
  }

  @Post(':id/execute')
  execute(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() payload: any) {
    return this.svc.execute(this.tenant(h), id, payload, 'manual');
  }

  @Get(':id/logs')
  getLogs(
    @Headers() h: Record<string, string>,
    @Param('id') id: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(50), ParseIntPipe) pageSize: number,
  ) { return this.svc.getLogs(this.tenant(h), id, page, pageSize); }
}
