import { Controller, Get, Put, Body, Param, Headers } from '@nestjs/common';
import { TemplateService } from './template.service';

/** Notification template management — list / inspect / edit message templates. */
@Controller('templates')
export class TemplateController {
  constructor(private readonly svc: TemplateService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id']; }

  @Get()
  findAll(@Headers() h: Record<string, string>) {
    return this.svc.findAll(this.tenant(h));
  }

  @Get(':slug')
  findBySlug(@Headers() h: Record<string, string>, @Param('slug') slug: string) {
    return this.svc.findBySlug(this.tenant(h), slug);
  }

  @Put(':slug')
  upsert(@Headers() h: Record<string, string>, @Param('slug') slug: string, @Body() dto: any) {
    return this.svc.upsert(this.tenant(h), { ...dto, slug }, this.actor(h));
  }
}
