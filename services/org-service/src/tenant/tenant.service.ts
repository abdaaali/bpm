import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class TenantService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService) {}

  async findAll(page = 1, pageSize = 20) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const cnt = await this.db.query('SELECT COUNT(*) FROM tenants');
    const rows = await this.db.query('SELECT * FROM tenants ORDER BY created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return { data: rows.rows, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }

  async findById(id: string) {
    const r = await this.db.query('SELECT * FROM tenants WHERE id = $1', [id]);
    if (!r.rows[0]) throw new NotFoundException(`Tenant ${id} not found`);
    return r.rows[0];
  }

  async findBySlug(slug: string) {
    const r = await this.db.query('SELECT * FROM tenants WHERE slug = $1', [slug]);
    if (!r.rows[0]) throw new NotFoundException(`Tenant ${slug} not found`);
    return r.rows[0];
  }

  async create(dto: any, actorId?: string) {
    const existing = await this.db.query('SELECT id FROM tenants WHERE slug = $1', [dto.slug]);
    if (existing.rows[0]) throw new ConflictException(`Tenant slug '${dto.slug}' already exists`);
    const r = await this.db.query(
      'INSERT INTO tenants (name, slug, settings) VALUES ($1, $2, $3) RETURNING *',
      [dto.name, dto.slug, JSON.stringify(dto.settings || {})],
    );
    const tenant = r.rows[0];
    await this.audit.log({ tenantId: tenant.id, entityType: 'tenant', entityId: tenant.id, action: 'CREATE', actorId, afterState: tenant });
    return tenant;
  }

  async update(id: string, dto: any, actorId?: string) {
    const existing = await this.findById(id);
    const r = await this.db.query(
      'UPDATE tenants SET name = COALESCE($1, name), settings = COALESCE($2, settings), active = COALESCE($3, active), updated_at = NOW() WHERE id = $4 RETURNING *',
      [dto.name, dto.settings ? JSON.stringify(dto.settings) : null, dto.active, id],
    );
    const updated = r.rows[0];
    await this.audit.log({ tenantId: id, entityType: 'tenant', entityId: id, action: 'UPDATE', actorId, beforeState: existing, afterState: updated });
    return updated;
  }
}
