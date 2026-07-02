import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { TenantService } from './tenant.service';

@ApiTags('Tenants')
@Controller('tenants')
export class TenantController {
  constructor(private readonly svc: TenantService) {}

  @Get() findAll(@Query('page') page = '1', @Query('pageSize') ps = '20') { return this.svc.findAll(+page, +ps); }
  @Post() create(@Body() body: any) { return this.svc.create(body); }
  @Get(':id') findOne(@Param('id') id: string) { return this.svc.findById(id); }
  @Put(':id') update(@Param('id') id: string, @Body() body: any) { return this.svc.update(id, body); }
}
