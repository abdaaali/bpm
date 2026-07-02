import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AlarmService } from './alarm.service';
import { DatabaseService } from '../database/database.service';

@ApiTags('Alarms')
@ApiBearerAuth()
@Controller('alarms')
export class AlarmQueryController {
  constructor(
    private readonly alarmSvc: AlarmService,
    private readonly db: DatabaseService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List alarms with optional filters' })
  list(
    @Query('page')          page          = '1',
    @Query('pageSize')      pageSize      = '20',
    @Query('status')        status?:       string,
    @Query('source_system') sourceSystem?: string,
    @Query('severity')      severity?:     string,
    @Query('site_id')       siteId?:       string,
    @Query('sla_status')    slaStatus?:    string,
  ) {
    return this.alarmSvc.list(parseInt(page, 10), parseInt(pageSize, 10), {
      status, source_system: sourceSystem, severity, site_id: siteId, sla_status: slaStatus,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single alarm by ID' })
  async get(@Param('id') id: string) {
    const alarm = await this.alarmSvc.findById(id);
    if (!alarm) throw new NotFoundException('Alarm not found');
    return alarm;
  }

  @Get(':id/ticket')
  @ApiOperation({ summary: 'Get ticket mapping for an alarm' })
  async getTicket(@Param('id') id: string) {
    const mapping = await this.alarmSvc.getTicketMapping(id);
    if (!mapping) throw new NotFoundException('No ticket mapping found for this alarm');
    return mapping;
  }

  @Get('healthz/status')
  @ApiOperation({ summary: 'Alarm subsystem health check' })
  async healthz() {
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok', timestamp: new Date().toISOString() };
    } catch (e) {
      return { status: 'degraded', error: e.message, timestamp: new Date().toISOString() };
    }
  }
}
