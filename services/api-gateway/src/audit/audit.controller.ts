import { Controller, Get, Query, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { TenantInterceptor } from '../auth/tenant.interceptor';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('audit:read')
@UseInterceptors(TenantInterceptor)
@Controller('api/v1/audit')
export class AuditController {
  constructor(private readonly svc: AuditService) {}

  @Get()
  getAuditLogs(@Req() req: any, @Query('entityType') entityType?: string, @Query('entityId') entityId?: string,
    @Query('actorId') actorId?: string, @Query('from') from?: string, @Query('to') to?: string,
    @Query('page') page = '1', @Query('pageSize') pageSize = '20') {
    return this.svc.findAll({ tenantId: req.tenantId, entityType, entityId, actorId, from, to, page: +page, pageSize: +pageSize });
  }
}
