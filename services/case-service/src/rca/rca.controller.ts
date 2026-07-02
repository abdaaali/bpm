import { Controller, Get, Post, Put, Patch, Body, Param, Headers } from '@nestjs/common';
import { RcaService } from './rca.service';

/** RCA Level-2 + CAPA, scoped to a case. */
@Controller('cases/:id')
export class RcaController {
  constructor(private readonly svc: RcaService) {}

  private tenant(h: Record<string, string>) { return h['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }
  private actor(h: Record<string, string>) { return h['x-user-id']; }

  @Get('rca')
  getRca(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.getRca(this.tenant(h), id);
  }

  // ── RCA assist (offline ML) ──
  @Get('rca/similar')
  similar(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.similarCases(this.tenant(h), id);
  }

  @Get('rca/suggest')
  suggest(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.suggestRootCause(this.tenant(h), id);
  }

  @Put('rca')
  saveRca(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: any) {
    return this.svc.upsertRca(this.tenant(h), id, dto || {}, this.actor(h));
  }

  @Get('capa')
  listCapa(@Headers() h: Record<string, string>, @Param('id') id: string) {
    return this.svc.listCapa(this.tenant(h), id);
  }

  @Post('capa')
  addCapa(@Headers() h: Record<string, string>, @Param('id') id: string, @Body() dto: any) {
    return this.svc.addCapa(this.tenant(h), id, dto, this.actor(h));
  }

  @Patch('capa/:aid')
  updateCapa(@Headers() h: Record<string, string>, @Param('id') id: string, @Param('aid') aid: string, @Body() dto: any) {
    return this.svc.updateCapa(this.tenant(h), id, aid, dto || {}, this.actor(h));
  }
}
