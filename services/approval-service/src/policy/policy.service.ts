import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalResolverService } from '../resolver/approval-resolver.service';

@Injectable()
export class PolicyService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly resolver: ApprovalResolverService,
  ) {}

  async findAll(tenantId: string, filters: { page?: number; pageSize?: number }) {
    const { page = 1, pageSize = 20 } = filters;
    const { limit, offset } = this.db.paginate(page, pageSize);
    const cnt = await this.db.query('SELECT COUNT(*) FROM approval_policies WHERE tenant_id = $1', [tenantId]);
    const rows = await this.db.query('SELECT * FROM approval_policies WHERE tenant_id = $1 ORDER BY name LIMIT $2 OFFSET $3', [tenantId, limit, offset]);
    return { data: rows.rows, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }

  async findById(id: string, tenantId: string) {
    const r = await this.db.query('SELECT * FROM approval_policies WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!r.rows[0]) throw new NotFoundException(`Policy ${id} not found`);
    return r.rows[0];
  }

  async create(tenantId: string, dto: any, actorId?: string) {
    const r = await this.db.query(
      `INSERT INTO approval_policies (tenant_id, name, description, process_key, active, steps, conditions, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tenantId, dto.name, dto.description || null, dto.processKey || null, dto.active !== false,
       JSON.stringify(dto.steps || []), JSON.stringify(dto.conditions || {}), actorId || null],
    );
    const policy = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'approval_policy', entityId: policy.id, action: 'CREATE', actorId, afterState: policy });
    return policy;
  }

  async update(id: string, tenantId: string, dto: any, actorId?: string) {
    const existing = await this.findById(id, tenantId);
    const r = await this.db.query(
      `UPDATE approval_policies SET name=COALESCE($1,name), description=COALESCE($2,description),
       steps=COALESCE($3,steps), conditions=COALESCE($4,conditions), active=COALESCE($5,active),
       version=version+1, updated_at=NOW() WHERE id=$6 AND tenant_id=$7 RETURNING *`,
      [dto.name, dto.description, dto.steps ? JSON.stringify(dto.steps) : null,
       dto.conditions ? JSON.stringify(dto.conditions) : null, dto.active, id, tenantId],
    );
    const updated = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'approval_policy', entityId: id, action: 'UPDATE', actorId, beforeState: existing, afterState: updated });
    return updated;
  }

  async simulate(tenantId: string, policyId: string, requesterId: string, context: any) {
    const chain = await this.resolver.resolveApprovers(tenantId, policyId, requesterId, context);
    return { policyId, requesterId, context, resolvedChain: chain, totalSteps: chain.length };
  }
}
