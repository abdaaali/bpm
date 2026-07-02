import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    // Tenant MUST come from the verified JWT, never a client-supplied header —
    // otherwise a caller could set X-Tenant-ID and read another tenant's data.
    // (Single-tenant today: the realm carries no tenant claim, so we use the
    // default; for multi-tenancy, map a `tenantId` claim in Keycloak.)
    const tenantId = request.user?.tenantId || 'a0000000-0000-0000-0000-000000000001';
    request.tenantId = tenantId;
    request.headers['x-tenant-id'] = tenantId;  // overwrite any client-supplied value
    return next.handle();
  }
}
