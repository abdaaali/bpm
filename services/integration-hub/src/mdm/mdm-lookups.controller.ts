import {
  Controller, Get, Post, Delete, Body, Param, Query,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MdmLookupsService } from './mdm-lookups.service';

@ApiTags('MDM Lookups')
@Controller('mdm/lookups')
export class MdmLookupsController {
  constructor(private readonly svc: MdmLookupsService) {}

  @Get()
  @ApiOperation({ summary: 'List lookup values — all grouped by type, or filtered by ?type=' })
  list(@Query('type') type?: string) {
    if (type) return this.svc.listByType(type);
    return this.svc.listAll();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a lookup value' })
  add(@Body() body: { type: string; value: string }) {
    return this.svc.add(body.type, body.value);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a lookup value by ID' })
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
