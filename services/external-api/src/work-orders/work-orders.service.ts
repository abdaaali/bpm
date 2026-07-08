import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(private readonly db: DatabaseService) {}

  private async audit(tenantId: string, actorId: string, actorName: string, action: string, resourceType: string, resourceId: string, details: any, ip = '0.0.0.0') {
    await this.db.query(
      `INSERT INTO external_audit_log (id, tenant_id, actor_type, actor_id, actor_name, action, resource_type, resource_id, details, ip_address, created_at)
       VALUES ($1,$2,'external_user',$3,$4,$5,$6,$7,$8,$9,NOW())`,
      [uuidv4(), tenantId, actorId, actorName, action, resourceType, resourceId, JSON.stringify(details), ip],
    ).catch((err) => this.logger.warn(`Audit failed: ${err.message}`));
  }

  async findMyWorkOrders(userId: string, companyId: string, tenantId: string, filters: any = {}) {
    let sql = `
      SELECT woa.id, 'WO-' || UPPER(REPLACE(SUBSTRING(woa.id::text, 25), '-', '')) AS work_order_ref,
             woa.assignment_status, woa.assigned_at, woa.due_at, woa.accepted_at,
             woa.rejected_at, woa.completed_at, woa.rework_count, woa.assignment_type,
             c.case_number, c.title, c.type AS case_type, c.priority, c.status AS case_status,
             c.context->>'site_name' AS site_name, c.context->>'location' AS location,
             eu.full_name AS assigned_user_name
      FROM work_order_assignments woa
      JOIN cases c ON c.id = woa.case_id
      LEFT JOIN external_users eu ON eu.id = woa.assigned_user_id
      WHERE woa.tenant_id = $1
        AND woa.assigned_company_id = $2
        AND woa.assignment_status != 'closed_cancelled'`;

    const params: any[] = [tenantId, companyId];

    // Technicians only see their own assignments; supervisors/admins see company-wide
    if (filters.role === 'technician') {
      params.push(userId);
      sql += ` AND (woa.assigned_user_id = $${params.length} OR woa.assigned_user_id IS NULL)`;
    }

    if (filters.status && filters.status !== 'all') {
      if (filters.status === 'overdue') {
        sql += ` AND woa.due_at < NOW() AND woa.assignment_status NOT IN ('closed','rejected')`;
      } else {
        params.push(filters.status);
        sql += ` AND woa.assignment_status = $${params.length}`;
      }
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      sql += ` AND (c.title ILIKE $${params.length} OR c.case_number ILIKE $${params.length})`;
    }

    sql += ' ORDER BY woa.assigned_at DESC';

    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    params.push(pageSize, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await this.db.query(sql, params);
    return { data: result.rows, page, pageSize };
  }

  async findOne(id: string, companyId: string, tenantId: string) {
    const result = await this.db.query(
      `SELECT woa.*, 'WO-' || UPPER(REPLACE(SUBSTRING(woa.id::text, 25), '-', '')) AS work_order_ref,
              c.case_number, c.title, c.description, c.type AS case_type,
              c.priority, c.status AS case_status, c.context->>'site_name' AS site_name, c.context->>'location' AS location,
              c.impact, c.urgency, c.planned_start_at AS scheduled_at,
              ec.company_name, ec.contact_email AS company_contact,
              eu.full_name AS assigned_user_name, eu.email AS assigned_user_email,
              iu.first_name || ' ' || iu.last_name AS dispatched_by_name
       FROM work_order_assignments woa
       JOIN cases c ON c.id = woa.case_id
       JOIN external_companies ec ON ec.id = woa.assigned_company_id
       LEFT JOIN external_users eu ON eu.id = woa.assigned_user_id
       LEFT JOIN users iu ON iu.id = woa.assigned_by_internal_user_id
       WHERE woa.id = $1 AND woa.tenant_id = $2 AND woa.assigned_company_id = $3`,
      [id, tenantId, companyId],
    );

    if (!result.rows[0]) throw new ForbiddenException('Work order not found or access denied');

    const wo = result.rows[0];

    // Submissions history
    const subs = await this.db.query(
      `SELECT es.id, es.submission_type, es.notes, es.payload, es.submitted_at,
              eu.full_name AS submitter_name
       FROM external_submissions es
       LEFT JOIN external_users eu ON eu.id = es.submitted_by
       WHERE es.assignment_id = $1 ORDER BY es.submitted_at ASC`,
      [id],
    );

    // External-visible attachments
    const atts = await this.db.query(
      `SELECT id, file_name, attachment_type, visibility_scope, malware_scan_status, file_size_bytes, created_at
       FROM external_attachments
       WHERE assignment_id = $1 AND visibility_scope != 'internal_only'
       ORDER BY created_at ASC`,
      [id],
    );

    // External-visible comments
    const comments = await this.db.query(
      `SELECT cc.id, cc.body, cc.internal, cc.created_at, u.first_name || ' ' || u.last_name AS author_name
       FROM case_comments cc
       LEFT JOIN users u ON u.id = cc.author_id
       WHERE cc.case_id = $1 AND cc.internal = false
       ORDER BY cc.created_at ASC`,
      [wo.case_id],
    );

    return { ...wo, submissions: subs.rows, attachments: atts.rows, comments: comments.rows };
  }

  async accept(id: string, userId: string, companyId: string, tenantId: string, ip: string) {
    const wo = await this.findOne(id, companyId, tenantId);
    if (!['pending'].includes(wo.assignment_status)) {
      throw new ForbiddenException(`Cannot accept work order with status: ${wo.assignment_status}`);
    }

    await this.db.query(
      `UPDATE work_order_assignments SET assignment_status = 'accepted', accepted_at = NOW(), assigned_user_id = COALESCE(assigned_user_id, $3), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, userId],
    );

    await this.db.query(
      `INSERT INTO external_submissions (id, tenant_id, assignment_id, submitted_by, submission_type, notes, submitted_at)
       VALUES ($1,$2,$3,$4,'acceptance','Work order accepted',NOW())`,
      [uuidv4(), tenantId, id, userId],
    );

    await this.audit(tenantId, userId, wo.assigned_user_name || userId, 'ACCEPT_WORK_ORDER', 'work_order_assignment', id, { case_number: wo.case_number }, ip);
    return { success: true };
  }

  async reject(id: string, userId: string, companyId: string, tenantId: string, reason: string, ip: string) {
    const wo = await this.findOne(id, companyId, tenantId);
    if (!['pending', 'accepted'].includes(wo.assignment_status)) {
      throw new ForbiddenException(`Cannot reject work order with status: ${wo.assignment_status}`);
    }

    await this.db.query(
      `UPDATE work_order_assignments SET assignment_status = 'rejected', rejected_at = NOW(), rejection_reason = $3, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, reason],
    );

    await this.db.query(
      `INSERT INTO external_submissions (id, tenant_id, assignment_id, submitted_by, submission_type, notes, submitted_at)
       VALUES ($1,$2,$3,$4,'rejection',$5,NOW())`,
      [uuidv4(), tenantId, id, userId, reason],
    );

    // Add external-visible comment, attributed to the actual contractor who
    // rejected it. author_id has no FK to `users` (dropped in migration 009 --
    // external_users ids are a disjoint UUID space), and the comments query's
    // `LEFT JOIN users` intentionally returns author_name=NULL for such rows so
    // the contractor portal's chat UI renders it as "my own message" rather
    // than mislabeling it "(Operator)".
    await this.db.query(
      `INSERT INTO case_comments (id, case_id, tenant_id, author_id, body, internal, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,false,NOW(),NOW())`,
      [uuidv4(), wo.case_id, tenantId, userId, `Contractor rejection: ${reason}`],
    );

    await this.audit(tenantId, userId, wo.assigned_user_name || userId, 'REJECT_WORK_ORDER', 'work_order_assignment', id, { reason }, ip);
    return { success: true };
  }

  async submitProgress(id: string, userId: string, companyId: string, tenantId: string, dto: any, ip: string) {
    const wo = await this.findOne(id, companyId, tenantId);

    // Auto-transition to in_progress if accepted
    if (wo.assignment_status === 'accepted') {
      await this.db.query(
        `UPDATE work_order_assignments SET assignment_status = 'in_progress', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
    }

    await this.db.query(
      `INSERT INTO external_submissions (id, tenant_id, assignment_id, submitted_by, submission_type, notes, payload, submitted_at)
       VALUES ($1,$2,$3,$4,'progress_update',$5,$6,NOW())`,
      [uuidv4(), tenantId, id, userId, dto.notes || '', JSON.stringify(dto.payload || {})],
    );

    await this.audit(tenantId, userId, wo.assigned_user_name || userId, 'SUBMIT_PROGRESS', 'work_order_assignment', id, { notes: dto.notes }, ip);
    return { success: true };
  }

  async submitCompletion(id: string, userId: string, companyId: string, tenantId: string, dto: any, ip: string) {
    const wo = await this.findOne(id, companyId, tenantId);
    if (!['accepted', 'in_progress', 'rework_required'].includes(wo.assignment_status)) {
      throw new ForbiddenException(`Cannot submit completion for work order with status: ${wo.assignment_status}`);
    }

    const submissionType = wo.assignment_status === 'rework_required' ? 'rework_submission' : 'completion';

    await this.db.query(
      `UPDATE work_order_assignments SET assignment_status = 'submitted', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );

    await this.db.query(
      `INSERT INTO external_submissions (id, tenant_id, assignment_id, submitted_by, submission_type, notes, payload, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
      [uuidv4(), tenantId, id, userId, submissionType, dto.notes || '', JSON.stringify(dto.payload || {})],
    );

    // Update case status to pending internal review
    await this.db.query(
      `UPDATE cases SET status = 'pending_review', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [wo.case_id, tenantId],
    );

    await this.audit(tenantId, userId, wo.assigned_user_name || userId, 'SUBMIT_COMPLETION', 'work_order_assignment', id, { type: submissionType }, ip);
    return { success: true };
  }

  async requestClarification(id: string, userId: string, companyId: string, tenantId: string, message: string, ip: string) {
    const wo = await this.findOne(id, companyId, tenantId);

    await this.db.query(
      `INSERT INTO external_submissions (id, tenant_id, assignment_id, submitted_by, submission_type, notes, submitted_at)
       VALUES ($1,$2,$3,$4,'clarification_request',$5,NOW())`,
      [uuidv4(), tenantId, id, userId, message],
    );

    // Add as external-visible case comment, attributed to the actual contractor
    // (see the identical note in reject() above).
    await this.db.query(
      `INSERT INTO case_comments (id, case_id, tenant_id, author_id, body, internal, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,false,NOW(),NOW())`,
      [uuidv4(), wo.case_id, tenantId, userId, `[Clarification Request] ${message}`],
    );

    await this.audit(tenantId, userId, wo.assigned_user_name || userId, 'REQUEST_CLARIFICATION', 'work_order_assignment', id, { message }, ip);
    return { success: true };
  }

  async requestReschedule(id: string, userId: string, companyId: string, tenantId: string, dto: any, ip: string) {
    const wo = await this.findOne(id, companyId, tenantId);

    await this.db.query(
      `INSERT INTO external_submissions (id, tenant_id, assignment_id, submitted_by, submission_type, notes, payload, status, submitted_at)
       VALUES ($1,$2,$3,$4,'reschedule_request',$5,$6,'pending',NOW())`,
      [uuidv4(), tenantId, id, userId, dto.reason || '', JSON.stringify({ requested_date: dto.requestedDate })],
    );

    await this.audit(tenantId, userId, wo.assigned_user_name || userId, 'REQUEST_RESCHEDULE', 'work_order_assignment', id, dto, ip);
    return { success: true };
  }

  async getDashboardStats(userId: string, companyId: string, tenantId: string) {
    const result = await this.db.query(
      `SELECT
        COUNT(*) FILTER (WHERE assignment_status = 'pending') AS assigned,
        COUNT(*) FILTER (WHERE assignment_status IN ('accepted','in_progress')) AS in_progress,
        COUNT(*) FILTER (WHERE assignment_status = 'submitted') AS pending_review,
        COUNT(*) FILTER (WHERE assignment_status = 'rework_required') AS rework_required,
        COUNT(*) FILTER (WHERE due_at < NOW() AND assignment_status NOT IN ('closed','rejected','submitted')) AS overdue,
        COUNT(*) FILTER (WHERE assignment_status = 'closed') AS closed_this_month
       FROM work_order_assignments
       WHERE tenant_id = $1 AND assigned_company_id = $2`,
      [tenantId, companyId],
    );

    const recent = await this.db.query(
      `SELECT woa.id, woa.assignment_status, woa.assigned_at, woa.due_at,
              c.case_number, c.title, c.priority
       FROM work_order_assignments woa
       JOIN cases c ON c.id = woa.case_id
       WHERE woa.tenant_id = $1 AND woa.assigned_company_id = $2
         AND woa.assignment_status NOT IN ('closed','rejected')
       ORDER BY woa.assigned_at DESC LIMIT 5`,
      [tenantId, companyId],
    );

    return { stats: result.rows[0], recent_work_orders: recent.rows };
  }
}
