import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PositionService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService) {}

  async findAll(tenantId: string, filters: { page?: number; pageSize?: number; orgUnitId?: string }) {
    const { page = 1, pageSize = 50, orgUnitId } = filters;
    const { limit, offset } = this.db.paginate(page, pageSize);
    const params: any[] = [tenantId];
    const conds = ['p.tenant_id = $1'];
    if (orgUnitId) { params.push(orgUnitId); conds.push(`p.org_unit_id = $${params.length}`); }
    const where = conds.join(' AND ');
    const cnt = await this.db.query(`SELECT COUNT(*) FROM positions p WHERE ${where}`, params);
    params.push(limit, offset);
    const rows = await this.db.query(`SELECT p.*, ou.name as org_unit_name FROM positions p LEFT JOIN org_units ou ON ou.id=p.org_unit_id WHERE ${where} ORDER BY p.level DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    return { data: rows.rows, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }

  async create(tenantId: string, dto: any, actorId?: string) {
    const r = await this.db.query(
      'INSERT INTO positions (tenant_id, org_unit_id, name, level, is_manager, metadata) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [tenantId, dto.orgUnitId, dto.name, dto.level || 0, dto.isManager || false, JSON.stringify(dto.metadata || {})],
    );
    const pos = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'position', entityId: pos.id, action: 'CREATE', actorId, afterState: pos });
    return pos;
  }

  async update(id: string, tenantId: string, dto: any, actorId?: string) {
    const r = await this.db.query(
      'UPDATE positions SET name=COALESCE($1,name), level=COALESCE($2,level), is_manager=COALESCE($3,is_manager), active=COALESCE($4,active), updated_at=NOW() WHERE id=$5 AND tenant_id=$6 RETURNING *',
      [dto.name, dto.level, dto.isManager, dto.active, id, tenantId],
    );
    if (!r.rows[0]) throw new NotFoundException(`Position ${id} not found`);
    return r.rows[0];
  }
}
