import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, HttpCode } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly svc: UserService) {}

  @Get()
  findAll(@Req() req: any, @Query() q: any) {
    // Tenant comes ONLY from the gateway-verified header — never from caller
    // body/query, which would allow cross-tenant reads/writes.
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.findAll(tid, { page: q.page ? +q.page : 1, pageSize: q.pageSize ? +q.pageSize : 20, search: q.search, role: q.role });
  }

  @Post()
  create(@Req() req: any, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.create(tid, body, req.headers['x-user-id']);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.findById(id, tid);
  }

  @Put(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.update(id, tid, body, req.headers['x-user-id']);
  }

  @Delete(':id')
  @HttpCode(200)
  deactivate(@Req() req: any, @Param('id') id: string, @Query('action') action: string) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    if (action === 'activate') return this.svc.activate(id, tid, req.headers['x-user-id']);
    return this.svc.deactivate(id, tid, req.headers['x-user-id']);
  }

  @Post(':id/roles')
  assignRole(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.assignRole(id, body.roleId, tid, body.keycloakId);
  }

  @Delete(':id/roles/:roleId')
  removeRole(@Req() req: any, @Param('id') id: string, @Param('roleId') roleId: string) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.removeRole(id, roleId, tid);
  }

  @Post(':id/assignments')
  assignToOrgUnit(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.assignToOrgUnit(id, tid, body);
  }

  @Get(':id/managers')
  getManagers(@Req() req: any, @Param('id') id: string) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.getManagers(id, tid);
  }

  @Get(':id/hierarchy')
  getHierarchy(@Req() req: any, @Param('id') id: string) {
    const tid = req.headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001';
    return this.svc.getHierarchy(id, tid);
  }
}
