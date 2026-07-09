import type { APIRequestContext, Page } from '@playwright/test';
import { apiHeaders } from './auth';

/** Collects console errors + uncaught page errors for the duration of a test. */
export function trackErrors(page: Page): { errors: string[] } {
  const state = { errors: [] as string[] };
  page.on('console', msg => { if (msg.type() === 'error') state.errors.push(`console.error: ${msg.text()}`); });
  page.on('pageerror', err => state.errors.push(`pageerror: ${err.message}`));
  return state;
}

/** Collects failed (4xx/5xx) API responses for the duration of a test. */
export function trackApiFailures(page: Page, pathPrefix = '/api/'): { failures: string[] } {
  const state = { failures: [] as string[] };
  page.on('response', res => {
    if (res.url().includes(pathPrefix) && res.status() >= 400) {
      state.failures.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  return state;
}

/** Create a process definition via the real API (frontend-portal's /api/v1 proxy). */
export async function createProcessDefinition(request: APIRequestContext, token: string, dto: {
  name: string; slug: string; description?: string; category?: string; bpmnXml: string;
}) {
  const res = await request.post('/api/v1/processes/definitions', {
    headers: apiHeaders(token),
    data: {
      name: dto.name,
      slug: dto.slug,
      description: dto.description || 'Playwright seed',
      category: dto.category || 'Playwright',
      bpmn_xml: dto.bpmnXml,
    },
  });
  if (!res.ok()) throw new Error(`Seed create failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function publishProcessDefinition(request: APIRequestContext, token: string, defId: string) {
  const res = await request.post(`/api/v1/processes/definitions/${defId}/publish`, { headers: apiHeaders(token) });
  if (!res.ok()) throw new Error(`Publish failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/**
 * Archives (never deletes) a process definition this test seeded. Without
 * this, every run leaves its seeded definitions behind in Process Studio /
 * Service Catalog — exactly the pollution that buried real process
 * definitions past the list page's row cutoff (see Phase 1 process-definition
 * repair). Archiving works from any status (draft or active) and is fully
 * reversible via unpublish/publish, so it's safe to call unconditionally in
 * afterAll even if a test failed before publishing.
 */
export async function archiveProcessDefinition(request: APIRequestContext, token: string, defId: string) {
  const res = await request.post(`/api/v1/processes/definitions/${defId}/archive`, { headers: apiHeaders(token) });
  if (!res.ok()) throw new Error(`Archive failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function startProcessInstance(request: APIRequestContext, token: string, dto: {
  definitionId: string; businessKey?: string; variables?: any;
}) {
  const res = await request.post('/api/v1/processes/instances', { headers: apiHeaders(token), data: dto });
  if (!res.ok()) throw new Error(`Start instance failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function getProcessInstance(request: APIRequestContext, token: string, id: string) {
  const res = await request.get(`/api/v1/processes/instances/${id}`, { headers: apiHeaders(token) });
  if (!res.ok()) throw new Error(`Get instance failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

export async function getTasksForInstance(request: APIRequestContext, token: string, instanceId: string) {
  // Query param is `instanceId` (see services/bpm-orchestrator/src/task/task.service.ts findAll).
  const res = await request.get('/api/v1/tasks', { headers: apiHeaders(token), params: { instanceId, pageSize: 50 } });
  if (!res.ok()) throw new Error(`Get tasks failed: ${res.status()} ${await res.text()}`);
  const body = await res.json();
  return (body.data || body) as any[];
}

export async function completeTask(request: APIRequestContext, token: string, taskId: string, variables: any = {}) {
  const res = await request.post(`/api/v1/tasks/${taskId}/complete`, { headers: apiHeaders(token), data: { variables } });
  if (!res.ok()) throw new Error(`Complete task failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

// ── Direct bpm-orchestrator access (backend-workflow project only) ─────────
// bpm-orchestrator is normally internal-only, reached exclusively via
// api-gateway's /api/v1/processes/* routes. api-gateway does NOT proxy the
// approval-result callback (it's a service-to-service route that only
// approval-service calls in production; see
// services/bpm-orchestrator/src/process-instance/process-instance.controller.ts).
// infra/docker-compose.dev.yml exposes it on host port 3003 (same pattern as
// external-api on 3007) so these diagnostic tests can call it directly.
export const ORCHESTRATOR_URL = process.env.E2E_ORCHESTRATOR_URL || 'http://localhost:3003';
export const TENANT_ID = process.env.E2E_TENANT_ID || 'a0000000-0000-0000-0000-000000000001';

export async function getTaskDirect(request: APIRequestContext, taskId: string) {
  const res = await request.get(`${ORCHESTRATOR_URL}/tasks/${taskId}`, { headers: { 'x-tenant-id': TENANT_ID } });
  if (!res.ok()) throw new Error(`Get task (direct) failed: ${res.status()} ${await res.text()}`);
  return res.json();
}

/**
 * Simulates approval-service's resume callback
 * (services/approval-service/src/instance/instance.service.ts resumeProcess),
 * which normally fires after a human decision on an approval-gated BPMN node.
 * Passing forkId/flowId proves the fix for Bug 1 (see
 * gateway-join-synchronization.spec.ts): before the fix, approvalResult()
 * never threaded the branch's fork/flow context back into advance(), so any
 * branch resumed this way skipped join synchronization entirely.
 */
export async function postApprovalResultDirect(request: APIRequestContext, instanceId: string, body: {
  nodeId: string; outcome: 'approved' | 'rejected'; forkId?: string | null; flowId?: string | null;
}) {
  const res = await request.post(`${ORCHESTRATOR_URL}/instances/${instanceId}/approval-result`, {
    headers: { 'x-tenant-id': TENANT_ID, 'Content-Type': 'application/json' },
    data: body,
  });
  if (!res.ok()) throw new Error(`approval-result (direct) failed: ${res.status()} ${await res.text()}`);
  return res.json();
}
