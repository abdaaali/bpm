import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { CompanyService } from './company.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('api/ext/company')
@UseGuards(JwtAuthGuard)
export class CompanyController {
  constructor(private readonly svc: CompanyService) {}

  @Get('me')
  getMyCompany(@Req() req: any) {
    const { company_id, tenant_id } = req.user;
    return this.svc.getMyCompany(company_id, tenant_id);
  }

  @Get('team')
  getTeam(@Req() req: any) {
    const { company_id, tenant_id, role } = req.user;
    if (!['company_admin', 'supervisor'].includes(role)) {
      return { message: 'Access denied', data: [] };
    }
    return this.svc.getTeam(company_id, tenant_id);
  }

  @Get('stats')
  getStats(@Req() req: any) {
    const { company_id, tenant_id, role } = req.user;
    if (!['company_admin', 'supervisor'].includes(role)) {
      return { message: 'Access denied', data: [] };
    }
    return this.svc.getStats(company_id, tenant_id);
  }
}
