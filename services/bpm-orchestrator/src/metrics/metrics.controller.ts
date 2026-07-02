import { Controller, Get, Res } from '@nestjs/common'; import * as client from 'prom-client';
const r=new client.Registry(); client.collectDefaultMetrics({register:r});
@Controller('metrics') export class MetricsController { @Get() async get(@Res() res:any){res.set('Content-Type',r.contentType);res.end(await r.metrics());} }
