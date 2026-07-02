import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class DelegationService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService) {}

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

  async create(tenantId: string, dto: any, actorId?: string) {
    const r = await this.db.query(
      'INSERT INTO delegations (tenant_id, delegator_id, delegate_id, reason, start_date, end_date) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [tenantId, dto.delegatorId, dto.delegateId, dto.reason || null, dto.startDate, dto.endDate],
    );
    const del = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'delegation', entityId: del.id, action: 'CREATE', actorId, afterState: del });
    return del;
  }

  async deactivate(id: string, tenantId: string, actorId?: string) {
    const r = await this.db.query('UPDATE delegations SET active=false, updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *', [id, tenantId]);
    if (!r.rows[0]) throw new NotFoundException(`Delegation ${id} not found`);
    await this.audit.log({ tenantId, entityType: 'delegation', entityId: id, action: 'DEACTIVATE', actorId });
    return r.rows[0];
  }
}
