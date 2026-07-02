import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface RoutingInput {
  group?: string;     // candidate group = role key (e.g. it_engineer, manager, cab_member)
  teamId?: string;    // optional explicit team / org unit
}
export interface RoutingResult {
  assigneeId: string | null;
  assignedTeamId: string | null;
  queue: string | null;   // group left as a claimable queue when no assignee resolved
}

/**
 * C3 — the single assignment/routing engine, shared by case-service (case
 * creation) and bpm-orchestrator (task creation) via HTTP. Resolves the
 * least-loaded active member of a candidate group (role), where "load" =
 * open cases + open tasks already assigned to that user. Falls back to a
 * claimable group queue when nobody resolves.
 */
@Injectable()
export class RoutingService {
  constructor(private readonly db: DatabaseService) {}

  async resolve(tenantId: string, input: RoutingInput): Promise<RoutingResult> {
    let assigneeId: string | null = null;
    if (input.group) {
      // Prefer an active member; fall back to any member of the group so routing
      // still works in environments where the local `active` flag isn't maintained.
      assigneeId = await this.pickLeastLoaded(tenantId, input.group, true)
                || await this.pickLeastLoaded(tenantId, input.group, false);
    }
    return {
      assigneeId,
      assignedTeamId: input.teamId || null,
      queue: assigneeId ? null : (input.group || null),
    };
  }

  private async pickLeastLoaded(tenantId: string, group: string, activeOnly: boolean): Promise<string | null> {
    const r = await this.db.query(
      `SELECT u.id,
              (SELECT count(*) FROM cases c
                 WHERE c.assignee_id = u.id AND c.status NOT IN ('resolved','closed','cancelled'))
            + (SELECT count(*) FROM tasks t
                 WHERE t.assignee_id = u.id AND t.status IN ('pending','in_progress')) AS load
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles ro       ON ro.id = ur.role_id
        WHERE u.tenant_id = $1 AND ro.key = $2 ${activeOnly ? 'AND u.active = true' : ''}
        ORDER BY load ASC, u.created_at ASC
        LIMIT 1`,
      [tenantId, group],
    );
    return r.rows[0]?.id || null;
  }
}
