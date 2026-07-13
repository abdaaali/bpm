import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './require-permission.decorator';
import { hasPermission } from './permissions';
import { RolesCacheService } from './roles-cache.service';

/**
 * Enforces @RequirePermission(...) using the verified JWT roles (req.user.roles)
 * against the tenant's DB-driven permission map (falls back to the static
 * ROLE_PERMISSIONS map on any DB error — see RolesCacheService).
 * Routes without a declared permission are allowed for any authenticated user
 * (so coverage can be added incrementally without breaking un-annotated routes).
 * Must run AFTER JwtAuthGuard so req.user is populated.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rolesCache: RolesCacheService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required) return true;
    const req = ctx.switchToHttp().getRequest();
    const roles: string[] = req.user?.roles || [];
    const tenantId: string = req.user?.tenantId;
    const map = await this.rolesCache.getEffectivePermissionsMap(tenantId);
    if (!hasPermission(roles, required, map)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
