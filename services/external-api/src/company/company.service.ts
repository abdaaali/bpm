import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CompanyService {
  constructor(private readonly db: DatabaseService) {}

  async getMyCompany(companyId: string, tenantId: string) {
    const result = await this.db.query(
      `SELECT ec.*, pc.company_name AS parent_company_name
       FROM external_companies ec
       LEFT JOIN external_companies pc ON pc.id = ec.parent_company_id
       WHERE ec.id = $1 AND ec.tenant_id = $2`,
      [companyId, tenantId],
    );
    return result.rows[0];
  }

  async getTeam(companyId: string, tenantId: string) {
    const result = await this.db.query(
      `SELECT eu.id, eu.username, eu.email, eu.full_name, eu.role, eu.active, eu.last_login_at,
              COUNT(woa.id) FILTER (WHERE woa.assignment_status NOT IN ('closed','rejected')) AS active_assignments
       FROM external_users eu
       LEFT JOIN work_order_assignments woa ON woa.assigned_user_id = eu.id AND woa.tenant_id = eu.tenant_id
       WHERE eu.external_company_id = $1 AND eu.tenant_id = $2 AND eu.active = true
       GROUP BY eu.id
       ORDER BY eu.full_name ASC`,
      [companyId, tenantId],
    );
    return result.rows;
  }

  async getStats(companyId: string, tenantId: string) {
    const result = await this.db.query(
      `SELECT eu.id, eu.full_name, eu.role,
              COUNT(woa.id) FILTER (WHERE woa.assignment_status NOT IN ('closed','rejected')) AS active,
              COUNT(woa.id) FILTER (WHERE woa.assignment_status = 'closed') AS completed,
              COUNT(woa.id) FILTER (WHERE woa.due_at < NOW() AND woa.assignment_status NOT IN ('closed','rejected')) AS overdue
       FROM external_users eu
       LEFT JOIN work_order_assignments woa ON woa.assigned_user_id = eu.id
       WHERE eu.external_company_id = $1 AND eu.tenant_id = $2 AND eu.active = true
       GROUP BY eu.id ORDER BY active DESC`,
      [companyId, tenantId],
    );
    return result.rows;
  }
}
