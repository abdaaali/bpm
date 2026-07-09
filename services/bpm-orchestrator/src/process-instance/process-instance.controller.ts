import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Headers, ParseIntPipe, DefaultValuePipe, Put } from '@nestjs/common';
import { ProcessInstanceService } from './process-instance.service';

@Controller('instances')
export class ProcessInstanceController {
  constructor(private readonly svc: ProcessInstanceService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id']; }

  @Get()
  findAll(
    @Headers() h: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('status') status?: string,
    @Query('definitionId') definitionId?: string,
    @Query('initiatorId') initiatorId?: string,
    @Query('caseId') caseId?: string,
    @Query('businessKey') businessKey?: string,
  ) { return this.svc.findAll(this.tenant(h), { status, definitionId, initiatorId, caseId, businessKey }, page, pageSize); }

  @Get(':id')
  findOne(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.findOne(this.tenant(h), id);
  }

  @Post()
  start(@Headers() h: Record<string, string>, @Body() dto: any) {
    return this.svc.start(this.tenant(h), { ...dto, initiatorId: dto.initiatorId || this.actor(h) });
  }

  @Post(':id/approval-result')
  approvalResult(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() body: any) {
    return this.svc.approvalResult(this.tenant(h), id, body, this.actor(h));
  }

  @Patch(':id/suspend')
  suspend(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.suspend(this.tenant(h), id, this.actor(h));
  }

  @Patch(':id/resume')
  resume(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.resume(this.tenant(h), id, this.actor(h));
  }

  @Patch(':id/terminate')
  terminate(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.svc.terminate(this.tenant(h), id, body.reason || 'Terminated by user', this.actor(h));
  }

  @Patch(':id/variables')
  updateVariables(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() body: { variables: Record<string, any> }) {
    return this.svc.updateVariables(this.tenant(h), id, body.variables || {}, this.actor(h));
  }

  @Delete(':id')
  remove(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.remove(this.tenant(h), id, this.actor(h));
  }
}
