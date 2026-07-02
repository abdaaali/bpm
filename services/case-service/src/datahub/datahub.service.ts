import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { computeHybridSla, SiteTravel } from '../case/hybrid-sla';

/**
 * Operational DataHub — Sites domain (the SLA-critical reference data).
 * Owns the travel-condition attributes that feed the travel-aware Hybrid SLA.
 */
// Whitelisted generic domains → backing table (guards against SQL injection on
// the :domain path param; only these uniform code/name/data tables are exposed).
const DOMAINS: Record<string, string> = {
  vendors: 'datahub_vendors',
  routes: 'datahub_routes',
  calendars: 'datahub_calendars',
  workforce: 'datahub_workforce',
  spares: 'datahub_spares',
};

@Injectable()
export class DataHubService {
  constructor(private readonly db: DatabaseService) {}

  // ── Generic extension domains (vendors / routes / calendars / workforce / spares) ──
  domains() { return Object.keys(DOMAINS); }

  private table(domain: string): string {
    const t = DOMAINS[domain];
    if (!t) throw new NotFoundException(`Unknown DataHub domain: ${domain}`);
    return t;
  }

  async listDomain(tenantId: string, domain: string, search?: string) {
    const t = this.table(domain);
    const params: any[] = [tenantId];
    let where = 'tenant_id=$1';
    if (search) { params.push(`%${search}%`); where += ` AND (code ILIKE $2 OR name ILIKE $2)`; }
    const r = await this.db.query(`SELECT * FROM ${t} WHERE ${where} ORDER BY code`, params);
    return r.rows;
  }

