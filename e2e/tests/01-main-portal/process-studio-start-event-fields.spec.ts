import { test, expect } from '@playwright/test';
import { getDevUser, getAccessToken, apiHeaders } from '../helpers/auth';
import { createProcessDefinition, publishProcessDefinition, archiveProcessDefinition } from '../helpers/api';
import { selectMuiDropdownByValue } from '../helpers/selectors';
import { NO_NAMESPACE_START_EVENT_BPMN } from '../helpers/test-data';

test.describe.serial('process studio: first Start Event field survives save, reload, and publish', () => {
  let defId: string;
  let processName: string;
  let token: string;

  test.beforeAll(async ({ request }) => {
    const user = getDevUser();
    token = await getAccessToken(request, user);
    processName = `E2E Regression Process ${Date.now()}`;
    const body = await createProcessDefinition(request, token, {
      name: processName,
      slug: `e2e-regression-${Date.now()}`,
      description: 'Playwright seed: no camunda namespace, no formFields yet',
      bpmnXml: NO_NAMESPACE_START_EVENT_BPMN,
    });
    defId = body.id;

    // Sanity: confirm the seed truly reproduces the previously-broken scenario.
    expect(body.bpmn_xml).not.toContain('xmlns:camunda');
    expect(body.bpmn_xml).not.toContain('camunda:formFields');
  });

  test.afterAll(async ({ request }) => {
    // Keep Process Studio / Service Catalog free of test pollution — archive
    // (not delete) so this seed doesn't linger as a real-looking process.
    if (defId) await archiveProcessDefinition(request, token, defId);
  });

  test('existing process can be opened in Process Studio', async ({ page }) => {
    await page.goto(`/processes/${defId}/studio`);
    await expect(page.getByRole('heading', { name: processName })).toBeVisible();
    await expect(page.locator('svg[data-element-id]')).toBeVisible();
  });

  test('Start Event field can be added and saved', async ({ page }) => {
    await page.goto(`/processes/${defId}/studio`);
    await expect(page.locator('svg[data-element-id]')).toBeVisible();

    await page.locator('[data-element-id="StartEvent_1"]').click();
    await expect(page.getByText('Start Form Fields')).toBeVisible();

    await page.getByText('Add start form field').click();
    const accordion = page.locator('.MuiAccordion-root').last();
    await accordion.getByText(/^Field \d+$/).click(); // expand the new field's accordion

    await accordion.getByLabel('Display label').fill('Urgency');
    await expect(accordion.getByLabel('Variable key')).toHaveValue('urgency');

    await selectMuiDropdownByValue(page, accordion.getByTestId('form-field-type-select'), 'select');
    await expect(accordion.getByText('Dropdown options')).toBeVisible();

    await accordion.getByText('Add option').click();
    await expect(accordion.getByLabel('Label', { exact: true })).toHaveCount(1);
    await accordion.getByLabel('Label', { exact: true }).nth(0).fill('Low');
    await accordion.getByText('Add option').click();
    await expect(accordion.getByLabel('Label', { exact: true })).toHaveCount(2);
    await accordion.getByLabel('Label', { exact: true }).nth(1).fill('High');

    await accordion.getByRole('checkbox', { name: 'Required field' }).check();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved!')).toBeVisible({ timeout: 15_000 });
  });

  test('BPMN XML persisted the field with xmlns:camunda and camunda:formFields', async ({ request }) => {
    const res = await request.get(`/api/v1/processes/definitions/${defId}`, { headers: apiHeaders(token) });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.bpmn_xml).toContain('xmlns:camunda=');
    expect(body.bpmn_xml).toContain('camunda:formFields=');

    const seMatch = body.bpmn_xml.match(/<(?:[a-zA-Z]+:)?startEvent\b[^>]*camunda:formFields="([^"]*)"/);
    expect(seMatch, 'startEvent should carry camunda:formFields').not.toBeNull();
    const fields = JSON.parse(decodeURIComponent(seMatch![1]));
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ key: 'urgency', label: 'Urgency', type: 'select', required: true });
    expect(fields[0].options).toContain('low');
    expect(fields[0].options).toContain('high');
  });

  test('field still exists after reload', async ({ page }) => {
    await page.goto(`/processes/${defId}/studio`);
    await expect(page.locator('svg[data-element-id]')).toBeVisible();
    await page.reload();
    await expect(page.locator('svg[data-element-id]')).toBeVisible();

    await page.locator('[data-element-id="StartEvent_1"]').click();
    await expect(page.getByText('Start Form Fields')).toBeVisible();
    await expect(page.getByText('Urgency')).toBeVisible();
  });

  test('process can be published', async ({ page }) => {
    await page.goto(`/processes/${defId}/studio`);
    await expect(page.locator('svg[data-element-id]')).toBeVisible();
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByText('Published!')).toBeVisible({ timeout: 15_000 });
  });
});
