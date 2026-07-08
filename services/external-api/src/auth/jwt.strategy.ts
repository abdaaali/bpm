import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

// Require a secret in production (fail-fast on startup); allow a dev-only default.
function reqSecret(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV === 'production') throw new Error(`${name} must be set in production`);
  return devDefault;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: reqSecret('JWT_SECRET', 'external-portal-jwt-secret-2024'),
    });
  }

  async validate(payload: any) {
    if (payload.portal !== 'external') {
      throw new UnauthorizedException('Invalid portal context');
    }
    return {
      sub: payload.sub,
      email: payload.email,
      full_name: payload.full_name,
      company_id: payload.company_id,
      company_name: payload.company_name,
      role: payload.role,
      tenant_id: payload.tenant_id,
    };
  }
}
