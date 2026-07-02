import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { AuditService } from '../audit/audit.service';
import { parseBpmn } from '../engine/bpmn-parser';

@Injectable()
export class ProcessDefinitionService {
  private readonly logger = new Logger(ProcessDefinitionService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly kafka: KafkaProducerService,
    private readonly audit: AuditService,
  ) {}

  async findAll(tenantId: string, page = 1, pageSize = 20) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const [rows, count] = await Promise.all([
      this.db.query(
        `SELECT id, tenant_id, name, slug, description, category, version, status, config, bpmn_xml IS NOT NULL as has_xml, created_at, updated_at
         FROM process_definitions WHERE tenant_id=$1 ORDER BY name, version DESC LIMIT $2 OFFSET $3`,
        [tenantId, limit, offset],
      ),
      this.db.query(`SELECT COUNT(*) FROM process_definitions WHERE tenant_id=$1`, [tenantId]),
    ]);
    return { data: rows.rows, total: parseInt(count.rows[0].count), page, pageSize };
  }

  async findOne(tenantId: string, id: string) {
    const r = await this.db.query(
      `SELECT * FROM process_definitions WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId],
    );
    if (!r.rows.length) throw new NotFoundException('Process definition not found');
    return r.rows[0];
  }

  async findBySlug(tenantId: string, slug: string) {
    const r = await this.db.query(
      `SELECT * FROM process_definitions WHERE slug=$1 AND tenant_id=$2 AND status='active' ORDER BY version DESC LIMIT 1`,
      [slug, tenantId],
    );
    if (!r.rows.length) throw new NotFoundException(`No active definition for slug: ${slug}`);
    return r.rows[0];
  }

  /**
   * The intake (start) form for a process: the form fields authored on its
   * StartEvent in the BPMN. Single source of truth (same parser as task forms),
   * so ops can change intake fields in Process Studio without code. Returns an
   * empty `fields` array when the process has no start form.
   */
  async getStartForm(tenantId: string, slug: string) {
    const def = await this.findBySlug(tenantId, slug); // 404s if no active version
    let fields: any[] = [];
    if (def.bpmn_xml) {
      try {
        const proc = parseBpmn(def.bpmn_xml);
        const start = proc.elements.find(
          (e: any) => e.id === proc.startEventId || e.type === 'startEvent',
        );
        fields = start?.formFields || [];
      } catch (e: any) {
        this.logger.warn(`Start-form parse failed for '${slug}': ${e.message}`);
      }
    }
    return { slug: def.slug, name: def.name, version: def.version, fields };
  }

  async create(tenantId: string, dto: any, actorId?: string) {
    // Resolve version in a separate query to avoid PostgreSQL parameter-type
    // ambiguity when the same $N placeholder appears in both VALUES and a subquery.
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version) + 1, 1) AS next_version
       FROM process_definitions WHERE tenant_id = $1 AND slug = $2`,
      [tenantId, dto.slug],
    );
    const version = versionResult.rows[0].next_version;

    const r = await this.db.query(
      `INSERT INTO process_definitions(tenant_id,name,slug,description,category,bpmn_xml,config,version,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'draft')
       RETURNING *`,
      [tenantId, dto.name, dto.slug, dto.description || null, dto.category || null, dto.bpmn_xml || null, JSON.stringify(dto.config || {}), version],
    );
    const def = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'process_definition', entityId: def.id, action: 'created', actorId, afterState: def });
    await this.kafka.produce('bpm.process.definition', { event: 'definition.created', tenantId, definitionId: def.id });
    return def;
  }

  async update(tenantId: string, id: string, dto: any, actorId?: string) {
    const existing = await this.findOne(tenantId, id);
    // Process-change safety: only DRAFT versions are editable in place. A
    // published (active) or archived version is immutable in its executable
    // content, because running instances are pinned to their definition_id and
    // resolve BPMN from that row. Editing the flow must fork a new draft version
    // so in-flight work is never altered mid-execution.
    if (existing.status !== 'draft' && (dto.bpmn_xml !== undefined || dto.config !== undefined)) {
      throw new BadRequestException(
        `Cannot edit the flow of a '${existing.status}' process version. ` +
        `Create a new version (POST /definitions/${id}/new-version) and edit that draft, then publish it.`,
      );
    }
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 3;
    if (dto.name !== undefined) { fields.push(`name=$${i++}`); vals.push(dto.name); }
    if (dto.description !== undefined) { fields.push(`description=$${i++}`); vals.push(dto.description); }
    if (dto.category !== undefined) { fields.push(`category=$${i++}`); vals.push(dto.category); }
    if (dto.bpmn_xml !== undefined) { fields.push(`bpmn_xml=$${i++}`); vals.push(dto.bpmn_xml); }
    if (dto.config !== undefined) { fields.push(`config=$${i++}`); vals.push(JSON.stringify(dto.config)); }
    if (!fields.length) return existing;
    fields.push(`updated_at=NOW()`);
    const r = await this.db.query(
      `UPDATE process_definitions SET ${fields.join(',')} WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [id, tenantId, ...vals],
    );
    const updated = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'process_definition', entityId: id, action: 'updated', actorId, beforeState: existing, afterState: updated });
    return updated;
  }

  /**
   * Process-change safety — fork a new editable DRAFT version from any existing
   * version, seeded with its current flow. This is the only way to "edit" a
   * published process: edit the draft, then publish it (which archives the prior
   * active version, whose row is retained so running instances keep running on it).
   */
  async createDraftVersion(tenantId: string, id: string, actorId?: string) {
    const src = await this.findOne(tenantId, id);
    const versionResult = await this.db.query(
      `SELECT COALESCE(MAX(version) + 1, 1) AS next_version
       FROM process_definitions WHERE tenant_id = $1 AND slug = $2`,
      [tenantId, src.slug],
    );
    const version = versionResult.rows[0].next_version;
    const r = await this.db.query(
      `INSERT INTO process_definitions(tenant_id,name,slug,description,category,bpmn_xml,config,version,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'draft')
       RETURNING *`,
      [tenantId, src.name, src.slug, src.description, src.category, src.bpmn_xml,
       JSON.stringify(src.config || {}), version],
    );
    const def = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'process_definition', entityId: def.id, action: 'version.created', actorId, afterState: { fromId: id, slug: src.slug, version } });
    await this.kafka.produce('bpm.process.definition', { event: 'definition.version_created', tenantId, definitionId: def.id, fromDefinitionId: id, version });
    this.logger.log(`Forked draft v${version} of '${src.slug}' from ${id} → ${def.id}`);
    return def;
  }

  async publish(tenantId: string, id: string, actorId?: string) {
    const existing = await this.findOne(tenantId, id);
    if (existing.status === 'active') return existing;
    // Supersede prior versions of the same slug. Hard-delete any version with no
    // live (running/suspended) instances so old versions don't accumulate; archive
    // any that still have live instances so those keep running on their own row.
    const others = await this.db.query(
      `SELECT id FROM process_definitions WHERE tenant_id=$1 AND slug=$2 AND id!=$3`,
      [tenantId, existing.slug, id],
    );
    for (const { id: oldId } of others.rows) {
      const live = await this.db.query(
        `SELECT COUNT(*) FROM process_instances WHERE definition_id=$1 AND status NOT IN ('terminated','completed')`,
        [oldId],
      );
      if (parseInt(live.rows[0].count, 10) > 0) {
        await this.db.query(
          `UPDATE process_definitions SET status='archived', updated_at=NOW() WHERE id=$1`, [oldId],
        );
        this.logger.log(`Archived superseded v of '${existing.slug}' ${oldId} (live instances exist)`);
      } else {
        // Cascade-delete ended instances and their tasks, then the definition row
        await this.db.query(
          `DELETE FROM tasks WHERE process_instance_id IN (SELECT id FROM process_instances WHERE definition_id=$1)`, [oldId],
        );
        await this.db.query(`DELETE FROM process_instances WHERE definition_id=$1`, [oldId]);
        await this.db.query(`DELETE FROM process_definitions WHERE id=$1`, [oldId]);
        await this.audit.log({ tenantId, entityType: 'process_definition', entityId: oldId, action: 'deleted', actorId, afterState: { reason: 'superseded_on_publish', slug: existing.slug } });
        this.logger.log(`Hard-deleted superseded v of '${existing.slug}' ${oldId} (no live instances)`);
      }
    }
    const r = await this.db.query(
      `UPDATE process_definitions SET status='active', updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [id, tenantId],
    );
    const updated = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'process_definition', entityId: id, action: 'published', actorId, beforeState: existing, afterState: updated });
    await this.kafka.produce('bpm.process.definition', { event: 'definition.published', tenantId, definitionId: id });
    return updated;
  }

  async unpublish(tenantId: string, id: string, actorId?: string) {
    const existing = await this.findOne(tenantId, id);
    if (existing.status !== 'active') throw new BadRequestException('Only active definitions can be unpublished');
    const r = await this.db.query(
      `UPDATE process_definitions SET status='draft', updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [id, tenantId],
    );
    const updated = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'process_definition', entityId: id, action: 'unpublished', actorId, beforeState: existing, afterState: updated });
    await this.kafka.produce('bpm.process.definition', { event: 'definition.unpublished', tenantId, definitionId: id });
    return updated;
  }

  async archive(tenantId: string, id: string, actorId?: string) {
    const existing = await this.findOne(tenantId, id);
    const r = await this.db.query(
      `UPDATE process_definitions SET status='archived', updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [id, tenantId],
    );
    await this.audit.log({ tenantId, entityType: 'process_definition', entityId: id, action: 'archived', actorId, beforeState: existing, afterState: r.rows[0] });
    return r.rows[0];
  }

  async remove(tenantId: string, id: string, actorId?: string) {
    const existing = await this.findOne(tenantId, id);
    if (existing.status === 'active') throw new BadRequestException('Cannot delete an active definition — archive it first.');
    // Block only if running/suspended instances exist; terminated/completed are fine
    const inst = await this.db.query(
      `SELECT COUNT(*) FROM process_instances WHERE definition_id=$1 AND status NOT IN ('terminated','completed')`, [id],
    );
    if (parseInt(inst.rows[0].count) > 0) throw new BadRequestException('Cannot delete: active or suspended instances exist. Terminate them first.');
    // Cascade-delete ended instances and their tasks
    await this.db.query(
      `DELETE FROM tasks WHERE process_instance_id IN (SELECT id FROM process_instances WHERE definition_id=$1)`, [id],
    );
    await this.db.query(`DELETE FROM process_instances WHERE definition_id=$1`, [id]);
    await this.db.query(`DELETE FROM process_definitions WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    await this.audit.log({ tenantId, entityType: 'process_definition', entityId: id, action: 'deleted', actorId, beforeState: existing });
  }
}
