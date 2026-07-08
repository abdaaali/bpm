import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { DatabaseService } from '../database/database.service';

export interface ResolvedStep {
  stepId: string;
  stepIndex: number;
  label: string;
  approverId: string;
  approverName: string;
  approverEmail: string;
  parallel: boolean;
  slaHours: number;
  dueAt: Date;
  delegatedFrom?: string;
  condition?: any;
}

@Injectable()
export class ApprovalResolverService {
  private readonly logger = new Logger(ApprovalResolverService.name);

  constructor(private readonly db: DatabaseService) {}

  private orgServiceUrl = () => process.env.ORG_SERVICE_URL || 'http://org-service:3001';

  async resolveApprovers(
    tenantId: string,
    policyId: string,
    requesterId: string,
    context: Record<string, any>,
  ): Promise<ResolvedStep[]> {
    // 1. Load policy
    const policyResult = await this.db.query('SELECT * FROM approval_policies WHERE id = $1 AND tenant_id = $2', [policyId, tenantId]);
    if (!policyResult.rows[0]) throw new Error(`Policy ${policyId} not found`);
    const policy = policyResult.rows[0];
    const steps: any[] = policy.steps;

    // 2. Load requester's manager chain from org-service
    let managerChain: any[] = [];
    try {
      const res = await axios.get(
        `${this.orgServiceUrl()}/users/${requesterId}/managers`,
        { headers: { 'X-Tenant-ID': tenantId }, timeout: 10000 },
      );
      managerChain = Array.isArray(res.data) ? res.data : [];
    } catch (err) {
      this.logger.warn(`Could not fetch manager chain for ${requesterId}: ${err.message}`);
    }

    // 3. Load active delegations
    const today = new Date().toISOString().split('T')[0];
    const delegationsResult = await this.db.query(
      `SELECT * FROM delegations WHERE tenant_id = $1 AND active = true AND start_date <= $2 AND end_date >= $2`,
      [tenantId, today],
    );
    const delegationMap = new Map<string, string>(); // delegatorId -> delegateId
    for (const d of delegationsResult.rows) {
      delegationMap.set(d.delegator_id, d.delegate_id);
    }

    // 4. Resolve each step
    const resolved: ResolvedStep[] = [];
    let stepIndex = 0;
    const usedHierarchyIds = new Set<string>(); // avoid duplicate hierarchy approvers

    for (const step of steps) {
      // Evaluate condition
      if (step.condition && !this.evaluateCondition(step.condition, context)) {
        this.logger.debug(`Step ${step.id} skipped (condition not met)`);
        continue;
      }

      let approvers: any[] = [];

      if (step.type === 'hierarchy') {
        const level = step.hierarchyLevel || 1;
        let manager = managerChain[level - 1];
        if (!manager && managerChain.length) {
          // The requester sits higher in the org than this policy level expects
          // (their chain is shorter than `level`). Fall back to the top of their
          // available chain so the step still has an approver — but only if that
          // person isn't already approving an earlier step, to avoid asking the
          // same manager to approve twice in a row.
          const top = managerChain[managerChain.length - 1];
          if (top && !usedHierarchyIds.has(top.id)) {
            manager = top;
            this.logger.debug(`Step ${step.id}: no manager at level ${level}; falling back to top of chain ${top.id}`);
          }
        }
        if (manager) {
          approvers = [manager];
          usedHierarchyIds.add(manager.id);
        } else {
          this.logger.warn(`No manager at level ${level} for requester ${requesterId}`);
        }
      } else if (step.type === 'role') {
        approvers = await this.getUsersByRole(tenantId, step.roleKey);
      } else if (step.type === 'specific_user') {
        const userResult = await this.db.query('SELECT * FROM users WHERE id = $1 AND tenant_id = $2', [step.userId, tenantId]);
        if (userResult.rows[0]) approvers = [userResult.rows[0]];
      } else if (step.type === 'org_unit_manager') {
        approvers = await this.getOrgUnitManagers(tenantId, step.orgUnitId);
      }

      // Apply delegations
      const resolvedApprovers = approvers.map((a) => {
        const delegateId = delegationMap.get(a.id);
        if (delegateId) {
          return { ...a, _delegatedFrom: a.id, _delegateId: delegateId };
        }
        return a;
      });

      const stepEntries: ResolvedStep[] = [];
      for (const approver of resolvedApprovers) {
        const effectiveApproverId = approver._delegateId || approver.id;

        // Segregation of duties: the requester can never be an approver of their
        // own request (covers role/hierarchy/specific-user/delegation paths).
        if (effectiveApproverId === requesterId) {
          this.logger.warn(`SoD: requester ${requesterId} excluded as approver on step '${step.id}'`);
          continue;
        }

        let effectiveApprover = approver;
        if (approver._delegateId) {
          const delegateResult = await this.db.query('SELECT * FROM users WHERE id = $1', [approver._delegateId]);
          if (delegateResult.rows[0]) effectiveApprover = delegateResult.rows[0];
        }

        const slaHours = step.slaHours || 24;
        const dueAt = new Date(Date.now() + slaHours * 3600 * 1000);

        stepEntries.push({
          stepId: step.id,
          stepIndex,
          label: step.label || step.id,
          approverId: effectiveApproverId,
          approverName: `${effectiveApprover.first_name || ''} ${effectiveApprover.last_name || ''}`.trim(),
          approverEmail: effectiveApprover.email,
          parallel: step.parallel === true,
          slaHours,
          dueAt,
          delegatedFrom: approver._delegatedFrom,
          condition: step.condition,
        });
      }

      // Only consume a step index for steps that have at least one eligible
      // approver, so indices stay contiguous (also skips steps that resolved to
      // no approver at all, instead of leaving an un-actionable gap).
      if (stepEntries.length > 0) {
        resolved.push(...stepEntries);
        stepIndex++;
      } else {
        this.logger.warn(`Step '${step.id}' resolved to no eligible approver — skipped`);
      }
    }

    return resolved;
  }

  private evaluateCondition(condition: any, context: Record<string, any>): boolean {
    if (!condition) return true;
    const { field, operator, value } = condition;
    const contextValue = context[field];
    if (contextValue === undefined || contextValue === null) return false;

    switch (operator) {
      case '>=': return Number(contextValue) >= Number(value);
      case '<=': return Number(contextValue) <= Number(value);
      case '>': return Number(contextValue) > Number(value);
      case '<': return Number(contextValue) < Number(value);
      case '=':
      case '==': return String(contextValue) === String(value);
      case '!=': return String(contextValue) !== String(value);
      case 'in': return Array.isArray(value) && value.includes(contextValue);
      case 'not_in': return Array.isArray(value) && !value.includes(contextValue);
      default: return true;
    }
  }

  private async getUsersByRole(tenantId: string, roleKey: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT u.* FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.tenant_id = $1 AND r.key = $2 AND u.active = true`,
      [tenantId, roleKey],
    );
    return result.rows;
  }

  private async getOrgUnitManagers(tenantId: string, orgUnitId: string): Promise<any[]> {
    const result = await this.db.query(
      `SELECT u.* FROM users u
       JOIN user_org_assignments uoa ON uoa.user_id = u.id
       JOIN positions p ON p.id = uoa.position_id
       WHERE uoa.org_unit_id = $1 AND p.is_manager = true AND u.tenant_id = $2 AND u.active = true`,
      [orgUnitId, tenantId],
    );
    return result.rows;
  }
}
