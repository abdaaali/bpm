import { test, expect, APIRequestContext } from '@playwright/test';
import { getDevUser, getAccessToken, apiHeaders } from '../helpers/devUser';

/**
 * Flows 4-18 (see task spec). Deliberately seeded via a raw BPMN XML that has
 * NEITHER `xmlns:camunda` NOR `camunda:formFields` anywhere — this is exactly
 * the previously-broken scenario (an existing process opened for editing,
 * before its first form field is ever added). The fix is only proven if the
 * first field added in the UI survives Save, reload, Publish, and shows up in
 * New Request — not just for a brand-new process created from the in-app
 * empty template (which already declares xmlns:camunda and would pass even
 * with the bug present).
 */
const REGRESSION_BPMN = `<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
             xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
             xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
             xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
             xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
             targetNamespace="http://bpmn.io/schema/bpmn">
  <process id="Process_1" name="E2E Regression Process" isExecutable="true">
    <startEvent id="StartEvent_1" name="Start">
      <outgoing>Flow_1</outgoing>
    </startEvent>
    <userTask id="Activity_1" name="Review">
      <incoming>Flow_1</incoming>
      <outgoing>Flow_2</outgoing>
    </userTask>
    <endEvent id="EndEvent_1" name="End">
      <incoming>Flow_2</incoming>
    </endEvent>
    <sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1"/>
    <sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="EndEvent_1"/>
  </process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="152" y="82" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1_di" bpmnElement="Activity_1"><dc:Bounds x="250" y="60" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="412" y="82" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1"><di:waypoint x="188" y="100"/><di:waypoint x="250" y="100"/></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2"><di:waypoint x="350" y="100"/><di:waypoint x="412" y="100"/></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</definitions>`;

test.describe.serial('Process Studio -> Publish -> Service Catalog -> New Request (existing BPMN with no camunda namespace)', () => {
  let defId: string;
  let processName: string;
  let token: string;

  test.beforeAll(async ({ request }) => {
    const user = getDevUser();
    token = await getAccessToken(request, user);
    const stamp = Date.now();
    processName = `E2E Regression Process ${stamp}`;

    const res = await request.post('/api/v1/processes/definitions', {
      headers: apiHeaders(token),
      data: {
        name: processName,
        slug: `e2e-regression-${stamp}`,
        description: 'Playwright seed: no camunda namespace, no formFields yet',
        category: 'Playwright',
        bpmn_xml: REGRESSION_BPMN,
      },
    });
    expect(res.ok(), `seed create failed: ${res.status()} ${await res.text()}`).toBeTruthy();
    const body = await res.json();
    defId = body.id;

    // Sanity: confirm the seed truly reproduces the previously-broken scenario.
    expect(body.bpmn_xml).not.toContain('xmlns:camunda');
    expect(body.bpmn_xml).not.toContain('camunda:formFields');
  });

  test('existing process can be opened in Process Studio', async ({ page }) => {
    await page.goto(`/processes/${defId}/studio`);
    await expect(page.getByRole('heading', { name: processName })).toBeVisible();
    await expect(page.locator('svg[data-element-id]')).toBeVisible();
  });

  test('Start Event can be selected and a form field can be added', async ({ page }) => {
    await page.goto(`/processes/${defId}/studio`);
    await expect(page.locator('svg[data-element-id]')).toBeVisible();

    await page.locator('[data-element-id="StartEvent_1"]').click();
    await expect(page.getByText('Start Form Fields')).toBeVisible();

    await page.getByText('Add start form field').click();
    const accordion = page.locator('.MuiAccordion-root').last();
    await accordion.getByText(/^Field \d+$/).click(); // expand the new field's accordion

    await accordion.getByLabel('Display label').fill('Urgency');
    await expect(accordion.getByLabel('Variable key')).toHaveValue('urgency');

    await accordion.getByTestId('form-field-type-select').click();
    await page.locator('li[data-value="select"]').click();
    // Force the menu closed regardless of MUI's own close animation/timing —
    // its backdrop otherwise intercepts the very next click.
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toBeHidden();
    await expect(accordion.getByText('Dropdown options')).toBeVisible();

    await accordion.getByText('Add option').click();
    await expect(accordion.getByLabel('Label', { exact: true })).toHaveCount(1);
    await accordion.getByLabel('Label', { exact: true }).nth(0).fill('Low');
    await accordion.getByText('Add option').click();
    await expect(accordion.getByLabel('Label', { exact: true })).toHaveCount(2);
    await accordion.getByLabel('Label', { exact: true }).nth(1).fill('High');

    await accordion.getByRole('checkbox', { name: 'Required field' }).check();

    // Save
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Saved!')).toBeVisible({ timeout: 15_000 });
  });

  test('BPMN XML persisted the field and declares xmlns:camunda', async ({ request }) => {
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

  test('Service Catalog opens and New Request opens from the published process', async ({ page }) => {
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

  test('Urgency field appears in New Request, validation blocks submit until filled, then request can be submitted', async ({ page }) => {
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

  test('request appears in My Requests', async ({ page }) => {
    // Same bare-URL bounce-to-Home issue as the Service Catalog test — navigate
    // via the UI (My Work -> My Requests tab) instead of a hard goto.
    await page.goto('/home');
    await page.getByRole('main').getByRole('button', { name: 'My Work' }).click();
    await page.getByRole('tab', { name: 'My Requests' }).click();
    await page.getByPlaceholder(/Search by reference, title or service/).fill(processName);
    await expect(page.getByText(processName).first()).toBeVisible();
  });
});
