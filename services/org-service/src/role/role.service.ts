import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class RoleService {
  constructor(private readonly db: DatabaseService) {}

  async findAll(tenantId: string, filters: { page?: number; pageSize?: number }) {
    const { page = 1, pageSize = 50 } = filters;
    const { limit, offset } = this.db.paginate(page, pageSize);
    const cnt = await this.db.query('SELECT COUNT(*) FROM roles WHERE tenant_id = $1', [tenantId]);
    const rows = await this.db.query('SELECT * FROM roles WHERE tenant_id = $1 ORDER BY name LIMIT $2 OFFSET $3', [tenantId, limit, offset]);
    return { data: rows.rows, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }

  async create(tenantId: string, dto: any) {
    const r = await this.db.query(
      'INSERT INTO roles (tenant_id, name, key, permissions, description) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [tenantId, dto.name, dto.key, JSON.stringify(dto.permissions || []), dto.description || null],
    );
    return r.rows[0];
  }

  async update(tenantId: string, id: string, dto: { name?: string; permissions?: string[]; description?: string }) {
    const r = await this.db.query(
      `UPDATE roles SET
         name = COALESCE($3, name),
         permissions = COALESCE($4::jsonb, permissions),
         description = COALESCE($5, description),
         updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [tenantId, id, dto.name ?? null, dto.permissions ? JSON.stringify(dto.permissions) : null, dto.description ?? null],
    );
    return r.rows[0];
  }
}
