import { Controller, Get, Post, Param, Query, Body } from '@nestjs/common';
import { RetentionService } from './retention.service';

@Controller('retention')
export class RetentionController {
  constructor(private readonly svc: RetentionService) {}

  @Get('status')
  status() { return this.svc.getStatus(); }

  @Get('runs')
  runs(@Query('limit') limit?: string) { return this.svc.listRuns(limit ? parseInt(limit, 10) : 50); }

  @Post('run')
  run(@Body() b: any) { return this.svc.runRetention('manual', b?.dryRun === true ? true : b?.dryRun === false ? false : undefined); }

  @Get('archived')
  archived(@Query('kind') kind?: string, @Query('search') search?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.svc.listArchived(kind || 'case', search, page ? parseInt(page, 10) : 1, pageSize ? parseInt(pageSize, 10) : 25);
  }

  @Get('archived/:id')
  getArchived(@Param('id') id: string, @Query('kind') kind?: string) { return this.svc.getArchived(kind || 'case', id); }

  @Post('archived/:id/restore')
  restore(@Param('id') id: string, @Query('kind') kind?: string) { return this.svc.restoreArchived(kind || 'case', id); }
}
