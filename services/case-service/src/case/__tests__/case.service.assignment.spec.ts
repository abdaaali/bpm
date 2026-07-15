import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { CaseService } from '../case.service';

const TENANT = 'a0000000-0000-0000-0000-000000000001';
const ASSIGNEE = 'assignee-0000-0000-0000-0000000';
const TEAM = 'team-00000-0000-0000-0000000000';

function makeService(dbHandler: (text: string, params: any[]) => any) {
  const db = { query: jest.fn(async (text: string, params: any[]) => dbHandler(text, params)) };
  const kafka = { produce: jest.fn() };
  const audit = { log: jest.fn() };
  const routing = {};
  const slaConfig = {};
  const svc = new CaseService(db as any, kafka as any, audit as any, routing as any, slaConfig as any);
  return { svc, db, kafka, audit };
}

describe('CaseService.create — creation-time assignment authorization (403, not silent-ignore)', () => {
  it('rejects assignee_id from a role without cases:assign, with a clear 403', async () => {
    const { svc, db } = makeService(() => {
      throw new Error('no DB call should happen before the authorization check');
    });
    await expect(
      svc.create(TENANT, { type: 'incident', title: 'x', assignee_id: ASSIGNEE }, 'actor-1', ['requester']),
    ).rejects.toThrow(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('rejects assigned_team_id from a role without cases:assign, with a clear 403', async () => {
    const { svc, db } = makeService(() => {
      throw new Error('no DB call should happen before the authorization check');
    });
    await expect(
      svc.create(TENANT, { type: 'incident', title: 'x', assigned_team_id: TEAM }, 'actor-1', ['requester']),
    ).rejects.toThrow(ForbiddenException);
    expect(db.query).not.toHaveBeenCalled();
  });

  it('does not throw for an unassigned case created by a requester (no assignment attempted)', async () => {
    // Once past the (skipped) authorization gate this would hit the rest of create()'s
    // heavy pipeline (SLA/site/case-number/etc), which isn't mocked here — a thrown
    // error from something unrelated to authorization is fine and expected; a
    // ForbiddenException would not be.
    const { svc } = makeService(() => {
      throw new Error('unrelated downstream dependency, not an authorization failure');
    });
    await expect(svc.create(TENANT, { type: 'incident', title: 'x' }, 'actor-1', ['requester'])).rejects.not.toThrow(ForbiddenException);
  });

  it('lets a manager past the authorization gate for a valid assignment', async () => {
    const { svc } = makeService((text) => {
      if (text.includes('SELECT id, active FROM users')) return { rows: [{ id: ASSIGNEE, active: true }] };
      if (text.includes('SELECT id, active FROM org_units')) return { rows: [{ id: TEAM, active: true }] };
      if (text.includes('FROM user_org_assignments')) return { rows: [{ '?column?': 1 }] };
      throw new Error('unrelated downstream dependency (case-number/SLA/etc), not an authorization failure');
    });
    await expect(
      svc.create(TENANT, { type: 'incident', title: 'x', assignee_id: ASSIGNEE, assigned_team_id: TEAM }, 'actor-1', ['manager']),
    ).rejects.not.toThrow(ForbiddenException);
  });
});

describe('CaseService.validateAssignmentEligibility', () => {
  it('rejects a non-existent assignee', async () => {
    const { svc } = makeService((text) => {
      if (text.includes('SELECT id, active FROM users')) return { rows: [] };
      throw new Error('unexpected query');
    });
    await expect((svc as any).validateAssignmentEligibility(TENANT, ASSIGNEE, undefined)).rejects.toThrow(BadRequestException);
  });

  it('rejects an inactive assignee', async () => {
    const { svc } = makeService((text) => {
      if (text.includes('SELECT id, active FROM users')) return { rows: [{ id: ASSIGNEE, active: false }] };
      throw new Error('unexpected query');
    });
    await expect((svc as any).validateAssignmentEligibility(TENANT, ASSIGNEE, undefined)).rejects.toThrow(BadRequestException);
  });

  it('rejects a non-existent team', async () => {
    const { svc } = makeService((text) => {
      if (text.includes('SELECT id, active FROM org_units')) return { rows: [] };
      throw new Error('unexpected query');
    });
    await expect((svc as any).validateAssignmentEligibility(TENANT, undefined, TEAM)).rejects.toThrow(BadRequestException);
  });

  it('rejects an inactive team', async () => {
    const { svc } = makeService((text) => {
      if (text.includes('SELECT id, active FROM org_units')) return { rows: [{ id: TEAM, active: false }] };
      throw new Error('unexpected query');
    });
    await expect((svc as any).validateAssignmentEligibility(TENANT, undefined, TEAM)).rejects.toThrow(BadRequestException);
  });

  it('rejects an assignee who does not belong to the selected team', async () => {
    const { svc } = makeService((text) => {
      if (text.includes('SELECT id, active FROM users')) return { rows: [{ id: ASSIGNEE, active: true }] };
      if (text.includes('SELECT id, active FROM org_units')) return { rows: [{ id: TEAM, active: true }] };
      if (text.includes('FROM user_org_assignments')) return { rows: [] }; // no membership row
      throw new Error('unexpected query');
    });
    await expect((svc as any).validateAssignmentEligibility(TENANT, ASSIGNEE, TEAM)).rejects.toThrow(BadRequestException);
  });

  it('accepts a valid, active assignee who belongs to the selected active team', async () => {
    const { svc } = makeService((text) => {
      if (text.includes('SELECT id, active FROM users')) return { rows: [{ id: ASSIGNEE, active: true }] };
      if (text.includes('SELECT id, active FROM org_units')) return { rows: [{ id: TEAM, active: true }] };
      if (text.includes('FROM user_org_assignments')) return { rows: [{ '?column?': 1 }] };
      throw new Error('unexpected query');
    });
    await expect((svc as any).validateAssignmentEligibility(TENANT, ASSIGNEE, TEAM)).resolves.toBeUndefined();
  });
});
