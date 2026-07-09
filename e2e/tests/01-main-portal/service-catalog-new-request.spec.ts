import { test, expect } from '@playwright/test';
import { getDevUser, getAccessToken } from '../helpers/auth';
import { createProcessDefinition, publishProcessDefinition, archiveProcessDefinition } from '../helpers/api';
import { publishedBpmnWithUrgencyField } from '../helpers/test-data';

// Independent of process-studio-start-event-fields.spec.ts: seeds its own
// already-published process (formFields baked in via API) so this file can
// run standalone and isn't order-dependent on another spec file.
test.describe.serial('service catalog: new request form reflects the process definition', () => {
  let defId: string;
  let processName: string;
  let token: string;

  test.beforeAll(async ({ request }) => {
    const user = getDevUser();
    token = await getAccessToken(request, user);
    processName = `E2E Catalog Process ${Date.now()}`;
    const def = await createProcessDefinition(request, token, {
      name: processName,
      slug: `e2e-catalog-${Date.now()}`,
      description: 'Playwright seed: pre-published with an Urgency field',
      bpmnXml: publishedBpmnWithUrgencyField(),
    });
    defId = def.id;
    await publishProcessDefinition(request, token, defId);
  });

  test.afterAll(async ({ request }) => {
    if (defId) await archiveProcessDefinition(request, token, defId);
  });

  test('service catalog: opening a service opens its New Request form', async ({ page }) => {
    // A bare (non-deep-link) hard navigation to /catalog bounces to /home once per
    // fresh page (AuthContext's post-login "land on Home" logic, keyed on
    // sessionStorage which Playwright's storageState never carries over). Navigate
    // like a real user instead: land on Home, then click through — client-side
    // routing doesn't re-run the Keycloak init that triggers the bounce.
    await page.goto('/home');
    await page.getByRole('heading', { name: 'Service Catalog' }).click();
    await expect(page).toHaveURL(/\/catalog$/);
    await expect(page.getByRole('heading', { name: 'Service Catalog' })).toBeVisible();

    await page.getByPlaceholder(/Search services/).fill(processName);
    const card = page.locator('.MuiCard-root').filter({ hasText: processName });
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'Request' }).click();

    await expect(page).toHaveURL(new RegExp(`/catalog/${defId}/new`));
    await expect(page.getByRole('heading', { name: processName })).toBeVisible();
  });

  test('new request: Urgency field appears, required validation blocks submit, valid submit creates the request', async ({ page }) => {
    await page.goto(`/catalog/${defId}/new`);
    await expect(page.getByTestId('field-urgency')).toBeVisible();

    const submitBtn = page.getByRole('button', { name: 'Submit Request' });
    await expect(submitBtn).toBeDisabled(); // required field not yet filled

    await page.getByTestId('field-urgency').click();
    await page.getByRole('option', { name: 'Low' }).click();

    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    await expect(page.getByText('Request Submitted Successfully')).toBeVisible({ timeout: 15_000 });
  });
});
