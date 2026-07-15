import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';

// Roles that may create/manage a delegation on someone else's behalf, not just their
// own. Matches "Platform Administrator" / "Manager" from the approved decision — a
// future "Business Administrator" role should be added here once it exists.
const DELEGATION_MANAGER_ROLES = ['admin', 'manager'];

@Injectable()
export class DelegationService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService) {}

  // Same dual-identity convention as instance.service.ts's resolveUserId: the caller's
  // id may arrive as either the internal users.id or the Keycloak-issued sub, depending
  // on the caller. Resolving here (rather than trusting the raw header) is what closes
  // the original vulnerability — without it, "does delegatorId match the caller" could
  // never reliably be true even for a legitimate self-delegation.
  private async resolveUserId(id: string | undefined, tenantId: string): Promise<string | undefined> {
    if (!id) return id;
    const r = await this.db.query(`SELECT id FROM users WHERE tenant_id=$2 AND (id::text=$1 OR keycloak_id=$1) LIMIT 1`, [id, tenantId]);
    return r.rows[0]?.id || id;
  }

  private async getActiveUser(id: string, tenantId: string): Promise<{ id: string; active: boolean } | undefined> {
    const r = await this.db.query(`SELECT id, active FROM users WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    return r.rows[0];
  }

  // "Eligible to perform the relevant approval" — this schema has no per-delegation
  // approval-type/policy scoping, so the practical check is: does the delegate hold any
  // approval-deciding permission at all (exact approvals:decide, the approvals:* wildcard,
  // or the global * admin wildcard). Queried directly against roles/user_roles rather than
  // reusing the gateway's ROLE_PERMISSIONS map, which isn't available from this service.
  private async isApprovalEligible(userId: string, tenantId: string): Promise<boolean> {
    const r = await this.db.query(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
       WHERE ur.user_id=$1 AND r.tenant_id=$2
         AND (r.permissions ? '*' OR r.permissions ? 'approvals:*' OR r.permissions ? 'approvals:decide')
       LIMIT 1`,
      [userId, tenantId],
    );
    return (r.rowCount || 0) > 0;
  }

  async findAll(tenantId: string, filters: { page?: number; pageSize?: number; active?: boolean }) {
    const { page = 1, pageSize = 20, active } = filters;
    const { limit, offset } = this.db.paginate(page, pageSize);
    const params: any[] = [tenantId];
    const conds = ['tenant_id = $1'];
    if (active !== undefined) { params.push(active); conds.push(`active = $${params.length}`); }
    const where = conds.join(' AND ');
    const cnt = await this.db.query(`SELECT COUNT(*) FROM delegations WHERE ${where}`, params);
    params.push(limit, offset);
    const rows = await this.db.query(`SELECT d.*, du.email as delegator_email, dg.email as delegate_email FROM delegations d LEFT JOIN users du ON du.id=d.delegator_id LEFT JOIN users dg ON dg.id=d.delegate_id WHERE ${where} ORDER BY d.start_date DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    return { data: rows.rows, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }

  async create(tenantId: string, dto: any, rawActorId?: string, actorRoles: string[] = []) {
    const actorId = await this.resolveUserId(rawActorId, tenantId);
    const delegatorId = await this.resolveUserId(dto.delegatorId, tenantId);
    const delegateId = await this.resolveUserId(dto.delegateId, tenantId);

    if (!delegatorId || !delegateId) throw new BadRequestException('delegatorId and delegateId are required');
    if (!dto.startDate || !dto.endDate) throw new BadRequestException('startDate and endDate are required');

    const isElevated = actorRoles.some((r) => DELEGATION_MANAGER_ROLES.includes(r));
    if (delegatorId !== actorId && !isElevated) {
      throw new ForbiddenException('You do not have permission to create a delegation on behalf of another user.');
    }

    if (delegatorId === delegateId) throw new BadRequestException('A user cannot delegate to themselves.');

    const [delegator, delegate] = await Promise.all([
      this.getActiveUser(delegatorId, tenantId),
      this.getActiveUser(delegateId, tenantId),
    ]);
    if (!delegator) throw new BadRequestException('The delegating user was not found in this tenant.');
    if (!delegator.active) throw new BadRequestException('The delegating user is not active.');
    if (!delegate) throw new BadRequestException('The delegate user was not found in this tenant.');
    if (!delegate.active) throw new BadRequestException('The delegate user is not active.');

    if (!(await this.isApprovalEligible(delegateId, tenantId))) {
      throw new BadRequestException('The delegate does not hold any approval-deciding permission and is not eligible for this delegation.');
    }

    const reciprocal = await this.db.query(
      `SELECT 1 FROM delegations WHERE tenant_id=$1 AND delegator_id=$2 AND delegate_id=$3 AND active=true
         AND daterange(start_date, end_date, '[]') && daterange($4::date, $5::date, '[]') LIMIT 1`,
      [tenantId, delegateId, delegatorId, dto.startDate, dto.endDate],
    );
    if ((reciprocal.rowCount || 0) > 0) {
      throw new BadRequestException('This would create a delegation loop with an existing active delegation in the opposite direction.');
    }

    const r = await this.db.query(
      'INSERT INTO delegations (tenant_id, delegator_id, delegate_id, reason, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [tenantId, delegatorId, delegateId, dto.reason || null, dto.startDate, dto.endDate],
    );
    const del = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'delegation', entityId: del.id, action: 'CREATE', actorId, afterState: del });
    return del;
  }

  async deactivate(id: string, tenantId: string, rawActorId?: string, actorRoles: string[] = []) {
    const actorId = await this.resolveUserId(rawActorId, tenantId);
    const existing = await this.db.query('SELECT * FROM delegations WHERE id=$1 AND tenant_id=$2', [id, tenantId]);
    if (!existing.rows[0]) throw new NotFoundException(`Delegation ${id} not found`);

    const isElevated = actorRoles.some((r) => DELEGATION_MANAGER_ROLES.includes(r));
    if (existing.rows[0].delegator_id !== actorId && !isElevated) {
      throw new ForbiddenException('You do not have permission to manage this delegation.');
    }

    const r = await this.db.query('UPDATE delegations SET active=false, updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *', [id, tenantId]);
    await this.audit.log({ tenantId, entityType: 'delegation', entityId: id, action: 'DEACTIVATE', actorId });
    return r.rows[0];
  }
}
