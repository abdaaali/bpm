import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import axios from 'axios';
import { DatabaseService } from '../database/database.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { AuditService } from '../audit/audit.service';
import { ProcessDefinitionService } from '../process-definition/process-definition.service';
import { parseBpmn, getOutgoingFlows, getIncomingFlows, getElementById, evaluateCondition, BpmnProcess, BpmnFlow } from '../engine/bpmn-parser';

@Injectable()
export class ProcessInstanceService {
  private readonly logger = new Logger(ProcessInstanceService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly kafka: KafkaProducerService,
    private readonly audit: AuditService,
    private readonly defSvc: ProcessDefinitionService,
  ) {}

  async findAll(tenantId: string, filters: any, page = 1, pageSize = 20) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const conds: string[] = ['pi.tenant_id=$1'];
    const vals: any[] = [tenantId];
    let i = 2;
    if (filters.status) { conds.push(`pi.status=$${i++}`); vals.push(filters.status); }
    if (filters.definitionId) { conds.push(`pi.definition_id=$${i++}`); vals.push(filters.definitionId); }
    if (filters.initiatorId) { conds.push(`pi.initiator_id=$${i++}`); vals.push(filters.initiatorId); }
    if (filters.caseId) { conds.push(`pi.case_id=$${i++}`); vals.push(filters.caseId); }
    if (filters.businessKey) { conds.push(`pi.business_key ILIKE $${i++}`); vals.push(`%${filters.businessKey}%`); }
    const where = conds.join(' AND ');
    const [rows, count] = await Promise.all([
      this.db.query(
        `SELECT pi.*, pd.name as definition_name, pd.slug as definition_slug
         FROM process_instances pi JOIN process_definitions pd ON pd.id=pi.definition_id
         WHERE ${where} ORDER BY pi.started_at DESC LIMIT $${i++} OFFSET $${i++}`,
        [...vals, limit, offset],
      ),
      this.db.query(`SELECT COUNT(*) FROM process_instances pi WHERE ${where}`, vals),
    ]);
    return { data: rows.rows, total: parseInt(count.rows[0].count), page, pageSize };
  }

  async findOne(tenantId: string, id: string) {
    const r = await this.db.query(
      `SELECT pi.*, pd.name as definition_name, pd.bpmn_xml
       FROM process_instances pi JOIN process_definitions pd ON pd.id=pi.definition_id
       WHERE pi.id=$1 AND pi.tenant_id=$2`,
      [id, tenantId],
    );
    if (!r.rows.length) throw new NotFoundException('Process instance not found');
    return r.rows[0];
  }

  /** Resolve a Keycloak sub or internal UUID to an internal user UUID. Returns null if unresolvable. */
  private async resolveUserId(actorId: string | undefined, tenantId: string): Promise<string | null> {
    if (!actorId) return null;
    const r = await this.db.query(
      `SELECT id FROM users WHERE tenant_id=$2 AND (id::text=$1 OR keycloak_id=$1) LIMIT 1`,
      [actorId, tenantId],
    );
    return r.rows[0]?.id || null;
  }

  async start(tenantId: string, dto: { definitionId?: string; slug?: string; businessKey?: string; variables?: any; initiatorId?: string; caseId?: string }) {
    // Load definition
    let def: any;
    if (dto.definitionId) {
      def = await this.defSvc.findOne(tenantId, dto.definitionId);
    } else if (dto.slug) {
      def = await this.defSvc.findBySlug(tenantId, dto.slug);
    } else {
      throw new BadRequestException('definitionId or slug required');
    }
    if (def.status !== 'active') throw new BadRequestException('Process definition is not active');

    // Resolve initiator: Keycloak sub → internal user UUID
    const initiatorId = await this.resolveUserId(dto.initiatorId, tenantId);

    // Parse BPMN to find start event and initial tokens
    const bpmnProcess = def.bpmn_xml ? parseBpmn(def.bpmn_xml) : null;
    const currentNodeId = bpmnProcess?.startEventId || null;

    const r = await this.db.query(
      `INSERT INTO process_instances(tenant_id,definition_id,business_key,status,variables,current_node_id,initiator_id,case_id)
       VALUES($1,$2,$3,'active',$4,$5,$6,$7) RETURNING *`,
      [tenantId, def.id, dto.businessKey || null, JSON.stringify(dto.variables || {}), currentNodeId, initiatorId, dto.caseId || null],
    );
    const instance = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'process_instance', entityId: instance.id, action: 'started', actorId: initiatorId, afterState: { definitionId: def.id, businessKey: dto.businessKey } });
    await this.kafka.produce('bpm.process.started', { tenantId, instanceId: instance.id, definitionId: def.id, definitionSlug: def.slug, businessKey: dto.businessKey, initiatorId });

    // Advance past start event to first real node
    if (bpmnProcess && currentNodeId) {
      await this.advance(tenantId, instance.id, currentNodeId, dto.variables || {}, bpmnProcess, initiatorId);
    }

    return this.findOne(tenantId, instance.id);
  }

  async advance(
    tenantId: string, instanceId: string, fromNodeId: string, variables: any, bpmnProcess: any, actorId?: string,
    // Identifies which fork cohort + activated flow this execution branch descends
    // from, so a converging parallel/inclusive gateway can tell how many of its
    // branches have actually arrived. null outside any fork (or once a join has
    // fully resolved back to top level).
    branchToken: { forkId: string; flowId: string } | null = null,
  ) {
    const outFlows = getOutgoingFlows(bpmnProcess, fromNodeId);
    const fromEl = getElementById(bpmnProcess, fromNodeId);

    if (!fromEl || fromEl.type === 'endEvent') {
      if (branchToken) {
        // This execution is one branch of a still-open fork (see
        // gateway_forks) that reached an end event instead of arriving at the
        // fork's join. Ending this token here must NOT complete the whole
        // instance — sibling branches may still be running; only a join
        // resolving back to branchToken=null (or an execution that was never
        // inside a fork) is allowed to decide the instance is finished.
        // Known limitation: a branch that bypasses its fork's join like this
        // never registers a gateway_arrivals row, so if that join is still
        // waiting on this branch specifically, it now waits forever — a
        // pre-existing modeling/engine gap (asymmetric fork branches aren't
        // fully supported), not something this fix attempts to solve. This
        // fix only stops that gap from corrupting the rest of the instance.
        this.logger.warn(`Instance ${instanceId} branch reached end event ${fromNodeId} while still part of an open fork — ending this branch only, not the whole instance`);
        return;
      }
      // Complete the instance
      await this.db.query(
        `UPDATE process_instances SET status='completed', completed_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [instanceId],
      );
      await this.kafka.produce('bpm.process.completed', { tenantId, instanceId });
      // C1: process finished — resolve the linked case
      await this.syncCase(tenantId, instanceId, 'resolved', actorId);
      return;
    }

    // Join synchronization: a parallel/inclusive gateway with more than one
    // incoming flow only proceeds once every branch spawned by its matching
    // fork has arrived here — otherwise it re-fires its fork logic once per
    // arriving branch, duplicating all downstream work.
    if ((fromEl.type === 'parallelGateway' || fromEl.type === 'inclusiveGateway') && getIncomingFlows(bpmnProcess, fromNodeId).length > 1) {
      if (!branchToken) {
        // No tracked fork context (malformed BPMN, or a join reached via a path
        // that doesn't propagate branch tokens, e.g. resuming from a parked
        // approval — see delegateApproval). Fail open rather than deadlock.
        this.logger.warn(`Instance ${instanceId} reached join ${fromNodeId} with no fork context — proceeding without synchronization`);
      } else {
        const token = branchToken;
        const outcome = await this.db.withTransaction(async (client) => {
          const forkRow = await client.query(`SELECT * FROM gateway_forks WHERE id=$1 FOR UPDATE`, [token.forkId]);
          if (!forkRow.rows.length) return { proceed: false, next: null as { forkId: string; flowId: string } | null };
          await client.query(
            `INSERT INTO gateway_arrivals(fork_id, join_node_id, flow_id) VALUES($1,$2,$3)
             ON CONFLICT (fork_id, join_node_id, flow_id) DO NOTHING`,
            [token.forkId, fromNodeId, token.flowId],
          );
          const count = await client.query(
            `SELECT COUNT(*)::int AS n FROM gateway_arrivals WHERE fork_id=$1 AND join_node_id=$2`,
            [token.forkId, fromNodeId],
          );
          if (count.rows[0].n < forkRow.rows[0].expected_count) return { proceed: false, next: null };
          const parentForkId = forkRow.rows[0].parent_fork_id;
          const parentFlowId = forkRow.rows[0].parent_flow_id;
          await client.query(`DELETE FROM gateway_forks WHERE id=$1`, [token.forkId]); // cascades gateway_arrivals
          return { proceed: true, next: parentForkId ? { forkId: parentForkId, flowId: parentFlowId } : null };
        });
        if (!outcome.proceed) return; // still waiting on sibling branches, or a concurrent branch already won this join
        branchToken = outcome.next; // resume under the parent fork's context (or null if this was top-level)
      }
    }

    if (fromEl.type === 'exclusiveGateway') {
      // Take first matching condition flow
      const chosen = outFlows.find(f => f.condition ? evaluateCondition(f.condition, variables) : true);
      if (chosen) {
        const nextEl = getElementById(bpmnProcess, chosen.target);
        await this.db.query(
          `UPDATE process_instances SET current_node_id=$1, updated_at=NOW() WHERE id=$2`,
          [chosen.target, instanceId],
        );
        if (nextEl) await this.advance(tenantId, instanceId, chosen.target, variables, bpmnProcess, actorId, branchToken);
      }
      return;
    }

    if (fromEl.type === 'parallelGateway' || fromEl.type === 'inclusiveGateway') {
      // Parallel gateways always take every outgoing flow; inclusive gateways
      // only take flows whose condition holds (falling back to unconditional
      // flows, then to the first flow, so a malformed diagram never dead-ends).
      const activated = fromEl.type === 'inclusiveGateway' ? this.activateInclusiveFlows(outFlows, variables) : outFlows;

      if (activated.length <= 1) {
        // Not a real fork — the single active branch continues under the same token.
        for (const flow of activated) {
          const nextEl = getElementById(bpmnProcess, flow.target);
          if (nextEl && nextEl.type === 'userTask') {
            await this.createTask(tenantId, instanceId, nextEl, variables, actorId, branchToken);
          } else if (nextEl) {
            await this.advance(tenantId, instanceId, flow.target, variables, bpmnProcess, actorId, branchToken);
          }
        }
        return;
      }

      const forkRow = await this.db.query(
        `INSERT INTO gateway_forks(tenant_id, instance_id, fork_node_id, expected_count, parent_fork_id, parent_flow_id)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [tenantId, instanceId, fromNodeId, activated.length, branchToken?.forkId ?? null, branchToken?.flowId ?? null],
      );
      const forkId = forkRow.rows[0].id;
      for (const flow of activated) {
        const nextEl = getElementById(bpmnProcess, flow.target);
        const childToken = { forkId, flowId: flow.id };
        if (nextEl && nextEl.type === 'userTask') {
          await this.createTask(tenantId, instanceId, nextEl, variables, actorId, childToken);
        } else if (nextEl) {
          await this.advance(tenantId, instanceId, flow.target, variables, bpmnProcess, actorId, childToken);
        }
      }
      return;
    }

    if (fromEl.type === 'startEvent' || fromEl.type === 'intermediateThrowEvent' || fromEl.type === 'intermediateCatchEvent') {
      for (const flow of outFlows) {
        const nextEl = getElementById(bpmnProcess, flow.target);
        if (nextEl) {
          await this.db.query(`UPDATE process_instances SET current_node_id=$1, updated_at=NOW() WHERE id=$2`, [flow.target, instanceId]);
          await this.advance(tenantId, instanceId, flow.target, variables, bpmnProcess, actorId, branchToken);
        }
      }
      return;
    }

    if (fromEl.type === 'userTask') {
      // C2 — a userTask flagged formKey="approval" is delegated to approval-service
      // (the process parks here until a decision arrives) rather than becoming an inbox task.
      if (fromEl.formKey === 'approval') {
        const parked = await this.delegateApproval(tenantId, instanceId, fromEl, variables, actorId, branchToken);
        if (parked) return;
      }
      await this.createTask(tenantId, instanceId, fromEl, variables, actorId, branchToken);
      return;
    }

    if (fromEl.type === 'serviceTask') {
      // Auto-complete service tasks and move forward
      await this.kafka.produce('bpm.service.task', { tenantId, instanceId, nodeId: fromEl.id, serviceType: fromEl.serviceType, config: fromEl.config });
      for (const flow of outFlows) {
        await this.db.query(`UPDATE process_instances SET current_node_id=$1, updated_at=NOW() WHERE id=$2`, [flow.target, instanceId]);
        await this.advance(tenantId, instanceId, flow.target, variables, bpmnProcess, actorId, branchToken);
      }
      return;
    }

    // Default: move to first outgoing flow target
    if (outFlows.length > 0) {
      await this.db.query(`UPDATE process_instances SET current_node_id=$1, updated_at=NOW() WHERE id=$2`, [outFlows[0].target, instanceId]);
      await this.advance(tenantId, instanceId, outFlows[0].target, variables, bpmnProcess, actorId, branchToken);
    }
  }

  /** Inclusive-gateway branch activation: flows whose condition holds, else unconditional flows, else the first flow. */
  private activateInclusiveFlows(outFlows: BpmnFlow[], variables: any): BpmnFlow[] {
    const matched = outFlows.filter(f => f.condition && evaluateCondition(f.condition, variables));
    if (matched.length) return matched;
    const unconditional = outFlows.filter(f => !f.condition);
    return unconditional.length ? unconditional : outFlows.slice(0, 1);
  }

  private async createTask(tenantId: string, instanceId: string, el: any, variables: any, actorId?: string, branchToken: { forkId: string; flowId: string } | null = null) {
    const dueAt = el.slaHours ? new Date(Date.now() + el.slaHours * 3600 * 1000).toISOString() : null;
    // Merge form schema into task variables so WorkInbox can render dynamic form
    const taskVars = { ...variables };
    if (el.formFields?.length) {
      taskVars._formSchema = el.formFields;
    }
    // candidateUsers (Flowable) falls back into candidate_groups so the inbox can filter
    const candidateList =
      el.candidateGroups?.length ? el.candidateGroups :
      el.candidateUsers?.length  ? el.candidateUsers  : null;
    // Assignment is a human decision: a task with no explicitly-designed assignee
    // (camunda:assignee) stays a claimable POOL task on its candidate group — a
    // person claims it (or a lead assigns it) before the step proceeds. No
    // automatic individual assignment.
    const assigneeId = el.assignee || null;
    await this.db.query(
      `INSERT INTO tasks(tenant_id,process_instance_id,node_id,name,type,status,assignee_id,candidate_groups,form_key,variables,due_at,case_id,fork_id,flow_id)
       VALUES($1,$2,$3,$4,COALESCE($5,'userTask'),'pending',$6,$7,$8,$9,$10,(SELECT case_id FROM process_instances WHERE id=$2),$11,$12)`,
      [tenantId, instanceId, el.id, el.name || el.id, el.type, assigneeId,
        candidateList ? JSON.stringify(candidateList) : null,
        el.formKey || null, JSON.stringify(taskVars), dueAt,
        branchToken?.forkId ?? null, branchToken?.flowId ?? null],
    );
    await this.kafka.produce('bpm.task.created', { tenantId, instanceId, nodeId: el.id, name: el.name, assignee: assigneeId });
    // C1: work has started — move a linked case new/open → in_progress
    await this.syncCase(tenantId, instanceId, 'in_progress', actorId);
  }


  /**
   * C2 — delegate a BPMN approval node to approval-service. Creates an approval
   * instance bound to the linked case (or the instance), carrying a process
   * callback context so the decision resumes the process. Parks the process at
   * this node (no advance). Returns false to fall back to a normal task if no
   * policy exists or the call fails (fail-open — never dead-end the process).
   */
  private async delegateApproval(
    tenantId: string, instanceId: string, el: any, variables: any, actorId?: string,
    branchToken: { forkId: string; flowId: string } | null = null,
  ): Promise<boolean> {
    try {
      const meta = await this.db.query(
        `SELECT pd.slug, pi.case_id, pi.initiator_id,
                c.risk_level, c.change_type, c.priority, c.impact, c.urgency
         FROM process_instances pi
         JOIN process_definitions pd ON pd.id=pi.definition_id
         LEFT JOIN cases c ON c.id=pi.case_id
         WHERE pi.id=$1`, [instanceId]);
      const row = meta.rows[0];
      if (!row) return false;
      const policy = await this.db.query(
        `SELECT id FROM approval_policies WHERE tenant_id=$1 AND process_key=$2 AND active=true ORDER BY version DESC LIMIT 1`,
        [tenantId, row.slug]);
      if (!policy.rows.length) return false; // no policy → fall back to a normal task
      const entityType = row.case_id ? 'case' : 'process_instance';
      const entityId   = row.case_id || instanceId;
      const requester  = row.initiator_id || actorId;
      const base = process.env.APPROVAL_SERVICE_URL || 'http://approval-service:3002';
      const resp = await axios.post(`${base}/instances`, {
        policyId: policy.rows[0].id,
        entityType, entityId,
        title: `${el.name || 'Approval'}${variables?.caseNumber ? ` — ${variables.caseNumber}` : ''}`,
        // Pass process variables + case fields so policy step conditions
        // (risk_level / change_type / priority …) can actually evaluate.
        context: {
          ...(variables || {}),
          risk_level: row.risk_level, change_type: row.change_type,
          priority: row.priority, impact: row.impact, urgency: row.urgency,
          // forkId/flowId let approvalResult() re-attach this branch to its
          // fork's join synchronization when the decision resumes the process
          // (see approval-service's resumeProcess, which echoes this context
          // straight back) — without them, a resumed branch has no fork
          // context and skips join synchronization entirely (Bug 1).
          process: { instanceId, nodeId: el.id, forkId: branchToken?.forkId ?? null, flowId: branchToken?.flowId ?? null },
        },
      }, {
        headers: { 'x-tenant-id': tenantId, ...(requester ? { 'x-user-id': requester } : {}) },
        timeout: 5000,
      });
      const approvalId = resp.data?.id;
      if (!approvalId) return false;
      this.logger.log(`Delegated approval for instance ${instanceId} node ${el.id} → approval ${approvalId}`);
      return true; // parked — process waits for the decision
    } catch (e: any) {
      this.logger.warn(`Approval delegation for instance ${instanceId} node ${el?.id} failed: ${e.response?.data?.message || e.message}`);
      return false; // fall back to a normal task
    }
  }

  /**
   * C1 — keep a linked case in lock-step with its orchestrating process.
   * Guarded, idempotent UPDATEs: only move a case forward, never override a
   * case a human has already resolved/closed/cancelled. No-op when the instance
   * has no linked case (subquery → null). Fail-open: case sync must never block
   * the engine from advancing.
   */
  private async syncCase(tenantId: string, instanceId: string, target: 'in_progress' | 'resolved' | 'cancelled', actorId?: string) {
    const caseSub = `(SELECT case_id FROM process_instances WHERE id=$1)`;
    let sql: string;
    if (target === 'in_progress') {
      sql = `UPDATE cases SET status='in_progress', version=version+1, updated_at=NOW()
             WHERE tenant_id=$2 AND id=${caseSub} AND status IN ('new','open')
             RETURNING id`;
    } else if (target === 'resolved') {
      sql = `UPDATE cases SET status='resolved', version=version+1, resolved_at=NOW(), updated_at=NOW(),
               resolution_code=COALESCE(resolution_code,'auto_process_completed'),
               resolution_notes=COALESCE(resolution_notes,'Automatically resolved when the orchestrating process completed.')
             WHERE tenant_id=$2 AND id=${caseSub} AND status NOT IN ('resolved','closed','cancelled')
             RETURNING id`;
    } else {
      sql = `UPDATE cases SET status='cancelled', version=version+1, updated_at=NOW()
             WHERE tenant_id=$2 AND id=${caseSub} AND status NOT IN ('resolved','closed','cancelled')
             RETURNING id`;
    }
    try {
      const r = await this.db.query(sql, [instanceId, tenantId]);
      const caseId = r.rows[0]?.id;
      if (caseId) {
        await this.audit.log({ tenantId, entityType: 'case', entityId: caseId, action: `process_sync.${target}`, actorId, afterState: { status: target, instanceId } });
        await this.kafka.produce('bpm.case.synced', { tenantId, caseId, instanceId, status: target });
      }
    } catch (e: any) {
      this.logger.warn(`Case sync (${target}) for instance ${instanceId} failed: ${e.message}`);
    }
  }

  /**
   * Called by TaskService when a user task is completed.
   * Merges the task output variables into the instance, then advances the
   * process from the completed node's outgoing flows.
   */
  async onTaskCompleted(tenantId: string, instanceId: string, nodeId: string, vars: any, actorId?: string, forkId?: string | null, flowId?: string | null) {
    const instance = await this.findOne(tenantId, instanceId);
    if (instance.status !== 'active') return; // don't advance suspended/terminated instances
    if (!instance.bpmn_xml) return;

    const bpmnProcess: BpmnProcess = parseBpmn(instance.bpmn_xml);
    const branchToken = forkId && flowId ? { forkId, flowId } : null;

    // Persist merged variables to instance so gateway conditions have full context
    await this.db.query(
      `UPDATE process_instances SET variables=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
      [JSON.stringify(vars), instanceId, tenantId],
    );

    // Advance through each outgoing flow of the completed task
    const outFlows = getOutgoingFlows(bpmnProcess, nodeId);
    for (const flow of outFlows) {
      await this.db.query(
        `UPDATE process_instances SET current_node_id=$1, updated_at=NOW() WHERE id=$2`,
        [flow.target, instanceId],
      );
      await this.advance(tenantId, instanceId, flow.target, vars, bpmnProcess, actorId, branchToken);
    }
  }

  /**
   * C2 — resume a process parked on an approval step once approval-service has
   * a final decision. Merges the decision into the instance variables (so the
   * downstream gateway can branch on `decision`/`approved`), completes any wait
   * task on that node, then advances. Reuses the same engine path as task
   * completion.
   */
  async approvalResult(tenantId: string, instanceId: string, body: {
    nodeId: string; outcome: 'approved' | 'rejected'; approvalInstanceId?: string;
    // See delegateApproval — echoed back from the approval context so this
    // branch can resume under the same fork/flow it was parked from instead
    // of losing join synchronization (Bug 1).
    forkId?: string | null; flowId?: string | null;
  }, actorId?: string) {
    const instance = await this.findOne(tenantId, instanceId);
    if (instance.status !== 'active' || !instance.bpmn_xml) return instance;
    const bpmnProcess: BpmnProcess = parseBpmn(instance.bpmn_xml);
    const branchToken = body.forkId && body.flowId ? { forkId: body.forkId, flowId: body.flowId } : null;

    const decision = body.outcome === 'approved' ? 'approve' : 'reject';
    const mergedVars = { ...(instance.variables || {}), decision, approved: body.outcome === 'approved', approvalOutcome: body.outcome };
    await this.db.query(
      `UPDATE process_instances SET variables=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
      [JSON.stringify(mergedVars), instanceId, tenantId],
    );
    // Complete any wait task parked on this approval node
    await this.db.query(
      `UPDATE tasks SET status='completed', outcome=$3, completed_at=NOW(), updated_at=NOW()
       WHERE process_instance_id=$1 AND node_id=$2 AND status IN ('pending','in_progress')`,
      [instanceId, body.nodeId, body.outcome],
    );
    // Advance from the approval node's outgoing flows
    const outFlows = getOutgoingFlows(bpmnProcess, body.nodeId);
    for (const flow of outFlows) {
      await this.db.query(`UPDATE process_instances SET current_node_id=$1, updated_at=NOW() WHERE id=$2`, [flow.target, instanceId]);
      await this.advance(tenantId, instanceId, flow.target, mergedVars, bpmnProcess, actorId, branchToken);
    }
    return this.findOne(tenantId, instanceId);
  }

  async suspend(tenantId: string, id: string, actorId?: string) {
    const inst = await this.findOne(tenantId, id);
    if (inst.status !== 'active') throw new BadRequestException('Only active instances can be suspended');
    await this.db.query(`UPDATE process_instances SET status='suspended', updated_at=NOW() WHERE id=$1`, [id]);
    await this.audit.log({ tenantId, entityType: 'process_instance', entityId: id, action: 'suspended', actorId });
    return this.findOne(tenantId, id);
  }

  async resume(tenantId: string, id: string, actorId?: string) {
    const inst = await this.findOne(tenantId, id);
    if (inst.status !== 'suspended') throw new BadRequestException('Only suspended instances can be resumed');
    await this.db.query(`UPDATE process_instances SET status='active', updated_at=NOW() WHERE id=$1`, [id]);
    await this.audit.log({ tenantId, entityType: 'process_instance', entityId: id, action: 'resumed', actorId });
    return this.findOne(tenantId, id);
  }

  async updateVariables(tenantId: string, id: string, variables: Record<string, any>, actorId?: string) {
    const inst = await this.findOne(tenantId, id);
    if (['completed', 'terminated'].includes(inst.status)) throw new BadRequestException('Cannot update variables on a finished instance');
    const r = await this.db.query(
      `UPDATE process_instances SET variables = variables || $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING *`,
      [JSON.stringify(variables), id, tenantId],
    );
    await this.audit.log({ tenantId, entityType: 'process_instance', entityId: id, action: 'variables_updated', actorId, afterState: variables });
    return r.rows[0];
  }

  async remove(tenantId: string, id: string, actorId?: string) {
    const existing = await this.findOne(tenantId, id);
    if (!['terminated', 'completed'].includes(existing.status)) {
      throw new BadRequestException('Can only delete terminated or completed instances. Terminate it first.');
    }
    // Atomic: never orphan tasks by deleting the instance but not its tasks.
    await this.db.withTransaction(async (c) => {
      await c.query(`DELETE FROM tasks WHERE process_instance_id=$1`, [id]);
      await c.query(`DELETE FROM process_instances WHERE id=$1 AND tenant_id=$2`, [id, tenantId]);
    });
    await this.audit.log({ tenantId, entityType: 'process_instance', entityId: id, action: 'deleted', actorId, beforeState: existing });
  }

  async terminate(tenantId: string, id: string, reason: string, actorId?: string) {
    const inst = await this.findOne(tenantId, id);
    if (inst.status === 'completed' || inst.status === 'terminated') throw new BadRequestException('Instance already ended');
    // Atomic: terminate the instance and cancel its open tasks together, so a
    // terminated instance can't be left with live tasks lingering in inboxes.
    await this.db.withTransaction(async (c) => {
      await c.query(
        `UPDATE process_instances SET status='terminated', completed_at=NOW(), updated_at=NOW(), variables=variables||$2 WHERE id=$1`,
        [id, JSON.stringify({ _terminationReason: reason })],
      );
      await c.query(`UPDATE tasks SET status='cancelled', updated_at=NOW() WHERE process_instance_id=$1 AND status IN ('pending','in_progress')`, [id]);
    });
    await this.audit.log({ tenantId, entityType: 'process_instance', entityId: id, action: 'terminated', actorId, afterState: { reason } });
    // C1: process terminated — cancel the linked case (unless already resolved/closed)
    await this.syncCase(tenantId, id, 'cancelled', actorId);
    return this.findOne(tenantId, id);
  }
}
