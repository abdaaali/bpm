import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import axios from 'axios';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalResolverService } from '../resolver/approval-resolver.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';

@Injectable()
export class InstanceService {
  private readonly logger = new Logger(InstanceService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly resolver: ApprovalResolverService,
    private readonly kafka: KafkaProducerService,
  ) {}

  private tid(req: any) { return req?.headers?.['x-tenant-id'] || 'a0000000-0000-0000-0000-000000000001'; }

  /** Resolve an actor (Keycloak sub OR internal UUID) to an internal user UUID.
   * The gateway forwards the Keycloak sub as x-user-id, but approvers are stored
   * as internal user UUIDs — without this, gateway-routed decisions never match. */
  private async resolveUserId(actorId: string | undefined, tenantId: string): Promise<string | undefined> {
    if (!actorId) return actorId;
    const r = await this.db.query(`SELECT id FROM users WHERE tenant_id=$2 AND (id::text=$1 OR keycloak_id=$1) LIMIT 1`, [actorId, tenantId]);
    return r.rows[0]?.id || actorId;
  }

  /**
   * C2 — propagate an approval lifecycle change to the linked case and, if the
   * approval was started by a process, resume that process. entity_type='case'
   * approvals drive the case: created → pending_approval, approved/rejected →
   * matching case status. Fail-open: a downstream hiccup must never break the
   * approval flow.
   */
  private async syncLinkedCase(instance: any, status: string, actorId?: string, comment?: string) {
    if (instance.entity_type !== 'case' || !instance.entity_id) return;
    const caseUrl = process.env.CASE_SERVICE_URL || 'http://case-service:3004';
    try {
      await axios.patch(
        `${caseUrl}/api/cases/${instance.entity_id}/transition`,
        { status, comment },
        { headers: { 'x-tenant-id': instance.tenant_id, ...(actorId ? { 'x-user-id': actorId } : {}) }, timeout: 5000 },
      );
      this.logger.log(`Approval ${instance.id} → case ${instance.entity_id} transitioned to '${status}'`);
    } catch (e: any) {
      this.logger.warn(`Case transition ('${status}') for approval ${instance.id} failed: ${e.response?.data?.message || e.message}`);
    }
  }

  /**
   * C2 — resume a process parked on an approval step. Only fires when the
   * approval carries a process context (set by the orchestrator when it
   * delegates a BPMN approval node). No-op for standalone approvals. Fail-open.
   */
  private async resumeProcess(instance: any, outcome: 'approved' | 'rejected') {
    const proc = instance.context?.process;
    if (!proc?.instanceId) return;
    const orchUrl = process.env.BPM_ORCHESTRATOR_URL || 'http://bpm-orchestrator:3003';
    try {
      await axios.post(
        `${orchUrl}/instances/${proc.instanceId}/approval-result`,
        // forkId/flowId round-trip the branch context the orchestrator set
        // when it delegated this node (see delegateApproval) — without them,
        // the resumed branch loses join synchronization with its sibling
        // fork branches.
        { nodeId: proc.nodeId, outcome, approvalInstanceId: instance.id, forkId: proc.forkId ?? null, flowId: proc.flowId ?? null },
        { headers: { 'x-tenant-id': instance.tenant_id }, timeout: 5000 },
      );
    } catch (e: any) {
      this.logger.warn(`Process resume for approval ${instance.id} failed: ${e.response?.data?.message || e.message}`);
    }
  }

