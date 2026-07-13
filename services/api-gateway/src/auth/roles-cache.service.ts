import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { ROLE_PERMISSIONS } from './permissions';

const CACHE_TTL_MS = 30_000;

@Injectable()
export class RolesCacheService implements OnModuleInit {
  private readonly logger = new Logger(RolesCacheService.name);
  private pool: Pool;
  private cache = new Map<string, { map: Record<string, string[]>; expiresAt: number }>();

  onModuleInit() {
    this.pool = new Pool({ connectionString: process.env.DATABASE_URL });
    this.pool.on('error', (err) => this.logger.error('PG Pool error', err));
  }

  /**
   * DB-backed permission map for a tenant, backfilled from the static
   * ROLE_PERMISSIONS for any role key the tenant hasn't defined in the DB
   * yet, and falling back to the static map wholesale on any DB error.
   * This is an ops platform — a permission lookup must never fail closed
   * and lock everyone out because of a transient DB hiccup.
   */
  async getEffectivePermissionsMap(tenantId: string): Promise<Record<string, string[]>> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) return cached.map;

    try {
      const r = await this.pool.query<{ key: string; permissions: string[] }>(
        'SELECT key, permissions FROM roles WHERE tenant_id = $1',
        [tenantId],
      );
      const map: Record<string, string[]> = { ...ROLE_PERMISSIONS };
      for (const row of r.rows) map[row.key] = row.permissions;
      this.cache.set(tenantId, { map, expiresAt: Date.now() + CACHE_TTL_MS });
      return map;
    } catch (err) {
      this.logger.error(`Failed to load roles for tenant ${tenantId}, falling back to static permissions map`, err as Error);
      return ROLE_PERMISSIONS;
    }
  }
}
