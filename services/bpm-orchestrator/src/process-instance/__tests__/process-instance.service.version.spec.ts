import { NotFoundException } from '@nestjs/common';
import { ProcessInstanceService } from '../process-instance.service';

const TENANT = 'a0000000-0000-0000-0000-000000000001';
const INSTANCE = 'instance-0000-0000-0000-000000';

function makeService(row: any) {
  const db = { query: jest.fn(async (_text: string, _params?: any[]) => ({ rows: row ? [row] : [] })) };
  const kafka = { produce: jest.fn() };
  const audit = { log: jest.fn() };
  const defSvc = {};
  const svc = new ProcessInstanceService(db as any, kafka as any, audit as any, defSvc as any);
  return { svc, db };
}

describe('ProcessInstanceService.findOne — definition version (bugfix)', () => {
  it('selects pd.version as definition_version so the real running version is available to the caller', async () => {
    const { svc, db } = makeService({
      id: INSTANCE,
      tenant_id: TENANT,
      definition_name: 'Purchase Request',
      definition_version: 3, // the instance is pinned to v3, not the "always 1" bug
      bpmn_xml: '<xml/>',
    });
    const result = await svc.findOne(TENANT, INSTANCE);
    expect(result.definition_version).toBe(3);

    // Confirm the query actually asks for pd.version — not just that the mock happens
    // to return it (a mock returning the field proves nothing about the real SQL).
    const sql = db.query.mock.calls[0][0] as string;
    expect(sql).toMatch(/pd\.version\s+as\s+definition_version/i);
  });

  it('throws NotFoundException when no instance matches (regression guard, unrelated to the version fix)', async () => {
    const { svc } = makeService(undefined);
    await expect(svc.findOne(TENANT, INSTANCE)).rejects.toThrow(NotFoundException);
  });
});
