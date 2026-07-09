import { test, expect } from '@playwright/test';
import { getDevUser, getAccessToken } from '../helpers/auth';
import { createProcessDefinition, publishProcessDefinition, archiveProcessDefinition } from '../helpers/api';
import { publishedBpmnWithUrgencyField } from '../helpers/test-data';

test('my requests: a submitted request appears in My Requests', async ({ page, request }) => {
  const user = getDevUser();
  const token = await getAccessToken(request, user);
  const processName = `E2E My Requests Process ${Date.now()}`;
  const def = await createProcessDefinition(request, token, {
    name: processName,
    slug: `e2e-my-requests-${Date.now()}`,
    description: 'Playwright seed: pre-published with an Urgency field',
    bpmnXml: publishedBpmnWithUrgencyField(),
  });
  try {
    await publishProcessDefinition(request, token, def.id);

    // Submit through the real UI (not the API directly) so this test also proves
    // the submission that populates My Requests actually goes through the form.
    await page.goto(`/catalog/${def.id}/new`);
    await expect(page.getByTestId('field-urgency')).toBeVisible();
    await page.getByTestId('field-urgency').click();
    await page.getByRole('option', { name: 'Low' }).click();
    await page.getByRole('button', { name: 'Submit Request' }).click();
    await expect(page.getByText('Request Submitted Successfully')).toBeVisible({ timeout: 15_000 });

    // Same bare-URL bounce-to-Home issue as Service Catalog — navigate via the UI
    // (My Work -> My Requests tab) instead of a hard goto.
    await page.goto('/home');
    await page.getByRole('main').getByRole('button', { name: 'My Work' }).click();
    await page.getByRole('tab', { name: 'My Requests' }).click();
    await page.getByPlaceholder(/Search by reference, title or service/).fill(processName);
    await expect(page.getByText(processName).first()).toBeVisible();
  } finally {
    // Keep Process Studio / Service Catalog free of test pollution. The
    // submitted request/case itself is left intact (real business data flow,
    // not test clutter) — only the seeded process definition is archived.
    await archiveProcessDefinition(request, token, def.id);
  }
});
