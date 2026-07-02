import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CaseService } from '../case/case.service';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

// Case statuses from which a contractor action should NOT drive a status change.
const TERMINAL_CASE_STATUSES = ['resolved', 'closed', 'cancelled'];

@Injectable()
export class ContractorService {
  private readonly logger = new Logger(ContractorService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly caseSvc: CaseService,
  ) {}

  // ── Utilities ─────────────────────────────────────────────────────────────

  private async auditLog(tenantId: string, actorId: string, actorType: string, action: string, resourceType: string, resourceId: string, details: any, req?: any) {
    try {
      await this.db.query(
        `INSERT INTO external_audit_log (id, tenant_id, actor_type, actor_id, actor_name, action, resource_type, resource_id, details, ip_address, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [uuidv4(), tenantId, actorType, actorId, details?.actor_name || actorId, action, resourceType, resourceId, JSON.stringify(details), req?.ip || '0.0.0.0'],
      );
    } catch (err) {
      this.logger.warn(`Audit log failed: ${err.message}`);
    }
  }

  // ── External Companies ────────────────────────────────────────────────────

  async getCompanies(tenantId: string, filters: any = {}) {
    let sql = `
      SELECT ec.*, pc.company_name AS parent_company_name,
             COUNT(eu.id)::int AS user_count
      FROM external_companies ec
      LEFT JOIN external_companies pc ON pc.id = ec.parent_company_id
      LEFT JOIN external_users eu ON eu.external_company_id = ec.id AND eu.active = true
      WHERE ec.tenant_id = $1`;
    const params: any[] = [tenantId];

    if (filters.active !== undefined) {
      params.push(filters.active === 'true' || filters.active === true);
      sql += ` AND ec.active = $${params.length}`;
    }
    if (filters.company_type) {
      params.push(filters.company_type);
      sql += ` AND ec.company_type = $${params.length}`;
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      sql += ` AND ec.company_name ILIKE $${params.length}`;
    }

    sql += ' GROUP BY ec.id, pc.company_name ORDER BY ec.company_name ASC';
    const result = await this.db.query(sql, params);
    return result.rows;
  }

  async getCompany(id: string, tenantId: string) {
    const result = await this.db.query(
      `SELECT ec.*, pc.company_name AS parent_company_name
       FROM external_companies ec
       LEFT JOIN external_companies pc ON pc.id = ec.parent_company_id
       WHERE ec.id = $1 AND ec.tenant_id = $2`,
      [id, tenantId],
    );
    if (!result.rows[0]) throw new NotFoundException('Company not found');
    return result.rows[0];
  }

  async createCompany(tenantId: string, dto: any, actorId: string) {
    const id = uuidv4();
    const result = await this.db.query(
      `INSERT INTO external_companies (id, tenant_id, company_name, company_type, parent_company_id,
        qualification_status, active, contact_email, contact_phone, region_scope, capabilities, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW()) RETURNING *`,
      [
        id, tenantId, dto.company_name, dto.company_type || 'contractor',
        dto.parent_company_id || null,
        dto.qualification_status || 'pending',
        dto.active !== false,
        dto.contact_email || null, dto.contact_phone || null,
        dto.region_scope || [], dto.capabilities || [],
      ],
    );
    await this.auditLog(tenantId, actorId, 'internal_user', 'CREATE_COMPANY', 'external_company', id, { company_name: dto.company_name });
    return result.rows[0];
  }

  async updateCompany(id: string, tenantId: string, dto: any, actorId: string) {
    await this.getCompany(id, tenantId);
    const result = await this.db.query(
      `UPDATE external_companies SET
        company_name = COALESCE($3, company_name),
        company_type = COALESCE($4, company_type),
        parent_company_id = COALESCE($5, parent_company_id),
        qualification_status = COALESCE($6, qualification_status),
        active = COALESCE($7, active),
        contact_email = COALESCE($8, contact_email),
        contact_phone = COALESCE($9, contact_phone),
        region_scope = COALESCE($10, region_scope),
        capabilities = COALESCE($11, capabilities),
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, tenantId, dto.company_name, dto.company_type, dto.parent_company_id,
       dto.qualification_status, dto.active, dto.contact_email, dto.contact_phone,
       dto.region_scope, dto.capabilities],
    );
    await this.auditLog(tenantId, actorId, 'internal_user', 'UPDATE_COMPANY', 'external_company', id, dto);
    return result.rows[0];
  }

