import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);
  private pool: Pool;

  onModuleInit() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.pool.on('error', (err) => this.logger.error('PG Pool error', err));
  }

  async findAll(f: { tenantId: string; entityType?: string; entityId?: string; actorId?: string; from?: string; to?: string; page: number; pageSize: number }) {
    const { tenantId, entityType, entityId, actorId, from, to, page, pageSize } = f;
    const offset = (page - 1) * pageSize;
    const params: any[] = [tenantId];
    const conds: string[] = ['tenant_id = $1'];

    if (entityType) { params.push(entityType); conds.push(`entity_type = $${params.length}`); }
    if (entityId) { params.push(entityId); conds.push(`entity_id::text = $${params.length}`); }
    if (actorId) { params.push(actorId); conds.push(`actor_id::text = $${params.length}`); }
    if (from) { params.push(from); conds.push(`created_at >= $${params.length}`); }
    if (to) { params.push(to); conds.push(`created_at <= $${params.length}`); }

    const where = conds.join(' AND ');
    const cnt = await this.pool.query(`SELECT COUNT(*) FROM audit_log WHERE ${where}`, params);
    params.push(pageSize, offset);
    const rows = await this.pool.query(
      `SELECT * FROM audit_log WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params,
    );
    return { data: rows.rows, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }
}
