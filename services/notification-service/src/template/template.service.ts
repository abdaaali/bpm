import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as Handlebars from 'handlebars';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);
  private cache = new Map<string, HandlebarsTemplateDelegate>();

  constructor(private readonly db: DatabaseService) {
    this.registerHelpers();
  }

  private registerHelpers() {
    Handlebars.registerHelper('upper', (str: string) => String(str || '').toUpperCase());
    Handlebars.registerHelper('lower', (str: string) => String(str || '').toLowerCase());
    Handlebars.registerHelper('date', (d: string | Date) => new Date(d).toLocaleDateString());
    Handlebars.registerHelper('datetime', (d: string | Date) => new Date(d).toLocaleString());
    Handlebars.registerHelper('ifEq', function (a: any, b: any, opts: any) { return a === b ? opts.fn(this) : opts.inverse(this); });
  }

  async findAll(tenantId: string) {
    const r = await this.db.query(
      `SELECT id, name, slug, channel, subject, created_at FROM notification_templates WHERE tenant_id=$1 ORDER BY name`,
      [tenantId],
    );
    return r.rows;
  }

  async findBySlug(tenantId: string, slug: string) {
    const r = await this.db.query(
      `SELECT * FROM notification_templates WHERE slug=$1 AND tenant_id=$2`,
      [slug, tenantId],
    );
    if (!r.rows.length) throw new NotFoundException(`Template not found: ${slug}`);
    return r.rows[0];
  }

  async render(tenantId: string, slug: string, variables: Record<string, any>): Promise<{ subject: string; body: string; channel: string }> {
    const tpl = await this.findBySlug(tenantId, slug);
    const cacheKey = `${tpl.id}:${tpl.updated_at}`;
    if (!this.cache.has(cacheKey)) {
      this.cache.set(cacheKey, Handlebars.compile(tpl.body));
    }
    const subjectTpl = Handlebars.compile(tpl.subject || '');
    return {
      subject: subjectTpl(variables),
      body: this.cache.get(cacheKey)!(variables),
      channel: tpl.channel,
    };
  }

  async upsert(tenantId: string, dto: any, actorId?: string) {
    const r = await this.db.query(
      `INSERT INTO notification_templates(tenant_id, name, slug, channel, subject, body)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(tenant_id,slug) DO UPDATE SET name=EXCLUDED.name, channel=EXCLUDED.channel,
         subject=EXCLUDED.subject, body=EXCLUDED.body, updated_at=NOW()
       RETURNING *`,
      [tenantId, dto.name, dto.slug, dto.channel || 'in_app', dto.subject || '', dto.body],
    );
    this.cache.clear(); // clear render cache
    return r.rows[0];
  }
}
