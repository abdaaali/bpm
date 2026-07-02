import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger } from '@nestjs/common';
import axios from 'axios';
import { DatabaseService } from '../database/database.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { AuditService } from '../audit/audit.service';
import { computeHybridSla, SiteTravel } from './hybrid-sla';
import { RoutingService } from './routing.service';
import { SlaConfigService } from '../sla-config/sla-config.service';

// C1 — case type → orchestrating process slug. When a case of one of these
// types is created and the matching definition is active, we start the process
// linked to the case so task progress drives the case status automatically.
const TYPE_PROCESS: Record<string, string> = {
  incident: 'incident_management',
  fault:    'fault_management',
  change:   'change_management',
  request:  'purchase_request',
  problem:  'problem_management',
  spare_part:     'spare_parts',
  asset_movement: 'asset_movement',
  convoy:         'convoy',
  theft:          'theft',
  security_audit: 'security_audit',
  pdt:            'pdt',
};

/**
 * Whether a case type should auto-start its process. Driven by CASE_AUTO_PROCESS:
 *   unset / "false"        → no type auto-starts
 *   "true" / "all"         → every type in TYPE_PROCESS
 *   comma list (selective) → only those types, e.g. "request,change"
 * (An explicit process_slug bypasses this and always starts its process.)
 */
function autoProcessAllowed(type: string): boolean {
  const raw = (process.env.CASE_AUTO_PROCESS ?? 'false').trim().toLowerCase();
  if (raw === '' || raw === 'false') return false;
  if (raw === 'true' || raw === 'all') return true;
  return raw.split(',').map(s => s.trim()).includes(type);
}

const TYPE_PREFIX: Record<string, string> = {
  incident: 'INC', problem: 'PRB', change: 'CHG', request: 'REQ', alarm: 'ALM', work_order: 'WO',
  // Telecom managed-service processes
  fault: 'FLT', pdt: 'PDT', theft: 'THF', security_audit: 'AUD',
  asset_movement: 'AMV', convoy: 'CVY', spare_part: 'SPR',
};

// Known associative link types between cases (free-form allowed; this is the
// curated set the UI offers). Mirrors the framework's cross-record relationships.
const LINK_TYPES = [
  'related_to', 'caused_by', 'causes', 'duplicate_of', 'investigates',
  'spawned_from', 'spawned', 'requires', 'escalated_to', 'blocks', 'blocked_by',
];

// ITIL state machine transitions
const VALID_TRANSITIONS: Record<string, string[]> = {
  new:              ['open', 'in_progress', 'cancelled', 'resolved', 'dispatched_external'],
  open:             ['in_progress', 'pending', 'cancelled', 'resolved', 'dispatched_external'],
  in_progress:      ['pending', 'pending_approval', 'resolved', 'cancelled', 'dispatched_external'],
  pending:          ['in_progress', 'cancelled', 'resolved', 'dispatched_external'],
  pending_approval: ['approved', 'rejected', 'in_progress'],
  approved:         ['in_progress', 'cancelled'],
  rejected:         ['open', 'cancelled'],
  // Field work is with an external contractor. Re-dispatch (self-loop) is allowed,
  // and the case can come back in-house, resolve, or be cancelled from here — so a
  // dispatched case is never a dead end.
  dispatched_external: ['dispatched_external', 'in_progress', 'pending', 'resolved', 'cancelled'],
  resolved:         ['closed', 'open'],
  closed:           [],
  cancelled:        [],
};

@Injectable()
export class CaseService {
  private readonly logger = new Logger(CaseService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly kafka: KafkaProducerService,
    private readonly audit: AuditService,
    private readonly routing: RoutingService,
    private readonly slaConfig: SlaConfigService,
  ) {}

  /**
   * Resolve an actor identifier (internal UUID or Keycloak sub) to an internal
   * user UUID, scoped to the tenant so a sub from another tenant can't resolve
   * to a user here.
   */
  private async resolveUserId(actorId: string | undefined, tenantId: string): Promise<string | null> {
    if (!actorId) return null;
    const r = await this.db.query(
      `SELECT id FROM users WHERE tenant_id=$2 AND (id::text=$1 OR keycloak_id=$1) LIMIT 1`,
      [actorId, tenantId],
    );
    return r.rows[0]?.id || null;
  }