  async create(tenantId: string, dto: any, requesterId: string) {
    // Resolve the requester (Keycloak sub) to an internal user id so requester_id,
    // the manager-chain lookup, and the segregation-of-duties check all operate
    // on internal ids (approvers are resolved to internal ids too).
    requesterId = (await this.resolveUserId(requesterId, tenantId)) || requesterId;
    const resolvedSteps = await this.resolver.resolveApprovers(tenantId, dto.policyId, requesterId, dto.context || {});

    // Safety net: never create a dangling pending instance with no approver — it
    // would park the linked case forever. Reject so the caller (e.g. the process
    // engine's delegation) falls back to a normal task instead of a silent hang.
    if (!resolvedSteps.length) {
      throw new BadRequestException('No approvers resolved for this policy/context');
    }

    const step0 = resolvedSteps.filter(s => s.stepIndex === 0);
    // Atomic: the instance and ALL its step-0 decision records are created
    // together — never an instance with zero approvers (which would park the
    // linked case forever) on a mid-loop failure.
    const instance = await this.db.withTransaction(async (cx) => {
      const r = await cx.query(
        `INSERT INTO approval_instances (tenant_id, policy_id, entity_type, entity_id, requester_id, context, status, resolved_steps, current_step_index)
         VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,0) RETURNING *`,
        [tenantId, dto.policyId, dto.entityType, dto.entityId, requesterId, JSON.stringify(dto.context || {}), JSON.stringify(resolvedSteps)],
      );
      const inst = r.rows[0];
      for (const step of step0) {
        await cx.query(
          `INSERT INTO approval_step_decisions (instance_id, tenant_id, step_index, step_id, approver_id, delegated_from, due_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [inst.id, tenantId, step.stepIndex, step.stepId, step.approverId, step.delegatedFrom || null, step.dueAt],
        );
      }
      return inst;
    });

    // Notify approvers AFTER commit (Kafka can't participate in the transaction).
    for (const step of step0) {
      await this.kafka.produce('bpm.approvals', {
        eventType: 'decision_required',
        tenantId,
        instanceId: instance.id,
        approverId: step.approverId,
        approverEmail: step.approverEmail,
        stepId: step.stepId,
        title: dto.title || `Approval required for ${dto.entityType} ${dto.entityId}`,
        subject: dto.title,
      });
    }

    await this.audit.log({ tenantId, entityType: 'approval_instance', entityId: instance.id, action: 'CREATE', actorId: requesterId, afterState: { ...instance, resolvedSteps } });
    // C2 — move the linked case into pending_approval while the decision is open
    await this.syncLinkedCase(instance, 'pending_approval', requesterId);
    return this.findById(instance.id, tenantId);
  }

  async findAll(tenantId: string, filters: { page?: number; pageSize?: number; status?: string; entityType?: string }) {
    const { page = 1, pageSize = 20, status, entityType } = filters;
    const { limit, offset } = this.db.paginate(page, pageSize);
    const params: any[] = [tenantId];
    const conds = ['tenant_id = $1'];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (entityType) { params.push(entityType); conds.push(`entity_type = $${params.length}`); }
    const where = conds.join(' AND ');
    const cnt = await this.db.query(`SELECT COUNT(*) FROM approval_instances WHERE ${where}`, params);
    params.push(limit, offset);
    const rows = await this.db.query(`SELECT * FROM approval_instances WHERE ${where} ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`, params);
    return { data: rows.rows, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }

  async findById(id: string, tenantId: string) {
    const r = await this.db.query('SELECT * FROM approval_instances WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    if (!r.rows[0]) throw new NotFoundException(`Instance ${id} not found`);
    const instance = r.rows[0];
    const decisions = await this.db.query('SELECT asd.*, u.email as approver_email, u.keycloak_id as approver_keycloak_id, u.first_name, u.last_name FROM approval_step_decisions asd LEFT JOIN users u ON u.id=asd.approver_id WHERE asd.instance_id = $1 ORDER BY asd.step_index', [id]);
    return { ...instance, decisions: decisions.rows };
  }

  async findPendingForUser(userId: string, tenantId: string, filters: { page?: number; pageSize?: number }) {
    userId = (await this.resolveUserId(userId, tenantId)) as string;
    const { page = 1, pageSize = 20 } = filters;
    const { limit, offset } = this.db.paginate(page, pageSize);
    const cnt = await this.db.query(
      `SELECT COUNT(DISTINCT ai.id) FROM approval_instances ai
       JOIN approval_step_decisions asd ON asd.instance_id = ai.id
       WHERE ai.tenant_id = $1 AND asd.approver_id = $2 AND asd.decision IS NULL AND ai.status = 'pending'`,
      [tenantId, userId],
    );
    const rows = await this.db.query(
      // Surface case + policy context so an approver can decide without drilling in:
      // case_number/title/type/priority (when the approval is on a case) and the
      // step label/policy name. requester name comes from users.
      `SELECT DISTINCT ai.*, asd.id as step_decision_id, asd.step_id, asd.step_index, asd.due_at,
              c.case_number, c.title AS case_title, c.type AS case_type, c.priority AS case_priority,
              p.name AS policy_name,
              TRIM(CONCAT(ru.first_name, ' ', ru.last_name)) AS requester_name
       FROM approval_instances ai
       JOIN approval_step_decisions asd ON asd.instance_id = ai.id
       LEFT JOIN cases c ON ai.entity_type = 'case' AND c.id = ai.entity_id
       LEFT JOIN approval_policies p ON p.id = ai.policy_id
       LEFT JOIN users ru ON ru.id = ai.requester_id
       WHERE ai.tenant_id = $1 AND asd.approver_id = $2 AND asd.decision IS NULL AND ai.status = 'pending'
       ORDER BY asd.due_at NULLS LAST
       LIMIT $3 OFFSET $4`,
      [tenantId, userId, limit, offset],
    );
    // Derive a human label for the current step from resolved_steps (no extra round-trip).
    const data = rows.rows.map((r: any) => {
      const step = Array.isArray(r.resolved_steps) ? r.resolved_steps[r.step_index] : null;
      return { ...r, step_label: step?.label || step?.name || `Step ${r.step_index + 1}` };
    });
    return { data, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }

  /** Home-card counters scoped to the leader's primary org unit and descendants. */
  async getLeadershipSummary(userId: string, tenantId: string) {
    userId = (await this.resolveUserId(userId, tenantId)) as string;
    const profile = await this.db.query(
      `SELECT u.id,
              COALESCE(array_agg(DISTINCT r.key) FILTER (WHERE r.key IS NOT NULL), '{}') AS role_keys,
              ou.id AS org_unit_id, ou.name AS org_unit_name, ou.type AS org_unit_type,
              p.name AS position_name
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN user_org_assignments uoa ON uoa.user_id = u.id AND uoa.tenant_id = u.tenant_id
         AND uoa.is_primary = true AND (uoa.effective_to IS NULL OR uoa.effective_to >= CURRENT_DATE)
       LEFT JOIN org_units ou ON ou.id = uoa.org_unit_id
       LEFT JOIN positions p ON p.id = uoa.position_id
       WHERE u.id = $1 AND u.tenant_id = $2
       GROUP BY u.id, ou.id, ou.name, ou.type, p.name`,
      [userId, tenantId],
    );
    const actor = profile.rows[0];
    if (!actor) throw new ForbiddenException('No organization profile is linked to this account');

    const roleKeys = (actor.role_keys || []).map((r: string) => r.toLowerCase().replace(/[ -]+/g, '_'));
    const isAdmin = roleKeys.includes('admin');
    const leadershipRole = roleKeys.some((r: string) => ['manager', 'director', 'team_leader'].includes(r));
    const leadershipPosition = /(^|\s)(manager|director|team leader)(\s|$)/i.test(actor.position_name || '');
    if (!isAdmin && !leadershipRole && !leadershipPosition) {
      throw new ForbiddenException('Leadership summary is limited to admins, directors, managers and team leaders');
    }
    if (!isAdmin && !actor.org_unit_id) {
      throw new ForbiddenException('A primary organization assignment is required for leadership scope');
    }

    const personal = await this.db.query(
      `SELECT COUNT(DISTINCT ai.id)::int AS pending,
              COUNT(DISTINCT ai.id) FILTER (WHERE asd.due_at < NOW())::int AS overdue
       FROM approval_instances ai
       JOIN approval_step_decisions asd ON asd.instance_id = ai.id
       WHERE ai.tenant_id = $1 AND asd.approver_id = $2 AND asd.decision IS NULL
         AND ai.status IN ('pending','escalated')`,
      [tenantId, userId],
    );

    const scopeSql = isAdmin
      ? `SELECT id FROM users WHERE tenant_id = $1 AND active = true`
      : `WITH RECURSIVE scoped_units AS (
           SELECT id FROM org_units WHERE id = $2 AND tenant_id = $1
           UNION ALL
           SELECT child.id FROM org_units child JOIN scoped_units parent ON child.parent_id = parent.id
           WHERE child.tenant_id = $1 AND child.active = true
         )
         SELECT DISTINCT uoa.user_id AS id FROM user_org_assignments uoa
         JOIN scoped_units su ON su.id = uoa.org_unit_id
         WHERE uoa.tenant_id = $1 AND (uoa.effective_to IS NULL OR uoa.effective_to >= CURRENT_DATE)`;
    const organization = await this.db.query(
      `WITH scoped_users AS (${scopeSql})
       SELECT COUNT(DISTINCT ai.id) FILTER (WHERE ai.status IN ('pending','escalated'))::int AS pending,
              COUNT(DISTINCT ai.id) FILTER (
                WHERE ai.status = 'escalated'
                   OR (ai.status = 'pending' AND asd.decision IS NULL AND asd.due_at < NOW())
              )::int AS urgent,
              COUNT(DISTINCT ai.id) FILTER (
                WHERE ai.status = 'pending' AND asd.decision IS NULL AND asd.due_at < NOW()
              )::int AS overdue,
              COUNT(DISTINCT ai.id) FILTER (WHERE ai.status = 'escalated')::int AS escalated
       FROM approval_instances ai
       JOIN scoped_users su ON su.id = ai.requester_id
       LEFT JOIN approval_step_decisions asd ON asd.instance_id = ai.id
       WHERE ai.tenant_id = $1`,
      isAdmin ? [tenantId] : [tenantId, actor.org_unit_id],
    );

    return {
      awaitingMine: personal.rows[0]?.pending || 0,
      myOverdue: personal.rows[0]?.overdue || 0,
      organizationPending: organization.rows[0]?.pending || 0,
      urgent: organization.rows[0]?.urgent || 0,
      overdue: organization.rows[0]?.overdue || 0,
      escalated: organization.rows[0]?.escalated || 0,
      scope: isAdmin
        ? { type: 'tenant', name: 'Entire organization' }
        : { type: actor.org_unit_type, name: actor.org_unit_name },
    };
  }

  /** Paginated instance list for the "My Organization Approvals" / "Overdue &
   * Escalated" Home cards — same leadership + org-tree scoping as
   * getLeadershipSummary's `organization` counter, but returning rows instead
   * of just a count, and filterable by `attention=urgent` to match that card. */
  async findOrganizationScoped(userId: string, tenantId: string, filters: { page?: number; pageSize?: number; attention?: string }) {
    userId = (await this.resolveUserId(userId, tenantId)) as string;
    const { page = 1, pageSize = 20, attention } = filters;
    const { limit, offset } = this.db.paginate(page, pageSize);

    const profile = await this.db.query(
      `SELECT COALESCE(array_agg(DISTINCT r.key) FILTER (WHERE r.key IS NOT NULL), '{}') AS role_keys,
              ou.id AS org_unit_id, p.name AS position_name
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
       LEFT JOIN roles r ON r.id = ur.role_id
       LEFT JOIN user_org_assignments uoa ON uoa.user_id = u.id AND uoa.tenant_id = u.tenant_id
         AND uoa.is_primary = true AND (uoa.effective_to IS NULL OR uoa.effective_to >= CURRENT_DATE)
       LEFT JOIN org_units ou ON ou.id = uoa.org_unit_id
       LEFT JOIN positions p ON p.id = uoa.position_id
       WHERE u.id = $1 AND u.tenant_id = $2
       GROUP BY ou.id, p.name`,
      [userId, tenantId],
    );
    const actor = profile.rows[0];
    if (!actor) throw new ForbiddenException('No organization profile is linked to this account');
    const roleKeys = (actor.role_keys || []).map((r: string) => r.toLowerCase().replace(/[ -]+/g, '_'));
    const isAdmin = roleKeys.includes('admin');
    const leadershipRole = roleKeys.some((r: string) => ['manager', 'director', 'team_leader'].includes(r));
    const leadershipPosition = /(^|\s)(manager|director|team leader)(\s|$)/i.test(actor.position_name || '');
    if (!isAdmin && !leadershipRole && !leadershipPosition) {
      throw new ForbiddenException('Organization approvals are limited to admins, directors, managers and team leaders');
    }
    if (!isAdmin && !actor.org_unit_id) {
      throw new ForbiddenException('A primary organization assignment is required for leadership scope');
    }

    const scopeSql = isAdmin
      ? `SELECT id FROM users WHERE tenant_id = $1 AND active = true`
      : `WITH RECURSIVE scoped_units AS (
           SELECT id FROM org_units WHERE id = $2 AND tenant_id = $1
           UNION ALL
           SELECT child.id FROM org_units child JOIN scoped_units parent ON child.parent_id = parent.id
           WHERE child.tenant_id = $1 AND child.active = true
         )
         SELECT DISTINCT uoa.user_id AS id FROM user_org_assignments uoa
         JOIN scoped_units su ON su.id = uoa.org_unit_id
         WHERE uoa.tenant_id = $1 AND (uoa.effective_to IS NULL OR uoa.effective_to >= CURRENT_DATE)`;
    const scopeParams = isAdmin ? [tenantId] : [tenantId, actor.org_unit_id];

    const attentionCond = attention === 'urgent'
      ? `AND (ai.status = 'escalated' OR (ai.status = 'pending' AND asd.decision IS NULL AND asd.due_at < NOW()))`
      : `AND ai.status IN ('pending','escalated')`;

    const cnt = await this.db.query(
      `WITH scoped_users AS (${scopeSql})
       SELECT COUNT(DISTINCT ai.id) FROM approval_instances ai
       JOIN scoped_users su ON su.id = ai.requester_id
       LEFT JOIN approval_step_decisions asd ON asd.instance_id = ai.id
       WHERE ai.tenant_id = $1 ${attentionCond}`,
      scopeParams,
    );
    const rows = await this.db.query(
      `WITH scoped_users AS (${scopeSql})
       SELECT DISTINCT ai.*, c.case_number, c.title AS case_title, c.type AS case_type, c.priority AS case_priority,
              p.name AS policy_name, TRIM(CONCAT(ru.first_name, ' ', ru.last_name)) AS requester_name
       FROM approval_instances ai
       JOIN scoped_users su ON su.id = ai.requester_id
       LEFT JOIN approval_step_decisions asd ON asd.instance_id = ai.id
       LEFT JOIN cases c ON ai.entity_type = 'case' AND c.id = ai.entity_id
       LEFT JOIN approval_policies p ON p.id = ai.policy_id
       LEFT JOIN users ru ON ru.id = ai.requester_id
       WHERE ai.tenant_id = $1 ${attentionCond}
       ORDER BY ai.created_at DESC
       LIMIT $${scopeParams.length + 1} OFFSET $${scopeParams.length + 2}`,
      [...scopeParams, limit, offset],
    );
    return { data: rows.rows, total: parseInt(cnt.rows[0].count, 10), page, pageSize };
  }

  async approve(instanceId: string, stepDecisionId: string, userId: string, tenantId: string, comment?: string) {
    userId = (await this.resolveUserId(userId, tenantId)) as string;
    const instance = await this.findById(instanceId, tenantId);
    if (instance.status !== 'pending') throw new BadRequestException('Instance is not pending');
    // Segregation of duties (defense-in-depth; the resolver already excludes the
    // requester as an approver): never let the requester approve their own request.
    if (userId && userId === instance.requester_id) {
      throw new ForbiddenException('You cannot approve your own request (segregation of duties)');
    }

    const currentIndex = instance.current_step_index;
    const resolvedSteps: any[] = instance.resolved_steps;

    // Atomic decision + advance. FOR UPDATE locks the step so concurrent
    // approvals serialize; the conditional UPDATE (decision IS NULL) makes a
    // double-approval a no-op; the instance advance + next-step inserts commit
    // together so the instance can never be left half-advanced.
    const result = await this.db.withTransaction(async (cx) => {
      // `stepDecisionId` may be the decision-row UUID (UI) or the logical
      // step_id like "step_cab" (gateway / process-driven callers). Match either,
      // scoped to this approver, and prefer an still-open decision. Comparing the
      // UUID column as text avoids a cast error when a non-UUID step_id arrives.
      const dec = await cx.query(
        `SELECT * FROM approval_step_decisions
         WHERE instance_id=$1 AND approver_id=$2 AND (id::text=$3 OR step_id=$3)
         ORDER BY (decision IS NULL) DESC, step_index DESC LIMIT 1 FOR UPDATE`,
        [instanceId, userId, stepDecisionId],
      );
      if (!dec.rows[0]) throw new NotFoundException('Step decision not found or not assigned to you');
      if (dec.rows[0].decision) throw new BadRequestException('Already decided');

      await cx.query(
        `UPDATE approval_step_decisions SET decision='approved', comment=$1, decided_at=NOW() WHERE id=$2 AND decision IS NULL`,
        [comment || null, dec.rows[0].id],
      );

      const atStep = await cx.query(
        'SELECT * FROM approval_step_decisions WHERE instance_id=$1 AND step_index=$2',
        [instanceId, currentIndex],
      );
      const allApproved = atStep.rows.every(d => d.decision === 'approved');
      const anyRejected = atStep.rows.some(d => d.decision === 'rejected');
      if (anyRejected) return { fullyApproved: false, nextSteps: [] as any[] };

      // `parallel` only affects how this step's approvers are assigned/notified
      // (together, not one-after-another) — it does NOT reduce the quorum. A
      // parallel step still requires every assigned approver's decision before
      // advancing, same as a sequential step; do not special-case it here.
      if (allApproved) {
        const nextIndex = currentIndex + 1;
        const nextSteps = resolvedSteps.filter(s => s.stepIndex === nextIndex);
        if (nextSteps.length === 0) {
          await cx.query(`UPDATE approval_instances SET status='approved', completed_at=NOW(), current_step_index=$1, updated_at=NOW() WHERE id=$2`, [nextIndex, instanceId]);
          return { fullyApproved: true, nextSteps: [] as any[] };
        }
        await cx.query(`UPDATE approval_instances SET current_step_index=$1, updated_at=NOW() WHERE id=$2`, [nextIndex, instanceId]);
        for (const step of nextSteps) {
          await cx.query(
            `INSERT INTO approval_step_decisions (instance_id, tenant_id, step_index, step_id, approver_id, delegated_from, due_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [instanceId, tenantId, step.stepIndex, step.stepId, step.approverId, step.delegatedFrom || null, step.dueAt],
          );
        }
        return { fullyApproved: false, nextSteps };
      }
      return { fullyApproved: false, nextSteps: [] as any[] };
    });

    // Side effects AFTER commit (Kafka/HTTP can't participate in the transaction).
    if (result.fullyApproved) {
      await this.kafka.produce('bpm.approvals', { eventType: 'approved', tenantId, instanceId, requesterId: instance.requester_id });
      await this.syncLinkedCase(instance, 'approved', userId, comment);
      await this.resumeProcess(instance, 'approved');
    } else {
      for (const step of result.nextSteps) {
        await this.kafka.produce('bpm.approvals', {
          eventType: 'decision_required', tenantId, instanceId,
          approverId: step.approverId, approverEmail: step.approverEmail, stepId: step.stepId,
        });
      }
    }

    await this.audit.log({ tenantId, entityType: 'approval_instance', entityId: instanceId, action: 'APPROVE_STEP', actorId: userId });
    return this.findById(instanceId, tenantId);
  }

