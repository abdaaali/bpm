import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { DelegationService } from '../delegation.service';

const TENANT = 'a0000000-0000-0000-0000-000000000001';
const ACTOR = 'actor-0000-0000-0000-000000000000';
const DELEGATOR = 'delegator-0000-0000-0000-00000000';
const DELEGATE = 'delegate-000-0000-0000-000000000';

type QueryHandler = (text: string, params: any[]) => any;

function makeDb(handler: QueryHandler) {
  return { query: jest.fn(async (text: string, params: any[]) => handler(text, params)) };
}

function makeAudit() {
  return { log: jest.fn(async () => undefined) };
}

// Default handler: everyone resolves to themselves, is active, delegate is
// approval-eligible, and no reciprocal delegation exists. Individual tests
// override only the branch they care about.
function defaultHandler(overrides: Partial<Record<string, QueryHandler>> = {}): QueryHandler {
  return (text, params) => {
    if (text.includes('FROM users WHERE tenant_id') && overrides.resolve) return overrides.resolve(text, params);
    if (text.includes('FROM users WHERE tenant_id')) return { rows: [{ id: params[0] }] }; // resolveUserId: id passthrough
    if (overrides.activeUser && text.includes('SELECT id, active FROM users')) return overrides.activeUser(text, params);
    if (text.includes('SELECT id, active FROM users')) return { rows: [{ id: params[0], active: true }] };
    if (overrides.eligible && text.includes('user_roles ur JOIN roles')) return overrides.eligible(text, params);
    if (text.includes('user_roles ur JOIN roles')) return { rows: [{ '?column?': 1 }], rowCount: 1 };
    if (overrides.reciprocal && text.includes('delegator_id=$2 AND delegate_id=$3')) return overrides.reciprocal(text, params);
    if (text.includes('delegator_id=$2 AND delegate_id=$3')) return { rows: [], rowCount: 0 };
    if (text.includes('INSERT INTO delegations')) return { rows: [{ id: 'new-delegation-id', tenant_id: TENANT, delegator_id: params[1], delegate_id: params[2] }] };
    throw new Error(`Unexpected query in test: ${text}`);
  };
}

