import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TARGETS, SLA_CLASS_FACTOR, SlaConfig, SlaTargets } from '../case/sla';

/**
 * Effective SLA configuration = code defaults (TARGETS / SLA_CLASS_FACTOR)
 * overlaid with per-tenant DB overrides (sla_targets / sla_class_factors).
 * Cached per tenant; invalidated on any edit. case-service create() reads this
 * so new cases use the configured targets; past cases keep their pinned snapshot.
 */
@Injectable()
export class SlaConfigService {
  private cache = new Map<string, { cfg: SlaConfig; at: number }>();
  private readonly TTL = 60_000;

  constructor(private readonly db: DatabaseService) {}

  async getEffectiveConfig(tenantId: string): Promise<SlaConfig> {
    const cached = this.cache.get(tenantId);
    if (cached && Date.now() - cached.at < this.TTL) return cached.cfg;

    // Deep-clone the code defaults, then apply DB overrides.
    const targets: Record<string, Record<string, SlaTargets>> = {};
    for (const [type, byP] of Object.entries(TARGETS)) {
      targets[type] = {};
      for (const [p, t] of Object.entries(byP)) targets[type][p] = { ...t };
    }
    const classFactors: Record<string, number> = { ...SLA_CLASS_FACTOR };

    const [tr, cf] = await Promise.all([
      this.db.query(`SELECT type, priority, response_hours, resolve_hours, restore_hours FROM sla_targets WHERE tenant_id=$1`, [tenantId]),
      this.db.query(`SELECT class_key, factor FROM sla_class_factors WHERE tenant_id=$1`, [tenantId]),
    ]);
    for (const r of tr.rows) {
      targets[r.type] = targets[r.type] || {};
      targets[r.type][r.priority] = {
        responseHours: Number(r.response_hours),
        resolveHours: Number(r.resolve_hours),
        ...(r.restore_hours != null ? { restoreHours: Number(r.restore_hours) } : {}),
      };
    }
    for (const r of cf.rows) classFactors[String(r.class_key).toLowerCase()] = Number(r.factor);

    const cfg: SlaConfig = { targets, classFactors };
    this.cache.set(tenantId, { cfg, at: Date.now() });
    return cfg;
  }

  private invalidate(tenantId: string) { this.cache.delete(tenantId); }

  /** Effective targets as a flat list for the editor (with an `overridden` flag). */
  async listTargets(tenantId: string) {
    const ov = await this.db.query(`SELECT type, priority FROM sla_targets WHERE tenant_id=$1`, [tenantId]);
    const overridden = new Set(ov.rows.map((r: any) => `${r.type}|${r.priority}`));
    const cfg = await this.getEffectiveConfig(tenantId);
    const rows: any[] = [];
    for (const [type, byP] of Object.entries(cfg.targets!)) {
      for (const [priority, t] of Object.entries(byP)) {
        rows.push({
          type, priority,
          response_hours: t.responseHours, resolve_hours: t.resolveHours, restore_hours: t.restoreHours ?? null,
          overridden: overridden.has(`${type}|${priority}`),
        });
      }
    }
    return rows;
  }

  async upsertTarget(tenantId: string, type: string, priority: string, dto: any) {
    const resp = Number(dto.response_hours);
    const res = Number(dto.resolve_hours);
    if (!Number.isFinite(resp) || !Number.isFinite(res) || resp < 0 || res < 0) {
      throw new BadRequestException('response_hours and resolve_hours must be non-negative numbers');
    }
    const restore = dto.restore_hours === '' || dto.restore_hours == null ? null : Number(dto.restore_hours);
    if (restore != null && (!Number.isFinite(restore) || restore < 0)) throw new BadRequestException('restore_hours must be a non-negative number');
    await this.db.query(
      `INSERT INTO sla_targets(tenant_id, type, priority, response_hours, resolve_hours, restore_hours)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(tenant_id,type,priority) DO UPDATE SET response_hours=$4, resolve_hours=$5, restore_hours=$6, updated_at=NOW()`,
      [tenantId, type, priority, resp, res, restore],
    );
    this.invalidate(tenantId);
    return { ok: true };
  }

  /** Effective class factors as a list for the editor (with an `overridden` flag). */
  async listClassFactors(tenantId: string) {
    const ov = await this.db.query(`SELECT class_key FROM sla_class_factors WHERE tenant_id=$1`, [tenantId]);
    const overridden = new Set(ov.rows.map((r: any) => String(r.class_key).toLowerCase()));
    const cfg = await this.getEffectiveConfig(tenantId);
    return Object.entries(cfg.classFactors!).map(([class_key, factor]) => ({
      class_key, factor, overridden: overridden.has(class_key),
    }));
  }

  async upsertClassFactor(tenantId: string, key: string, dto: any) {
    const factor = Number(dto.factor);
    if (!Number.isFinite(factor) || factor <= 0) throw new BadRequestException('factor must be a positive number');
    await this.db.query(
      `INSERT INTO sla_class_factors(tenant_id, class_key, factor) VALUES($1,$2,$3)
       ON CONFLICT(tenant_id,class_key) DO UPDATE SET factor=$3, updated_at=NOW()`,
      [tenantId, key.toLowerCase(), factor],
    );
    this.invalidate(tenantId);
    return { ok: true };
  }
}
