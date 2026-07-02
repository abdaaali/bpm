import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { NotificationService } from '../notification/notification.service';
import { DatabaseService } from '../database/database.service';

const TOPICS = [
  'bpm.task.created', 'bpm.task.sla_breach', 'bpm.task.reassigned',
  'bpm.approvals', 'bpm.case.created', 'bpm.case.sla_breach', 'bpm.case.assigned',
  'bpm.case.status_changed', 'bpm.case.major_declared', 'bpm.case.major_resolved',
  'bpm.case.sla_at_risk', 'bpm.case.vendor_escalated', 'bpm.case.vendor_resolved',
  'bpm.process.started', 'bpm.process.completed',
];

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaConsumerService.name);
  private consumer: Consumer;
  private connected = false;

  constructor(
    private readonly notifSvc: NotificationService,
    private readonly db: DatabaseService,
  ) {}

  async onModuleInit() {
    const kafka = new Kafka({
      clientId: 'notification-service-consumer',
      brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
      retry: { retries: 5 },
    });
    this.consumer = kafka.consumer({ groupId: 'notification-service-group' });
    try {
      // Pre-create the topics so subscribe never silently skips a not-yet-produced
      // one (a fresh deploy would otherwise miss events until the first producer
      // emits + a consumer restart). createTopics is idempotent.
      const admin = kafka.admin();
      await admin.connect();
      await admin.createTopics({ topics: TOPICS.map((topic) => ({ topic })) }).catch(() => {});
      await admin.disconnect().catch(() => {});

      await this.consumer.connect();
      await this.consumer.subscribe({ topics: TOPICS, fromBeginning: false });
      this.connected = true;
      await this.consumer.run({ eachMessage: (msg) => this.handle(msg) });
      this.logger.log(`Consumer subscribed to ${TOPICS.length} topics`);
    } catch (e) {
      this.logger.warn(`Kafka consumer failed: ${e.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.connected) await this.consumer.disconnect().catch(() => {});
  }

  private async handle({ topic, message }: EachMessagePayload) {
    try {
      const payload = JSON.parse(message.value?.toString() || '{}');
      await this.route(topic, payload);
    } catch (e) {
      this.logger.error(`[${topic}] ${e.message}`);
    }
  }

  private async route(topic: string, p: any) {
    const { tenantId } = p;
    if (!tenantId) return;

    switch (topic) {
      case 'bpm.task.created':
        if (p.assignee) {
          await this.sendTo(tenantId, p.assignee, 'task_assigned', {
            taskName: p.name, instanceId: p.instanceId, nodeId: p.nodeId,
          }, 'task', p.nodeId);
        }
        break;

      case 'bpm.task.sla_breach':
        if (p.assigneeId) {
          await this.sendTo(tenantId, p.assigneeId, 'task_sla_breach', {
            taskName: p.taskName, dueAt: p.dueAt, taskId: p.taskId,
          }, 'task', p.taskId);
        }
        break;

      case 'bpm.task.reassigned':
        if (p.toUserId) {
          await this.sendTo(tenantId, p.toUserId, 'task_reassigned', {
            taskId: p.taskId, fromUserId: p.fromUserId,
          }, 'task', p.taskId);
        }
        break;

      case 'bpm.approvals': {
        // decision_required → notify the pending approver; approved/rejected →
        // notify the original requester of the outcome.
        if (p.eventType === 'decision_required' && p.approverId) {
          await this.sendTo(tenantId, p.approverId, 'approval_requested', {
            instanceId: p.instanceId, title: p.title || p.subject, stepName: p.stepId, dueAt: p.dueAt,
          }, 'approval_instance', p.instanceId);
        } else if ((p.eventType === 'approved' || p.eventType === 'rejected') && p.requesterId) {
          await this.sendTo(tenantId, p.requesterId, 'approval_decision', {
            instanceId: p.instanceId, decision: p.eventType, reason: p.reason,
          }, 'approval_instance', p.instanceId);
        }
        break;
      }

      case 'bpm.case.created':
        if (p.requesterId) {
          await this.sendTo(tenantId, p.requesterId, 'case_created', {
            caseNumber: p.caseNumber, type: p.type, title: p.title, priority: p.priority,
          }, 'case', p.caseId);
        }
        break;

      case 'bpm.case.sla_breach':
        if (p.assigneeId) {
          await this.sendTo(tenantId, p.assigneeId, 'case_sla_breach', {
            caseNumber: p.caseNumber, type: p.type, priority: p.priority, dueAt: p.dueAt,
          }, 'case', p.caseId);
        }
        break;

      case 'bpm.case.sla_at_risk':
        if (p.assigneeId) {
          await this.sendTo(tenantId, p.assigneeId, 'case_sla_at_risk', {
            caseNumber: p.caseNumber, type: p.type, priority: p.priority,
            dueAt: p.dueAt, minutesLeft: p.minutesLeft,
          }, 'case', p.caseId);
        }
        break;

      case 'bpm.case.assigned':
        // Skip self-assignment (don't notify someone for assigning to themselves).
        if (p.assigneeId && p.assigneeId !== p.actorId) {
          await this.sendTo(tenantId, p.assigneeId, 'case_assigned', {
            caseNumber: p.caseNumber, title: p.title, type: p.type, priority: p.priority,
            slaDueAt: p.slaDueAt, siteCode: p.siteCode,
          }, 'case', p.caseId);
        }
        break;

      case 'bpm.case.status_changed':
        // Tell the requester when their case is resolved or closed.
        if ((p.to === 'resolved' || p.to === 'closed') && p.requesterId) {
          await this.sendTo(tenantId, p.requesterId, 'case_resolved', {
            caseNumber: p.caseNumber, title: p.title,
            resolutionCode: p.resolutionCode, resolutionNotes: p.resolutionNotes,
          }, 'case', p.caseId);
        }
        break;

      case 'bpm.case.major_declared': {
        // Fan out to management + the assignee/MIM + requester.
        const vars = { caseNumber: p.caseNumber, title: p.title, priority: p.priority,
          siteCode: p.siteCode, mimName: p.mimName, reason: p.reason };
        const recips = await this.stakeholders(tenantId, [p.assigneeId, p.mimId, p.requesterId], 'manager');
        for (const uid of recips) await this.sendTo(tenantId, uid, 'major_incident_declared', vars, 'case', p.caseId);
        break;
      }

      case 'bpm.case.vendor_escalated':
        if (p.assigneeId) {
          await this.sendTo(tenantId, p.assigneeId, 'vendor_escalation_raised', {
            caseNumber: p.caseNumber, vendorName: p.vendorName, reason: p.reason,
            vendorSlaDueAt: p.vendorSlaDueAt, contactEmail: p.contactEmail, contactPhone: p.contactPhone,
          }, 'case', p.caseId);
        }
        break;

      case 'bpm.case.vendor_resolved':
        if (p.assigneeId) {
          await this.sendTo(tenantId, p.assigneeId, 'vendor_escalation_resolved', {
            caseNumber: p.caseNumber, vendorName: p.vendorName, notes: p.notes,
          }, 'case', p.caseId);
        }
        break;

      case 'bpm.case.major_resolved': {
        const vars = { caseNumber: p.caseNumber, title: p.title, resolutionNotes: p.resolutionNotes, pirNumber: p.pirNumber };
        const recips = await this.stakeholders(tenantId, [p.assigneeId, p.mimId, p.requesterId], 'manager');
        for (const uid of recips) await this.sendTo(tenantId, uid, 'major_incident_resolved', vars, 'case', p.caseId);
        break;
      }

      default:
        break;
    }
  }

  /** Unique recipient ids: the given direct ids plus all active members of a role. */
  private async stakeholders(tenantId: string, directIds: (string | undefined)[], roleKey: string): Promise<string[]> {
    const ids = new Set<string>(directIds.filter(Boolean) as string[]);
    try {
      const r = await this.db.query(
        `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles ro ON ro.id=ur.role_id
          WHERE u.tenant_id=$1 AND u.active AND ro.key=$2`,
        [tenantId, roleKey],
      );
      for (const row of r.rows) ids.add(row.id);
    } catch (e) { this.logger.warn(`stakeholders lookup failed: ${(e as any).message}`); }
    return [...ids];
  }

  private async sendTo(
    tenantId: string, recipientId: string, templateSlug: string,
    variables: Record<string, any>, entityType?: string, entityId?: string,
  ) {
    // Lookup email if possible
    let recipientEmail: string | undefined;
    try {
      const r = await this.db.query(`SELECT email FROM users WHERE id=$1 AND tenant_id=$2`, [recipientId, tenantId]);
      recipientEmail = r.rows[0]?.email;
    } catch { /* ignore */ }

    await this.notifSvc.send({ tenantId, recipientId, recipientEmail, templateSlug, variables, entityType, entityId });
  }
}
