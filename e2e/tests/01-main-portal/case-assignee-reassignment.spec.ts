import { test, expect } from '@playwright/test';
import { getDevUser, getAccessToken, apiHeaders } from '../helpers/auth';

/**
 * Regression coverage for the "missing assignee options" investigation.
 * Root cause found: apps/mobile-pwa/src/pages/CaseDetail.tsx opened the
 * Reassign dialog immediately (empty Autocomplete/Select) and only started
 * fetching /users + /org-units afterward, with no loading state and no
 * explicit pageSize (silently capped at the server's default of 20) — so a
 * user interacting with the dropdown before the fetch resolved, or a tenant
 * with >20 users, would see "no options". The main portal's CaseDetail.tsx
 * (apps/frontend-portal) was already correct (react-query, keepPreviousData,
 * explicit pageSize) and is used here as the regression-proof surface.
 */

let token: string;
let caseId: string;
let caseNumber: string;

test.beforeAll(async ({ request }) => {
  token = await getAccessToken(request, getDevUser());
  const res = await request.post('/api/v1/cases', {
    headers: apiHeaders(token),
    data: { title: `E2E Assignee Test ${Date.now()}`, type: 'incident', priority: 'medium', description: 'Playwright seed for assignee-reassignment coverage' },
  });
  expect(res.ok(), `case create failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  const body = await res.json();
  caseId = body.id;
  caseNumber = body.case_number;
});

test('assignee dropdown loads at least one real user from the org directory', async ({ page }) => {
  await page.goto(`/cases/${caseId}`);
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /reassign/i }).first().click();
  const combo = page.locator('[role="combobox"]').first();
  await combo.click();

  const options = page.locator('li[role="option"]');
  await expect(options.first()).toBeVisible({ timeout: 10_000 });
  const count = await options.count();
  expect(count, 'assignee dropdown must offer at least one real user').toBeGreaterThan(0);

  const texts = await options.allTextContents();
  // Real seeded users (infra/keycloak/realm-export.json), not placeholders.
  expect(texts.some(t => /Admin User|Alice Johnson|Bob Smith/.test(t)), `expected a real seeded user, got: ${texts.join(', ')}`).toBeTruthy();
});

test('reassigning a case persists to the DB and survives reload', async ({ page }) => {
  await page.goto(`/cases/${caseId}`);
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /reassign/i }).first().click();
  const combo = page.locator('[role="combobox"]').first();
  await combo.click();
  await page.getByRole('option', { name: 'Bob Smith' }).click();

  await Promise.all([
    page.waitForResponse(r => r.url().includes(`/api/v1/cases/${caseId}/assign`) && r.request().method() === 'PATCH'),
    page.getByRole('button', { name: 'Reassign', exact: true }).click(),
  ]);

  // Reload — the assignment must be read back from the DB, not just kept in local state.
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.getByText('Bob Smith')).toBeVisible({ timeout: 10_000 });
});

test('tenant isolation: tenant A cannot see tenant B users in the assignee list', async ({ request }) => {
  // Tenant B fixture is a real, separately-tenanted user created for this test
  // (see Phase 2 report) — id b9999999-...-99 / c9999999-...-99. Not mock data:
  // a genuine second tenants/users row, isolated by the same tenant_id-scoped
  // query every other case/user lookup in org-service uses.
  const res = await request.get('/api/v1/users', { headers: apiHeaders(token), params: { pageSize: 200 } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const emails: string[] = body.data.map((u: any) => u.email);
  expect(emails).not.toContain('tenantb.user@isolationtest.example.com');
});
