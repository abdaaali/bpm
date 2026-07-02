import { Controller, Get, Post, Put, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DelegationService } from './delegation.service';

@ApiTags('Delegations')
@Controller('delegations')
export class DelegationController {
  constructor(private readonly svc: DelegationService) {}

  @Get() findAll(@Req() req: any, @Query() q: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.findAll(tid, { page: q.page ? +q.page : 1, pageSize: q.pageSize ? +q.pageSize : 20, active: q.active !== undefined ? q.active === 'true' : undefined });
  }
  @Post() create(@Req() req: any, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.create(tid, body, req.headers['x-user-id']);
  }
  @Put(':id') deactivate(@Req() req: any, @Param('id') id: string) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.deactivate(id, tid, req.headers['x-user-id']);
  }
}
