import {
  Controller, Post, Body, Headers, HttpCode, HttpStatus,
  UnauthorizedException, BadRequestException, Logger,
  UseGuards,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'crypto';
import { AlarmService } from './alarm.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/** Validates a static webhook token from the request header. */
function validateToken(header: string | undefined, expected: string | undefined, sourceName: string): void {
  if (!expected) {
    // Fail CLOSED: an unconfigured token must never silently open the webhook to
    // unauthenticated alarm injection. Operators must set the *_WEBHOOK_TOKEN env.
    throw new UnauthorizedException(`Webhook authentication is not configured for ${sourceName}`);
  }
  if (!header) {
    throw new UnauthorizedException(`Missing X-Webhook-Token for ${sourceName}`);
  }
  // Support both "Bearer <token>" and raw token. Constant-time compare over fixed
  // length digests to avoid leaking the token via response timing.
  const provided = header.startsWith('Bearer ') ? header.slice(7) : header;
  const a = createHash('sha256').update(provided).digest();
  const b = createHash('sha256').update(expected).digest();
  if (!timingSafeEqual(a, b)) {
    throw new UnauthorizedException(`Invalid webhook token for ${sourceName}`);
  }
}

/** Guard payload size to prevent DoS */
function checkSize(body: any, maxKb = 512): void {
  const size = Buffer.byteLength(JSON.stringify(body), 'utf8');
  if (size > maxKb * 1024) {
    throw new BadRequestException(`Request body exceeds ${maxKb}KB limit`);
  }
}

@ApiTags('Alarm Webhooks')
@Controller('alarms/webhooks')
export class AlarmIngestionController {
  private readonly logger = new Logger(AlarmIngestionController.name);

  constructor(private readonly alarmSvc: AlarmService) {}

  @Post('zabbix')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Receive Zabbix webhook/media-type alarm payload' })
  async zabbix(
    @Body() body: Record<string, any>,
    @Headers('x-webhook-token') token?: string,
    @Headers('authorization') auth?: string,
  ) {
    validateToken(token ?? auth, process.env.ZABBIX_WEBHOOK_TOKEN, 'Zabbix');
    checkSize(body);
    try {
      const result = await this.alarmSvc.ingestZabbix(body);
      return { ok: true, ...result };
    } catch (e) {
      this.logger.error(`Zabbix ingest error: ${e.message}`);
      throw e;
    }
  }

  @Post('alertmanager')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Receive Prometheus Alertmanager webhook payload' })
  async alertmanager(
    @Body() body: Record<string, any>,
    @Headers('x-webhook-token') token?: string,
    @Headers('authorization') auth?: string,
  ) {
    validateToken(token ?? auth, process.env.ALERTMANAGER_WEBHOOK_TOKEN, 'Alertmanager');
    checkSize(body);
    try {
      const results = await this.alarmSvc.ingestAlertmanager(body);
      return { ok: true, count: results.length, results };
    } catch (e) {
      this.logger.error(`Alertmanager ingest error: ${e.message}`);
      throw e;
    }
  }

  @Post('grafana')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Receive Grafana Unified Alerting webhook payload' })
  async grafana(
    @Body() body: Record<string, any>,
    @Headers('x-webhook-token') token?: string,
    @Headers('authorization') auth?: string,
  ) {
    validateToken(token ?? auth, process.env.GRAFANA_WEBHOOK_TOKEN, 'Grafana');
    checkSize(body);
    try {
      const results = await this.alarmSvc.ingestGrafana(body);
      return { ok: true, count: results.length, results };
    } catch (e) {
      this.logger.error(`Grafana ingest error: ${e.message}`);
      throw e;
    }
  }
}
