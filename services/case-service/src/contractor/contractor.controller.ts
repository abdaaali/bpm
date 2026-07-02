import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req, Headers } from '@nestjs/common';
import { ContractorService } from './contractor.service';

function extractHeaders(headers: any) {
  return {
    tenantId: headers['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001',
    userId: headers['x-user-id'] || 'system',
  };
}

@Controller('contractors')
export class ContractorController {
  constructor(private readonly svc: ContractorService) {}

  // ── Companies ──────────────────────────────────────────────────────────────
  @Get('companies')
  listCompanies(@Query() q: any, @Headers() h: any) {
    const { tenantId } = extractHeaders(h);
    return this.svc.getCompanies(tenantId, q);
  }

  @Post('companies')
  createCompany(@Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.createCompany(tenantId, b, userId);
  }

  @Get('companies/:id')
  getCompany(@Param('id') id: string, @Headers() h: any) {
    const { tenantId } = extractHeaders(h);
    return this.svc.getCompany(id, tenantId);
  }

  @Put('companies/:id')
  updateCompany(@Param('id') id: string, @Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.updateCompany(id, tenantId, b, userId);
  }

  @Delete('companies/:id')
  deleteCompany(@Param('id') id: string, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.deleteCompany(id, tenantId, userId);
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  @Get('users')
  listUsers(@Query() q: any, @Headers() h: any) {
    const { tenantId } = extractHeaders(h);
    return this.svc.getUsers(tenantId, q);
  }

  @Post('users')
  createUser(@Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.createUser(tenantId, b, userId);
  }

  @Get('users/:id')
  getUser(@Param('id') id: string, @Query() q: any, @Headers() h: any) {
    const { tenantId } = extractHeaders(h);
    return this.svc.getUsers(tenantId, { ...q, user_id: id });
  }

  @Put('users/:id')
  updateUser(@Param('id') id: string, @Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.updateUser(id, tenantId, b, userId);
  }

  @Delete('users/:id')
  deleteUser(@Param('id') id: string, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.deleteUser(id, tenantId, userId);
  }

  @Post('users/:id/reset-password')
  resetPassword(@Param('id') id: string, @Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.resetUserPassword(id, tenantId, b, userId);
  }

  // ── Assignments ────────────────────────────────────────────────────────────
  @Get('assignments')
  listAssignments(@Query() q: any, @Headers() h: any) {
    const { tenantId } = extractHeaders(h);
    return this.svc.getAssignments(tenantId, q);
  }

  @Get('assignments/:id')
  getAssignment(@Param('id') id: string, @Headers() h: any) {
    const { tenantId } = extractHeaders(h);
    return this.svc.getAssignment(id, tenantId);
  }

  @Post('dispatch')
  dispatch(@Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.dispatch(tenantId, b, userId);
  }

  @Patch('assignments/:id/approve')
  approve(@Param('id') id: string, @Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.approveAssignment(id, tenantId, userId, b);
  }

  @Patch('assignments/:id/rework')
  requestRework(@Param('id') id: string, @Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.requestRework(id, tenantId, userId, b);
  }

  @Patch('assignments/:id/reassign')
  reassign(@Param('id') id: string, @Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.reassignAssignment(id, tenantId, userId, b);
  }

  @Patch('assignments/:id/reschedule')
  respondReschedule(@Param('id') id: string, @Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.respondReschedule(id, tenantId, userId, b);
  }

  @Patch('assignments/:id/close')
  close(@Param('id') id: string, @Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.closeAssignment(id, tenantId, userId, b);
  }

  @Post('assignments/:id/comments')
  addComment(@Param('id') id: string, @Body() b: any, @Headers() h: any) {
    const { tenantId, userId } = extractHeaders(h);
    return this.svc.addAssignmentComment(id, tenantId, userId, b.body, b.internal ?? false);
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────
  @Get('dashboard')
  getDashboard(@Query() q: any, @Headers() h: any) {
    const { tenantId } = extractHeaders(h);
    return this.svc.getDashboard(tenantId, q);
  }

  @Get('performance')
  getPerformance(@Query() q: any, @Headers() h: any) {
    const { tenantId } = extractHeaders(h);
    return this.svc.getPerformance(tenantId, q);
  }
}
