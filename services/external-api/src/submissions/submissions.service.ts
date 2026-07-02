import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class SubmissionsService {
  constructor(private readonly db: DatabaseService) {}

  async findByAssignment(assignmentId: string, tenantId: string) {
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
