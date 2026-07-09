import { test, expect } from '@playwright/test';
import { getDevUser, getAccessToken } from '../helpers/auth';
import {
  createProcessDefinition, publishProcessDefinition, startProcessInstance,
  getProcessInstance, getTasksForInstance, completeTask,
  getTaskDirect, postApprovalResultDirect, archiveProcessDefinition,
} from '../helpers/api';
import { PARALLEL_JOIN_BPMN, EARLY_END_BRANCH_BPMN } from '../helpers/test-data';

/**
 * Real API/DB-backed integration tests against bpm-orchestrator's gateway-join
 * synchronization logic (services/bpm-orchestrator/src/process-instance/
 * process-instance.service.ts `advance()`), not mocked. No jest/unit test
 * harness exists in bpm-orchestrator (no jest devDependency, no *.spec.ts) —
 * this file is the smallest safe diagnostic proof against the real running
 * service and real Postgres rows (gateway_forks / gateway_arrivals /
 * process_instances / tasks), per infra/db/migrations/040_gateway_join_state.sql.
 *
 * Covers the two gateway-join bugs fixed in process-instance.service.ts:
 *   1. Fail-open path losing its branch token through delegateApproval —
 *      fixed by threading forkId/flowId through delegateApproval ->
 *      approval context -> resumeProcess -> approvalResult -> advance().
 *   2. `expected_count` not being checked against branches that actually
 *      reach the join, so a branch hitting an end event early prematurely
 *      completed the whole process instance — fixed by only completing the
 *      instance at an end event when branchToken is null.
 */

let token: string;
const seededDefIds: string[] = [];

test.beforeAll(async ({ request }) => {
  token = await getAccessToken(request, getDevUser());
});

// Archive every process definition this file seeded — these are pure
// diagnostic fixtures with no real business meaning, and left unarchived
// they'd re-accumulate in Process Studio / Service Catalog exactly like the
// pollution fixed in Phase 1 (process-definition repair).
test.afterAll(async ({ request }) => {
  for (const defId of seededDefIds) {
    await archiveProcessDefinition(request, token, defId).catch(() => {});
  }
});

async function seedAndPublish(request: any, bpmnXml: string, namePrefix: string) {
  const stamp = Date.now();
  const def = await createProcessDefinition(request, token, {
    name: `${namePrefix} ${stamp}`,
    slug: `${namePrefix.toLowerCase().replace(/\s+/g, '-')}-${stamp}`,
    bpmnXml,
  });
  await publishProcessDefinition(request, token, def.id);
  seededDefIds.push(def.id);
  return def.id as string;
}

test('workflow engine: parallel gateway join waits for all required arrivals before advancing', async ({ request }) => {
  const defId = await seedAndPublish(request, PARALLEL_JOIN_BPMN, 'E2E Parallel Join');
  const instance = await startProcessInstance(request, token, { definitionId: defId, businessKey: `PJ-${Date.now()}` });

  let tasks = await getTasksForInstance(request, token, instance.id);
  const taskA = tasks.find(t => t.node_id === 'TaskA');
  const taskB = tasks.find(t => t.node_id === 'TaskB');
  expect(taskA, 'Branch A task should exist immediately after fork').toBeTruthy();
  expect(taskB, 'Branch B task should exist immediately after fork').toBeTruthy();

  // Complete A only — the join must wait; "Final" must not exist yet.
  await completeTask(request, token, taskA.id);
  tasks = await getTasksForInstance(request, token, instance.id);
  expect(tasks.find(t => t.node_id === 'TaskFinal'), 'join fired after only 1 of 2 branches arrived').toBeUndefined();

  let inst = await getProcessInstance(request, token, instance.id);
  expect(inst.status).toBe('active');

  // Complete B — the join now has both arrivals and must fire exactly once.
  await completeTask(request, token, taskB.id);
  tasks = await getTasksForInstance(request, token, instance.id);
  const finalTasks = tasks.filter(t => t.node_id === 'TaskFinal');
  expect(finalTasks, 'join must create exactly one downstream task, not duplicate it').toHaveLength(1);
});

