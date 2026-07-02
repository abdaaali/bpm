import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const CASE_URL = () => process.env.CASE_SERVICE_URL || 'http://case-service:3004';

function hdrs(req: any) {
  return {
    Authorization: req.headers['authorization'] || '',
    'X-Tenant-ID': req.tenantId || '',
    'X-User-ID': req.user?.sub || '',
  };
}

@ApiTags('Contractors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@UseInterceptors(TenantInterceptor)
@RequirePermission('contractors:read')
@Controller('api/v1/contractors')
export class ContractorsController {
  constructor(private readonly proxy: ProxyService) {}

  // ── External Company Management ──────────────────────────────────────────
  @Get('companies')
  listCompanies(@Req() req: any, @Query() q: any) {
    return this.proxy.forward(CASE_URL(), 'GET', '/api/contractors/companies', undefined, hdrs(req), q);
  }

  @Post('companies')
  @RequirePermission('contractors:manage')
  createCompany(@Req() req: any, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'POST', '/api/contractors/companies', b, hdrs(req));
  }

  @Get('companies/:id')
  getCompany(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(CASE_URL(), 'GET', `/api/contractors/companies/${id}`, undefined, hdrs(req));
  }

  @Put('companies/:id')
  @RequirePermission('contractors:manage')
  updateCompany(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PUT', `/api/contractors/companies/${id}`, b, hdrs(req));
  }

  @Delete('companies/:id')
  @RequirePermission('contractors:manage')
  deleteCompany(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(CASE_URL(), 'DELETE', `/api/contractors/companies/${id}`, undefined, hdrs(req));
  }

  // ── External User Management ─────────────────────────────────────────────
  @Get('users')
  listUsers(@Req() req: any, @Query() q: any) {
    return this.proxy.forward(CASE_URL(), 'GET', '/api/contractors/users', undefined, hdrs(req), q);
  }

  @Post('users')
  @RequirePermission('contractors:manage')
  createUser(@Req() req: any, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'POST', '/api/contractors/users', b, hdrs(req));
  }

  @Get('users/:id')
  getUser(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(CASE_URL(), 'GET', `/api/contractors/users/${id}`, undefined, hdrs(req));
  }

  @Put('users/:id')
  @RequirePermission('contractors:manage')
  updateUser(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PUT', `/api/contractors/users/${id}`, b, hdrs(req));
  }

  @Delete('users/:id')
  @RequirePermission('contractors:manage')
  deleteUser(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(CASE_URL(), 'DELETE', `/api/contractors/users/${id}`, undefined, hdrs(req));
  }

  @Post('users/:id/reset-password')
  @RequirePermission('contractors:manage')
  resetUserPassword(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'POST', `/api/contractors/users/${id}/reset-password`, b, hdrs(req));
  }

  // ── Work Order Assignments ────────────────────────────────────────────────
  @Get('assignments')
  listAssignments(@Req() req: any, @Query() q: any) {
    return this.proxy.forward(CASE_URL(), 'GET', '/api/contractors/assignments', undefined, hdrs(req), q);
  }

  @Get('assignments/:id')
  getAssignment(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(CASE_URL(), 'GET', `/api/contractors/assignments/${id}`, undefined, hdrs(req));
  }

  @Post('dispatch')
  @RequirePermission('contractors:dispatch')
  dispatch(@Req() req: any, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'POST', '/api/contractors/dispatch', b, hdrs(req));
  }

  @Patch('assignments/:id/approve')
  @RequirePermission('contractors:dispatch')
  approve(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PATCH', `/api/contractors/assignments/${id}/approve`, b, hdrs(req));
  }

  @Patch('assignments/:id/rework')
  @RequirePermission('contractors:dispatch')
  rework(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PATCH', `/api/contractors/assignments/${id}/rework`, b, hdrs(req));
  }

  @Patch('assignments/:id/reassign')
  @RequirePermission('contractors:dispatch')
  reassign(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PATCH', `/api/contractors/assignments/${id}/reassign`, b, hdrs(req));
  }

  @Patch('assignments/:id/close')
  @RequirePermission('contractors:dispatch')
  close(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PATCH', `/api/contractors/assignments/${id}/close`, b, hdrs(req));
  }

  @Patch('assignments/:id/reschedule')
  @RequirePermission('contractors:dispatch')
  respondReschedule(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'PATCH', `/api/contractors/assignments/${id}/reschedule`, b, hdrs(req));
  }

  @Post('assignments/:id/comments')
  @RequirePermission('contractors:dispatch')
  addComment(@Req() req: any, @Param('id') id: string, @Body() b: any) {
    return this.proxy.forward(CASE_URL(), 'POST', `/api/contractors/assignments/${id}/comments`, b, hdrs(req));
  }

  // ── Dashboard & Reporting ─────────────────────────────────────────────────
  @Get('dashboard')
  dashboard(@Req() req: any, @Query() q: any) {
    return this.proxy.forward(CASE_URL(), 'GET', '/api/contractors/dashboard', undefined, hdrs(req), q);
  }

  @Get('performance')
  performance(@Req() req: any, @Query() q: any) {
    return this.proxy.forward(CASE_URL(), 'GET', '/api/contractors/performance', undefined, hdrs(req), q);
  }
}
