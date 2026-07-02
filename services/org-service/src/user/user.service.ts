import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';

@Injectable()
export class UserService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly kc: KeycloakAdminService,
  ) {}

  private defaultTenant = 'a0000000-0000-0000-0000-000000000001';

  async findAll(tenantId: string, filters: { page?: number; pageSize?: number; search?: string; role?: string }) {
    const { page = 1, pageSize = 20, search, role } = filters;
    const { limit, offset } = this.db.paginate(page, pageSize);
    const params: any[] = [tenantId];
    const conds: string[] = ['u.tenant_id = $1'];

    if (search) { params.push(`%${search}%`); conds.push(`(u.email ILIKE $${params.length} OR u.first_name ILIKE $${params.length} OR u.last_name ILIKE $${params.length} OR u.username ILIKE $${params.length})`); }
    if (role) { params.push(role); conds.push(`EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.key=$${params.length})`); }

    const where = conds.join(' AND ');
    const cnt = await this.db.query(`SELECT COUNT(*) FROM users u WHERE ${where}`, params);
    params.push(limit, offset);
    const rows = await this.db.query(
      `SELECT u.*,
              COALESCE(u.first_name || ' ' || u.last_name, u.username) AS display_name,
              array_agg(DISTINCT r.key)  FILTER (WHERE r.key  IS NOT NULL) AS role_keys,
              array_agg(DISTINCT r.id)   FILTER (WHERE r.id   IS NOT NULL) AS role_ids,
              array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) AS role_names,
              (SELECT ou.name FROM user_org_assignments uoa
               JOIN org_units ou ON ou.id = uoa.org_unit_id
               WHERE uoa.user_id = u.id AND uoa.is_primary = true LIMIT 1) AS primary_org_unit,
              (SELECT uoa.org_unit_id FROM user_org_assignments uoa
               WHERE uoa.user_id = u.id AND uoa.is_primary = true LIMIT 1) AS primary_org_unit_id,
              (SELECT p.name FROM user_org_assignments uoa
               JOIN positions p ON p.id = uoa.position_id
               WHERE uoa.user_id = u.id AND uoa.is_primary = true LIMIT 1) AS primary_position,
              (SELECT uoa.position_id FROM user_org_assignments uoa
               WHERE uoa.user_id = u.id AND uoa.is_primary = true LIMIT 1) AS primary_position_id
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE ${where} GROUP BY u.id ORDER BY u.first_name, u.last_name
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params,
    );
    return { data: rows.rows, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }

  async findById(id: string, tenantId: string) {
    const r = await this.db.query(
      `SELECT u.*,
              COALESCE(u.first_name || ' ' || u.last_name, u.username) AS display_name,
              array_agg(DISTINCT r.key)  FILTER (WHERE r.key  IS NOT NULL) AS role_keys,
              array_agg(DISTINCT r.id)   FILTER (WHERE r.id   IS NOT NULL) AS role_ids,
              array_agg(DISTINCT r.name) FILTER (WHERE r.name IS NOT NULL) AS role_names
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE u.id = $1 AND u.tenant_id = $2 GROUP BY u.id`,
      [id, tenantId],
    );
    if (!r.rows[0]) throw new NotFoundException(`User ${id} not found`);
    return r.rows[0];
  }

  async findByKeycloakId(keycloakId: string) {
    const r = await this.db.query('SELECT * FROM users WHERE keycloak_id = $1', [keycloakId]);
    return r.rows[0] || null;
  }

  async create(tenantId: string, dto: any, actorId?: string) {
    // 1. Create in Keycloak first (so the user can log in)
    let keycloakId = dto.keycloakId || null;
    if (!keycloakId && dto.password) {
      keycloakId = await this.kc.createUser({
        username: dto.username,
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: dto.password,
      });
    }

    // 2-3. Create the BPM user row and its primary org assignment atomically, so
    // a failed assignment can't leave a half-provisioned user with no org unit.
    const user = await this.db.withTransaction(async (cx) => {
      const r = await cx.query(
        `INSERT INTO users (tenant_id, keycloak_id, email, first_name, last_name, username, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [tenantId, keycloakId, dto.email, dto.firstName, dto.lastName, dto.username, JSON.stringify(dto.metadata || {})],
      );
      const u = r.rows[0];
      if (dto.orgUnitId) {
        await this.assignToOrgUnit(u.id, tenantId, {
          orgUnitId: dto.orgUnitId, positionId: dto.positionId || null, isPrimary: true,
        }, cx);
      }
      return u;
    });

    // 4. Assign roles (each also syncs to Keycloak, so kept outside the txn)
    if (dto.roleIds?.length) {
      for (const roleId of dto.roleIds) {
        await this.assignRole(user.id, roleId, tenantId, keycloakId);
      }
    }

    await this.audit.log({ tenantId, entityType: 'user', entityId: user.id, action: 'CREATE', actorId, afterState: user });
    return this.findById(user.id, tenantId);
  }

  async update(id: string, tenantId: string, dto: any, actorId?: string) {
    const existing = await this.findById(id, tenantId);

    // 1. Sync to Keycloak if we have a keycloak_id
    if (existing.keycloak_id) {
      const kcUpdate: any = {};
      if (dto.email !== undefined) kcUpdate.email = dto.email;
      if (dto.firstName !== undefined) kcUpdate.firstName = dto.firstName;
      if (dto.lastName !== undefined) kcUpdate.lastName = dto.lastName;
      if (dto.active !== undefined) kcUpdate.enabled = dto.active;
      if (Object.keys(kcUpdate).length) await this.kc.updateUser(existing.keycloak_id, kcUpdate);
      if (dto.password) await this.kc.resetPassword(existing.keycloak_id, dto.password);
    }

    // 2. Update BPM user
    const r = await this.db.query(
      `UPDATE users SET
         email      = COALESCE($1, email),
         first_name = COALESCE($2, first_name),
         last_name  = COALESCE($3, last_name),
         username   = COALESCE($4, username),
         active     = COALESCE($5, active),
         updated_at = NOW()
       WHERE id = $6 AND tenant_id = $7 RETURNING *`,
      [dto.email, dto.firstName, dto.lastName, dto.username, dto.active, id, tenantId],
    );
    const updated = r.rows[0];

    // 3. Replace the PRIMARY org assignment if provided. Atomic, and scoped to
    // is_primary=true so the user's SECONDARY team memberships are preserved
    // (deleting all of them silently broke team-queue visibility & approver
    // resolution).
    if (dto.orgUnitId !== undefined) {
      await this.db.withTransaction(async (cx) => {
        await cx.query(
          'DELETE FROM user_org_assignments WHERE user_id = $1 AND tenant_id = $2 AND is_primary = true',
          [id, tenantId],
        );
        if (dto.orgUnitId) {
          await cx.query(
            `INSERT INTO user_org_assignments (user_id, tenant_id, org_unit_id, position_id, is_primary)
             VALUES ($1,$2,$3,$4,true)`,
            [id, tenantId, dto.orgUnitId, dto.positionId || null],
          );
        }
      });
    }

    // 4. Sync roles if provided
    if (dto.roleIds !== undefined) {
      await this.syncRoles(id, tenantId, dto.roleIds, existing.keycloak_id);
    }

    await this.audit.log({ tenantId, entityType: 'user', entityId: id, action: 'UPDATE', actorId, beforeState: existing, afterState: updated });
    return this.findById(id, tenantId);
  }

  async deactivate(id: string, tenantId: string, actorId?: string) {
    const existing = await this.findById(id, tenantId);
    await this.db.query(
      'UPDATE users SET active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    if (existing.keycloak_id) await this.kc.updateUser(existing.keycloak_id, { enabled: false });
    await this.audit.log({ tenantId, entityType: 'user', entityId: id, action: 'DEACTIVATE', actorId, beforeState: existing });
    return { success: true };
  }

  async activate(id: string, tenantId: string, actorId?: string) {
    const existing = await this.findById(id, tenantId);
    await this.db.query(
      'UPDATE users SET active = true, updated_at = NOW() WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    if (existing.keycloak_id) await this.kc.updateUser(existing.keycloak_id, { enabled: true });
    await this.audit.log({ tenantId, entityType: 'user', entityId: id, action: 'ACTIVATE', actorId, beforeState: existing });
    return { success: true };
  }

  async assignRole(userId: string, roleId: string, tenantId: string, keycloakId?: string) {
    await this.db.query(
      `INSERT INTO user_roles (user_id, role_id, tenant_id)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [userId, roleId, tenantId],
    );
    if (keycloakId) {
      const role = await this.db.query('SELECT key FROM roles WHERE id = $1', [roleId]);
      if (role.rows[0]?.key) await this.kc.assignRealmRole(keycloakId, role.rows[0].key);
    }
    return { success: true };
  }

  async removeRole(userId: string, roleId: string, tenantId: string) {
    const user = await this.findById(userId, tenantId);
    await this.db.query(
      'DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2 AND tenant_id = $3',
      [userId, roleId, tenantId],
    );
    if (user.keycloak_id) {
      const role = await this.db.query('SELECT key FROM roles WHERE id = $1', [roleId]);
      if (role.rows[0]?.key) await this.kc.removeRealmRole(user.keycloak_id, role.rows[0].key);
    }
    return { success: true };
  }

  private async syncRoles(userId: string, tenantId: string, newRoleIds: string[], keycloakId?: string) {
    // Get current role IDs
    const curr = await this.db.query(
      'SELECT role_id FROM user_roles WHERE user_id = $1 AND tenant_id = $2',
      [userId, tenantId],
    );
    const current = new Set<string>(curr.rows.map((r: any) => r.role_id as string));
    const desired = new Set<string>(newRoleIds);

    // Add new roles
    for (const rid of desired) {
      if (!current.has(rid)) await this.assignRole(userId, rid, tenantId, keycloakId);
    }
    // Remove removed roles
    for (const rid of current) {
      if (!desired.has(rid)) await this.removeRole(userId, rid, tenantId);
    }
  }

  async assignToOrgUnit(userId: string, tenantId: string, dto: any,
                        executor: { query: (text: string, params?: any[]) => Promise<any> } = this.db) {
    if (dto.isPrimary) {
      await executor.query('UPDATE user_org_assignments SET is_primary = false WHERE user_id = $1 AND tenant_id = $2', [userId, tenantId]);
    }
    const r = await executor.query(
      `INSERT INTO user_org_assignments (user_id, tenant_id, org_unit_id, position_id, is_primary)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [userId, tenantId, dto.orgUnitId, dto.positionId || null, dto.isPrimary !== false],
    );
    return r.rows[0];
  }

  async getManagers(userId: string, tenantId: string): Promise<any[]> {
    const assignment = await this.db.query(
      'SELECT * FROM user_org_assignments WHERE user_id = $1 AND tenant_id = $2 AND is_primary = true LIMIT 1',
      [userId, tenantId],
    );
    if (!assignment.rows[0]) return [];

    const managers: any[] = [];
    let orgUnitId: string | null = assignment.rows[0].org_unit_id;
    const visited = new Set<string>();

    while (orgUnitId && !visited.has(orgUnitId)) {
      visited.add(orgUnitId);
      const unit = await this.db.query('SELECT * FROM org_units WHERE id = $1', [orgUnitId]);
      if (!unit.rows[0]) break;

      const mgr = await this.db.query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.username,
                COALESCE(u.first_name || ' ' || u.last_name, u.username) AS display_name,
                p.name as position_name, p.level as position_level,
                ou.name as org_unit_name, ou.type as org_unit_type, $2 as hierarchy_level
         FROM users u
         JOIN user_org_assignments uoa ON uoa.user_id = u.id
         JOIN positions p ON p.id = uoa.position_id
         JOIN org_units ou ON ou.id = uoa.org_unit_id
         WHERE uoa.org_unit_id = $1 AND p.is_manager = true AND u.active = true AND u.id != $3
           AND (uoa.effective_to IS NULL OR uoa.effective_to >= CURRENT_DATE)
         ORDER BY p.level DESC LIMIT 1`,
        [orgUnitId, managers.length + 1, userId],
      );
      if (mgr.rows[0]) managers.push(mgr.rows[0]);
      orgUnitId = unit.rows[0].parent_id;
    }
    return managers;
  }

  async getHierarchy(userId: string, tenantId: string) {
    const user = await this.findById(userId, tenantId);
    const managers = await this.getManagers(userId, tenantId);
    const assignments = await this.db.query(
      `SELECT uoa.*, ou.name as org_unit_name, ou.type as org_unit_type, p.name as position_name
       FROM user_org_assignments uoa
       JOIN org_units ou ON ou.id = uoa.org_unit_id
       LEFT JOIN positions p ON p.id = uoa.position_id
       WHERE uoa.user_id = $1 AND uoa.tenant_id = $2`,
      [userId, tenantId],
    );
    return { user, assignments: assignments.rows, managerChain: managers };
  }
}
