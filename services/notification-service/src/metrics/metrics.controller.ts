import { Controller, Get, Res } from '@nestjs/common'; import { Response } from 'express'; import * as client from 'prom-client';
client.collectDefaultMetrics({ prefix: 'notification_service_' });
@Controller('metrics') export class MetricsController {
  @Get() async metrics(@Res() res: Response){res.set('Content-Type',client.register.contentType);res.end(await client.register.metrics());}
}
