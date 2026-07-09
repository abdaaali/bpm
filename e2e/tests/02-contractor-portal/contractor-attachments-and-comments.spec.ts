import { test, expect } from '@playwright/test';
import path from 'path';
import { getContractorUser, loginAsContractor } from '../helpers/auth';
import { trackErrors } from '../helpers/api';
import { WO2_ID } from '../helpers/test-data';

test.beforeEach(async ({ page }) => {
  await loginAsContractor(page, getContractorUser('alpha.tech1@alpha-field.example.com'));
  await page.goto(`/work-orders/${WO2_ID}`);
  await expect(page.getByRole('tab', { name: /Work Order Details/i })).toBeVisible({ timeout: 10_000 });
});

test('contractor portal: PDF upload is tagged as a document, not a photo', async ({ page }) => {
  const errors = trackErrors(page);
  await page.getByRole('tab', { name: /Attachments/ }).click();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'sample.pdf'));

  // Root cause: upload always hardcoded attachmentType='photo' regardless of the
  // actual file; a PDF must now show the 'document' chip, not 'photo'.
  // .last(): re-running this test accumulates same-named attachments (the app
  // doesn't dedupe by filename) — the most recently uploaded card is always the
  // one this run just created.
  const card = page.locator('.MuiCard-root.MuiPaper-outlined').filter({ hasText: 'sample.pdf' }).last();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(card.getByText('document', { exact: true })).toBeVisible();
  await expect(card.getByText('photo', { exact: true })).toHaveCount(0);

  expect(errors.errors, errors.errors.join('\n')).toEqual([]);
});

test('contractor portal: chat message is attributed to the contractor, not mislabeled "(Operator)"', async ({ page }) => {
  const errors = trackErrors(page);
  await page.getByRole('tab', { name: /Communication/ }).click();

  const msg = `E2E regression check ${Date.now()}`;
  await page.getByPlaceholder('Send a message to the operator...').fill(msg);
  await page.getByRole('button').filter({ has: page.locator('svg[data-testid="SendIcon"]') }).click();

  const bubble = page.getByText(msg).locator('xpath=ancestor::div[2]');
  await expect(bubble).toBeVisible({ timeout: 10_000 });
  // Root cause: author_id used to resolve to an arbitrary internal user, so the
  // contractor's own message rendered as "<name> (Operator)". It must NOT show
  // that label now that author_id is the contractor's own id.
  await expect(bubble.getByText('(Operator)')).toHaveCount(0);

  expect(errors.errors, errors.errors.join('\n')).toEqual([]);
});
