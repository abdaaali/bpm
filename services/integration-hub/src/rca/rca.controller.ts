import { Controller, Get, Query, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { RcaService } from './rca.service';

@Controller('rca')
export class RcaController {
  constructor(private readonly svc: RcaService) {}

  private days(d: number) { return Math.min(Math.max(d, 1), 90); }

  @Get('summary')
  summary(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.svc.getSummary(this.days(days));
  }

  @Get('pareto')
  pareto(
    @Query('by') by: 'severity' | 'source_system' | 'category' = 'severity',
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.svc.getPareto(by || 'severity', this.days(days));
  }

  @Get('anomalies')
  anomalies(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.svc.getAnomalies(this.days(days));
  }

  @Get('clusters')
  clusters(
    @Query('k', new DefaultValuePipe(5), ParseIntPipe) k: number,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.svc.getClusters(k, this.days(days));
  }

  @Get('correlations')
  correlations(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.svc.getCorrelations(this.days(days));
  }

  @Get('top-causes')
  topCauses(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.svc.getTopCauses(this.days(days));
  }
}
