import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { permissionsFor } from '../auth/permissions';
import { RolesCacheService } from '../auth/roles-cache.service';

@ApiTags('Me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/me')
export class MeController {
  constructor(private readonly rolesCache: RolesCacheService) {}

  // Identity + effective RBAC permissions for the signed-in user (drives UI gating).
  @Get()
  async me(@Req() req: any) {
    const roles: string[] = req.user?.roles || [];
    const map = await this.rolesCache.getEffectivePermissionsMap(req.user?.tenantId);
    return {
      sub: req.user?.sub,
      username: req.user?.username,
      name: req.user?.name,
      email: req.user?.email,
      tenantId: req.user?.tenantId,
      roles,
      permissions: permissionsFor(roles, map),
    };
  }

  @Get('permissions')
  async permissions(@Req() req: any) {
    const map = await this.rolesCache.getEffectivePermissionsMap(req.user?.tenantId);
    return { permissions: permissionsFor(req.user?.roles || [], map) };
  }
}
