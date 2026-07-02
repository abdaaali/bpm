import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { WorkOrdersService } from './work-orders.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/ext')
@UseGuards(JwtAuthGuard)
export class WorkOrdersController {
  constructor(private readonly svc: WorkOrdersService) {}

  @Get('dashboard/stats')
  getDashboardStats(@Req() req: any) {
    const { sub, company_id, tenant_id } = req.user;
    return this.svc.getDashboardStats(sub, company_id, tenant_id);
  }

  @Get('work-orders')
  list(@Req() req: any, @Query() q: any) {
    const { sub, company_id, tenant_id, role } = req.user;
    return this.svc.findMyWorkOrders(sub, company_id, tenant_id, { ...q, role });
  }

  @Get('work-orders/:id')
  getOne(@Param('id') id: string, @Req() req: any) {
    const { company_id, tenant_id } = req.user;
    return this.svc.findOne(id, company_id, tenant_id);
  }

  @Post('work-orders/:id/accept')
  accept(@Param('id') id: string, @Req() req: any) {
    const { sub, company_id, tenant_id } = req.user;
    return this.svc.accept(id, sub, company_id, tenant_id, req.ip);
  }

  @Post('work-orders/:id/reject')
  reject(@Param('id') id: string, @Body() body: { reason: string }, @Req() req: any) {
    const { sub, company_id, tenant_id } = req.user;
    return this.svc.reject(id, sub, company_id, tenant_id, body.reason || 'No reason provided', req.ip);
  }

  @Post('work-orders/:id/progress')
  progress(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const { sub, company_id, tenant_id } = req.user;
    return this.svc.submitProgress(id, sub, company_id, tenant_id, body, req.ip);
  }

  @Post('work-orders/:id/complete')
  complete(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const { sub, company_id, tenant_id } = req.user;
    return this.svc.submitCompletion(id, sub, company_id, tenant_id, body, req.ip);
  }

  @Post('work-orders/:id/clarification')
  clarification(@Param('id') id: string, @Body() body: { message: string }, @Req() req: any) {
    const { sub, company_id, tenant_id } = req.user;
    return this.svc.requestClarification(id, sub, company_id, tenant_id, body.message, req.ip);
  }

  @Post('work-orders/:id/reschedule')
  reschedule(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const { sub, company_id, tenant_id } = req.user;
    return this.svc.requestReschedule(id, sub, company_id, tenant_id, body, req.ip);
  }
}
