import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { permissionsFor } from '../auth/permissions';

@ApiTags('Me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/v1/me')
export class MeController {
  // Identity + effective RBAC permissions for the signed-in user (drives UI gating).
  @Get()
  me(@Req() req: any) {
    const roles: string[] = req.user?.roles || [];
    return {
      sub: req.user?.sub,
      username: req.user?.username,
      name: req.user?.name,
      email: req.user?.email,
      tenantId: req.user?.tenantId,
      roles,
      permissions: permissionsFor(roles),
    };
  }

  @Get('permissions')
  permissions(@Req() req: any) {
    return { permissions: permissionsFor(req.user?.roles || []) };
  }
}
