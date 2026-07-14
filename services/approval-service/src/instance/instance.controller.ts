import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InstanceService } from './instance.service';

@ApiTags('Approval Instances')
@Controller('instances')
export class InstanceController {
  constructor(private readonly svc: InstanceService) {}

  @Post() create(@Req() req: any, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    const uid = req.headers['x-user-id'] || body.requesterId;
    return this.svc.create(tid, body, uid);
  }
  @Get() findAll(@Req() req: any, @Query() q: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.findAll(tid, { page: q.page ? +q.page : 1, pageSize: q.pageSize ? +q.pageSize : 20, status: q.status, entityType: q.entityType });
  }
  @Get('pending') getPending(@Req() req: any, @Query() q: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    const uid = req.headers['x-user-id'] || '';
    return this.svc.findPendingForUser(uid, tid, { page: q.page ? +q.page : 1, pageSize: q.pageSize ? +q.pageSize : 20 });
  }
  @Get('leadership-summary') getLeadershipSummary(@Req() req: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    const uid = req.headers['x-user-id'] || '';
    return this.svc.getLeadershipSummary(uid, tid);
  }
  @Get('organization') getOrganizationScoped(@Req() req: any, @Query() q: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    const uid = req.headers['x-user-id'] || '';
    return this.svc.findOrganizationScoped(uid, tid, { page: q.page ? +q.page : 1, pageSize: q.pageSize ? +q.pageSize : 20, attention: q.attention });
  }
  @Get(':id') findOne(@Req() req: any, @Param('id') id: string) {
    return this.svc.findById(id, req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001');
  }
  @Post(':id/steps/:stepId/approve') approve(@Req() req: any, @Param('id') id: string, @Param('stepId') sid: string, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    const uid = req.headers['x-user-id'] || '';
    return this.svc.approve(id, sid, uid, tid, body.comment);
  }
  @Post(':id/steps/:stepId/reject') reject(@Req() req: any, @Param('id') id: string, @Param('stepId') sid: string, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    const uid = req.headers['x-user-id'] || '';
    return this.svc.reject(id, sid, uid, tid, body.comment || 'Rejected');
  }
}
