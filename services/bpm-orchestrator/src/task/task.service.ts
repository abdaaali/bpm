import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KafkaProducerService } from '../kafka/kafka-producer.service';
import { AuditService } from '../audit/audit.service';
import { ProcessInstanceService } from '../process-instance/process-instance.service';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly kafka: KafkaProducerService,
    private readonly audit: AuditService,
    private readonly instanceSvc: ProcessInstanceService,
  ) {}

  async findAll(tenantId: string, filters: any, page = 1, pageSize = 20) {
    const { limit, offset } = this.db.paginate(page, pageSize);
    const conds: string[] = ['t.tenant_id=$1'];
    const vals: any[] = [tenantId];
    let i = 2;
    if (filters.status) { conds.push(`t.status=$${i++}`); vals.push(filters.status); }
    if (filters.assigneeId) { conds.push(`t.assignee_id=$${i++}`); vals.push(filters.assigneeId); }
    if (filters.instanceId) { conds.push(`t.process_instance_id=$${i++}`); vals.push(filters.instanceId); }
    if (filters.caseId) { conds.push(`t.case_id=$${i++}`); vals.push(filters.caseId); }
    if (filters.candidateGroup) { conds.push(`t.candidate_groups @> $${i++}`); vals.push(JSON.stringify([filters.candidateGroup])); }
    if (filters.overdue === 'true') { conds.push(`t.due_at < NOW() AND t.status NOT IN ('completed','cancelled')`); }
    const where = conds.join(' AND ');
    const [rows, count] = await Promise.all([
      this.db.query(
        `SELECT t.*, pi.definition_id, pi.business_key, pd.name as process_name, pd.slug as process_slug
         FROM tasks t
         LEFT JOIN process_instances pi ON pi.id=t.process_instance_id
         LEFT JOIN process_definitions pd ON pd.id=pi.definition_id
         WHERE ${where} ORDER BY t.due_at ASC NULLS LAST, t.created_at DESC
         LIMIT $${i++} OFFSET $${i++}`,
        [...vals, limit, offset],
      ),
      this.db.query(`SELECT COUNT(*) FROM tasks t WHERE ${where}`, vals),
    ]);
    return { data: rows.rows, total: parseInt(count.rows[0].count), page, pageSize };
  }

  async findOne(tenantId: string, id: string) {
    const r = await this.db.query(
      `SELECT t.*, pi.definition_id, pi.business_key, pd.name as process_name, pd.slug as process_slug
       FROM tasks t
       LEFT JOIN process_instances pi ON pi.id=t.process_instance_id
       LEFT JOIN process_definitions pd ON pd.id=pi.definition_id
       WHERE t.id=$1 AND t.tenant_id=$2`,
      [id, tenantId],
    );
    if (!r.rows.length) throw new NotFoundException('Task not found');
    return r.rows[0];
  }

  async claim(tenantId: string, id: string, userId: string) {
    const task = await this.findOne(tenantId, id);
    if (task.status !== 'pending') throw new BadRequestException('Only pending tasks can be claimed');
    if (task.assignee_id && task.assignee_id !== userId) throw new BadRequestException('Task is already assigned to another user');
    // The UPDATE is the authoritative guard: it only succeeds if the task is
    // STILL pending and unclaimed, so two concurrent claims can't both win.
    const r = await this.db.query(
      `UPDATE tasks SET assignee_id=$1, status='in_progress', claimed_at=NOW(), updated_at=NOW()
       WHERE id=$2 AND tenant_id=$3 AND status='pending' AND (assignee_id IS NULL OR assignee_id=$1) RETURNING *`,
      [userId, id, tenantId],
    );
    if (!r.rows[0]) throw new BadRequestException('Task is no longer available to claim');
    await this.audit.log({ tenantId, entityType: 'task', entityId: id, action: 'claimed', actorId: userId, beforeState: { assignee_id: task.assignee_id }, afterState: { assignee_id: userId } });
    await this.kafka.produce('bpm.task.claimed', { tenantId, taskId: id, userId, instanceId: task.process_instance_id });
    return r.rows[0];
  }

  async unclaim(tenantId: string, id: string, userId: string) {
    const task = await this.findOne(tenantId, id);
    if (task.status !== 'in_progress') throw new BadRequestException('Only in-progress tasks can be unclaimed');
    if (task.assignee_id !== userId) throw new BadRequestException('Task not claimed by this user');
    const r = await this.db.query(
      `UPDATE tasks SET assignee_id=NULL, status='pending', claimed_at=NULL, updated_at=NOW() WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [id, tenantId],
    );
    await this.audit.log({ tenantId, entityType: 'task', entityId: id, action: 'unclaimed', actorId: userId });
    return r.rows[0];
  }

  async complete(tenantId: string, id: string, dto: { variables?: any; outcome?: string }, userId: string) {
    const task = await this.findOne(tenantId, id);
    if (!['pending', 'in_progress'].includes(task.status)) throw new BadRequestException('Task cannot be completed in its current state');
    const mergedVars = { ...(task.variables || {}), ...(dto.variables || {}), _outcome: dto.outcome || 'completed' };
    // Conditional UPDATE is the authoritative guard: only the request that flips
    // the task out of an active state gets a row back. A concurrent/duplicate
    // complete gets 0 rows and bails BEFORE advancing the process — preventing
    // double process advancement (duplicate next tasks / double resolution).
    const r = await this.db.query(
      `UPDATE tasks SET status='completed', completed_at=NOW(), updated_at=NOW(), variables=$1, outcome=$2
       WHERE id=$3 AND tenant_id=$4 AND status IN ('pending','in_progress') RETURNING *`,
      [JSON.stringify(mergedVars), dto.outcome || 'completed', id, tenantId],
    );
    if (!r.rows[0]) throw new BadRequestException('Task was already completed');
    const completed = r.rows[0];
    await this.audit.log({ tenantId, entityType: 'task', entityId: id, action: 'completed', actorId: userId, afterState: { outcome: dto.outcome, variables: dto.variables } });
    await this.kafka.produce('bpm.task.completed', { tenantId, taskId: id, instanceId: task.process_instance_id, nodeId: task.node_id, outcome: dto.outcome, variables: mergedVars, userId });

    // Advance the process to the next node(s) — only the winning completer reaches here.
    if (task.process_instance_id) {
      await this.instanceSvc.onTaskCompleted(tenantId, task.process_instance_id, task.node_id, mergedVars, userId);
    }
    return completed;
  }

  async reassign(tenantId: string, id: string, newAssigneeId: string, actorId: string) {
    const task = await this.findOne(tenantId, id);
    if (['completed', 'cancelled'].includes(task.status)) throw new BadRequestException('Cannot reassign a completed or cancelled task');
    const r = await this.db.query(
      `UPDATE tasks SET assignee_id=$1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *`,
      [newAssigneeId, id, tenantId],
    );
    await this.audit.log({ tenantId, entityType: 'task', entityId: id, action: 'reassigned', actorId, beforeState: { assignee_id: task.assignee_id }, afterState: { assignee_id: newAssigneeId } });
    await this.kafka.produce('bpm.task.reassigned', { tenantId, taskId: id, fromUserId: task.assignee_id, toUserId: newAssigneeId });
    return r.rows[0];
  }

  async addComment(tenantId: string, taskId: string, userId: string, message: string) {
    const task = await this.findOne(tenantId, taskId);
    await this.db.query(
      `UPDATE tasks SET comments=COALESCE(comments,'[]'::jsonb)||$1::jsonb, updated_at=NOW() WHERE id=$2 AND tenant_id=$3`,
      [JSON.stringify([{ userId, message, createdAt: new Date().toISOString() }]), taskId, tenantId],
    );
    return this.findOne(tenantId, taskId);
  }

  async getStats(tenantId: string, userId?: string) {
    const [open, inProgress, overdue, slaBreached, myCount] = await Promise.all([
      this.db.query(`SELECT COUNT(*) FROM tasks WHERE tenant_id=$1 AND status='pending'`, [tenantId]),
      this.db.query(`SELECT COUNT(*) FROM tasks WHERE tenant_id=$1 AND status='in_progress'`, [tenantId]),
      this.db.query(`SELECT COUNT(*) FROM tasks WHERE tenant_id=$1 AND status NOT IN ('completed','cancelled','escalated') AND due_at < NOW()`, [tenantId]),
      this.db.query(`SELECT COUNT(*) FROM tasks WHERE tenant_id=$1 AND sla_breached=true AND status NOT IN ('completed','cancelled','escalated')`, [tenantId]),
      userId
        ? this.db.query(`SELECT COUNT(*) FROM tasks WHERE tenant_id=$1 AND assignee_id=$2 AND status NOT IN ('completed','cancelled','escalated')`, [tenantId, userId])
        : Promise.resolve({ rows: [{ count: '0' }] }),
    ]);
    return {
      open: parseInt(open.rows[0].count),
      inProgress: parseInt(inProgress.rows[0].count),
      overdue: parseInt(overdue.rows[0].count),
      slaBreached: parseInt(slaBreached.rows[0].count),
      myTasks: parseInt(myCount.rows[0].count),
    };
  }

  /** SLA breach check — called by scheduler */
  async checkSlaBreaches(tenantId: string) {
    const overdue = await this.db.query(
      `SELECT id, tenant_id, process_instance_id, assignee_id, name, due_at
       FROM tasks WHERE tenant_id=$1 AND status NOT IN ('completed','cancelled') AND due_at < NOW() AND sla_breached=false`,
      [tenantId],
    );
    for (const task of overdue.rows) {
      await this.db.query(`UPDATE tasks SET sla_breached=true, updated_at=NOW() WHERE id=$1`, [task.id]);
      await this.kafka.produce('bpm.task.sla_breach', {
        tenantId: task.tenant_id, taskId: task.id, instanceId: task.process_instance_id,
        assigneeId: task.assignee_id, taskName: task.name, dueAt: task.due_at,
      });
      this.logger.warn(`SLA breach: task ${task.id} (${task.name})`);
    }
    return overdue.rows.length;
  }
}
