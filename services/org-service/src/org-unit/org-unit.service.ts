import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

@Injectable()
export class OrgUnitService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly kafka: KafkaProducerService,
  ) {}

  async findAll(tenantId: string, filters: { page?: number; pageSize?: number; type?: string; parentId?: string }) {
    const { page = 1, pageSize = 50, type, parentId } = filters;
    const { limit, offset } = this.db.paginate(page, pageSize);
    const params: any[] = [tenantId];
    const conds: string[] = ['tenant_id = $1'];
    if (type) { params.push(type); conds.push(`type = $${params.length}`); }
    if (parentId === 'null') { conds.push('parent_id IS NULL'); }
    else if (parentId) { params.push(parentId); conds.push(`parent_id = $${params.length}`); }
    const where = conds.join(' AND ');
    const cnt = await this.db.query(`SELECT COUNT(*) FROM org_units WHERE ${where}`, params);
    params.push(limit, offset);
    const rows = await this.db.query(`SELECT * FROM org_units WHERE ${where} ORDER BY level, name LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    return { data: rows.rows, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }

  async getTree(tenantId: string): Promise<any[]> {
    const rows = await this.db.query(
      'SELECT * FROM org_units WHERE tenant_id = $1 AND active = true ORDER BY level, name',
      [tenantId],
    );
    return this.buildTree(rows.rows, null);
  }

  private buildTree(nodes: any[], parentId: string | null): any[] {
    return nodes
      .filter((n) => (parentId === null ? n.parent_id === null : n.parent_id === parentId))
      .map((n) => ({ ...n, children: this.buildTree(nodes, n.id) }));
  }

  async findById(id: string, tenantId: string) {
    const r = await this.db.query('SELECT * FROM org_units WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!r.rows[0]) throw new NotFoundException(`OrgUnit ${id} not found`);
    return r.rows[0];
  }

  async create(tenantId: string, dto: any, actorId?: string) {
    let level = 0;
    let path = '';
    if (dto.parentId) {
      const parent = await this.findById(dto.parentId, tenantId);
      level = parent.level + 1;
      path = `${parent.path}/${parent.id}`;
    }
    const r = await this.db.query(
      `INSERT INTO org_units (tenant_id, parent_id, type, name, code, level, path, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [tenantId, dto.parentId || null, dto.type, dto.name, dto.code || null, level, path || '/', JSON.stringify(dto.metadata || {})],
    );
    const unit = r.rows[0];
    // Fix path to include self
    const fullPath = `${path}/${unit.id}`;
    await this.db.query('UPDATE org_units SET path = $1 WHERE id = $2', [fullPath, unit.id]);
    unit.path = fullPath;
    await this.audit.log({ tenantId, entityType: 'org_unit', entityId: unit.id, action: 'CREATE', actorId, afterState: unit });
    await this.kafka.produce('bpm.org.changed', { action: 'unit_created', tenantId, unit });
    return unit;
  }

  async update(id: string, tenantId: string, dto: any, actorId?: string) {
    const existing = await this.findById(id, tenantId);

    // Re-parenting: undefined = don't touch parent; null/'' = move to root; a
    // uuid = move under that unit. Only recompute level/path when it's
    // actually changing.
    let level = existing.level;
    let path = existing.path;
    let parentId = existing.parent_id;
    if (dto.parentId !== undefined && (dto.parentId || null) !== existing.parent_id) {
      parentId = dto.parentId || null;
      if (parentId === id) {
        throw new BadRequestException('A unit cannot be its own parent');
      }
      if (parentId) {
        const newParent = await this.findById(parentId, tenantId);
        // Cycle check: walk up from the proposed new parent — if we ever reach
        // `id`, the target is `id` itself or one of its own descendants.
        let cursor: any = newParent;
        const visited = new Set<string>();
        while (cursor) {
          if (cursor.id === id) {
            throw new BadRequestException('Cannot move a unit under its own descendant');
          }
          if (visited.has(cursor.id)) break; // defensive: shouldn't happen, avoids infinite loop
          visited.add(cursor.id);
          if (!cursor.parent_id) break;
          cursor = await this.findById(cursor.parent_id, tenantId);
        }
        level = newParent.level + 1;
        path = `${newParent.path}/${id}`;
      } else {
        level = 0;
        path = `/${id}`;
      }
    }

    const updated = await this.db.withTransaction(async (cx) => {
      const r = await cx.query(
        `UPDATE org_units SET name = COALESCE($1,name), code = COALESCE($2,code),
         metadata = COALESCE($3,metadata), active = COALESCE($4,active),
         parent_id = $5, level = $6, path = $7, updated_at = NOW()
         WHERE id = $8 AND tenant_id = $9 RETURNING *`,
        [dto.name, dto.code, dto.metadata ? JSON.stringify(dto.metadata) : null, dto.active,
         parentId, level, path, id, tenantId],
      );
      const row = r.rows[0];
      if (level !== existing.level || path !== existing.path) {
        await this.cascadeRecompute(cx, tenantId, id, level, path);
      }
      return row;
    });

    await this.audit.log({ tenantId, entityType: 'org_unit', entityId: id, action: 'UPDATE', actorId, beforeState: existing, afterState: updated });
    return updated;
  }

  // Recomputes level/path for every descendant after a re-parent, iterative
  // BFS over parent_id (one query per fan-out level) — mirrors the per-level
  // query style getManagerChain already uses for hierarchy walks.
  private async cascadeRecompute(cx: any, tenantId: string, rootId: string, rootLevel: number, rootPath: string) {
    let frontier = [{ id: rootId, level: rootLevel, path: rootPath }];
    while (frontier.length) {
      const parent = frontier.shift()!;
      const children = await cx.query(
        'SELECT id FROM org_units WHERE parent_id = $1 AND tenant_id = $2',
        [parent.id, tenantId],
      );
      const next: { id: string; level: number; path: string }[] = [];
      for (const child of children.rows) {
        const newLevel = parent.level + 1;
        const newPath = `${parent.path}/${child.id}`;
        await cx.query('UPDATE org_units SET level = $1, path = $2, updated_at = NOW() WHERE id = $3', [newLevel, newPath, child.id]);
        next.push({ id: child.id, level: newLevel, path: newPath });
      }
      frontier.push(...next);
    }
  }

  async delete(id: string, tenantId: string, actorId?: string) {
    const existing = await this.findById(id, tenantId);
    await this.db.query('UPDATE org_units SET active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    await this.audit.log({ tenantId, entityType: 'org_unit', entityId: id, action: 'DELETE', actorId, beforeState: existing });
  }

  async getManagerChain(orgUnitId: string, tenantId: string): Promise<any[]> {
    // Walk up the hierarchy returning manager positions at each level
    const chain: any[] = [];
    let currentId: string | null = orgUnitId;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const unit = await this.db.query('SELECT * FROM org_units WHERE id = $1 AND tenant_id = $2', [currentId, tenantId]);
      if (!unit.rows[0]) break;
      const managers = await this.db.query(
        `SELECT u.*, p.name as position_name, p.level as position_level, ou.name as org_unit_name
         FROM users u
         JOIN user_org_assignments uoa ON uoa.user_id = u.id
         JOIN positions p ON p.id = uoa.position_id
         JOIN org_units ou ON ou.id = uoa.org_unit_id
         WHERE uoa.org_unit_id = $1 AND p.is_manager = true AND u.active = true
           AND (uoa.effective_to IS NULL OR uoa.effective_to >= CURRENT_DATE)
         ORDER BY p.level DESC`,
        [currentId],
      );
      if (managers.rows.length > 0) {
        chain.push({ orgUnit: unit.rows[0], manager: managers.rows[0], level: chain.length + 1 });
      }
      currentId = unit.rows[0].parent_id;
    }
    return chain;
  }
}
