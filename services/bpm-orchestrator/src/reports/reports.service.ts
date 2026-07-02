import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { REPORT_SOURCES, ReportColumn } from './report-sources';

interface Filter { column: string; op: string; value?: any; value2?: any; }
interface SortSpec { column: string; dir?: string; }
export interface RunDto {
  dataSource: string;
  columns?: string[];
  filters?: Filter[];
  sort?: SortSpec;
  limit?: number;
}
interface TemplateDto {
  name: string;
  description?: string;
  dataSource: string;
  config?: any;
}

const SIMPLE_OPS: Record<string, string> = {
  eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=',
};

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  /** Metadata for the builder UI — the whitelist, minus raw SQL. */
  getSources() {
    return Object.values(REPORT_SOURCES).map((s) => ({
      key: s.key,
      label: s.label,
      defaultColumns: s.defaultColumns,
      columns: s.columns.map((c) => ({
        key: c.key,
        label: c.label,
        type: c.type,
        filterable: c.filterable !== false,
        sortable: c.sortable !== false,
      })),
    }));
  }

  private cast(type: string): string {
    return type === 'date' ? '::timestamptz' : type === 'number' ? '::numeric' : type === 'bool' ? '::boolean' : '';
  }

  /** Run a report live against the selected data source. Tenant-scoped. */
  async run(tenantId: string, dto: RunDto) {
    const src = REPORT_SOURCES[dto.dataSource];
    if (!src) throw new BadRequestException(`Unknown data source: ${dto.dataSource}`);

    const colMap = new Map<string, ReportColumn>(src.columns.map((c) => [c.key, c]));
    const requested = dto.columns?.length ? dto.columns : src.defaultColumns;
    const selected = requested.filter((k) => colMap.has(k));
    if (!selected.length) throw new BadRequestException('No valid columns selected');

    const selectSql = selected.map((k) => `${colMap.get(k)!.expr} AS "${k}"`).join(', ');

    const params: any[] = [tenantId];
    const where: string[] = [`${src.alias}.tenant_id = $1`];

    for (const f of dto.filters || []) {
      const col = colMap.get(f.column);
      if (!col || col.filterable === false || !f?.op) continue;
      const cast = this.cast(col.type);

      if (f.op === 'is_null') { where.push(`${col.expr} IS NULL`); continue; }
      if (f.op === 'not_null') { where.push(`${col.expr} IS NOT NULL`); continue; }
      if (f.op === 'is_true') { where.push(`${col.expr} = true`); continue; }
      if (f.op === 'is_false') { where.push(`${col.expr} = false`); continue; }

      if (f.op === 'contains') {
        params.push(`%${f.value ?? ''}%`);
        where.push(`${col.expr}::text ILIKE $${params.length}`);
        continue;
      }
      if (f.op === 'in') {
        const arr = Array.isArray(f.value)
          ? f.value
          : String(f.value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        if (!arr.length) continue;
        params.push(arr);
        where.push(`${col.expr}::text = ANY($${params.length})`);
        continue;
      }
      if (f.op === 'between') {
        if (f.value == null || f.value2 == null) continue;
        params.push(f.value); const a = params.length;
        params.push(f.value2); const b = params.length;
        where.push(`${col.expr} BETWEEN $${a}${cast} AND $${b}${cast}`);
        continue;
      }
      const opSql = SIMPLE_OPS[f.op];
      if (!opSql || f.value == null || f.value === '') continue;
      params.push(f.value);
      where.push(`${col.expr} ${opSql} $${params.length}${cast}`);
    }

    let orderSql = src.defaultOrder;
    if (dto.sort?.column && colMap.has(dto.sort.column) && colMap.get(dto.sort.column)!.sortable !== false) {
      const dir = String(dto.sort.dir).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
      orderSql = `${colMap.get(dto.sort.column)!.expr} ${dir}`;
    }

    const limit = Math.min(Math.max(1, Number(dto.limit) || 1000), 10000);
    params.push(limit);
    const sql = `SELECT ${selectSql} FROM ${src.from} WHERE ${where.join(' AND ')} ORDER BY ${orderSql} NULLS LAST LIMIT $${params.length}`;

    const r = await this.db.query(sql, params);
    return {
      columns: selected.map((k) => ({ key: k, label: colMap.get(k)!.label, type: colMap.get(k)!.type })),
      rows: r.rows,
      total: r.rows.length,
    };
  }

  // ── Templates ──────────────────────────────────────────────────────────────
  async listTemplates(tenantId: string) {
    const r = await this.db.query(
      `SELECT id, name, description, data_source, config, created_by, created_at, updated_at
       FROM report_templates WHERE tenant_id = $1 ORDER BY name ASC`,
      [tenantId],
    );
    return r.rows;
  }

  async getTemplate(tenantId: string, id: string) {
    const r = await this.db.query(
      `SELECT * FROM report_templates WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id],
    );
    if (!r.rows[0]) throw new NotFoundException('Template not found');
    return r.rows[0];
  }

  async saveTemplate(tenantId: string, userId: string | null, dto: TemplateDto) {
    if (!dto?.name?.trim()) throw new BadRequestException('Template name is required');
    if (!REPORT_SOURCES[dto.dataSource]) throw new BadRequestException(`Unknown data source: ${dto.dataSource}`);
    const r = await this.db.query(
      `INSERT INTO report_templates (tenant_id, name, description, data_source, config, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenantId, dto.name.trim(), dto.description || null, dto.dataSource, JSON.stringify(dto.config || {}), userId],
    );
    return r.rows[0];
  }

  async updateTemplate(tenantId: string, id: string, dto: TemplateDto) {
    if (!dto?.name?.trim()) throw new BadRequestException('Template name is required');
    if (!REPORT_SOURCES[dto.dataSource]) throw new BadRequestException(`Unknown data source: ${dto.dataSource}`);
    const r = await this.db.query(
      `UPDATE report_templates
       SET name = $3, description = $4, data_source = $5, config = $6, updated_at = NOW()
       WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [tenantId, id, dto.name.trim(), dto.description || null, dto.dataSource, JSON.stringify(dto.config || {})],
    );
    if (!r.rows[0]) throw new NotFoundException('Template not found');
    return r.rows[0];
  }

  async deleteTemplate(tenantId: string, id: string) {
    const r = await this.db.query(
      `DELETE FROM report_templates WHERE tenant_id = $1 AND id = $2 RETURNING id`,
      [tenantId, id],
    );
    if (!r.rows[0]) throw new NotFoundException('Template not found');
    return { deleted: true, id };
  }
}
