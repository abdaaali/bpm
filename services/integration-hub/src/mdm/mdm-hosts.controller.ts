import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { MdmHostsService } from './mdm-hosts.service';

@ApiTags('MDM Hosts')
@Controller('mdm/hosts')
export class MdmHostsController {
  constructor(private readonly svc: MdmHostsService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get MDM host statistics' })
  getStats() { return this.svc.getStats(); }

  @Get('filter-options')
  @ApiOperation({ summary: 'Get distinct regions and technology domains for filters' })
  filterOptions() { return this.svc.getFilterOptions(); }

  @Get('export')
  @ApiOperation({ summary: 'Export all hosts as JSON' })
  async export(@Res() res: Response) {
    const hosts = await this.svc.exportAll();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="mdm_hosts_${Date.now()}.json"`);
    res.send(JSON.stringify(hosts, null, 2));
  }

  @Post('import')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk import/upsert hosts from JSON array' })
  import(@Body() body: { hosts: any[] }) { return this.svc.importBulk(body.hosts ?? []); }

  @Get()
  @ApiOperation({ summary: 'List hosts with pagination and filters' })
  list(
    @Query('page')               page              = '1',
    @Query('pageSize')           pageSize          = '20',
    @Query('search')             search?:           string,
    @Query('region')             region?:           string,
    @Query('technology_domain')  technology_domain?: string,
    @Query('is_active')          is_active?:        string,
  ) {
    return this.svc.list(parseInt(page, 10), parseInt(pageSize, 10), { search, region, technology_domain, is_active });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get host by ID' })
  get(@Param('id') id: string) { return this.svc.findById(id); }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create host' })
  create(@Body() body: any) { return this.svc.create(body); }

  @Put(':id')
  @ApiOperation({ summary: 'Update host' })
  update(@Param('id') id: string, @Body() body: any) { return this.svc.update(id, body); }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete host' })
  remove(@Param('id') id: string) { return this.svc.remove(id); }
}
