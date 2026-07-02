import { Controller, Get, Headers, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { RcaService } from './rca.service';

@Controller('rca')
export class RcaController {
  constructor(private readonly svc: RcaService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }

  @Get('summary')
  summary(
    @Headers() h: Record<string, string>,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) { return this.svc.getSummary(this.tenant(h), Math.min(days, 90)); }

  @Get('pareto')
  pareto(
    @Headers() h: Record<string, string>,
    @Query('by') by = 'root_cause_category',
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) { return this.svc.getPareto(this.tenant(h), by, Math.min(days, 90)); }

  @Get('trends')
  trends(
    @Headers() h: Record<string, string>,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) { return this.svc.getTrends(this.tenant(h), Math.min(days, 90)); }

  @Get('repeat-offenders')
  repeatOffenders(
    @Headers() h: Record<string, string>,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) { return this.svc.getRepeatOffenders(this.tenant(h), Math.min(days, 90)); }

  @Get('process-analysis')
  processAnalysis(
    @Headers() h: Record<string, string>,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) { return this.svc.getProcessAnalysis(this.tenant(h), Math.min(days, 90)); }

  @Get('resolution-time')
  resolutionTime(
    @Headers() h: Record<string, string>,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) { return this.svc.getResolutionTime(this.tenant(h), Math.min(days, 90)); }

  @Get('emerging-problems')
  emergingProblems(@Headers() h: Record<string, string>) {
    return this.svc.getEmergingProblems(this.tenant(h));
  }
}
