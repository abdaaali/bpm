import { Controller, Get, Post, Put, Body, Param, Query, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { RoleService } from './role.service';

@ApiTags('Roles')
@Controller('roles')
export class RoleController {
  constructor(private readonly svc: RoleService) {}

  @Get() findAll(@Req() req: any, @Query() q: any) {
    // Tenant from the verified header only — not caller-supplied query/body.
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.findAll(tid, { page: q.page ? +q.page : 1, pageSize: q.pageSize ? +q.pageSize : 50 });
  }
  @Post() create(@Req() req: any, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.create(tid, body);
  }
  @Put(':id') update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.update(tid, id, body);
  }
}