  async createDomainItem(tenantId: string, domain: string, dto: any) {
    const t = this.table(domain);
    const r = await this.db.query(
      `INSERT INTO ${t}(tenant_id, code, name, data, active) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [tenantId, dto.code, dto.name, JSON.stringify(dto.data || {}), dto.active ?? true]);
    return r.rows[0];
  }

  async updateDomainItem(tenantId: string, domain: string, id: string, dto: any) {
    const t = this.table(domain);
    const sets: string[] = []; const params: any[] = [tenantId, id];
    for (const f of ['code', 'name', 'active']) {
      if (dto[f] !== undefined) { params.push(dto[f]); sets.push(`${f}=$${params.length}`); }
    }
    if (dto.data !== undefined) { params.push(JSON.stringify(dto.data)); sets.push(`data=$${params.length}`); }
    if (!sets.length) throw new NotFoundException('Nothing to update');
    sets.push('updated_at=NOW()');
    const r = await this.db.query(`UPDATE ${t} SET ${sets.join(', ')} WHERE tenant_id=$1 AND id=$2 RETURNING *`, params);
    if (!r.rows[0]) throw new NotFoundException('Item not found');
    return r.rows[0];
  }

  async deleteDomainItem(tenantId: string, domain: string, id: string) {
    const t = this.table(domain);
    await this.db.query(`DELETE FROM ${t} WHERE tenant_id=$1 AND id=$2`, [tenantId, id]);
    return { deleted: true };
  }

  /**
   * Route-matrix override for the Hybrid SLA: a precise support-center → site
   * route supersedes the site's flat travel attributes when present.
   */
  async findRoute(tenantId: string, siteCode: string, supportCenter?: string) {
    const r = await this.db.query(
      `SELECT code, data FROM datahub_routes
        WHERE tenant_id=$1 AND data->>'toSiteCode'=$2
          AND ($3::text IS NULL OR data->>'fromCenter'=$3)
        ORDER BY (data->>'fromCenter'=$3) DESC LIMIT 1`,
      [tenantId, siteCode, supportCenter || null]);
    return r.rows[0] || null;
  }

  private readonly COLS = `id, site_code, name, region, access_class, support_center,
    base_travel_minutes, max_travel_minutes, road_factor, security_factor, seasonal_factor,
    access_delay_minutes, convoy_required, escort_required, working_hours, sla_class,
    version, created_at, updated_at`;

  async listSites(tenantId: string, q?: { access_class?: string; region?: string; search?: string }) {
    const where = ['tenant_id=$1'];
    const params: any[] = [tenantId];
    if (q?.access_class) { params.push(q.access_class); where.push(`access_class=$${params.length}`); }
    if (q?.region) { params.push(q.region); where.push(`region=$${params.length}`); }
    if (q?.search) { params.push(`%${q.search}%`); where.push(`(site_code ILIKE $${params.length} OR name ILIKE $${params.length})`); }
    const r = await this.db.query(
      `SELECT ${this.COLS} FROM datahub_sites WHERE ${where.join(' AND ')} ORDER BY site_code`, params);
    return r.rows;
  }

  async getSite(tenantId: string, id: string) {
    const byId = /^[0-9a-f-]{36}$/i.test(id);
    const r = await this.db.query(
      `SELECT ${this.COLS} FROM datahub_sites WHERE tenant_id=$1 AND ${byId ? 'id=$2' : 'site_code=$2'}`,
      [tenantId, id]);
    if (!r.rows[0]) throw new NotFoundException('Site not found');
    return r.rows[0];
  }

  async createSite(tenantId: string, dto: any) {
    const r = await this.db.query(
      `INSERT INTO datahub_sites(tenant_id, site_code, name, region, access_class, support_center,
        base_travel_minutes, max_travel_minutes, road_factor, security_factor, seasonal_factor,
        access_delay_minutes, convoy_required, escort_required, working_hours, sla_class)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING ${this.COLS}`,
      [tenantId, dto.site_code, dto.name, dto.region || null, dto.access_class || 'urban',
       dto.support_center || null, dto.base_travel_minutes ?? 30, dto.max_travel_minutes ?? 480,
       dto.road_factor ?? 1.0, dto.security_factor ?? 1.0, dto.seasonal_factor ?? 1.0,
       dto.access_delay_minutes ?? 0, dto.convoy_required ?? false, dto.escort_required ?? false,
       dto.working_hours || '24x7', dto.sla_class || null]);
    return r.rows[0];
  }

  async updateSite(tenantId: string, id: string, dto: any) {
    // Bump version on every change — the SLA snapshot on past cases stays pinned
    // to the values that were current at ticket time (framework §17.3).
    const fields = ['name', 'region', 'access_class', 'support_center', 'base_travel_minutes',
      'max_travel_minutes', 'road_factor', 'security_factor', 'seasonal_factor', 'access_delay_minutes',
      'convoy_required', 'escort_required', 'working_hours', 'sla_class'];
    const sets: string[] = [];
    const params: any[] = [tenantId, id];
    for (const f of fields) {
      if (dto[f] !== undefined) { params.push(dto[f]); sets.push(`${f}=$${params.length}`); }
    }
    if (!sets.length) return this.getSite(tenantId, id);
    sets.push('version=version+1', 'updated_at=NOW()');
    const byId = /^[0-9a-f-]{36}$/i.test(id);
    const r = await this.db.query(
      `UPDATE datahub_sites SET ${sets.join(', ')} WHERE tenant_id=$1 AND ${byId ? 'id=$2' : 'site_code=$2'} RETURNING ${this.COLS}`,
      params);
    if (!r.rows[0]) throw new NotFoundException('Site not found');
    return r.rows[0];
  }

  async deleteSite(tenantId: string, id: string) {
    const byId = /^[0-9a-f-]{36}$/i.test(id);
    await this.db.query(`DELETE FROM datahub_sites WHERE tenant_id=$1 AND ${byId ? 'id=$2' : 'site_code=$2'}`,
      [tenantId, id]);
    return { deleted: true };
  }

  /**
   * Preview the Hybrid SLA a case would get for this site at a given type/priority
   * — used by the create-case UI so operators see the travel-aware clock before
   * filing. Pure computation, no write.
   */
  async previewSla(tenantId: string, id: string, type = 'fault', priority = 'high', slaClass?: string) {
    const site = await this.getSite(tenantId, id) as SiteTravel & Record<string, any>;
    // Apply the same route-matrix refinement the real case path uses.
    const route = await this.findRoute(tenantId, site.site_code, site.support_center || undefined);
    if (route) {
      const d = route.data || {};
      if (d.baseTravelMinutes != null) site.base_travel_minutes = d.baseTravelMinutes;
      if (d.roadFactor != null) site.road_factor = d.roadFactor;
      if (d.securityFactor != null) site.security_factor = d.securityFactor;
      site.route_code = route.code;
    }
    const { sla, breakdown } = computeHybridSla({ type, priority, slaClass }, site);
    return { type, priority, sla, breakdown };
  }
}
