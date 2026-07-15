import { Injectable, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SubmissionsService {
  constructor(private readonly db: DatabaseService) {}

  async findByAssignment(assignmentId: string, companyId: string, tenantId: string) {
    // The assignment must belong to the caller's own company — without this check any
    // authenticated contractor could read another company's submission history by
    // guessing/enumerating an assignment UUID. Same pattern as
    // WorkOrdersService.findOne()'s assigned_company_id check.
    const owns = await this.db.query(
      `SELECT 1 FROM work_order_assignments WHERE id=$1 AND tenant_id=$2 AND assigned_company_id=$3`,
      [assignmentId, tenantId, companyId],
    );
    if (!owns.rows[0]) throw new ForbiddenException('Assignment not found or access denied');

    const result = await this.db.query(
      `SELECT es.*, eu.full_name AS submitter_name
       FROM external_submissions es
       LEFT JOIN external_users eu ON eu.id = es.submitted_by
       WHERE es.assignment_id = $1 AND es.tenant_id = $2
       ORDER BY es.submitted_at ASC`,
      [assignmentId, tenantId],
    );
    return result.rows;
  }
}