  async deleteCompany(id: string, tenantId: string, actorId: string) {
    await this.getCompany(id, tenantId);
    await this.db.query(
      `UPDATE external_companies SET active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    await this.auditLog(tenantId, actorId, 'internal_user', 'DEACTIVATE_COMPANY', 'external_company', id, {});
    return { success: true };
  }

  // ── External Users ────────────────────────────────────────────────────────

  async getUsers(tenantId: string, filters: any = {}) {
    let sql = `
      SELECT eu.id, eu.tenant_id, eu.external_company_id, eu.external_company_id AS company_id,
             eu.username, eu.email, eu.full_name,
             eu.role, eu.active, eu.last_login_at, eu.mfa_enabled, eu.created_at,
             ec.company_name
      FROM external_users eu
      JOIN external_companies ec ON ec.id = eu.external_company_id
      WHERE eu.tenant_id = $1`;
    const params: any[] = [tenantId];

    if (filters.company_id) {
      params.push(filters.company_id);
      sql += ` AND eu.external_company_id = $${params.length}`;
    }
    if (filters.role) {
      params.push(filters.role);
      sql += ` AND eu.role = $${params.length}`;
    }
    if (filters.active !== undefined) {
      params.push(filters.active === 'true' || filters.active === true);
      sql += ` AND eu.active = $${params.length}`;
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      sql += ` AND (eu.full_name ILIKE $${params.length} OR eu.email ILIKE $${params.length} OR eu.username ILIKE $${params.length})`;
    }

    sql += ' ORDER BY eu.full_name ASC';
    const result = await this.db.query(sql, params);
    return result.rows;
  }

  async createUser(tenantId: string, dto: any, actorId: string) {
    const id = uuidv4();
    // The UI sends `company_id`; the column is `external_company_id`. Accept both.
    const companyId = dto.external_company_id ?? dto.company_id;
    if (!companyId) throw new BadRequestException('company_id is required');
    if (!dto.username || !dto.email || !dto.full_name) {
      throw new BadRequestException('username, email and full_name are required');
    }
    const passwordHash = await bcrypt.hash(dto.password || dto.temp_password || 'Contractor123!', 10);
    let result;
    try {
      result = await this.db.query(
        `INSERT INTO external_users (id, tenant_id, external_company_id, username, email, full_name,
          role, active, password_hash, mfa_enabled, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
         RETURNING id, tenant_id, external_company_id AS company_id, username, email, full_name, role, active, created_at`,
        [id, tenantId, companyId, dto.username, dto.email, dto.full_name,
         dto.role || 'technician', dto.active !== false, passwordHash, dto.mfa_enabled || false],
      );
    } catch (e: any) {
      // Clean errors instead of a bare 500 for the common cases.
      if (e.code === '23505') throw new ConflictException('A user with that username or email already exists');
      if (e.code === '23503') throw new BadRequestException('Unknown company');
      throw e;
    }
    await this.auditLog(tenantId, actorId, 'internal_user', 'CREATE_USER', 'external_user', id, { email: dto.email, role: dto.role });
    return result.rows[0];
  }

  async updateUser(id: string, tenantId: string, dto: any, actorId: string) {
    const result = await this.db.query(
      `UPDATE external_users SET
        full_name = COALESCE($3, full_name),
        role = COALESCE($4, role),
        active = COALESCE($5, active),
        email = COALESCE($6, email),
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2 RETURNING id, email, full_name, role, active`,
      [id, tenantId, dto.full_name, dto.role, dto.active, dto.email],
    );
    if (!result.rows[0]) throw new NotFoundException('User not found');
    await this.auditLog(tenantId, actorId, 'internal_user', 'UPDATE_USER', 'external_user', id, dto);
    return result.rows[0];
  }

  async resetUserPassword(id: string, tenantId: string, dto: any, actorId: string) {
    const passwordHash = await bcrypt.hash(dto.password || 'Contractor123!', 10);
    await this.db.query(
      `UPDATE external_users SET password_hash = $3, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, passwordHash],
    );
    await this.auditLog(tenantId, actorId, 'internal_user', 'RESET_PASSWORD', 'external_user', id, {});
    return { success: true };
  }