  async findAll(tenantId: string, filters: any, page = 1, pageSize = 20) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const conds: string[] = ['c.tenant_id=$1'];
    const vals: any[] = [tenantId];
    let i = 2;
    // requesterId may arrive as a Keycloak sub (the UI's user.id); resolve it to
    // the internal users.id stored on the case so "My Requests" matches.
    const requesterId = filters.requesterId
      ? (await this.resolveUserId(filters.requesterId, tenantId)) || filters.requesterId
      : undefined;
    if (filters.type) {
      // Accept a single type or a comma-separated list (e.g. a domain's types).
      const types = String(filters.type).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (types.length === 1) { conds.push(`c.type=$${i++}`); vals.push(types[0]); }
      else if (types.length > 1) { conds.push(`c.type=ANY($${i++})`); vals.push(types); }
    }
    if (filters.status) {
      const statuses = String(filters.status).split(',').map((s: string) => s.trim()).filter(Boolean);
      if (statuses.length === 1) { conds.push(`c.status=$${i++}`); vals.push(statuses[0]); }
      else { conds.push(`c.status=ANY($${i++})`); vals.push(statuses); }
    }
    if (filters.priority)   { conds.push(`c.priority=$${i++}`);    vals.push(filters.priority); }
    if (filters.assigneeId) { conds.push(`c.assignee_id=$${i++}`); vals.push(filters.assigneeId); }
    if (requesterId)        { conds.push(`c.requester_id=$${i++}`);vals.push(requesterId); }
    if (filters.teamId)     { conds.push(`c.assigned_team_id=$${i++}`); vals.push(filters.teamId); }
    if (filters.search)     { conds.push(`(c.title ILIKE $${i} OR c.case_number ILIKE $${i})`); vals.push(`%${filters.search}%`); i++; }
    if (filters.breached === 'true') { conds.push(`c.breached=true`); }
    const where = conds.join(' AND ');
    const [rows, count] = await Promise.all([
      this.db.query(
        `SELECT c.*,
                (u.first_name || ' ' || u.last_name) as requester_name,
                (a.first_name || ' ' || a.last_name) as assignee_name,
                ou.name as team_name
         FROM cases c
         LEFT JOIN users u  ON u.id=c.requester_id
         LEFT JOIN users a  ON a.id=c.assignee_id
         LEFT JOIN org_units ou ON ou.id=c.assigned_team_id
         WHERE ${where} ORDER BY c.created_at DESC LIMIT $${i++} OFFSET $${i++}`,
        [...vals, limit, offset],
      ),
      this.db.query(`SELECT COUNT(*) FROM cases c WHERE ${where}`, vals),
    ]);
    return { data: rows.rows, total: parseInt(count.rows[0].count), page, pageSize };
  }

  async findOne(tenantId: string, id: string, actorId?: string) {
    const r = await this.db.query(
      `SELECT c.*,
              (u.first_name || ' ' || u.last_name) as requester_name,
              (a.first_name || ' ' || a.last_name) as assignee_name,
              NULLIF(TRIM(m.first_name || ' ' || m.last_name), '') as mim_name,
              ou.name as team_name
       FROM cases c
       LEFT JOIN users u  ON u.id=c.requester_id
       LEFT JOIN users a  ON a.id=c.assignee_id
       LEFT JOIN users m  ON m.id=c.mim_id
       LEFT JOIN org_units ou ON ou.id=c.assigned_team_id
       WHERE c.id=$1 AND c.tenant_id=$2`,
      [id, tenantId],
    );
    if (!r.rows.length) throw new NotFoundException('Case not found');
    const row = r.rows[0];
    // Ownership flag for the caller — lets clients gate work actions (claim vs
    // begin/resolve) on whether the case is actually assigned to them.
    if (actorId) {
      const uid = await this.resolveUserId(actorId, tenantId);
      row.mine = !!uid && row.assignee_id === uid;
    }
    return row;
  }

  private async nextCaseNumber(tenantId: string, type: string): Promise<string> {
    const prefix = TYPE_PREFIX[type] || 'TKT';
    const r = await this.db.query(
      `INSERT INTO case_sequences(tenant_id, prefix, next_val) VALUES($1,$2,1002)
       ON CONFLICT(tenant_id,prefix) DO UPDATE SET next_val=case_sequences.next_val+1
       RETURNING next_val`,
      [tenantId, prefix],
    );
    return `${prefix}${r.rows[0].next_val}`;
  }

  /**
   * Resolve the affected DataHub site from a create payload — by explicit
   * affected_site_id, or by a site code/id carried in context (e.g. alarm
   * enrichment or a UI picker). Returns null when no site is referenced.
   */
  private async resolveSite(tenantId: string, dto: any): Promise<SiteTravel | null> {
    const ref = dto.affected_site_id || dto.site_id || dto.context?.affectedSiteId
      || dto.context?.site_id || dto.context?.siteCode || dto.context?.site_code;
    if (!ref) return null;
    const byId = /^[0-9a-f-]{36}$/i.test(String(ref));
    const r = await this.db.query(
      `SELECT id, site_code, name, access_class, support_center, base_travel_minutes,
              max_travel_minutes, road_factor, security_factor, seasonal_factor,
              access_delay_minutes, convoy_required, escort_required, sla_class
         FROM datahub_sites
        WHERE tenant_id=$1 AND (${byId ? 'id=$2' : 'site_code=$2'}) LIMIT 1`,
      [tenantId, ref],
    );
    const site = r.rows[0];
    if (!site) return null;
    // Route-matrix refinement: a precise support-center → site route overrides
    // the site's flat travel attributes in the Hybrid SLA when one exists.
    const route = await this.db.query(
      `SELECT code, data FROM datahub_routes
        WHERE tenant_id=$1 AND data->>'toSiteCode'=$2
          AND (data->>'fromCenter'=$3 OR $3 IS NULL)
        ORDER BY (data->>'fromCenter'=$3) DESC LIMIT 1`,
      [tenantId, site.site_code, site.support_center || null],
    );
    if (route.rows[0]) {
      const d = route.rows[0].data || {};
      if (d.baseTravelMinutes != null) site.base_travel_minutes = d.baseTravelMinutes;
      if (d.roadFactor != null) site.road_factor = d.roadFactor;
      if (d.securityFactor != null) site.security_factor = d.securityFactor;
      site.route_code = route.rows[0].code;
    }
    return site;
  }

  async create(tenantId: string, dto: any, actorId?: string) {
    const caseNumber = await this.nextCaseNumber(tenantId, dto.type);
    // C4 — compute SLA from a profile, but honour any SLA the caller already
    // computed (e.g. MDM-aware alarm ingestion) so a richer SLA is never lost.
    const slaClass = dto.sla_class || dto.context?.slaClass || dto.context?.sla_class;
    // Travel-aware Hybrid SLA: if the case names an affected site, the resolution
    // clock includes a DataHub-derived travel allowance (remote/high-risk sites
    // get more time). The full breakdown is snapshotted for audit/reproducibility.
    const site = await this.resolveSite(tenantId, dto);
    const affectedSiteId = site?.id || dto.affected_site_id || null;
    // Tenant-configurable SLA targets/class-factors (Administration → SLA Policies),
    // falling back to the code defaults when not overridden.
    const slaCfg = await this.slaConfig.getEffectiveConfig(tenantId);
    const { sla: computed, breakdown } = computeHybridSla(
      { type: dto.type, priority: dto.priority, slaClass, profile: dto.sla_profile }, site, slaCfg);
    const sla_due_at      = dto.sla_due_at      || computed.sla_due_at;
    const response_due_at = dto.response_due_at ?? computed.response_due_at;
    const restore_due_at  = dto.restore_due_at  ?? computed.restore_due_at;
    const sla_profile     = dto.sla_profile     || computed.sla_profile;
    const sla_breakdown   = dto.sla_breakdown   || breakdown;

    // Resolve requester: prefer explicit dto.requester_id, then resolved actorId (by internal UUID or keycloak_id)
    const requesterId = dto.requester_id || await this.resolveUserId(actorId, tenantId);

    // Assignment is a human decision — a case is never auto-assigned to a random
    // individual. It lands wherever the creator set it: a specific assignee
    // (explicit human choice) and/or a team (its queue, for someone to claim).
    // With neither, it stays unassigned for triage.
    const assigneeId = dto.assignee_id || null;
    const assignedTeamId = dto.assigned_team_id || null;

    const r = await this.db.query(
      `INSERT INTO cases(tenant_id, case_number, type, title, description, status, priority, impact, urgency,
                         category, subcategory, change_type, risk_level, requester_id, assignee_id,
                         assigned_team_id, context, sla_due_at,
                         root_cause_category, root_cause_subcategory, root_cause_description, is_recurring,
                         known_error, workaround, implementation_plan, backout_plan,
                         planned_start_at, planned_end_at, catalog_item, process_instance_id,
                         response_due_at, restore_due_at, sla_profile,
                         parent_case_id, case_relationship, affected_site_id, sla_breakdown, auto_rule)
       VALUES($1,$2,$3,$4,$5,'new',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37) RETURNING *`,
      [tenantId, caseNumber, dto.type, dto.title, dto.description || null,
       dto.priority || 'medium', dto.impact || 'medium', dto.urgency || 'medium',
       dto.category || null, dto.subcategory || null,
       dto.change_type || null, dto.risk_level || null,
       requesterId, assigneeId,
       assignedTeamId, JSON.stringify(dto.context || {}), sla_due_at,
       dto.root_cause_category || null, dto.root_cause_subcategory || null,
       dto.root_cause_description || null, dto.is_recurring || false,
       dto.known_error || false, dto.workaround || null,
       dto.implementation_plan || null, dto.backout_plan || null,
       dto.planned_start_at || null, dto.planned_end_at || null,
       dto.catalog_item || null, dto.process_instance_id || null,
       response_due_at, restore_due_at, sla_profile,
       dto.parent_case_id || null, dto.case_relationship || null,
       affectedSiteId, sla_breakdown ? JSON.stringify(sla_breakdown) : null,
       dto.auto_rule || null],
    );
    const c = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'case', entityId: c.id, action: 'created', actorId, afterState: c });
    await this.kafka.produce('bpm.case.created', { tenantId, caseId: c.id, caseNumber, type: c.type, title: c.title, priority: c.priority, requesterId: c.requester_id });
    // Notify the assignee when a case lands on them at creation (routed or explicit).
    if (c.assignee_id) {
      await this.kafka.produce('bpm.case.assigned', {
        tenantId, caseId: c.id, assigneeId: c.assignee_id, teamId: c.assigned_team_id,
        caseNumber: c.case_number, title: c.title, type: c.type, priority: c.priority,
        slaDueAt: c.sla_due_at, siteCode: c.context?.siteCode, actorId,
      });
    }
    // C1 — link an orchestrating process so task progress drives the case.
    const linked = await this.maybeStartProcess(tenantId, c, dto, actorId);
    // Rule-driven cross-process auto-links (skipped for rule-generated cases).
    if (!dto.auto_rule) await this.evaluateAutoLinks(tenantId, linked || c, actorId);
    return linked || c;
  }

  /** Child cases (Work Orders / sub-tickets) of a parent ticket. */
  async getChildren(tenantId: string, parentId: string) {
    const r = await this.db.query(
      `SELECT c.id, c.case_number, c.type, c.title, c.status, c.priority, c.assignee_id,
              COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email) AS assignee_name,
              c.case_relationship, c.created_at
         FROM cases c
         LEFT JOIN users u ON u.id = c.assignee_id
        WHERE c.tenant_id=$1 AND c.parent_case_id=$2
        ORDER BY c.created_at ASC`,
      [tenantId, parentId],
    );
    return r.rows;
  }

  /**
   * Assign a Work Order from a ticket: creates a child case (type 'work_order')
   * linked to the parent via parent_case_id, inheriting context unless overridden.
   */
  async createWorkOrder(tenantId: string, parentId: string, dto: any, actorId?: string) {
    const parent = await this.findOne(tenantId, parentId); // 404s if parent missing
    return this.create(tenantId, {
      type: 'work_order',
      title: dto.title || `Work Order for ${parent.case_number}`,
      description: dto.description,
      priority: dto.priority || parent.priority,
      category: dto.category || parent.category,
      assignee_id: dto.assignee_id,
      assigned_team_id: dto.assigned_team_id,
      candidate_group: dto.candidate_group,
      context: { ...(parent.context || {}), ...(dto.context || {}), parentCaseNumber: parent.case_number },
      parent_case_id: parentId,
      case_relationship: dto.case_relationship || 'work_order',
    }, actorId);
  }

  // ── Associative links (case_links) ─────────────────────────────────────────
  linkTypes() { return LINK_TYPES; }

  /** All related records of a case, in both directions, with linked-case summary. */
  async getLinks(tenantId: string, caseId: string) {
    const r = await this.db.query(
      `SELECT l.id, l.link_type, 'outgoing' AS direction,
              c.id AS case_id, c.case_number, c.type, c.title, c.status
         FROM case_links l JOIN cases c ON c.id = l.to_case_id
        WHERE l.tenant_id=$1 AND l.from_case_id=$2
       UNION ALL
       SELECT l.id, l.link_type, 'incoming' AS direction,
              c.id, c.case_number, c.type, c.title, c.status
         FROM case_links l JOIN cases c ON c.id = l.from_case_id
        WHERE l.tenant_id=$1 AND l.to_case_id=$2
        ORDER BY direction, link_type`,
      [tenantId, caseId],
    );
    return r.rows;
  }

  /** Link this case to another (typed, directional). Idempotent on (from,to,type). */
  async addLink(tenantId: string, fromId: string, dto: { toCaseId?: string; to_case_id?: string; linkType?: string; link_type?: string }, actorId?: string) {
    const toId = dto.toCaseId || dto.to_case_id;
    if (!toId) throw new BadRequestException('toCaseId is required');
    if (toId === fromId) throw new BadRequestException('A case cannot be linked to itself');
    const linkType = dto.linkType || dto.link_type || 'related_to';
    await this.findOne(tenantId, fromId);   // 404 if source missing
    await this.findOne(tenantId, toId);      // 404 if target missing
    const actor = await this.resolveUserId(actorId, tenantId);
    const r = await this.db.query(
      `INSERT INTO case_links(tenant_id, from_case_id, to_case_id, link_type, created_by)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (from_case_id, to_case_id, link_type) DO NOTHING
       RETURNING *`,
      [tenantId, fromId, toId, linkType, actor],
    );
    await this.audit.log({ tenantId, entityType: 'case', entityId: fromId, action: 'link.added', actorId, afterState: { toId, linkType } });
    return r.rows[0] || { ok: true, duplicate: true };
  }

  async removeLink(tenantId: string, caseId: string, linkId: string, actorId?: string) {
    await this.db.query(
      `DELETE FROM case_links WHERE id=$1 AND tenant_id=$2 AND (from_case_id=$3 OR to_case_id=$3)`,
      [linkId, tenantId, caseId],
    );
    await this.audit.log({ tenantId, entityType: 'case', entityId: caseId, action: 'link.removed', actorId, afterState: { linkId } });
    return { ok: true };
  }

  /**
   * C1 — start the orchestrating process for a new case and link it back.
   * Opt-in via CASE_AUTO_PROCESS (default off) plus the type→slug map, or an
   * explicit dto.process_slug. Only starts when an active definition exists.
   * Fail-open: a process-start failure must never block case creation.
   */
  // ── Rule-driven cross-process auto-links ────────────────────────────────────
  // Minimum recurring incidents (same CI/service, 30d) that spawn a Problem.
  private readonly REPEAT_INCIDENT_THRESHOLD = 3;

  /** Has the source case already spawned a linked case of `type` (dedup guard)? */
  private async hasLinkedType(tenantId: string, fromId: string, type: string): Promise<boolean> {
    const r = await this.db.query(
      `SELECT 1 FROM case_links l JOIN cases c ON c.id=l.to_case_id
        WHERE l.tenant_id=$1 AND l.from_case_id=$2 AND c.type=$3 LIMIT 1`,
      [tenantId, fromId, type],
    );
    return r.rowCount > 0;
  }

  /** Create a linked case of a target type and record provenance + a work note. */
  private async spawnLinked(tenantId: string, source: any, rule: string, linkType: string, dto: any, actorId?: string) {
    const child = await this.create(tenantId, { ...dto, auto_rule: rule, context: { ...(dto.context || {}), autoFromCase: source.case_number } }, actorId);
    await this.addLink(tenantId, source.id, { toCaseId: child.id, linkType }, actorId);
    await this.addComment(tenantId, source.id, await this.resolveUserId(actorId, tenantId) || '',
      `Auto-created ${child.type} ${child.case_number} (rule: ${rule}).`, true);
    await this.kafka.produce('bpm.case.auto_linked', {
      tenantId, rule, sourceId: source.id, sourceNumber: source.case_number,
      childId: child.id, childNumber: child.case_number, childType: child.type,
    });
    this.logger.log(`Auto-link [${rule}]: ${source.case_number} → ${child.case_number}`);
    return child;
  }

  /**
   * Evaluate cross-process rules against a case and create-or-link related cases.
   * Each rule is independently guarded by a dedup check and wrapped so a failure
   * never breaks the originating case operation.
   */
  private async evaluateAutoLinks(tenantId: string, c: any, actorId?: string) {
    const ctx = c.context || {};
    // Rule 1 — asset movement needing a security escort → spawn a Convoy.
    if (c.type === 'asset_movement' && (ctx.escortRequired === true || ctx.escortRequired === 'true')) {
      try {
        if (!(await this.hasLinkedType(tenantId, c.id, 'convoy'))) {
          await this.spawnLinked(tenantId, c, 'movement_escort_convoy', 'requires', {
            type: 'convoy', priority: c.priority || 'medium',
            title: `Convoy for ${c.case_number}: ${ctx.fromSite || '?'} → ${ctx.toSite || '?'}`,
            context: { route: `${ctx.fromSite || '?'} → ${ctx.toSite || '?'}`, departureWindow: 'TBD', highRisk: !!ctx.highRisk },
          }, actorId);
        }
      } catch (e: any) { this.logger.warn(`auto-link movement_escort_convoy failed: ${e.message}`); }
    }

    // Rule 2 — a security audit that flags a missing asset → spawn a Theft case.
    if (c.type === 'security_audit' && ctx.missingAssetRef) {
      try {
        if (!(await this.hasLinkedType(tenantId, c.id, 'theft'))) {
          await this.spawnLinked(tenantId, c, 'audit_missing_asset_theft', 'spawned', {
            type: 'theft', priority: 'high',
            title: `Suspected theft: ${ctx.missingAssetRef} (from audit ${c.case_number})`,
            context: { assetRef: ctx.missingAssetRef, siteCode: ctx.siteCode, incidentSummary: `Asset ${ctx.missingAssetRef} found missing during security audit ${c.case_number}.` },
          }, actorId);
        }
      } catch (e: any) { this.logger.warn(`auto-link audit_missing_asset_theft failed: ${e.message}`); }
    }

    // Rule 3 — N recurring incidents for the same CI/service (30d) → spawn a Problem.
    if (c.type === 'incident') {
      const key = ctx.affectedService || ctx.affectedHostId || ctx.siteCode;
      if (key) {
        try {
          const recent = await this.db.query(
            `SELECT id, case_number FROM cases
              WHERE tenant_id=$1 AND type='incident' AND status NOT IN ('cancelled')
                AND created_at > NOW() - INTERVAL '30 days'
                AND (context->>'affectedService'=$2 OR context->>'affectedHostId'=$2 OR context->>'siteCode'=$2)
              ORDER BY created_at DESC`,
            [tenantId, String(key)],
          );
          // Already a problem for this key? (dedup across the recurring set)
          const existing = await this.db.query(
            `SELECT 1 FROM cases WHERE tenant_id=$1 AND type='problem' AND auto_rule='repeat_incident_problem'
               AND status NOT IN ('resolved','closed','cancelled') AND context->>'autoProblemKey'=$2 LIMIT 1`,
            [tenantId, String(key)],
          );
          if (recent.rowCount >= this.REPEAT_INCIDENT_THRESHOLD && existing.rowCount === 0) {
            const problem = await this.spawnLinked(tenantId, c, 'repeat_incident_problem', 'escalated_to', {
              type: 'problem', priority: c.priority || 'high',
              title: `Recurring incidents: ${key} (${recent.rowCount} in 30d)`,
              context: { autoProblemKey: String(key), affectedService: String(key), symptom: `${recent.rowCount} recurring incidents for ${key} within 30 days.` },
            }, actorId);
            // Link the sibling incidents to the problem too.
            for (const inc of recent.rows) {
              if (inc.id === c.id) continue;
              try { await this.addLink(tenantId, inc.id, { toCaseId: problem.id, linkType: 'escalated_to' }, actorId); } catch { /* ignore dup */ }
            }
          }
        } catch (e: any) { this.logger.warn(`auto-link repeat_incident_problem failed: ${e.message}`); }
      }
    }
  }

  private async maybeStartProcess(tenantId: string, c: any, dto: any, actorId?: string): Promise<any | null> {
    if (c.process_instance_id) return null; // already linked
    // An explicit process_slug (e.g. a catalog request) always starts its process.
    // Otherwise, auto-start only for types allowed by CASE_AUTO_PROCESS:
    //   unset/"false" → none · "true"/"all" → every TYPE_PROCESS type ·
    //   comma list (e.g. "request,change") → only those types (selective).
    const slug = dto.process_slug || (autoProcessAllowed(c.type) ? TYPE_PROCESS[c.type] : undefined);
    if (!slug) return null;
    try {
      const def = await this.db.query(
        `SELECT id FROM process_definitions WHERE tenant_id=$1 AND slug=$2 AND status='active' LIMIT 1`,
        [tenantId, slug],
      );
      if (!def.rows.length) {
        // An explicit slug (e.g. from a catalog request) that matches no active
        // definition is a misconfiguration — surface it rather than silently
        // creating an orphan case with no workflow. (The auto-path stays quiet.)
        if (dto.process_slug) {
          this.logger.warn(`Case ${c.case_number}: requested process_slug '${slug}' has no active definition — case created without a process`);
        }
        return null;
      }
      const base = process.env.BPM_ORCHESTRATOR_URL || 'http://bpm-orchestrator:3003';
      const resp = await axios.post(`${base}/instances`, {
        slug,
        businessKey: c.case_number,
        caseId: c.id,
        // Start-form values captured at intake live in the case context — seed
        // them as process variables so downstream tasks/gateways can use them.
        variables: { ...(c.context || {}), caseId: c.id, caseNumber: c.case_number, title: c.title, priority: c.priority },
      }, {
        headers: { 'x-tenant-id': tenantId, ...(actorId ? { 'x-user-id': actorId } : {}) },
        timeout: 5000,
      });
      const instanceId = resp.data?.id;
      if (!instanceId) return null;
      // The orchestrator has already started (and stored case_id on) the instance.
      // If writing the back-link here fails, the instance is orphaned only from
      // the case side — recoverable from the orchestrator's case_id. Log at ERROR
      // with both ids so it can be reconciled rather than silently lost.
      try {
        const upd = await this.db.query(
          `UPDATE cases SET process_instance_id=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *`,
          [instanceId, c.id, tenantId],
        );
        this.logger.log(`Case ${c.case_number} linked to process '${slug}' instance ${instanceId}`);
        return upd.rows[0];
      } catch (linkErr: any) {
        this.logger.error(
          `Case ${c.case_number} (${c.id}): process '${slug}' instance ${instanceId} STARTED but back-link UPDATE failed — ` +
          `reconcile from orchestrator case_id. ${linkErr.message}`,
        );
        return null;
      }
    } catch (e: any) {
      this.logger.warn(`Auto-start process '${slug}' for case ${c.case_number} failed: ${e.message}`);
      return null;
    }
  }

  // Optimistic concurrency — fast pre-check that rejects an obviously stale
  // expected_version before doing any work. NOT authoritative on its own: pair
  // it with versionClause() + a rowCount check so the UPDATE is the real guard
  // (the read-then-write window between findOne and UPDATE is otherwise racy).
  private assertVersion(existing: any, expected: any) {
    if (expected != null && existing?.version != null && Number(expected) !== Number(existing.version)) {
      throw new ConflictException('This case was modified by someone else. Please reload and try again.');
    }
  }

  /**
   * SQL fragment that turns an UPDATE into an atomic compare-and-swap on the
   * expected version. Returns ` AND version=N` for a supplied (integer) version,
   * else ''. The caller MUST treat a 0-row UPDATE as a version conflict.
   */
  private versionClause(expected: any): string {
    if (expected == null) return '';
    const v = Number(expected);
    if (!Number.isInteger(v)) throw new BadRequestException('Invalid expected_version');
    return ` AND version=${v}`;
  }

  private static readonly CONFLICT_MSG = 'This case was modified by someone else. Please reload and try again.';

  async update(tenantId: string, id: string, dto: any, actorId?: string) {
    const existing = await this.findOne(tenantId, id);
    this.assertVersion(existing, dto?.expected_version);
    const fields: string[] = [];
    const vals: any[] = [id, tenantId];
    let i = 3;
    const updatable = ['title','description','priority','impact','urgency','category','subcategory','change_type','risk_level','assignee_id','assigned_team_id','root_cause_category','root_cause_subcategory','root_cause_description','is_recurring','known_error','workaround','implementation_plan','backout_plan','planned_start_at','planned_end_at','catalog_item','resolution_code','resolution_notes','escalated','escalated_at','process_instance_id','sla_due_at','sla_profile','response_due_at','restore_due_at','parent_case_id','case_relationship'];
    for (const key of updatable) {
      if (dto[key] !== undefined) { fields.push(`${key}=$${i++}`); vals.push(dto[key]); }
    }
    if (dto.context !== undefined) { fields.push(`context=$${i++}`); vals.push(JSON.stringify(dto.context)); }
    if (!fields.length) return existing;
    fields.push(`version=version+1`);
    fields.push(`updated_at=NOW()`);
    const r = await this.db.query(
      `UPDATE cases SET ${fields.join(',')} WHERE id=$1 AND tenant_id=$2${this.versionClause(dto?.expected_version)} RETURNING *`,
      vals,
    );
    // Atomic CAS: 0 rows with an expected_version means a concurrent writer won.
    if (!r.rows[0]) throw new ConflictException(CaseService.CONFLICT_MSG);
    const updated = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'case', entityId: id, action: 'updated', actorId, beforeState: existing, afterState: updated });
    // Re-evaluate auto-links — a field set after creation (e.g. a missing-asset
    // finding) may now match a rule. Dedup keeps this idempotent.
    if (!updated.auto_rule) await this.evaluateAutoLinks(tenantId, updated, actorId);
    return updated;
  }

  async transition(tenantId: string, id: string, newStatus: string, dto: { comment?: string; resolution?: string; resolution_code?: string; resolution_notes?: string }, actorId?: string) {
    const c = await this.findOne(tenantId, id);
    this.assertVersion(c, (dto as any)?.expected_version);
    const allowed = VALID_TRANSITIONS[c.status] || [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(`Cannot transition from '${c.status}' to '${newStatus}'`);
    }
    // A case reaching a terminal state auto-closes any open SLA pause interval.
    if (c.sla_paused && ['resolved', 'closed', 'cancelled'].includes(newStatus)) {
      await this.doResume(tenantId, c, undefined, actorId, 'sla.resumed.auto');
    }
    const extraFields: string[] = [];
    const extraVals: any[] = [];
    let idx = 3;
    if (newStatus === 'resolved') {
      extraFields.push(`resolved_at=NOW()`);
      if (dto.resolution_code) { extraFields.push(`resolution_code=$${idx++}`); extraVals.push(dto.resolution_code); }
      if (dto.resolution_notes) { extraFields.push(`resolution_notes=$${idx++}`); extraVals.push(dto.resolution_notes); }
    }
    if (newStatus === 'closed') { extraFields.push(`closed_at=NOW()`); }

    const updates = [`status='${newStatus}'`, `version=version+1`, `updated_at=NOW()`, ...extraFields].join(',');
    // Resolve the comment author to an internal id (case_comments.author_id is an
    // internal user id everywhere else; a raw Keycloak sub here breaks the join).
    const commentAuthor = dto.comment ? (await this.resolveUserId(actorId, tenantId)) : null;
    // Atomic: the status change and its work-note land together (or not at all),
    // and the status UPDATE is a compare-and-swap on the expected version.
    await this.db.withTransaction(async (cx) => {
      const u = await cx.query(
        `UPDATE cases SET ${updates} WHERE id=$1 AND tenant_id=$2${this.versionClause((dto as any)?.expected_version)}`,
        [id, tenantId, ...extraVals],
      );
      if (u.rowCount === 0) throw new ConflictException(CaseService.CONFLICT_MSG);
      if (dto.comment) {
        await this.addComment(tenantId, id, commentAuthor || '', dto.comment, false, cx);
      }
    });
    await this.audit.log({ tenantId, entityType: 'case', entityId: id, action: `status.${newStatus}`, actorId, beforeState: { status: c.status }, afterState: { status: newStatus } });
    await this.kafka.produce('bpm.case.status_changed', {
      tenantId, caseId: id, caseNumber: c.case_number, title: c.title, priority: c.priority,
      from: c.status, to: newStatus, requesterId: c.requester_id,
      resolutionCode: dto.resolution_code, resolutionNotes: dto.resolution_notes, actorId,
    });
    // Major incident resolved → open a Post-Incident Review and notify stakeholders.
    if (newStatus === 'resolved' && c.major_incident) {
      await this.handleMajorResolved(tenantId, c, dto, actorId);
    }
    return this.findOne(tenantId, id);
  }

  /**
   * Declare a Major Incident (P1): escalate to critical, assign a Major Incident
   * Manager (explicit or routed from the manager group), flag the case and fan
   * out to management/stakeholders. Idempotent — re-declaring is rejected.
   */
  async declareMajorIncident(tenantId: string, id: string, dto: { reason?: string; mimId?: string; expected_version?: number }, actorId?: string) {
    const c = await this.findOne(tenantId, id);
    this.assertVersion(c, dto?.expected_version);
    if (c.major_incident) throw new BadRequestException('This case is already a major incident');
    if (['resolved', 'closed', 'cancelled'].includes(c.status)) {
      throw new BadRequestException(`Cannot declare a major incident on a ${c.status} case`);
    }
    let mimId = dto.mimId || null;
    if (!mimId) {
      try { mimId = (await this.routing.resolve(tenantId, { group: 'manager' })).assigneeId; }
      catch (e: any) { this.logger.warn(`MIM routing failed: ${e.message}`); }
    }
    const mi = await this.db.query(
      `UPDATE cases SET major_incident=true, declared_major_at=NOW(), mim_id=$3,
              priority='critical', impact='high', urgency='high', escalated=true, escalated_at=NOW(),
              assignee_id=COALESCE(assignee_id,$3), version=version+1, updated_at=NOW()
        WHERE id=$1 AND tenant_id=$2${this.versionClause(dto?.expected_version)}`,
      [id, tenantId, mimId],
    );
    if (mi.rowCount === 0) throw new ConflictException(CaseService.CONFLICT_MSG);
    const actor = await this.resolveUserId(actorId, tenantId);
    if (dto.reason) await this.addComment(tenantId, id, actor || '', `Major Incident declared: ${dto.reason}`, true);
    let mimName: string | undefined;
    if (mimId) {
      const u = await this.db.query(`SELECT NULLIF(TRIM(first_name||' '||last_name),'') AS n FROM users WHERE id=$1`, [mimId]);
      mimName = u.rows[0]?.n;
    }
    await this.audit.log({ tenantId, entityType: 'case', entityId: id, action: 'major.declared', actorId, afterState: { mimId, reason: dto.reason } });
    await this.kafka.produce('bpm.case.major_declared', {
      tenantId, caseId: id, caseNumber: c.case_number, title: c.title, priority: 'critical',
      siteCode: c.context?.siteCode, requesterId: c.requester_id, assigneeId: c.assignee_id,
      mimId, mimName, reason: dto.reason, actorId,
    });
    this.logger.log(`Major Incident declared: ${c.case_number} (MIM ${mimName || mimId || 'unassigned'})`);
    return this.findOne(tenantId, id);
  }

  /** On major-incident resolution: spawn a PIR problem record + notify stakeholders. */
  private async handleMajorResolved(tenantId: string, c: any, dto: any, actorId?: string) {
    let pir: any = null;
    try {
      pir = await this.create(tenantId, {
        type: 'problem',
        title: `Post-Incident Review: ${c.case_number} — ${c.title}`,
        description: `Post-Incident Review for major incident ${c.case_number}.\nResolution: ${dto.resolution_notes || dto.resolution_code || 'n/a'}`,
        priority: 'high',
        context: { ...(c.context || {}), pirForCase: c.case_number },
      }, actorId);
      await this.addLink(tenantId, c.id, { toCaseId: pir.id, linkType: 'spawned' }, actorId);
    } catch (e: any) {
      this.logger.warn(`PIR creation for ${c.case_number} failed: ${e.message}`);
    }
    await this.kafka.produce('bpm.case.major_resolved', {
      tenantId, caseId: c.id, caseNumber: c.case_number, title: c.title,
      requesterId: c.requester_id, assigneeId: c.assignee_id, mimId: c.mim_id,
      resolutionNotes: dto.resolution_notes, pirNumber: pir?.case_number, actorId,
    });
  }

  // ── Shared Vendor Escalation (invocable from any case) ──────────────────────

  /**
   * Hand a case off to a third-party vendor: records the escalation with the
   * vendor's SLA clock + contacts (from datahub_vendors) and, optionally, pauses
   * the case SLA while we wait on them (stop-the-clock, reason 'waiting_vendor').
   */
  async raiseVendorEscalation(tenantId: string, caseId: string, dto: { vendorCode: string; reason?: string; pauseSla?: boolean }, actorId?: string) {
    const c = await this.findOne(tenantId, caseId);
    const v = await this.db.query(
      `SELECT code, name, data FROM datahub_vendors WHERE tenant_id=$1 AND code=$2 AND active=true`,
      [tenantId, dto.vendorCode],
    );
    if (!v.rows[0]) throw new BadRequestException(`Vendor not found: ${dto.vendorCode}`);
    const vendor = v.rows[0]; const d = vendor.data || {};
    const slaHours = Number(d.slaHours) || null;
    const dueAt = slaHours ? new Date(Date.now() + slaHours * 3600 * 1000).toISOString() : null;
    const actor = await this.resolveUserId(actorId, tenantId);

    let pausedCase = false;
    if (dto.pauseSla && !c.sla_paused && !['resolved', 'closed', 'cancelled'].includes(c.status)) {
      try { await this.pauseSla(tenantId, caseId, { reason: 'waiting_vendor', note: `Vendor: ${vendor.name}` }, actorId); pausedCase = true; }
      catch (e: any) { this.logger.warn(`Pause-on-vendor-escalation failed: ${e.message}`); }
    }

    const r = await this.db.query(
      `INSERT INTO case_vendor_escalations(tenant_id, case_id, vendor_code, vendor_name, reason, status,
              contact_email, contact_phone, vendor_sla_hours, vendor_sla_due_at, paused_case, raised_by)
       VALUES($1,$2,$3,$4,$5,'open',$6,$7,$8,$9,$10,$11) RETURNING *`,
      [tenantId, caseId, vendor.code, vendor.name, dto.reason || null,
       d.escalationEmail || null, d.escalationPhone || null, slaHours, dueAt, pausedCase, actor],
    );
    const esc = r.rows[0];
    await this.addComment(tenantId, caseId, actor || '', `Escalated to vendor ${vendor.name}${dto.reason ? `: ${dto.reason}` : ''}.`, true);
    await this.audit.log({ tenantId, entityType: 'case', entityId: caseId, action: 'vendor.escalated', actorId, afterState: { vendor: vendor.code, reason: dto.reason } });
    await this.kafka.produce('bpm.case.vendor_escalated', {
      tenantId, caseId, caseNumber: c.case_number, assigneeId: c.assignee_id,
      vendorName: vendor.name, reason: dto.reason, vendorSlaDueAt: dueAt,
      contactEmail: d.escalationEmail, contactPhone: d.escalationPhone,
    });
    this.logger.log(`Vendor escalation: ${c.case_number} → ${vendor.name}${pausedCase ? ' (case SLA paused)' : ''}`);
    return esc;
  }

  /** Advance a vendor escalation (acknowledged/resolved/cancelled); resolving resumes a vendor-paused case SLA. */
  async updateVendorEscalation(tenantId: string, caseId: string, escId: string, dto: { status?: string; notes?: string }, actorId?: string) {
    const e = (await this.db.query(`SELECT * FROM case_vendor_escalations WHERE id=$1 AND case_id=$2 AND tenant_id=$3`, [escId, caseId, tenantId])).rows[0];
    if (!e) throw new NotFoundException('Vendor escalation not found');
    const status = dto.status || e.status;
    const sets = ['status=$4', 'updated_at=NOW()']; const vals: any[] = [escId, caseId, tenantId, status];
    if (dto.notes !== undefined) { vals.push(dto.notes); sets.push(`notes=$${vals.length}`); }
    if (status === 'acknowledged' && !e.acknowledged_at) sets.push('acknowledged_at=NOW()');
    if ((status === 'resolved' || status === 'cancelled') && !e.resolved_at) sets.push('resolved_at=NOW()');
    await this.db.query(`UPDATE case_vendor_escalations SET ${sets.join(', ')} WHERE id=$1 AND case_id=$2 AND tenant_id=$3`, vals);

    if ((status === 'resolved' || status === 'cancelled') && e.paused_case) {
      const c = await this.findOne(tenantId, caseId);
      if (c.sla_paused && c.sla_paused_reason === 'waiting_vendor') {
        try { await this.resumeSla(tenantId, caseId, { note: `Vendor ${e.vendor_name} responded` }, actorId); }
        catch (err: any) { this.logger.warn(`Resume-after-vendor failed: ${err.message}`); }
      }
    }
    if (status === 'resolved') {
      const c = await this.findOne(tenantId, caseId);
      await this.kafka.produce('bpm.case.vendor_resolved', {
        tenantId, caseId, caseNumber: c.case_number, assigneeId: c.assignee_id,
        vendorName: e.vendor_name, notes: dto.notes,
      });
    }
    await this.audit.log({ tenantId, entityType: 'case', entityId: caseId, action: `vendor.${status}`, actorId });
    return (await this.db.query(`SELECT * FROM case_vendor_escalations WHERE id=$1`, [escId])).rows[0];
  }

  async getVendorEscalations(tenantId: string, caseId: string) {
    const r = await this.db.query(
      `SELECT * FROM case_vendor_escalations WHERE tenant_id=$1 AND case_id=$2 ORDER BY raised_at DESC`,
      [tenantId, caseId],
    );
    return r.rows;
  }

  async assign(tenantId: string, id: string, assigneeId: string | null, teamId: string | null, actorId?: string) {
    const c = await this.findOne(tenantId, id);
    // The assignee may arrive as a Keycloak sub (e.g. a claim sends the caller's
    // user.id). Resolve it to an internal users.id so assignee_id is consistent
    // and joinable — otherwise the case shows "Unassigned" and never matches the
    // claimer's "my work".
    const resolvedAssignee = assigneeId ? await this.resolveUserId(assigneeId, tenantId) : null;
    await this.db.query(
      `UPDATE cases SET assignee_id=$1, assigned_team_id=$2, version=version+1, updated_at=NOW() WHERE id=$3 AND tenant_id=$4`,
      [resolvedAssignee, teamId, id, tenantId],
    );
    await this.audit.log({ tenantId, entityType: 'case', entityId: id, action: 'assigned', actorId, afterState: { assigneeId: resolvedAssignee, teamId } });
    await this.kafka.produce('bpm.case.assigned', {
      tenantId, caseId: id, assigneeId: resolvedAssignee, teamId, caseNumber: c.case_number, title: c.title,
      type: c.type, priority: c.priority, slaDueAt: c.sla_due_at, siteCode: c.context?.siteCode, actorId,
    });
    return this.findOne(tenantId, id);
  }

  async addComment(tenantId: string, caseId: string, authorId: string, body: string, internal = false,
                   executor: { query: (text: string, params?: any[]) => Promise<any> } = this.db) {
    const r = await executor.query(
      `INSERT INTO case_comments(tenant_id, case_id, author_id, body, internal) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [tenantId, caseId, authorId, body, internal],
    );
    return r.rows[0];
  }

  async getComments(tenantId: string, caseId: string, includeInternal = false) {
    await this.findOne(tenantId, caseId); // ensure exists
    const r = await this.db.query(
      `SELECT cc.*, (u.first_name || ' ' || u.last_name) as author_name FROM case_comments cc
       LEFT JOIN users u ON u.id=cc.author_id
       WHERE cc.case_id=$1 AND cc.tenant_id=$2 ${includeInternal ? '' : 'AND cc.internal=false'}
       ORDER BY cc.created_at ASC`,
      [caseId, tenantId],
    );
    return r.rows;
  }

  // ── SLA pause / exclusion (framework §16 — stop-the-clock) ──────────────────

  /** Allowed exclusion reasons; the clock is paused while one of these holds. */
  async getPauseReasons() {
    return [
      { code: 'waiting_customer',  label: 'Awaiting customer / requester' },
      { code: 'waiting_parts',     label: 'Awaiting spare parts' },
      { code: 'waiting_access',    label: 'Awaiting site access / security clearance' },
      { code: 'waiting_vendor',    label: 'Awaiting third-party / vendor' },
      { code: 'waiting_approval',  label: 'Awaiting approval / change window' },
      { code: 'planned_window',    label: 'Outside agreed maintenance window' },
      { code: 'on_hold_other',     label: 'On hold — other (see note)' },
    ];
  }

  /** Pause the SLA clock. No-op-safe: re-pausing a paused case is rejected. */
  async pauseSla(tenantId: string, id: string, dto: { reason: string; note?: string }, actorId?: string) {
    const c = await this.findOne(tenantId, id);
    if (['resolved', 'closed', 'cancelled'].includes(c.status)) {
      throw new BadRequestException(`Cannot pause SLA on a ${c.status} case`);
    }
    if (c.sla_paused) throw new BadRequestException('SLA is already paused');
    const reason = dto.reason || 'on_hold_other';
    const actor = await this.resolveUserId(actorId, tenantId);
    // Atomic: open the pause interval and flip the case flag together, else the
    // scheduler keeps counting (flag false) against an open interval, or vice versa.
    await this.db.withTransaction(async (cx) => {
      await cx.query(
        `INSERT INTO case_sla_pauses(tenant_id, case_id, reason, note, paused_by) VALUES($1,$2,$3,$4,$5)`,
        [tenantId, id, reason, dto.note || null, actor],
      );
      await cx.query(
        `UPDATE cases SET sla_paused=true, sla_paused_at=NOW(), sla_paused_reason=$3,
                version=version+1, updated_at=NOW() WHERE id=$1 AND tenant_id=$2`,
        [id, tenantId, reason],
      );
    });
    await this.audit.log({ tenantId, entityType: 'case', entityId: id, action: 'sla.paused', actorId, afterState: { reason, note: dto.note } });
    await this.kafka.produce('bpm.case.sla_paused', { tenantId, caseId: id, caseNumber: c.case_number, reason, actorId });
    return this.findOne(tenantId, id);
  }

  /**
   * Resume the SLA clock: close the open interval, accumulate paused minutes and
   * push every still-pending due date out by the same amount (net-time fairness).
   */
  async resumeSla(tenantId: string, id: string, dto: { note?: string }, actorId?: string) {
    const c = await this.findOne(tenantId, id);
    if (!c.sla_paused) throw new BadRequestException('SLA is not paused');
    return this.doResume(tenantId, c, dto.note, actorId, 'sla.resumed');
  }

  /** Shared resume mechanics — also used to auto-resume when a case is resolved. */
  private async doResume(tenantId: string, c: any, note: string | undefined, actorId: string | undefined, action: string) {
    const actor = await this.resolveUserId(actorId, tenantId);
    const pausedAt = new Date(c.sla_paused_at).getTime();
    const minutes = Math.max(0, Math.round((Date.now() - pausedAt) / 60_000));
    // Atomic: close the interval and shift the due dates together — else the
    // paused minutes are lost (interval closed but clock not extended) or the
    // case looks resumed while the interval stays open.
    await this.db.withTransaction(async (cx) => {
      await cx.query(
        `UPDATE case_sla_pauses SET resumed_at=NOW(), duration_minutes=$3, resumed_by=$4, note=COALESCE($5, note)
         WHERE case_id=$1 AND tenant_id=$2 AND resumed_at IS NULL`,
        [c.id, tenantId, minutes, actor, note || null],
      );
      // Push the breach clock forward by the paused interval so only net time counts.
      await cx.query(
        `UPDATE cases SET sla_paused=false, sla_paused_at=NULL, sla_paused_reason=NULL,
                sla_at_risk=false, sla_at_risk_at=NULL,
                sla_paused_total_minutes = sla_paused_total_minutes + $3,
                sla_due_at      = sla_due_at      + ($3 || ' minutes')::interval,
                response_due_at = CASE WHEN response_due_at IS NULL THEN NULL ELSE response_due_at + ($3 || ' minutes')::interval END,
                restore_due_at  = CASE WHEN restore_due_at  IS NULL THEN NULL ELSE restore_due_at  + ($3 || ' minutes')::interval END,
                version=version+1, updated_at=NOW()
         WHERE id=$1 AND tenant_id=$2`,
        [c.id, tenantId, minutes],
      );
    });
    await this.audit.log({ tenantId, entityType: 'case', entityId: c.id, action, actorId, afterState: { paused_minutes: minutes } });
    await this.kafka.produce('bpm.case.sla_resumed', { tenantId, caseId: c.id, caseNumber: c.case_number, pausedMinutes: minutes, actorId });
    return minutes;
  }

  /** Pause timeline for a case (closed + any open interval). */
  async getSlaPauses(tenantId: string, id: string) {
    const r = await this.db.query(
      `SELECT id, reason, note, paused_at, resumed_at, duration_minutes, paused_by, resumed_by
         FROM case_sla_pauses WHERE tenant_id=$1 AND case_id=$2 ORDER BY paused_at ASC`,
      [tenantId, id],
    );
    return r.rows;
  }

  async checkSlaBreaches(tenantId: string) {
    const overdue = await this.db.query(
      // Paused cases are excluded — their clock is frozen until resumed.
      `SELECT id, case_number, type, priority, assignee_id, sla_due_at FROM cases
       WHERE tenant_id=$1 AND status NOT IN ('resolved','closed','cancelled')
         AND sla_paused=false AND sla_due_at < NOW() AND breached=false`,
      [tenantId],
    );
    for (const c of overdue.rows) {
      await this.db.query(`UPDATE cases SET breached=true, updated_at=NOW() WHERE id=$1`, [c.id]);
      await this.kafka.produce('bpm.case.sla_breach', {
        tenantId, caseId: c.id, caseNumber: c.case_number, type: c.type,
        priority: c.priority, assigneeId: c.assignee_id, dueAt: c.sla_due_at,
      });
      this.logger.warn(`SLA breach: ${c.case_number}`);
    }
    return overdue.rows.length;
  }

  /**
   * Flag cases approaching their SLA target (proactive warning) — once per case,
   * when remaining time drops below 20% of the total window (floor 15 min) and
   * before the actual breach. Paused/breached cases are excluded; the flag is
   * cleared on resume so it re-evaluates against the new due date.
   */
  async checkSlaAtRisk(tenantId: string) {
    const atRisk = await this.db.query(
      `SELECT id, case_number, type, priority, assignee_id, sla_due_at,
              GREATEST(0, ROUND(EXTRACT(EPOCH FROM (sla_due_at - NOW())) / 60))::int AS minutes_left
         FROM cases
        WHERE tenant_id=$1 AND status NOT IN ('resolved','closed','cancelled')
          AND sla_paused=false AND breached=false AND sla_at_risk=false
          AND sla_due_at > NOW()
          AND NOW() >= sla_due_at - GREATEST((sla_due_at - created_at) * 0.2, INTERVAL '15 minutes')`,
      [tenantId],
    );
    for (const c of atRisk.rows) {
      await this.db.query(`UPDATE cases SET sla_at_risk=true, sla_at_risk_at=NOW(), updated_at=NOW() WHERE id=$1`, [c.id]);
      await this.kafka.produce('bpm.case.sla_at_risk', {
        tenantId, caseId: c.id, caseNumber: c.case_number, type: c.type,
        priority: c.priority, assigneeId: c.assignee_id, dueAt: c.sla_due_at, minutesLeft: c.minutes_left,
      });
      this.logger.warn(`SLA at risk: ${c.case_number} (~${c.minutes_left} min left)`);
    }
    return atRisk.rows.length;
  }

  async getByDivision(tenantId: string) {
    const r = await this.db.query(
      `WITH RECURSIVE unit_division AS (
         SELECT id AS unit_id, id AS division_id, name AS division_name
         FROM org_units
         WHERE type = 'division' AND tenant_id = $1
         UNION ALL
         SELECT o.id AS unit_id, ud.division_id, ud.division_name
         FROM org_units o
         JOIN unit_division ud ON o.parent_id = ud.unit_id
         WHERE o.tenant_id = $1
       )
       SELECT ud.division_id, ud.division_name AS division, COUNT(c.id)::int AS count
       FROM cases c
       JOIN unit_division ud ON ud.unit_id = c.assigned_team_id
       WHERE c.tenant_id = $1 AND c.assigned_team_id IS NOT NULL
       GROUP BY ud.division_id, ud.division_name
       ORDER BY count DESC`,
      [tenantId],
    );
    return r.rows;
  }

  async getByDepartment(tenantId: string, divisionId: string) {
    const r = await this.db.query(
      `WITH RECURSIVE dept_subtree AS (
         SELECT id AS unit_id, id AS dept_id, name AS dept_name
         FROM org_units
         WHERE parent_id = $2 AND type = 'department' AND tenant_id = $1
         UNION ALL
         SELECT o.id AS unit_id, ds.dept_id, ds.dept_name
         FROM org_units o
         JOIN dept_subtree ds ON o.parent_id = ds.unit_id
         WHERE o.tenant_id = $1
       )
       SELECT ds.dept_name AS department, COUNT(c.id)::int AS count
       FROM cases c
       JOIN dept_subtree ds ON ds.unit_id = c.assigned_team_id
       WHERE c.tenant_id = $1 AND c.assigned_team_id IS NOT NULL
       GROUP BY ds.dept_name
       ORDER BY count DESC`,
      [tenantId, divisionId],
    );
    return r.rows;
  }

  async getStats(tenantId: string) {
    const [byStatus, byType, overdue, resolvedToday, openCount] = await Promise.all([
      this.db.query(`SELECT status, COUNT(*) as count FROM cases WHERE tenant_id=$1 GROUP BY status`, [tenantId]),
      this.db.query(`SELECT type, COUNT(*) as count FROM cases WHERE tenant_id=$1 GROUP BY type`, [tenantId]),
      this.db.query(`SELECT COUNT(*) as count FROM cases WHERE tenant_id=$1 AND breached=true AND status NOT IN ('resolved','closed','cancelled')`, [tenantId]),
      this.db.query(`SELECT COUNT(*) as count FROM cases WHERE tenant_id=$1 AND status='resolved' AND updated_at >= CURRENT_DATE`, [tenantId]),
      this.db.query(`SELECT COUNT(*) as count FROM cases WHERE tenant_id=$1 AND status NOT IN ('resolved','closed','cancelled')`, [tenantId]),
    ]);
    return {
      byStatus: byStatus.rows,
      byType: byType.rows,
      breachedCount: parseInt(overdue.rows[0].count),
      resolvedToday: parseInt(resolvedToday.rows[0].count),
      openCount: parseInt(openCount.rows[0].count),
    };
  }

  /**
   * Personal queue insight — the signed-in operator's own assigned cases, so they
   * can stay on top of their work. Resolves the actor (Keycloak sub or UUID).
   */
  async getMyQueueStats(tenantId: string, actorId?: string) {
    const uid = await this.resolveUserId(actorId, tenantId);
    if (!uid) return { open: 0, breached: 0, atRisk: 0, dueSoon: 0, paused: 0, resolvedToday: 0, resolved7d: 0, byPriority: [], byType: [], oldestOpenDays: 0, attention: [] };
    const OPEN = `status NOT IN ('resolved','closed','cancelled')`;
    const [tot, byP, byT, att] = await Promise.all([
      this.db.query(
        `SELECT
           count(*) FILTER (WHERE ${OPEN}) AS open,
           count(*) FILTER (WHERE breached AND ${OPEN}) AS breached,
           count(*) FILTER (WHERE sla_at_risk AND NOT breached AND ${OPEN}) AS at_risk,
           count(*) FILTER (WHERE sla_paused AND ${OPEN}) AS paused,
           count(*) FILTER (WHERE ${OPEN} AND NOT breached AND sla_due_at IS NOT NULL AND sla_due_at <= NOW()+INTERVAL '24 hours') AS due_soon,
           count(*) FILTER (WHERE status='resolved' AND resolved_at >= date_trunc('day', NOW())) AS resolved_today,
           count(*) FILTER (WHERE status IN ('resolved','closed') AND resolved_at >= NOW()-INTERVAL '7 days') AS resolved_7d,
           COALESCE(EXTRACT(DAY FROM NOW()-min(created_at) FILTER (WHERE ${OPEN})),0)::int AS oldest_open_days
         FROM cases WHERE tenant_id=$1 AND assignee_id=$2`, [tenantId, uid]),
      this.db.query(`SELECT priority, count(*)::int AS count FROM cases WHERE tenant_id=$1 AND assignee_id=$2 AND ${OPEN} GROUP BY priority`, [tenantId, uid]),
      this.db.query(`SELECT type, count(*)::int AS count FROM cases WHERE tenant_id=$1 AND assignee_id=$2 AND ${OPEN} GROUP BY type ORDER BY count DESC`, [tenantId, uid]),
      this.db.query(
        `SELECT id, case_number, type, title, priority, status, sla_due_at, breached, sla_at_risk
           FROM cases WHERE tenant_id=$1 AND assignee_id=$2 AND ${OPEN}
          ORDER BY breached DESC, sla_at_risk DESC, sla_due_at ASC NULLS LAST LIMIT 6`, [tenantId, uid]),
    ]);
    const s = tot.rows[0];
    return {
      open: +s.open, breached: +s.breached, atRisk: +s.at_risk, paused: +s.paused, dueSoon: +s.due_soon,
      resolvedToday: +s.resolved_today, resolved7d: +s.resolved_7d, oldestOpenDays: +s.oldest_open_days,
      byPriority: byP.rows, byType: byT.rows, attention: att.rows,
    };
  }

  /**
   * The operator's work list: cases assigned to them, plus cases sitting
   * UNCLAIMED in any team they belong to. Sorted most-urgent first. `mine` flags
   * the caller's own; the rest are claimable team-queue items.
   */
  async getMyWork(tenantId: string, actorId?: string) {
    const uid = await this.resolveUserId(actorId, tenantId);
    if (!uid) return [];
    const r = await this.db.query(
      `SELECT c.id, c.case_number, c.type, c.title, c.priority, c.status, c.sla_due_at,
              c.breached, c.sla_at_risk, c.assignee_id, c.assigned_team_id, ou.name AS team_name,
              (c.assignee_id = $2) AS mine
         FROM cases c
         LEFT JOIN org_units ou ON ou.id = c.assigned_team_id
        WHERE c.tenant_id = $1 AND c.status NOT IN ('resolved','closed','cancelled')
          AND ( c.assignee_id = $2
                OR ( c.assignee_id IS NULL
                     AND c.assigned_team_id IN (SELECT org_unit_id FROM user_org_assignments WHERE user_id = $2) ) )
        ORDER BY (c.assignee_id = $2) DESC, c.breached DESC, c.sla_at_risk DESC,
                 CASE c.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                 c.sla_due_at ASC NULLS LAST
        LIMIT 100`,
      [tenantId, uid],
    );
    return r.rows;
  }

  /** Claim an unassigned (team-queue) case to the caller. */
  async claimCase(tenantId: string, caseId: string, actorId?: string) {
    const uid = await this.resolveUserId(actorId, tenantId);
    if (!uid) throw new BadRequestException('Unknown user');
    const c = await this.findOne(tenantId, caseId);
    if (c.assignee_id && c.assignee_id !== uid) throw new BadRequestException('Already claimed by someone else');
    // Team isolation: you may only claim from your OWN team's queue. A case
    // routed to a team you don't belong to is another department's work —
    // cross-team hand-offs go through reassign (cases:assign), not self-claim.
    if (c.assigned_team_id) {
      const member = await this.db.query(
        `SELECT 1 FROM user_org_assignments WHERE user_id=$1 AND org_unit_id=$2 LIMIT 1`,
        [uid, c.assigned_team_id],
      );
      if (!member.rowCount) {
        throw new ForbiddenException(`This case belongs to ${c.team_name || 'another team'}. Ask a manager to reassign it to you.`);
      }
    }
    await this.db.query(
      `UPDATE cases SET assignee_id=$3, version=version+1, updated_at=NOW() WHERE id=$1 AND tenant_id=$2`,
      [caseId, tenantId, uid],
    );
    await this.audit.log({ tenantId, entityType: 'case', entityId: caseId, action: 'claimed', actorId, afterState: { assigneeId: uid } });
    await this.kafka.produce('bpm.case.assigned', {
      tenantId, caseId, assigneeId: uid, teamId: c.assigned_team_id, caseNumber: c.case_number,
      title: c.title, type: c.type, priority: c.priority, slaDueAt: c.sla_due_at, actorId,
    });
    return this.findOne(tenantId, caseId);
  }

  /** Telecom operations overview — SLA health, workload, vendor, spares, security. */
  async getOpsOverview(tenantId: string) {
    const OPEN = `status NOT IN ('resolved','closed','cancelled')`;
    const [sla, byType, byTeam, vendors, vByName, spares, security, workload, capa] = await Promise.all([
      this.db.query(
        `SELECT count(*) FILTER (WHERE breached) AS breached,
                count(*) FILTER (WHERE sla_at_risk AND NOT breached) AS at_risk,
                count(*) FILTER (WHERE sla_paused) AS paused,
                count(*) FILTER (WHERE NOT breached AND NOT sla_at_risk AND NOT sla_paused) AS on_track,
                count(*) AS total
           FROM cases WHERE tenant_id=$1 AND ${OPEN}`, [tenantId]),
      this.db.query(
        `SELECT type, count(*) FILTER (WHERE ${OPEN}) AS open,
                count(*) FILTER (WHERE breached AND ${OPEN}) AS breached
           FROM cases WHERE tenant_id=$1 GROUP BY type HAVING count(*) FILTER (WHERE ${OPEN}) > 0
          ORDER BY open DESC`, [tenantId]),
      this.db.query(
        `SELECT ro.key AS team, count(DISTINCT c.id) AS open
           FROM cases c JOIN user_roles ur ON ur.user_id=c.assignee_id JOIN roles ro ON ro.id=ur.role_id
          WHERE c.tenant_id=$1 AND c.${OPEN} AND ro.key IN ('noc','field_engineer','security','logistics','manager')
          GROUP BY ro.key ORDER BY open DESC`, [tenantId]),
      this.db.query(
        `SELECT count(*) FILTER (WHERE status IN ('open','acknowledged')) AS open,
                count(*) FILTER (WHERE status IN ('open','acknowledged') AND vendor_sla_due_at < NOW()) AS overdue
           FROM case_vendor_escalations WHERE tenant_id=$1`, [tenantId]),
      this.db.query(
        `SELECT vendor_name, count(*) AS open
           FROM case_vendor_escalations WHERE tenant_id=$1 AND status IN ('open','acknowledged')
          GROUP BY vendor_name ORDER BY open DESC`, [tenantId]),
      this.db.query(
        `SELECT code, name, (data->>'quantity')::int AS quantity, (data->>'reorderLevel')::int AS reorder,
                data->>'location' AS location
           FROM datahub_spares WHERE tenant_id=$1 ORDER BY (data->>'quantity')::int`, [tenantId]),
      this.db.query(
        `SELECT type, status, count(*) AS count FROM cases
          WHERE tenant_id=$1 AND type IN ('theft','security_audit') AND status NOT IN ('closed','cancelled')
          GROUP BY type, status`, [tenantId]),
      this.db.query(
        `SELECT COALESCE(NULLIF(TRIM(u.first_name||' '||u.last_name),''),u.username) AS name, count(*) AS open
           FROM cases c JOIN users u ON u.id=c.assignee_id
          WHERE c.tenant_id=$1 AND c.${OPEN} GROUP BY name ORDER BY open DESC LIMIT 8`, [tenantId]),
      this.db.query(
        `SELECT count(*) FILTER (WHERE status IN ('open','in_progress','done')) AS open,
                count(*) FILTER (WHERE status IN ('open','in_progress') AND due_at < NOW()) AS overdue
           FROM capa_actions WHERE tenant_id=$1`, [tenantId]),
    ]);
    const toInt = (rows: any[], ...keys: string[]) => rows.map(r => { keys.forEach(k => r[k] = r[k] == null ? 0 : parseInt(r[k])); return r; });
    const s = sla.rows[0];
    return {
      slaHealth: { breached: +s.breached, at_risk: +s.at_risk, paused: +s.paused, on_track: +s.on_track, total: +s.total },
      byType: toInt(byType.rows, 'open', 'breached'),
      byTeam: toInt(byTeam.rows, 'open'),
      vendors: { open: +vendors.rows[0].open, overdue: +vendors.rows[0].overdue, byVendor: toInt(vByName.rows, 'open') },
      spares: toInt(spares.rows, 'quantity', 'reorder').map(r => ({ ...r, low: r.quantity <= r.reorder })),
      security: toInt(security.rows, 'count'),
      workload: toInt(workload.rows, 'open'),
      capa: { open: +capa.rows[0].open, overdue: +capa.rows[0].overdue },
    };
  }

  async getTaxonomy() {
    const r = await this.db.query(
      `SELECT category, array_agg(subcategory ORDER BY subcategory) AS subcategories
       FROM root_cause_taxonomy GROUP BY category ORDER BY category`,
    );
    return r.rows;
  }
}
