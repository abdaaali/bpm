import { Controller, Get, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  @Get()
  getDashboard(@Req() req: any) {
    return this.svc.getDashboard(req.tenantId, req.user?.sub, req.headers['authorization'] || '');
  }
}