  async deleteUser(id: string, tenantId: string, actorId: string) {
    await this.db.query(
      `UPDATE external_users SET active = false, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    await this.auditLog(tenantId, actorId, 'internal_user', 'DEACTIVATE_USER', 'external_user', id, {});
    return { success: true };
  }

  // ── Work Order Assignments ─────────────────────────────────────────────────

  async getAssignments(tenantId: string, filters: any = {}) {
    let sql = `
      SELECT woa.*, 'WO-' || UPPER(REPLACE(SUBSTRING(woa.id::text, 25), '-', '')) AS work_order_ref,
             c.case_number, c.title, c.type AS case_type, c.priority, c.status AS case_status,
             ec.company_name, eu.full_name AS assigned_user_name,
             iu.first_name || ' ' || iu.last_name AS assigned_by_name,
             resched.id AS reschedule_id, resched.requested_date AS reschedule_requested_date,
             resched.notes AS reschedule_reason, resched.submitted_at AS reschedule_at
      FROM work_order_assignments woa
      JOIN cases c ON c.id = woa.case_id
      JOIN external_companies ec ON ec.id = woa.assigned_company_id
      LEFT JOIN external_users eu ON eu.id = woa.assigned_user_id
      LEFT JOIN users iu ON iu.id = woa.assigned_by_internal_user_id
      LEFT JOIN LATERAL (
        SELECT es.id, es.payload->>'requested_date' AS requested_date, es.notes, es.submitted_at
        FROM external_submissions es
        WHERE es.assignment_id = woa.id AND es.submission_type = 'reschedule_request'
          AND COALESCE(es.status, 'pending') = 'pending'
        ORDER BY es.submitted_at DESC LIMIT 1
      ) resched ON true
      WHERE woa.tenant_id = $1`;
    const params: any[] = [tenantId];

    if (filters.status) {
      const statuses = filters.status.split(',').map((s: string) => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        params.push(statuses[0]);
        sql += ` AND woa.assignment_status = $${params.length}`;
      } else {
        params.push(statuses);
        sql += ` AND woa.assignment_status = ANY($${params.length})`;
      }
    }
    if (filters.company_id) {
      params.push(filters.company_id);
      sql += ` AND woa.assigned_company_id = $${params.length}`;
    }
    if (filters.case_id) {
      params.push(filters.case_id);
      sql += ` AND woa.case_id = $${params.length}`;
    }
    if (filters.overdue === 'true') {
      sql += ` AND woa.due_at < NOW() AND woa.assignment_status NOT IN ('completed','closed','rejected')`;
    }

    sql += ' ORDER BY woa.assigned_at DESC';

    const page = parseInt(filters.page) || 1;
    const pageSize = parseInt(filters.pageSize) || 20;
    const offset = (page - 1) * pageSize;
    sql += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(pageSize, offset);

    const result = await this.db.query(sql, params);
    return { data: result.rows, page, pageSize };
  }

  // Internal decision on a contractor's reschedule request. Approve moves the
  // work order's due date (requested date, approver-adjustable) and freezes the
  // parent case's SLA for the reschedule window — fair to the contractor, who
  // shouldn't breach SLA for time he couldn't access the site. The freeze is
  // recorded through the case SLA-pause subsystem (case_sla_pauses + net-time
  // shift of every due column) rather than poking sla_due_at directly, so it is
  // audited and consistent with manual pause/resume. The whole decision runs in
  // one transaction with the request row locked, so concurrent/double approvals
  // cannot apply the shift twice.
  async respondReschedule(assignmentId: string, tenantId: string, actorId: string, dto: any) {
    const decision = dto.decision === 'approve' ? 'approved' : 'rejected';
    const resolved = await this.db.query(`SELECT id FROM users WHERE tenant_id=$2 AND (id::text=$1 OR keycloak_id=$1) LIMIT 1`, [actorId, tenantId]);
    const respondedBy = resolved.rows[0]?.id || null;

    const client = await this.db.pool.connect();
    let freezeMinutes = 0;
    let rescheduleId: string | null = null;
    try {
      await client.query('BEGIN');
      // Lock the pending request so a racing approval waits and then finds it
      // already responded — exactly one decision applies the side effects.
      const r = await client.query(
        `SELECT id, payload->>'requested_date' AS requested_date FROM external_submissions
         WHERE tenant_id=$1 AND assignment_id=$2 AND submission_type='reschedule_request'
           AND COALESCE(status,'pending')='pending'
         ORDER BY submitted_at DESC LIMIT 1 FOR UPDATE`,
        [tenantId, assignmentId],
      );
      if (!r.rows[0]) throw new BadRequestException('No pending reschedule request for this work order');
      rescheduleId = r.rows[0].id;

      await client.query(
        `UPDATE external_submissions SET status=$3, responded_at=NOW(), responded_by=$4, response_note=$5
         WHERE id=$1 AND tenant_id=$2`,
        [rescheduleId, tenantId, decision, respondedBy, dto.note || null],
      );

      if (decision === 'approved') {
        const newDue = dto.new_due_at || r.rows[0].requested_date;
        if (newDue) {
          // Move the work order's due date and read its previous value atomically
          // (locked), so the reschedule delay can't be computed off a stale read.
          const upd = await client.query(
            `WITH prev AS (
               SELECT case_id, due_at AS old_due FROM work_order_assignments
               WHERE id=$1 AND tenant_id=$2 FOR UPDATE
             )
             UPDATE work_order_assignments w SET due_at=$3, updated_at=NOW()
             FROM prev WHERE w.id=$1 AND w.tenant_id=$2
             RETURNING prev.case_id AS case_id, prev.old_due AS old_due`,
            [assignmentId, tenantId, newDue],
          );
          const caseId = upd.rows[0]?.case_id;
          const oldDue = upd.rows[0]?.old_due;

          // Freeze duration = the slip (newDue − oldDue), in minutes. Only a
          // forward move credits time; an earlier reschedule never shrinks SLA,
          // and a missing/invalid old due skips the shift (logged, not silent).
          const oldMs = oldDue ? new Date(oldDue).getTime() : NaN;
          const newMs = newDue ? new Date(newDue).getTime() : NaN;
          freezeMinutes = (!isNaN(oldMs) && !isNaN(newMs) && newMs > oldMs)
            ? Math.round((newMs - oldMs) / 60_000) : 0;
          if (caseId && freezeMinutes === 0) {
            this.logger.warn(`Reschedule for WO ${assignmentId}: no SLA freeze applied (oldDue=${oldDue}, newDue=${newDue})`);
          }

          if (caseId) {
            // Record the freeze as a closed SLA-pause interval (auditable via the
            // case SLA timeline). The partial unique index allows many closed
            // intervals; only one *open* pause per case is disallowed.
            if (freezeMinutes > 0) {
              await client.query(
                `INSERT INTO case_sla_pauses(tenant_id, case_id, reason, note, paused_at, resumed_at, duration_minutes, paused_by, resumed_by)
                 VALUES($1,$2,'waiting_access',$3,$4,$5,$6,$7,$7)`,
                [tenantId, caseId, `Contractor reschedule approved (WO due ${oldDue} → ${newDue})`, oldDue, newDue, freezeMinutes, respondedBy],
              );
            }
            // planned_end_at tracks the new completion date; every still-pending
            // due column is pushed out by the frozen minutes (net-time fairness,
            // mirroring doResume); version bumps for optimistic-lock safety.
            await client.query(
              `UPDATE cases SET
                 planned_end_at = $3,
                 sla_due_at      = CASE WHEN sla_due_at      IS NOT NULL AND $4 > 0 THEN sla_due_at      + ($4 || ' minutes')::interval ELSE sla_due_at      END,
                 response_due_at = CASE WHEN response_due_at IS NOT NULL AND $4 > 0 THEN response_due_at + ($4 || ' minutes')::interval ELSE response_due_at END,
                 restore_due_at  = CASE WHEN restore_due_at  IS NOT NULL AND $4 > 0 THEN restore_due_at  + ($4 || ' minutes')::interval ELSE restore_due_at  END,
                 sla_paused_total_minutes = sla_paused_total_minutes + $4,
                 version = version + 1,
                 updated_at = NOW()
               WHERE id=$1 AND tenant_id=$2`,
              [caseId, tenantId, newDue, freezeMinutes],
            );
          }
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await this.auditLog(tenantId, actorId, 'internal_user',
      decision === 'approved' ? 'APPROVE_RESCHEDULE' : 'REJECT_RESCHEDULE',
      'work_order_assignment', assignmentId,
      { reschedule_id: rescheduleId, new_due_at: dto.new_due_at, note: dto.note, sla_freeze_minutes: freezeMinutes });
    return this.getAssignment(assignmentId, tenantId);
  }

  async getAssignment(id: string, tenantId: string) {
    const result = await this.db.query(
      `SELECT woa.*, 'WO-' || UPPER(REPLACE(SUBSTRING(woa.id::text, 25), '-', '')) AS work_order_ref,
              c.case_number, c.title, c.description, c.type AS case_type, c.priority,
              c.status AS case_status, c.context->>'site_name' AS site_name, c.context->>'location' AS location,
              ec.company_name, ec.contact_email AS company_contact,
              eu.full_name AS assigned_user_name, eu.email AS assigned_user_email,
              iu.first_name || ' ' || iu.last_name AS assigned_by_name,
              resched.id AS reschedule_id, resched.requested_date AS reschedule_requested_date,
              resched.notes AS reschedule_reason, resched.submitted_at AS reschedule_at
       FROM work_order_assignments woa
       JOIN cases c ON c.id = woa.case_id
       JOIN external_companies ec ON ec.id = woa.assigned_company_id
       LEFT JOIN external_users eu ON eu.id = woa.assigned_user_id
       LEFT JOIN users iu ON iu.id = woa.assigned_by_internal_user_id
       LEFT JOIN LATERAL (
         SELECT es.id, es.payload->>'requested_date' AS requested_date, es.notes, es.submitted_at
         FROM external_submissions es
         WHERE es.assignment_id = woa.id AND es.submission_type = 'reschedule_request'
           AND COALESCE(es.status, 'pending') = 'pending'
         ORDER BY es.submitted_at DESC LIMIT 1
       ) resched ON true
       WHERE woa.id = $1 AND woa.tenant_id = $2`,
      [id, tenantId],
    );
    if (!result.rows[0]) throw new NotFoundException('Assignment not found');

    // Fetch submissions
    const subs = await this.db.query(
      `SELECT es.*, eu.full_name AS submitter_name
       FROM external_submissions es
       LEFT JOIN external_users eu ON eu.id = es.submitted_by
       WHERE es.assignment_id = $1
       ORDER BY es.submitted_at ASC`,
      [id],
    );

    // Fetch attachments (external-visible only)
    const atts = await this.db.query(
      `SELECT id, file_name, attachment_type, visibility_scope, malware_scan_status, file_size_bytes, created_at
       FROM external_attachments
       WHERE assignment_id = $1 AND visibility_scope != 'internal_only'
       ORDER BY created_at ASC`,
      [id],
    );

    // Fetch external-visible comments
    const comments = await this.db.query(
      `SELECT cc.id, cc.body, cc.internal, cc.created_at, u.first_name || ' ' || u.last_name AS author_name
       FROM case_comments cc
       LEFT JOIN users u ON u.id = cc.author_id
       WHERE cc.case_id = $1 AND cc.internal = false
       ORDER BY cc.created_at ASC`,
      [result.rows[0].case_id],
    );

    return {
      ...result.rows[0],
      submissions: subs.rows,
      attachments: atts.rows,
      comments: comments.rows,
    };
  }

  async dispatch(tenantId: string, dto: any, actorId: string) {
    const assignmentId = uuidv4();
    // The dispatch form sends company_id/user_id; the columns are
    // assigned_company_id/assigned_user_id. Accept both.
    const assignedCompanyId = dto.assigned_company_id ?? dto.company_id;
    const assignedUserId = dto.assigned_user_id ?? dto.user_id ?? null;
    if (!dto.case_id) throw new BadRequestException('case_id is required');
    if (!assignedCompanyId) throw new BadRequestException('company_id is required');

    // Validate case exists
    const caseResult = await this.db.query(
      `SELECT id, case_number, title, status FROM cases WHERE id = $1 AND tenant_id = $2`,
      [dto.case_id, tenantId],
    );
    if (!caseResult.rows[0]) throw new NotFoundException('Case not found');

    // Validate company exists
    const companyResult = await this.db.query(
      `SELECT id, company_name FROM external_companies WHERE id = $1 AND tenant_id = $2 AND active = true`,
      [assignedCompanyId, tenantId],
    );
    if (!companyResult.rows[0]) throw new NotFoundException('External company not found');

    await this.db.query(
      `INSERT INTO work_order_assignments (id, tenant_id, case_id, assigned_company_id, assigned_user_id,
        assignment_type, assignment_status, assigned_by_internal_user_id, assigned_at, due_at, sla_hours,
        instructions, rework_count, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,NOW(),$8,$9,$10,0,NOW(),NOW())`,
      [assignmentId, tenantId, dto.case_id, assignedCompanyId, assignedUserId,
       dto.assignment_type || 'company', actorId, dto.due_at || null, dto.sla_hours || 24, dto.instructions || null],
    );

    // Move the case to dispatched_external through the state machine (version
    // bump, audit, status_changed event, SLA handling) instead of a raw UPDATE.
    // Skip for terminal cases; best-effort for unusual source states (the work
    // order is the primary action and is already recorded).
    if (!TERMINAL_CASE_STATUSES.includes(caseResult.rows[0].status)) {
      try {
        await this.caseSvc.transition(tenantId, dto.case_id, 'dispatched_external',
          { comment: `Dispatched to ${companyResult.rows[0].company_name}` }, actorId);
      } catch (e: any) {
        this.logger.warn(`Case ${dto.case_id} dispatch status change skipped: ${e.message}`);
      }
    }

    await this.auditLog(tenantId, actorId, 'internal_user', 'DISPATCH_WORK_ORDER', 'work_order_assignment', assignmentId, {
      case_id: dto.case_id,
      case_number: caseResult.rows[0].case_number,
      company_id: dto.assigned_company_id,
      company_name: companyResult.rows[0].company_name,
    });

    return { id: assignmentId, case_number: caseResult.rows[0].case_number, company_name: companyResult.rows[0].company_name };
  }

  async approveAssignment(id: string, tenantId: string, actorId: string, dto: any = {}) {
    const asgn = await this.getAssignment(id, tenantId);

    await this.db.query(
      `UPDATE work_order_assignments SET assignment_status = 'closed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );

    // Resolve the linked case through the state machine (resolution fields,
    // version bump, audit, status_changed event, SLA auto-resume, work note),
    // unless it's already in a terminal state.
    const caseRow = await this.db.query(`SELECT status FROM cases WHERE id=$1 AND tenant_id=$2`, [asgn.case_id, tenantId]);
    if (caseRow.rows[0] && !TERMINAL_CASE_STATUSES.includes(caseRow.rows[0].status)) {
      try {
        await this.caseSvc.transition(tenantId, asgn.case_id, 'resolved', {
          resolution_code: 'contractor_completed',
          resolution_notes: dto.resolution_notes || 'Contractor work approved',
          comment: `Work order approved.${dto.notes ? ' ' + dto.notes : ''}`,
        }, actorId);
      } catch (e: any) {
        this.logger.warn(`Case ${asgn.case_id} resolve-on-approval skipped: ${e.message}`);
      }
    }

    await this.auditLog(tenantId, actorId, 'internal_user', 'APPROVE_WORK_ORDER', 'work_order_assignment', id, { case_id: asgn.case_id });
    return { success: true };
  }

  async requestRework(id: string, tenantId: string, actorId: string, dto: any) {
    const asgn = await this.getAssignment(id, tenantId);

    await this.db.query(
      `UPDATE work_order_assignments SET
        assignment_status = 'rework_required',
        rework_count = rework_count + 1,
        updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );

    // Add external-visible comment explaining the rework
    await this.db.query(
      `INSERT INTO case_comments (id, case_id, tenant_id, author_id, body, internal, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,false,NOW(),NOW())`,
      [uuidv4(), asgn.case_id, tenantId, actorId, `Rework requested: ${dto.reason || 'Please review and resubmit'}`],
    );

    await this.auditLog(tenantId, actorId, 'internal_user', 'REQUEST_REWORK', 'work_order_assignment', id, {
      reason: dto.reason, rework_count: (asgn.rework_count || 0) + 1,
    });
    return { success: true };
  }

  async reassignAssignment(id: string, tenantId: string, actorId: string, dto: any) {
    // Cancel current assignment
    await this.db.query(
      `UPDATE work_order_assignments SET assignment_status = 'closed', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    const old = await this.db.query(`SELECT case_id, sla_hours FROM work_order_assignments WHERE id = $1`, [id]);

    // Create new assignment
    return this.dispatch(tenantId, { ...dto, case_id: old.rows[0]?.case_id, sla_hours: old.rows[0]?.sla_hours }, actorId);
  }

  async closeAssignment(id: string, tenantId: string, actorId: string, dto: any = {}) {
    await this.db.query(
      `UPDATE work_order_assignments SET assignment_status = 'closed', completed_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    await this.auditLog(tenantId, actorId, 'internal_user', 'CLOSE_WORK_ORDER', 'work_order_assignment', id, dto);
    return { success: true };
  }

  async addAssignmentComment(id: string, tenantId: string, actorId: string, body: string, isInternal: boolean) {
    const asgn = await this.db.query(
      `SELECT case_id FROM work_order_assignments WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    if (!asgn.rows[0]) throw new NotFoundException('Assignment not found');
    await this.db.query(
      `INSERT INTO case_comments (id, case_id, tenant_id, author_id, body, internal, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
      [uuidv4(), asgn.rows[0].case_id, tenantId, actorId, body, isInternal],
    );
    return { success: true };
  }

  // ── Dashboard ──────────────────────────────────────────────────────────────

  async getDashboard(tenantId: string, filters: any = {}) {
    const stats = await this.db.query(
      `SELECT
        COUNT(*) FILTER (WHERE assignment_status NOT IN ('closed','rejected')) AS active_work_orders,
        COUNT(*) FILTER (WHERE accepted_at IS NOT NULL) AS accepted_count,
        COUNT(*) FILTER (WHERE rejected_at IS NOT NULL) AS rejected_count,
        COUNT(*) FILTER (WHERE assignment_status = 'closed') AS closed_total,
        COUNT(*) FILTER (WHERE assignment_status = 'closed' AND COALESCE(rework_count,0) = 0) AS ftr_count,
        AVG(EXTRACT(EPOCH FROM (completed_at - assigned_at))/3600) FILTER (WHERE completed_at IS NOT NULL) AS avg_completion_hours
       FROM work_order_assignments WHERE tenant_id = $1`,
      [tenantId],
    );
    const s = stats.rows[0];
    const acc = Number(s.accepted_count), rej = Number(s.rejected_count), closed = Number(s.closed_total);
    const kpis = {
      active_work_orders: Number(s.active_work_orders) || 0,
      avg_acceptance_rate: acc + rej > 0 ? Math.round((100 * acc) / (acc + rej)) : 0,
      first_time_right_rate: closed > 0 ? Math.round((100 * Number(s.ftr_count)) / closed) : 0,
      avg_completion_hours: Math.round((Number(s.avg_completion_hours) || 0) * 10) / 10,
    };

    const byCompany = await this.db.query(
      `SELECT ec.id AS company_id, ec.company_name,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE woa.assignment_status NOT IN ('closed','rejected'))::int AS active_count,
              COUNT(*) FILTER (WHERE woa.due_at < NOW() AND woa.assignment_status NOT IN ('closed','rejected'))::int AS overdue_count,
              COALESCE(ROUND(100.0 * COUNT(*) FILTER (WHERE woa.assignment_status = 'closed') / NULLIF(COUNT(*),0), 1), 0) AS completion_rate,
              COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (woa.completed_at - woa.assigned_at))/3600) FILTER (WHERE woa.completed_at IS NOT NULL)::numeric, 1), 0) AS avg_completion_hours
       FROM work_order_assignments woa
       JOIN external_companies ec ON ec.id = woa.assigned_company_id
       WHERE woa.tenant_id = $1
       GROUP BY ec.id, ec.company_name
       ORDER BY COUNT(*) FILTER (WHERE woa.assignment_status NOT IN ('closed','rejected')) DESC`,
      [tenantId],
    );
    const top_contractors = byCompany.rows.map((r: any) => ({
      company_id: r.company_id, company_name: r.company_name,
      active_count: r.active_count, overdue_count: r.overdue_count,
      completion_rate: Number(r.completion_rate), avg_completion_hours: Number(r.avg_completion_hours),
    }));
    const assignments_by_company = byCompany.rows.map((r: any) => ({ company_name: r.company_name, count: r.total }));

    const trend = await this.db.query(
      `SELECT to_char(date_trunc('week', assigned_at), 'MM-DD') AS week,
              COUNT(*)::int AS dispatched,
              COUNT(*) FILTER (WHERE assignment_status = 'closed')::int AS completed
       FROM work_order_assignments
       WHERE tenant_id = $1 AND assigned_at > NOW() - INTERVAL '8 weeks'
       GROUP BY date_trunc('week', assigned_at)
       ORDER BY date_trunc('week', assigned_at)`,
      [tenantId],
    );

    const status = await this.db.query(
      `SELECT assignment_status AS status, COUNT(*)::int AS count
       FROM work_order_assignments WHERE tenant_id = $1
       GROUP BY assignment_status ORDER BY COUNT(*) DESC`,
      [tenantId],
    );

    return {
      kpis,
      top_contractors,
      assignments_by_company,
      completion_trend: trend.rows,
      status_breakdown: status.rows,
    };
  }

  async getPerformance(tenantId: string, filters: any = {}) {
    const result = await this.db.query(
      `SELECT ec.company_name, ec.id AS company_id, ec.company_type,
              COUNT(*) AS total_assignments,
              COUNT(*) FILTER (WHERE woa.assignment_status = 'closed') AS completed,
              COUNT(*) FILTER (WHERE woa.assignment_status IN ('accepted','in_progress')) AS in_progress,
              COUNT(*) FILTER (WHERE woa.assignment_status = 'rework_required') AS rework_count,
              COUNT(*) FILTER (WHERE woa.rejected_at IS NOT NULL) AS rejected,
              COUNT(*) FILTER (WHERE woa.due_at < NOW() AND woa.assignment_status NOT IN ('closed','rejected')) AS overdue,
              ROUND(100.0 * COUNT(*) FILTER (WHERE woa.assignment_status = 'closed') / NULLIF(COUNT(*),0), 1) AS completion_rate,
              ROUND(100.0 * COUNT(*) FILTER (WHERE woa.rework_count = 0 AND woa.assignment_status = 'closed') / NULLIF(COUNT(*) FILTER (WHERE woa.assignment_status = 'closed'),0), 1) AS first_time_right_rate,
              ROUND(AVG(EXTRACT(EPOCH FROM (woa.completed_at - woa.assigned_at))/3600) FILTER (WHERE woa.completed_at IS NOT NULL), 1) AS avg_hours
       FROM work_order_assignments woa
       JOIN external_companies ec ON ec.id = woa.assigned_company_id
       WHERE woa.tenant_id = $1
       GROUP BY ec.id, ec.company_name, ec.company_type
       ORDER BY total_assignments DESC`,
      [tenantId],
    );
    return result.rows;
  }
}