  async reject(instanceId: string, stepDecisionId: string, userId: string, tenantId: string, comment: string) {
    userId = (await this.resolveUserId(userId, tenantId)) as string;
    const instance = await this.findById(instanceId, tenantId);
    if (instance.status !== 'pending') throw new BadRequestException('Instance is not pending');

    // Authorization + atomicity: lock the step (mirrors approve), verify it's
    // assigned to this actor and still open, then reject the step and the whole
    // instance together. Without the lock/conditional, any user could reject
    // anyone's step, or a race could decide a step twice.
    await this.db.withTransaction(async (cx) => {
      // Accept either the decision-row UUID or the logical step_id (see approve()).
      const dec = await cx.query(
        `SELECT * FROM approval_step_decisions
         WHERE instance_id=$1 AND approver_id=$2 AND (id::text=$3 OR step_id=$3)
         ORDER BY (decision IS NULL) DESC, step_index DESC LIMIT 1 FOR UPDATE`,
        [instanceId, userId, stepDecisionId],
      );
      if (!dec.rows[0]) throw new NotFoundException('Step decision not found or not assigned to you');
      if (dec.rows[0].decision) throw new BadRequestException('Already decided');

      await cx.query(
        'UPDATE approval_step_decisions SET decision=$1, comment=$2, decided_at=NOW() WHERE id=$3 AND decision IS NULL',
        ['rejected', comment, dec.rows[0].id],
      );
      await cx.query(`UPDATE approval_instances SET status='rejected', completed_at=NOW(), updated_at=NOW() WHERE id=$1`, [instanceId]);
    });

    await this.kafka.produce('bpm.approvals', { eventType: 'rejected', tenantId, instanceId, requesterId: instance.requester_id, reason: comment });
    // C2 — drive the linked case + resume any parked process
    await this.syncLinkedCase(instance, 'rejected', userId, comment);
    await this.resumeProcess(instance, 'rejected');
    await this.audit.log({ tenantId, entityType: 'approval_instance', entityId: instanceId, action: 'REJECT', actorId: userId });
    return this.findById(instanceId, tenantId);
  }
}
