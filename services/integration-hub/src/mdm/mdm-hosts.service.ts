import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class MdmHostsService {
  private readonly logger = new Logger(MdmHostsService.name);

  constructor(private readonly db: DatabaseService) {}

  async list(page = 1, pageSize = 20, filters: { search?: string; region?: string; technology_domain?: string; is_active?: string } = {}) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const conds: string[] = [];
    const vals: any[] = [];
    let i = 1;

    if (filters.search) {
      conds.push(`(host_name ILIKE $${i} OR site_id ILIKE $${i} OR ip_address ILIKE $${i})`);
      vals.push(`%${filters.search}%`);
      i++;
    }
    if (filters.region) { conds.push(`region=$${i++}`); vals.push(filters.region); }
    if (filters.technology_domain) { conds.push(`technology_domain=$${i++}`); vals.push(filters.technology_domain); }
    if (filters.is_active !== undefined) { conds.push(`is_active=$${i++}`); vals.push(filters.is_active === 'true'); }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const [rows, count] = await Promise.all([
      this.db.query(`SELECT * FROM mdm_hosts ${where} ORDER BY host_name LIMIT $${i} OFFSET $${i + 1}`, [...vals, limit, offset]),
      this.db.query(`SELECT COUNT(*) FROM mdm_hosts ${where}`, vals),
    ]);
    return { data: rows.rows, total: parseInt(count.rows[0].count, 10), page, pageSize };
  }

  async findById(id: string) {
    const r = await this.db.query(`SELECT * FROM mdm_hosts WHERE id=$1`, [id]);
    if (!r.rows.length) throw new NotFoundException('Host not found');
    return r.rows[0];
  }

  async findByHostName(hostName: string) {
    const r = await this.db.query(`SELECT * FROM mdm_hosts WHERE host_name=$1 AND is_active=true LIMIT 1`, [hostName]);
    return r.rows[0] ?? null;
  }

  async findBySiteId(siteId: string) {
    const r = await this.db.query(`SELECT * FROM mdm_hosts WHERE site_id=$1 AND is_active=true ORDER BY host_name LIMIT 1`, [siteId]);
    return r.rows[0] ?? null;
  }

  async create(dto: any) {
    const str = (v: any) => (v === '' || v == null) ? null : String(v);
    const num = (v: any) => (v === '' || v == null) ? null : Number(v);
    const r = await this.db.query(
      `INSERT INTO mdm_hosts
         (host_name, ip_address, site_id, canonical_site_id, region, cluster, vendor, technology_domain,
          assignment_group, oncall_group, sla_class, location_path,
          sla_profile_id, sla_calendar_id, sla_timezone,
          response_time_minutes, onsite_time_minutes, restore_time_minutes, travel_time_minutes, access_time_minutes,
          access_restrictions, notes, tags, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23::jsonb,$24)
       RETURNING *`,
      [
        dto.host_name, str(dto.ip_address), str(dto.site_id), str(dto.canonical_site_id),
        str(dto.region), str(dto.cluster), str(dto.vendor), str(dto.technology_domain),
        str(dto.assignment_group), str(dto.oncall_group), str(dto.sla_class), str(dto.location_path),
        str(dto.sla_profile_id), str(dto.sla_calendar_id), dto.sla_timezone || 'UTC',
        num(dto.response_time_minutes), num(dto.onsite_time_minutes), num(dto.restore_time_minutes),
        num(dto.travel_time_minutes), num(dto.access_time_minutes),
        str(dto.access_restrictions), str(dto.notes),
        JSON.stringify(dto.tags ?? []), dto.is_active !== false,
      ],
    );
    return r.rows[0];
  }

  async update(id: string, dto: any) {
    await this.findById(id); // ensure exists
    const fields: string[] = ['updated_at=NOW()'];
    const vals: any[] = [id];
    let i = 2;

    const cols = [
      'host_name', 'ip_address', 'site_id', 'canonical_site_id', 'region', 'cluster',
      'vendor', 'technology_domain', 'assignment_group', 'oncall_group', 'sla_class', 'location_path',
      'sla_profile_id', 'sla_calendar_id', 'sla_timezone',
      'response_time_minutes', 'onsite_time_minutes', 'restore_time_minutes', 'travel_time_minutes',
      'access_time_minutes', 'access_restrictions', 'notes', 'is_active',
    ];
    for (const col of cols) {
      if (dto[col] !== undefined) { fields.push(`${col}=$${i++}`); vals.push(dto[col]); }
    }
    if (dto.tags !== undefined) { fields.push(`tags=$${i++}::jsonb`); vals.push(JSON.stringify(dto.tags)); }

    const r = await this.db.query(
      `UPDATE mdm_hosts SET ${fields.join(',')} WHERE id=$1 RETURNING *`,
      vals,
    );
    return r.rows[0];
  }

  async remove(id: string) {
    await this.findById(id);
    await this.db.query(`DELETE FROM mdm_hosts WHERE id=$1`, [id]);
  }

  async getStats() {
    const [total, active, byRegion, byDomain] = await Promise.all([
      this.db.query(`SELECT COUNT(*) FROM mdm_hosts`),
      this.db.query(`SELECT COUNT(*) FROM mdm_hosts WHERE is_active=true`),
      this.db.query(`SELECT region, COUNT(*) as count FROM mdm_hosts WHERE region IS NOT NULL GROUP BY region ORDER BY count DESC LIMIT 8`),
      this.db.query(`SELECT technology_domain as domain, COUNT(*) as count FROM mdm_hosts WHERE technology_domain IS NOT NULL GROUP BY technology_domain ORDER BY count DESC LIMIT 8`),
    ]);
    const totalCount = parseInt(total.rows[0].count);
    const activeCount = parseInt(active.rows[0].count);
    return {
      total: totalCount,
      active: activeCount,
      inactive: totalCount - activeCount,
      byRegion: byRegion.rows.map((r: any) => ({ region: r.region, count: parseInt(r.count) })),
      byDomain: byDomain.rows.map((r: any) => ({ domain: r.domain, count: parseInt(r.count) })),
    };
  }

  /** Export all hosts as JSON array */
  async exportAll(): Promise<any[]> {
    const r = await this.db.query(`SELECT * FROM mdm_hosts ORDER BY host_name`);
    return r.rows;
  }

  /** Bulk import — upsert by host_name */
  async importBulk(hosts: any[]): Promise<{ imported: number; errors: string[] }> {
    let imported = 0;
    const errors: string[] = [];

    for (const host of hosts) {
      if (!host.host_name) { errors.push('Row missing host_name — skipped'); continue; }
      try {
        const existing = await this.findByHostName(host.host_name);
        if (existing) {
          await this.update(existing.id, host);
        } else {
          await this.create(host);
        }
        imported++;
      } catch (e) {
        errors.push(`${host.host_name}: ${e.message}`);
      }
    }

    this.logger.log(`Import complete: ${imported} hosts, ${errors.length} errors`);
    return { imported, errors };
  }

  /** Get distinct values for filter dropdowns — merges host data with configured lookup values */
  async getFilterOptions() {
    const safe = (p: Promise<any>) => p.catch(() => ({ rows: [] }));
    const [
      regions, domains, clusters, vendors, slaClasses, assignmentGroups, oncallGroups,
      lkpRegions, lkpDomains, lkpClusters, lkpVendors, lkpSlaCls, lkpAsgGrps, lkpOncall,
    ] = await Promise.all([
      this.db.query(`SELECT DISTINCT region FROM mdm_hosts WHERE region IS NOT NULL ORDER BY region`),
      this.db.query(`SELECT DISTINCT technology_domain FROM mdm_hosts WHERE technology_domain IS NOT NULL ORDER BY technology_domain`),
      this.db.query(`SELECT DISTINCT cluster FROM mdm_hosts WHERE cluster IS NOT NULL ORDER BY cluster`),
      this.db.query(`SELECT DISTINCT vendor FROM mdm_hosts WHERE vendor IS NOT NULL ORDER BY vendor`),
      this.db.query(`SELECT DISTINCT sla_class FROM mdm_hosts WHERE sla_class IS NOT NULL ORDER BY sla_class`),
      this.db.query(`SELECT DISTINCT assignment_group FROM mdm_hosts WHERE assignment_group IS NOT NULL ORDER BY assignment_group`),
      this.db.query(`SELECT DISTINCT oncall_group FROM mdm_hosts WHERE oncall_group IS NOT NULL ORDER BY oncall_group`),
      safe(this.db.query(`SELECT value FROM mdm_lookups WHERE type='region' ORDER BY sort_order, value`)),
      safe(this.db.query(`SELECT value FROM mdm_lookups WHERE type='technology_domain' ORDER BY sort_order, value`)),
      safe(this.db.query(`SELECT value FROM mdm_lookups WHERE type='cluster' ORDER BY sort_order, value`)),
      safe(this.db.query(`SELECT value FROM mdm_lookups WHERE type='vendor' ORDER BY sort_order, value`)),
      safe(this.db.query(`SELECT value FROM mdm_lookups WHERE type='sla_class' ORDER BY sort_order, value`)),
      safe(this.db.query(`SELECT value FROM mdm_lookups WHERE type='assignment_group' ORDER BY sort_order, value`)),
      safe(this.db.query(`SELECT value FROM mdm_lookups WHERE type='oncall_group' ORDER BY sort_order, value`)),
    ]);

    const merge = (hostRows: any[], hostField: string, lkpRows: any[]) => {
      const set = new Set<string>([
        ...hostRows.map((r: any) => r[hostField]),
        ...lkpRows.map((r: any) => r.value),
      ]);
      return [...set].sort();
    };

    return {
      regions:            merge(regions.rows,           'region',            lkpRegions.rows),
      technology_domains: merge(domains.rows,           'technology_domain', lkpDomains.rows),
      clusters:           merge(clusters.rows,          'cluster',           lkpClusters.rows),
      vendors:            merge(vendors.rows,           'vendor',            lkpVendors.rows),
      sla_classes:        merge(slaClasses.rows,        'sla_class',         lkpSlaCls.rows),
      assignment_groups:  merge(assignmentGroups.rows,  'assignment_group',  lkpAsgGrps.rows),
      oncall_groups:      merge(oncallGroups.rows,      'oncall_group',      lkpOncall.rows),
    };
  }
}
