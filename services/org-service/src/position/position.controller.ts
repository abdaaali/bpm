import { Controller, Get, Post, Put, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PositionService } from './position.service';

@ApiTags('Positions')
@Controller('positions')
export class PositionController {
  constructor(private readonly svc: PositionService) {}

  @Get() findAll(@Req() req: any, @Query() q: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.findAll(tid, { page: q.page ? +q.page : 1, pageSize: q.pageSize ? +q.pageSize : 50, orgUnitId: q.orgUnitId });
  }
  @Post() create(@Req() req: any, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.create(tid, body, req.headers['x-user-id']);
  }
  @Put(':id') update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.update(id, tid, body, req.headers['x-user-id']);
  }
}
