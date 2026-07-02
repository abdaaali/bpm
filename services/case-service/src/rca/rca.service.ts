import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';

/**
 * RCA Level-2 — formal Root Cause Analysis records (one per case) plus CAPA
 * (Corrective And Preventive Actions) with owners, due dates and an
 * effectiveness review. The structured `analysis` JSONB is method-specific
 * (five_whys steps, fishbone categories, …) and stored verbatim.
 */
// Searchable text per case for trigram similarity (title + description + a few
// telecom context fields). Used by similar-case retrieval and k-NN suggestion.
const CASE_TEXT = (alias: string) =>
  `lower(${alias}.title || ' ' || coalesce(${alias}.description,'') || ' ' ||
   coalesce(${alias}.context->>'symptom','') || ' ' || coalesce(${alias}.context->>'serviceAffected',''))`;

@Injectable()
export class RcaService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService) {}

  // ── RCA assist (offline, classical) ─────────────────────────────────────────

  /** Trigram-similar past cases (with their captured root cause / fix). */
  async similarCases(tenantId: string, caseId: string, limit = 6) {
    const r = await this.db.query(
      `WITH t AS (SELECT ${CASE_TEXT('c')} AS txt FROM cases c WHERE c.id=$1 AND c.tenant_id=$2)
       SELECT s.* FROM (
         SELECT c.id, c.case_number, c.type, c.title, c.status,
                c.root_cause_category, c.root_cause_subcategory, c.root_cause_description, c.resolution_notes,
                round(similarity(${CASE_TEXT('c')}, t.txt)::numeric, 3) AS similarity
           FROM cases c, t
          WHERE c.tenant_id=$2 AND c.id <> $1
            AND (c.root_cause_category IS NOT NULL OR c.status IN ('resolved','closed'))
       ) s
       WHERE s.similarity > 0.06
       ORDER BY s.similarity DESC
       LIMIT $3`,
      [caseId, tenantId, limit],
    );
    return r.rows;
  }

  /**
   * Weighted k-NN root-cause suggestion: take the most trigram-similar past cases
   * that already have a root cause, and vote (weighted by similarity) on the
   * category, then the subcategory within the winning category. Fully offline;
   * the supporting neighbours are returned so the suggestion is explainable.
   */
  async suggestRootCause(tenantId: string, caseId: string, k = 12) {
    const r = await this.db.query(
      `WITH t AS (SELECT ${CASE_TEXT('c')} AS txt FROM cases c WHERE c.id=$1 AND c.tenant_id=$2)
       SELECT c.case_number, c.root_cause_category AS cat, c.root_cause_subcategory AS sub,
              similarity(${CASE_TEXT('c')}, t.txt) AS sim
         FROM cases c, t
        WHERE c.tenant_id=$2 AND c.id <> $1 AND c.root_cause_category IS NOT NULL
        ORDER BY sim DESC LIMIT $3`,
      [caseId, tenantId, k],
    );
    const nbrs = r.rows.filter((n: any) => Number(n.sim) > 0.06);
    if (!nbrs.length) return { suggestion: null, neighbors: [] };

    const catW: Record<string, number> = {};
    for (const n of nbrs) catW[n.cat] = (catW[n.cat] || 0) + Number(n.sim);
    const total = Object.values(catW).reduce((a, b) => a + b, 0);
    const category = Object.entries(catW).sort((a, b) => b[1] - a[1])[0][0];

    const subW: Record<string, number> = {};
    for (const n of nbrs) if (n.cat === category && n.sub) subW[n.sub] = (subW[n.sub] || 0) + Number(n.sim);
    const subcategory = Object.entries(subW).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return {
      suggestion: { category, subcategory, confidence: +(catW[category] / total).toFixed(2), method: 'weighted_knn_trigram' },
      neighbors: nbrs.slice(0, 5).map((n: any) => ({ case_number: n.case_number, category: n.cat, similarity: +Number(n.sim).toFixed(3) })),
    };
  }

  private async resolveUser(actorId: string | undefined, tenantId: string): Promise<string | null> {
    if (!actorId) return null;
    const r = await this.db.query(`SELECT id FROM users WHERE tenant_id=$2 AND (id::text=$1 OR keycloak_id=$1) LIMIT 1`, [actorId, tenantId]);
    return r.rows[0]?.id || null;
  }

  /** Create or update the case's single formal RCA record (upsert on case_id). */
  async upsertRca(tenantId: string, caseId: string, dto: any, actorId?: string) {
    const actor = await this.resolveUser(actorId, tenantId);
    const r = await this.db.query(
      `INSERT INTO rca_records(tenant_id, case_id, method, summary, analysis, root_cause_statement, status, created_by)
       VALUES($1,$2,$3,$4,$5,$6,COALESCE($7,'draft'),$8)
       ON CONFLICT (case_id) DO UPDATE SET
         method=EXCLUDED.method, summary=EXCLUDED.summary, analysis=EXCLUDED.analysis,
         root_cause_statement=EXCLUDED.root_cause_statement,
         status=COALESCE($7, rca_records.status),
         reviewed_by=CASE WHEN $7='approved' THEN $8 ELSE rca_records.reviewed_by END,
         updated_at=NOW()
       RETURNING *`,
      [tenantId, caseId, dto.method || 'five_whys', dto.summary || null,
       JSON.stringify(dto.analysis || {}), dto.root_cause_statement || null, dto.status || null, actor],
    );
    const rec = r.rows[0];
    // Mirror the headline root cause onto the case (Level-1 fields) for the RCA dashboard.
    if (dto.root_cause_statement !== undefined || dto.root_cause_category) {
      await this.db.query(
        `UPDATE cases SET root_cause_description=COALESCE($3, root_cause_description),
                root_cause_category=COALESCE($4, root_cause_category), updated_at=NOW()
          WHERE id=$1 AND tenant_id=$2`,
        [caseId, tenantId, dto.root_cause_statement || null, dto.root_cause_category || null],
      );
    }
    await this.audit.log({ tenantId, entityType: 'case', entityId: caseId, action: 'rca.saved', actorId, afterState: { method: rec.method, status: rec.status } });
    return rec;
  }

  async getRca(tenantId: string, caseId: string) {
    const r = await this.db.query(`SELECT * FROM rca_records WHERE tenant_id=$1 AND case_id=$2`, [tenantId, caseId]);
    return r.rows[0] || null;
  }

  // ── CAPA ──
  async listCapa(tenantId: string, caseId: string) {
    const r = await this.db.query(
      `SELECT a.*, COALESCE(NULLIF(TRIM(u.first_name||' '||u.last_name),''), u.username) AS owner_name
         FROM capa_actions a LEFT JOIN users u ON u.id=a.owner_id
        WHERE a.tenant_id=$1 AND a.case_id=$2 ORDER BY a.action_type, a.created_at`,
      [tenantId, caseId]);
    return r.rows;
  }

  async addCapa(tenantId: string, caseId: string, dto: any, actorId?: string) {
    if (!dto.action_type || !['corrective', 'preventive'].includes(dto.action_type)) {
      throw new BadRequestException('action_type must be corrective or preventive');
    }
    if (!dto.description) throw new BadRequestException('description is required');
    const rca = await this.getRca(tenantId, caseId);
    const owner = dto.owner_id ? (await this.resolveUser(dto.owner_id, tenantId)) : null;
    const r = await this.db.query(
      `INSERT INTO capa_actions(tenant_id, case_id, rca_id, action_type, description, owner_id, due_at)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tenantId, caseId, rca?.id || null, dto.action_type, dto.description, owner, dto.due_at || null]);
    await this.audit.log({ tenantId, entityType: 'case', entityId: caseId, action: 'capa.added', actorId, afterState: { type: dto.action_type } });
    return r.rows[0];
  }

  async updateCapa(tenantId: string, caseId: string, actionId: string, dto: any, actorId?: string) {
    const existing = await this.db.query(`SELECT * FROM capa_actions WHERE id=$1 AND case_id=$2 AND tenant_id=$3`, [actionId, caseId, tenantId]);
    if (!existing.rows[0]) throw new NotFoundException('CAPA action not found');
    const sets: string[] = []; const vals: any[] = [actionId, caseId, tenantId];
    for (const f of ['description', 'status', 'effectiveness', 'effectiveness_notes']) {
      if (dto[f] !== undefined) { vals.push(dto[f]); sets.push(`${f}=$${vals.length}`); }
    }
    if (dto.due_at !== undefined) { vals.push(dto.due_at || null); sets.push(`due_at=$${vals.length}`); }
    if (dto.owner_id !== undefined) { vals.push(await this.resolveUser(dto.owner_id, tenantId)); sets.push(`owner_id=$${vals.length}`); }
    if (dto.effectiveness && dto.effectiveness !== 'pending') { vals.push(await this.resolveUser(actorId, tenantId)); sets.push(`verified_by=$${vals.length}`); }
    if (!sets.length) return existing.rows[0];
    sets.push('updated_at=NOW()');
    const r = await this.db.query(`UPDATE capa_actions SET ${sets.join(', ')} WHERE id=$1 AND case_id=$2 AND tenant_id=$3 RETURNING *`, vals);
    await this.audit.log({ tenantId, entityType: 'case', entityId: caseId, action: 'capa.updated', actorId, afterState: { status: dto.status, effectiveness: dto.effectiveness } });
    return r.rows[0];
  }
}
