import { Controller, Get, Post, Put, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PolicyService } from './policy.service';

@ApiTags('Approval Policies')
@Controller('policies')
export class PolicyController {
  constructor(private readonly svc: PolicyService) {}

  @Get() findAll(@Req() req: any, @Query() q: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.findAll(tid, { page: q.page ? +q.page : 1, pageSize: q.pageSize ? +q.pageSize : 20 });
  }
  @Post() create(@Req() req: any, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.create(tid, body, req.headers['x-user-id']);
  }
  @Post('simulate') simulate(@Req() req: any, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.simulate(tid, body.policyId, body.requesterId, body.context || {});
  }
  @Get(':id') findOne(@Req() req: any, @Param('id') id: string) {
    return this.svc.findById(id, req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001');
  }
  @Put(':id') update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.update(id, tid, body, req.headers['x-user-id']);
  }
}
