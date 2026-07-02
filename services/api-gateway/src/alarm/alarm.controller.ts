import {
  Controller, Post, Get, Param, Query, Body, Headers,
  Req, UseGuards, UseInterceptors, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { ProxyService } from '../proxy/proxy.service';

const HUB_URL = () => process.env.INTEGRATION_HUB_URL || 'http://integration-hub:3005';

/**
 * Webhook endpoints: NO JWT guard — tokens are validated by the integration-hub itself.
 * Query endpoints:   JWT protected.
 */

@ApiTags('Alarms')
@Controller('api/v1/alarms')
export class AlarmController {
  constructor(private readonly proxy: ProxyService) {}

  // ─── Inbound Webhooks (public, token auth in hub) ────────────────────────

  @Post('webhooks/zabbix')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Zabbix alarm webhook receiver' })
  zabbix(
    @Body() body: any,
    @Headers('x-webhook-token') token?: string,
    @Headers('authorization') auth?: string,
  ) {
    const headers: Record<string, string> = {};
    if (token) headers['x-webhook-token'] = token;
    if (auth)  headers['authorization']   = auth;
    return this.proxy.forward(HUB_URL(), 'POST', '/api/alarms/webhooks/zabbix', body, headers);
  }

  @Post('webhooks/alertmanager')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Prometheus Alertmanager webhook receiver' })
  alertmanager(
    @Body() body: any,
    @Headers('x-webhook-token') token?: string,
    @Headers('authorization') auth?: string,
  ) {
    const headers: Record<string, string> = {};
    if (token) headers['x-webhook-token'] = token;
    if (auth)  headers['authorization']   = auth;
    return this.proxy.forward(HUB_URL(), 'POST', '/api/alarms/webhooks/alertmanager', body, headers);
  }

  @Post('webhooks/grafana')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Grafana Unified Alerting webhook receiver' })
  grafana(
    @Body() body: any,
    @Headers('x-webhook-token') token?: string,
    @Headers('authorization') auth?: string,
  ) {
    const headers: Record<string, string> = {};
    if (token) headers['x-webhook-token'] = token;
    if (auth)  headers['authorization']   = auth;
    return this.proxy.forward(HUB_URL(), 'POST', '/api/alarms/webhooks/grafana', body, headers);
  }

  // ─── Query endpoints (JWT required) ────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(TenantInterceptor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List alarms' })
  list(@Req() req: any, @Query() q: any) {
    return this.proxy.forward(HUB_URL(), 'GET', '/api/alarms', undefined, authHdrs(req), q);
  }

  @Get('healthz')
  @ApiOperation({ summary: 'Alarm subsystem health' })
  healthz() {
    return this.proxy.forward(HUB_URL(), 'GET', '/api/alarms/healthz/status', undefined, {});
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(TenantInterceptor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get alarm by ID' })
  get(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(HUB_URL(), 'GET', `/api/alarms/${id}`, undefined, authHdrs(req));
  }

  @Get(':id/ticket')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(TenantInterceptor)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get ticket mapping for an alarm' })
  ticket(@Req() req: any, @Param('id') id: string) {
    return this.proxy.forward(HUB_URL(), 'GET', `/api/alarms/${id}/ticket`, undefined, authHdrs(req));
  }
}

function authHdrs(req: any): Record<string, string> {
  return {
    Authorization: req.headers['authorization'] || '',
    'X-Tenant-ID': req.tenantId || '',
    'X-User-ID':   req.user?.sub || '',
  };
}
