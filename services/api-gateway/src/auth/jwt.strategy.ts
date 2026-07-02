import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import * as jwksRsa from 'jwks-rsa';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    const jwksUri = process.env.JWT_PUBLIC_KEY_URL ||
      'http://keycloak:8080/realms/bpm/protocol/openid-connect/certs';
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri,
      }),
      algorithms: ['RS256'],
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    if (!payload) throw new UnauthorizedException('Invalid token');
    // Tenant comes ONLY from the signed token (or the single-tenant default) —
    // NEVER from a client-supplied header, which would let a caller read another
    // tenant's data. For multi-tenancy, map a tenant claim into the JWT.
    const tenantId =
      payload.tenant_id ||
      payload.tenantId ||
      'a0000000-0000-0000-0000-000000000001';  // default (single-tenant)
    return {
      sub: payload.sub,
      email: payload.email,
      username: payload.preferred_username,
      roles: payload.realm_access?.roles || [],
      tenantId,
      name: payload.name || payload.preferred_username,
    };
  }
}
