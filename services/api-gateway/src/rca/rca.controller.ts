import { Controller, Get, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const ORCH_URL = () => process.env.ORCHESTRATOR_URL || 'http://bpm-orchestrator:3003';
const CASE_URL = () => process.env.CASE_SERVICE_URL || 'http://case-service:3004';

function authHdrs(req: any): Record<string, string> {
  return {
    Authorization: req.headers['authorization'] || '',
    'X-Tenant-ID': req.tenantId || '',
    'X-User-ID':   req.user?.sub || '',
  };
}

@ApiTags('RCA')
@Controller('api/v1/rca')
@UseGuards(JwtAuthGuard)
@UseInterceptors(TenantInterceptor)
@ApiBearerAuth()
export class RcaController {
  constructor(private readonly proxy: ProxyService) {}

  @Get('summary')
  @ApiOperation({ summary: 'RCA KPI summary (case-based)' })
  summary(@Req() req: any, @Query('days') days?: string) {
    return this.proxy.forward(ORCH_URL(), 'GET', '/rca/summary', undefined, authHdrs(req), days ? { days } : {});
  }

  @Get('pareto')
  @ApiOperation({ summary: 'Pareto distribution by root cause / type / priority' })
  pareto(@Req() req: any, @Query('by') by?: string, @Query('days') days?: string) {
    return this.proxy.forward(ORCH_URL(), 'GET', '/rca/pareto', undefined, authHdrs(req), { ...(by && { by }), ...(days && { days }) });
  }

  @Get('trends')
  @ApiOperation({ summary: 'Daily case trends stacked by root cause category' })
  trends(@Req() req: any, @Query('days') days?: string) {
    return this.proxy.forward(ORCH_URL(), 'GET', '/rca/trends', undefined, authHdrs(req), days ? { days } : {});
  }

  @Get('repeat-offenders')
  @ApiOperation({ summary: 'Recurring root cause patterns' })
  repeatOffenders(@Req() req: any, @Query('days') days?: string) {
    return this.proxy.forward(ORCH_URL(), 'GET', '/rca/repeat-offenders', undefined, authHdrs(req), days ? { days } : {});
  }

  @Get('process-analysis')
  @ApiOperation({ summary: 'Root cause breakdown by process / case type' })
  processAnalysis(@Req() req: any, @Query('days') days?: string) {
    return this.proxy.forward(ORCH_URL(), 'GET', '/rca/process-analysis', undefined, authHdrs(req), days ? { days } : {});
  }

  @Get('resolution-time')
  @ApiOperation({ summary: 'Avg / median resolution time by root cause category' })
  resolutionTime(@Req() req: any, @Query('days') days?: string) {
    return this.proxy.forward(ORCH_URL(), 'GET', '/rca/resolution-time', undefined, authHdrs(req), days ? { days } : {});
  }

  @Get('taxonomy')
  @ApiOperation({ summary: 'Root cause taxonomy (categories + subcategories)' })
  taxonomy(@Req() req: any) {
    return this.proxy.forward(CASE_URL(), 'GET', '/api/cases/taxonomy', undefined, authHdrs(req), {});
  }

  @Get('emerging-problems')
  @ApiOperation({ summary: 'Anomaly detection — CIs with abnormal incident volume (modified z-score)' })
  emergingProblems(@Req() req: any) {
    return this.proxy.forward(ORCH_URL(), 'GET', '/rca/emerging-problems', undefined, authHdrs(req), {});
  }
}