describe('DelegationService.create — authorization', () => {
  it('allows a non-elevated user to delegate their own approval authority', async () => {
    const db = makeDb(defaultHandler());
    const svc = new DelegationService(db as any, makeAudit() as any);
    const result = await svc.create(
      TENANT,
      { delegatorId: ACTOR, delegateId: DELEGATE, startDate: '2026-08-01', endDate: '2026-08-10' },
      ACTOR,
      ['approver'], // not elevated — only allowed because delegatorId === the caller
    );
    expect(result.id).toBe('new-delegation-id');
  });

  it('rejects a non-elevated user delegating on behalf of someone else (the original vulnerability)', async () => {
    const db = makeDb(defaultHandler());
    const svc = new DelegationService(db as any, makeAudit() as any);
    await expect(
      svc.create(
        TENANT,
        { delegatorId: DELEGATOR, delegateId: DELEGATE, startDate: '2026-08-01', endDate: '2026-08-10' },
        ACTOR, // caller is not the delegator
        ['approver'], // and holds no elevated role
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows a manager to create a delegation on behalf of another user', async () => {
    const db = makeDb(defaultHandler());
    const svc = new DelegationService(db as any, makeAudit() as any);
    const result = await svc.create(
      TENANT,
      { delegatorId: DELEGATOR, delegateId: DELEGATE, startDate: '2026-08-01', endDate: '2026-08-10' },
      ACTOR,
      ['manager'],
    );
    expect(result.id).toBe('new-delegation-id');
  });

  it('allows an admin to create a delegation on behalf of another user', async () => {
    const db = makeDb(defaultHandler());
    const svc = new DelegationService(db as any, makeAudit() as any);
    const result = await svc.create(
      TENANT,
      { delegatorId: DELEGATOR, delegateId: DELEGATE, startDate: '2026-08-01', endDate: '2026-08-10' },
      ACTOR,
      ['admin'],
    );
    expect(result.id).toBe('new-delegation-id');
  });
});

describe('DelegationService.create — validation', () => {
  it('rejects self-delegation', async () => {
    const db = makeDb(defaultHandler());
    const svc = new DelegationService(db as any, makeAudit() as any);
    await expect(
      svc.create(TENANT, { delegatorId: ACTOR, delegateId: ACTOR, startDate: '2026-08-01', endDate: '2026-08-10' }, ACTOR, ['manager']),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an inactive delegator', async () => {
    const db = makeDb(
      defaultHandler({
        activeUser: (_text, params) => ({ rows: [{ id: params[0], active: params[0] === DELEGATOR ? false : true }] }),
      }),
    );
    const svc = new DelegationService(db as any, makeAudit() as any);
    await expect(
      svc.create(TENANT, { delegatorId: DELEGATOR, delegateId: DELEGATE, startDate: '2026-08-01', endDate: '2026-08-10' }, ACTOR, ['manager']),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an inactive delegate', async () => {
    const db = makeDb(
      defaultHandler({
        activeUser: (_text, params) => ({ rows: [{ id: params[0], active: params[0] === DELEGATE ? false : true }] }),
      }),
    );
    const svc = new DelegationService(db as any, makeAudit() as any);
    await expect(
      svc.create(TENANT, { delegatorId: DELEGATOR, delegateId: DELEGATE, startDate: '2026-08-01', endDate: '2026-08-10' }, ACTOR, ['manager']),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a delegate with no approval-deciding permission', async () => {
    const db = makeDb(defaultHandler({ eligible: () => ({ rows: [], rowCount: 0 }) }));
    const svc = new DelegationService(db as any, makeAudit() as any);
    await expect(
      svc.create(TENANT, { delegatorId: DELEGATOR, delegateId: DELEGATE, startDate: '2026-08-01', endDate: '2026-08-10' }, ACTOR, ['manager']),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a reciprocal delegation loop', async () => {
    const db = makeDb(defaultHandler({ reciprocal: () => ({ rows: [{ '?column?': 1 }], rowCount: 1 }) }));
    const svc = new DelegationService(db as any, makeAudit() as any);
    await expect(
      svc.create(TENANT, { delegatorId: DELEGATOR, delegateId: DELEGATE, startDate: '2026-08-01', endDate: '2026-08-10' }, ACTOR, ['manager']),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects a missing delegatorId/delegateId', async () => {
    const db = makeDb(defaultHandler());
    const svc = new DelegationService(db as any, makeAudit() as any);
    await expect(
      svc.create(TENANT, { delegateId: DELEGATE, startDate: '2026-08-01', endDate: '2026-08-10' }, ACTOR, ['manager']),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects missing dates', async () => {
    const db = makeDb(defaultHandler());
    const svc = new DelegationService(db as any, makeAudit() as any);
    await expect(
      svc.create(TENANT, { delegatorId: DELEGATOR, delegateId: DELEGATE }, ACTOR, ['manager']),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('DelegationService.deactivate — authorization', () => {
  function makeDeactivateDb(overrides: { existing?: any } = {}) {
    return makeDb((text, params) => {
      if (text.includes('FROM delegations WHERE id=$1 AND tenant_id=$2') && !text.includes('UPDATE')) {
        return { rows: [overrides.existing ?? { id: params[0], delegator_id: DELEGATOR, tenant_id: TENANT }] };
      }
      if (text.includes('FROM users WHERE tenant_id')) return { rows: [{ id: params[0] }] };
      if (text.startsWith('UPDATE delegations')) return { rows: [{ id: params[0], active: false }] };
      throw new Error(`Unexpected query in test: ${text}`);
    });
  }

  it('allows the delegation owner to deactivate their own delegation', async () => {
    const db = makeDeactivateDb({ existing: { id: 'd1', delegator_id: DELEGATOR, tenant_id: TENANT } });
    const svc = new DelegationService(db as any, makeAudit() as any);
    const result = await svc.deactivate('d1', TENANT, DELEGATOR, ['approver']);
    expect(result.active).toBe(false);
  });

  it('rejects a non-owner, non-elevated user deactivating someone else\'s delegation', async () => {
    const db = makeDeactivateDb({ existing: { id: 'd1', delegator_id: DELEGATOR, tenant_id: TENANT } });
    const svc = new DelegationService(db as any, makeAudit() as any);
    await expect(svc.deactivate('d1', TENANT, ACTOR, ['approver'])).rejects.toThrow(ForbiddenException);
  });

  it('allows a manager to deactivate someone else\'s delegation', async () => {
    const db = makeDeactivateDb({ existing: { id: 'd1', delegator_id: DELEGATOR, tenant_id: TENANT } });
    const svc = new DelegationService(db as any, makeAudit() as any);
    const result = await svc.deactivate('d1', TENANT, ACTOR, ['manager']);
    expect(result.active).toBe(false);
  });
});
