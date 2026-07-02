import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OrgUnitService } from './org-unit.service';

@ApiTags('Org Units')
@Controller('org-units')
export class OrgUnitController {
  constructor(private readonly svc: OrgUnitService) {}

  @Get('tree')
  getTree(@Req() req: any, @Query('tenantId') tenantId?: string) {
    const tid = tenantId || req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.getTree(tid);
  }

  @Get()
  findAll(@Req() req: any, @Query() q: any) {
    const tid = q.tenantId || req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.findAll(tid, { page: q.page ? +q.page : 1, pageSize: q.pageSize ? +q.pageSize : 50, type: q.type, parentId: q.parentId });
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    const tid = body.tenantId || req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    const uid = req.headers['x-user-id'];
    return this.svc.create(tid, body, uid);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.findById(id, tid);
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    const uid = req.headers['x-user-id'];
    return this.svc.update(id, tid, body, uid);
  }

  @Delete(':id')
  delete(@Req() req: any, @Param('id') id: string) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    const uid = req.headers['x-user-id'];
    return this.svc.delete(id, tid, uid);
  }

  @Get(':id/manager-chain')
  getManagerChain(@Req() req: any, @Param('id') id: string) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.getManagerChain(id, tid);
  }
}
