import { ForbiddenException } from '@nestjs/common';
import { SubmissionsService } from '../submissions.service';

const TENANT = 'a0000000-0000-0000-0000-000000000001';
const ASSIGNMENT = 'assignment-0000-0000-0000-00000';
const COMPANY_A = 'company-a-000-0000-0000-0000000';
const COMPANY_B = 'company-b-000-0000-0000-0000000';

function makeDb(assignmentOwnerCompany: string | null) {
  return {
    query: jest.fn(async (text: string, params: any[]) => {
      if (text.includes('FROM work_order_assignments WHERE id=$1')) {
        const [assignmentId, tenantId, companyId] = params;
        const matches = assignmentId === ASSIGNMENT && tenantId === TENANT && companyId === assignmentOwnerCompany;
        return { rows: matches ? [{ '?column?': 1 }] : [] };
      }
      if (text.includes('FROM external_submissions')) {
        return { rows: [{ id: 'sub-1', assignment_id: ASSIGNMENT, note: 'progress update' }] };
      }
      throw new Error(`Unexpected query in test: ${text}`);
    }),
  };
}

describe('SubmissionsService.findByAssignment — company isolation (IDOR fix)', () => {
  it('rejects a caller from a different company than the one that owns the assignment', async () => {
    const db = makeDb(COMPANY_A); // assignment belongs to Company A
    const svc = new SubmissionsService(db as any);
    await expect(svc.findByAssignment(ASSIGNMENT, COMPANY_B, TENANT)).rejects.toThrow(ForbiddenException);
  });

  it('rejects a caller with no matching assignment at all (also covers a guessed/enumerated UUID)', async () => {
    const db = makeDb(null);
    const svc = new SubmissionsService(db as any);
    await expect(svc.findByAssignment(ASSIGNMENT, COMPANY_A, TENANT)).rejects.toThrow(ForbiddenException);
  });

  it('allows the owning company to read its own assignment submissions', async () => {
    const db = makeDb(COMPANY_A);
    const svc = new SubmissionsService(db as any);
    const result = await svc.findByAssignment(ASSIGNMENT, COMPANY_A, TENANT);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sub-1');
  });
});
