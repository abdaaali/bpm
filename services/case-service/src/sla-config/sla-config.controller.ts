import { Controller, Get, Put, Param, Body, Headers } from '@nestjs/common';
import { SlaConfigService } from './sla-config.service';

const DEFAULT_TENANT = 'a0000000-0000-0000-0000-000000000001';

@Controller('sla')
export class SlaConfigController {
  constructor(private readonly svc: SlaConfigService) {}

  private tid(h: Record<string, string>) { return h['x-tenant-id'] || DEFAULT_TENANT; }

  @Get('targets')
  listTargets(@Headers() h: Record<string, string>) { return this.svc.listTargets(this.tid(h)); }

  @Put('targets/:type/:priority')
  upsertTarget(@Headers() h: Record<string, string>, @Param('type') type: string, @Param('priority') priority: string, @Body() b: any) {
    return this.svc.upsertTarget(this.tid(h), type, priority, b);
  }

  @Get('class-factors')
  listFactors(@Headers() h: Record<string, string>) { return this.svc.listClassFactors(this.tid(h)); }

  @Put('class-factors/:key')
  upsertFactor(@Headers() h: Record<string, string>, @Param('key') key: string, @Body() b: any) {
    return this.svc.upsertClassFactor(this.tid(h), key, b);
  }
}
