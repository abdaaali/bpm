import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEY } from './require-permission.decorator';
import { hasPermission } from './permissions';

/**
 * Enforces @RequirePermission(...) using the verified JWT roles (req.user.roles).
 * Routes without a declared permission are allowed for any authenticated user
 * (so coverage can be added incrementally without breaking un-annotated routes).
 * Must run AFTER JwtAuthGuard so req.user is populated.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      ctx.getHandler(), ctx.getClass(),
    ]);
    if (!required) return true;
    const req = ctx.switchToHttp().getRequest();
    const roles: string[] = req.user?.roles || [];
    if (!hasPermission(roles, required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
    return true;
  }
}
