import { Controller, Get, Headers, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }

  @Get('summary')
  summary(@Headers() h: Record<string, string>) { return this.svc.getSummary(this.tenant(h)); }

  @Get('by-definition')
  byDefinition(@Headers() h: Record<string, string>) { return this.svc.getByDefinition(this.tenant(h)); }

  @Get('over-time')
  overTime(
    @Headers() h: Record<string, string>,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) { return this.svc.getOverTime(this.tenant(h), Math.min(days, 90)); }

  @Get('bottlenecks')
  bottlenecks(@Headers() h: Record<string, string>) { return this.svc.getBottlenecks(this.tenant(h)); }

  @Get('sla')
  sla(@Headers() h: Record<string, string>) { return this.svc.getSlaCompliance(this.tenant(h)); }

  @Get('workload')
  workload(@Headers() h: Record<string, string>) { return this.svc.getWorkload(this.tenant(h)); }
}