test('workflow engine: duplicate branch arrival does not execute downstream twice', async ({ request }) => {
  const defId = await seedAndPublish(request, PARALLEL_JOIN_BPMN, 'E2E Duplicate Arrival');
  const instance = await startProcessInstance(request, token, { definitionId: defId, businessKey: `DA-${Date.now()}` });
  const tasks = await getTasksForInstance(request, token, instance.id);
  const taskA = tasks.find(t => t.node_id === 'TaskA');
  const taskB = tasks.find(t => t.node_id === 'TaskB');

  await completeTask(request, token, taskA.id);
  await completeTask(request, token, taskB.id);

  // task.service.ts's conditional UPDATE (status IN pending/in_progress) is the
  // authoritative guard against double-completion — a second complete() on the
  // same task must be rejected, not silently re-advance the process.
  await expect(completeTask(request, token, taskA.id, {})).rejects.toThrow(/400|already completed/i);

  const finalTasks = (await getTasksForInstance(request, token, instance.id)).filter(t => t.node_id === 'TaskFinal');
  expect(finalTasks, 'a rejected duplicate complete must not create a second downstream task').toHaveLength(1);
});

test('workflow engine: a branch reaching an end event early does not prematurely complete the whole instance', async ({ request }) => {
  const defId = await seedAndPublish(request, EARLY_END_BRANCH_BPMN, 'E2E Early End Branch');
  const instance = await startProcessInstance(request, token, { definitionId: defId, businessKey: `EE-${Date.now()}` });

  // Fork_1 activates 2 branches: one goes straight to an end event, the other
  // to a pending user task. Before the fix, reaching ANY end event marked the
  // WHOLE instance 'completed' regardless of the sibling branch still pending.
  const inst = await getProcessInstance(request, token, instance.id);
  expect(inst.status, 'an unrelated branch ending early must not complete the whole instance while Branch A is still pending').toBe('active');

  const tasks = await getTasksForInstance(request, token, instance.id);
  expect(tasks.find(t => t.node_id === 'TaskA' && t.status === 'pending'), 'Branch A task must still be pending').toBeTruthy();
});

test('workflow engine: a branch resumed via approval-result still participates in join synchronization', async ({ request }) => {
  // Simulates approval-service's resume callback (resumeProcess in
  // services/approval-service/src/instance/instance.service.ts) directly
  // against bpm-orchestrator, since seeding a real approval_policies row +
  // resolvable approver is out of scope for this diagnostic. This still
  // exercises the exact broken code path: approvalResult() must thread the
  // resumed branch's forkId/flowId into advance() the same way task.service.ts
  // already does via task.fork_id/task.flow_id for normal task completion.
  const defId = await seedAndPublish(request, PARALLEL_JOIN_BPMN, 'E2E Approval Branch Token');
  const instance = await startProcessInstance(request, token, { definitionId: defId, businessKey: `AB-${Date.now()}` });
  const tasks = await getTasksForInstance(request, token, instance.id);
  const taskB = tasks.find(t => t.node_id === 'TaskB');
  const taskBDirect = await getTaskDirect(request, taskB.id);
  expect(taskBDirect.fork_id, 'Branch B task should carry the fork context set by the fork gateway').toBeTruthy();

  // Resolve Branch B via the approval-result callback instead of /tasks/complete,
  // carrying forkId/flowId — the same information a fixed delegateApproval/
  // approvalResult round-trip must preserve across a parked approval.
  await postApprovalResultDirect(request, instance.id, {
    nodeId: 'TaskB', outcome: 'approved', forkId: taskBDirect.fork_id, flowId: taskBDirect.flow_id,
  });

  // Branch B alone must NOT be enough to fire the join — Branch A hasn't arrived.
  let remaining = await getTasksForInstance(request, token, instance.id);
  expect(remaining.find(t => t.node_id === 'TaskFinal'), 'the join fired from Branch B alone — its branch token was lost (Bug 1)').toBeUndefined();

  // Completing Branch A normally should now satisfy the join.
  const taskA = tasks.find(t => t.node_id === 'TaskA');
  await completeTask(request, token, taskA.id);
  remaining = await getTasksForInstance(request, token, instance.id);
  expect(remaining.filter(t => t.node_id === 'TaskFinal'), 'join must fire exactly once once both branches have genuinely arrived').toHaveLength(1);
});
