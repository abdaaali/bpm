import { Controller, Get, Post, Patch, Body, Param, Query, Headers, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { TaskService } from './task.service';

@Controller('tasks')
export class TaskController {
  constructor(private readonly svc: TaskService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id'] || ''; }

  @Get()
  findAll(
    @Headers() h: Record<string, string>,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('status') status?: string,
    @Query('assigneeId') assigneeId?: string,
    @Query('instanceId') instanceId?: string,
    @Query('caseId') caseId?: string,
    @Query('candidateGroup') candidateGroup?: string,
    @Query('overdue') overdue?: string,
  ) { return this.svc.findAll(this.tenant(h), { status, assigneeId, instanceId, caseId, candidateGroup, overdue }, page, pageSize); }

  @Get('stats')
  getStats(@Headers() h: Record<string, string>) {
    const uid = this.actor(h) || undefined;
    return this.svc.getStats(this.tenant(h), uid);
  }

  @Get(':id')
  findOne(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.findOne(this.tenant(h), id);
  }

  @Patch(':id/claim')
  claim(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.claim(this.tenant(h), id, this.actor(h));
  }

  @Patch(':id/unclaim')
  unclaim(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.unclaim(this.tenant(h), id, this.actor(h));
  }

  @Post(':id/complete')
  complete(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: { variables?: any; outcome?: string }) {
    return this.svc.complete(this.tenant(h), id, dto, this.actor(h));
  }

  @Patch(':id/reassign')
  reassign(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() body: { assigneeId: string }) {
    return this.svc.reassign(this.tenant(h), id, body.assigneeId, this.actor(h));
  }

  @Post(':id/comment')
  addComment(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() body: { message: string }) {
    return this.svc.addComment(this.tenant(h), id, this.actor(h), body.message);
  }
}
