import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    const result = await this.db.query(
      `SELECT eu.*, ec.company_name, ec.company_type, ec.id AS company_id, ec.tenant_id
       FROM external_users eu
       JOIN external_companies ec ON ec.id = eu.external_company_id
       WHERE eu.email = $1 AND eu.active = true`,
      [email],
    );

    if (!result.rows[0]) throw new UnauthorizedException('Invalid credentials');

    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    // Update last login
    await this.db.query(
      `UPDATE external_users SET last_login_at = NOW() WHERE id = $1`,
      [user.id],
    );

    // Audit login
    await this.db.query(
      `INSERT INTO external_audit_log (id, tenant_id, actor_type, actor_id, actor_name, action, resource_type, resource_id, details, created_at)
       VALUES (gen_random_uuid(), $1, 'external_user', $2, $3, 'LOGIN', 'session', $2, '{"event":"login"}'::jsonb, NOW())`,
      [user.tenant_id, user.id, user.full_name],
    ).catch(() => {});

    const { password_hash, ...safeUser } = user;
    return safeUser;
  }

  login(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      full_name: user.full_name,
      company_id: user.external_company_id || user.company_id,
      company_name: user.company_name,
      role: user.role,
      tenant_id: user.tenant_id,
      portal: 'external',
    };

    return {
      access_token: this.jwt.sign(payload),
      expires_in: 28800, // 8h in seconds
      user: payload,
    };
  }

  async getProfile(userId: string) {
    const result = await this.db.query(
      `SELECT eu.id, eu.email, eu.username, eu.full_name, eu.role, eu.active, eu.last_login_at, eu.mfa_enabled,
              eu.external_company_id, ec.company_name, ec.company_type, ec.qualification_status,
              ec.contact_email AS company_email, ec.contact_phone AS company_phone,
              ec.region_scope, ec.capabilities
       FROM external_users eu
       JOIN external_companies ec ON ec.id = eu.external_company_id
       WHERE eu.id = $1`,
      [userId],
    );
    if (!result.rows[0]) throw new UnauthorizedException('User not found');
    return result.rows[0];
  }
}
