import { Injectable, Logger } from '@nestjs/common';

// Require a secret in production (fail-fast); allow a dev-only default otherwise.
function reqSecret(name: string, devDefault: string): string {
  const v = process.env[name];
  if (v) return v;
  if (process.env.NODE_ENV === 'production') throw new Error(`${name} must be set in production`);
  return devDefault;
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private readonly baseUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
  private readonly realm   = process.env.KEYCLOAK_REALM || 'bpm';
  private readonly adminUser = process.env.KEYCLOAK_ADMIN_USER || 'admin';
  private readonly adminPass = reqSecret('KEYCLOAK_ADMIN_PASSWORD', 'Admin123!');

  private async getAdminToken(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: 'admin-cli',
        username: this.adminUser,
        password: this.adminPass,
        grant_type: 'password',
      }),
    });
    if (!res.ok) throw new Error(`KC admin token failed: ${res.status}`);
    const data: any = await res.json();
    return data.access_token;
  }

  async createUser(dto: {
    username: string; email: string;
    firstName: string; lastName: string;
    password: string;
  }): Promise<string> {
    const token = await this.getAdminToken();
    const res = await fetch(`${this.baseUrl}/admin/realms/${this.realm}/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: dto.username,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        enabled: true,
        emailVerified: true,
        credentials: [{ type: 'password', value: dto.password, temporary: false }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`KC createUser failed ${res.status}: ${err}`);
    }
    const location = res.headers.get('location') || '';
    return location.split('/').pop() || '';
  }

  async updateUser(keycloakId: string, dto: {
    email?: string; firstName?: string; lastName?: string; enabled?: boolean;
  }) {
    const token = await this.getAdminToken();
    const res = await fetch(`${this.baseUrl}/admin/realms/${this.realm}/users/${keycloakId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    if (!res.ok) this.logger.warn(`KC updateUser ${keycloakId} failed: ${res.status}`);
  }

  async resetPassword(keycloakId: string, password: string) {
    const token = await this.getAdminToken();
    await fetch(
      `${this.baseUrl}/admin/realms/${this.realm}/users/${keycloakId}/reset-password`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'password', value: password, temporary: false }),
      },
    );
  }

  async assignRealmRole(keycloakId: string, roleName: string) {
    try {
      const token = await this.getAdminToken();
      const roleRes = await fetch(
        `${this.baseUrl}/admin/realms/${this.realm}/roles/${roleName}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!roleRes.ok) return; // role doesn't exist in KC, skip silently
      const role = await roleRes.json();
      await fetch(
        `${this.baseUrl}/admin/realms/${this.realm}/users/${keycloakId}/role-mappings/realm`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([role]),
        },
      );
    } catch (e) {
      this.logger.warn(`KC assignRole ${roleName} to ${keycloakId} failed: ${e}`);
    }
  }

  async removeRealmRole(keycloakId: string, roleName: string) {
    try {
      const token = await this.getAdminToken();
      const roleRes = await fetch(
        `${this.baseUrl}/admin/realms/${this.realm}/roles/${roleName}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!roleRes.ok) return;
      const role = await roleRes.json();
      await fetch(
        `${this.baseUrl}/admin/realms/${this.realm}/users/${keycloakId}/role-mappings/realm`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify([role]),
        },
      );
    } catch (e) {
      this.logger.warn(`KC removeRole ${roleName} from ${keycloakId} failed: ${e}`);
    }
  }
}
