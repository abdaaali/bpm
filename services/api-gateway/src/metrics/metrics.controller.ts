import { Controller, Get, Res } from '@nestjs/common';
import * as client from 'prom-client';

const register = new client.Registry();
client.collectDefaultMetrics({ register });

@Controller('metrics')
export class MetricsController {
  @Get()
  async getMetrics(@Res() res: any) {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  }
}
