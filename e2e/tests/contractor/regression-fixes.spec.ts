import { test, expect } from '@playwright/test';
import path from 'path';
import { getContractorUser, loginAsContractor, trackErrors } from './helpers';

// alpha.tech1 owns WO2 (f3000000-...002), seeded status 'in_progress' -- a
// work order that's still actionable (canAct = status not in closed/rejected)
// but NOT 'pending', which is exactly what these regression tests need:
// a work order where Accept must NOT show, and where chat/upload/progress
// actions are all available.
const WO2_ID = 'f3000000-0000-0000-0000-000000000002';

test.describe('regression: WorkOrderDetail bug fixes', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsContractor(page, getContractorUser('alpha.tech1@alpha-field.example.com'));
    await page.goto(`/work-orders/${WO2_ID}`);
    await expect(page.getByRole('tab', { name: /Work Order Details/i })).toBeVisible({ timeout: 10_000 });
  });

  test('chat message is attributed to me, not mislabeled "(Operator)"', async ({ page }) => {
    const errors = trackErrors(page);
    await page.getByRole('tab', { name: /Communication/ }).click();

    const msg = `E2E regression check ${Date.now()}`;
    await page.getByPlaceholder('Send a message to the operator...').fill(msg);
    await page.getByRole('button').filter({ has: page.locator('svg[data-testid="SendIcon"]') }).click();

    const bubble = page.getByText(msg).locator('xpath=ancestor::div[2]');
    await expect(bubble).toBeVisible({ timeout: 10_000 });
    // Root cause fixed: author_id used to resolve to an arbitrary internal user,
    // so the contractor's own message rendered as "<name> (Operator)". It must
    // NOT show that label now that author_id is the contractor's own id.
    await expect(bubble.getByText('(Operator)')).toHaveCount(0);

    expect(errors.errors, errors.errors.join('\n')).toEqual([]);
  });

  test('uploading a PDF is tagged as a document, not a photo', async ({ page }) => {
    const errors = trackErrors(page);
    await page.getByRole('tab', { name: /Attachments/ }).click();

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures', 'sample.pdf'));

    // Root cause fixed: upload always hardcoded attachmentType='photo' regardless
    // of the actual file; a PDF must now show the 'document' chip, not 'photo'.
    // .last(): re-running this test accumulates same-named attachments (the app
    // doesn't dedupe by filename, and isn't expected to) -- the most recently
    // uploaded card is always the one this run just created.
    const card = page.locator('.MuiCard-root.MuiPaper-outlined').filter({ hasText: 'sample.pdf' }).last();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await expect(card.getByText('document', { exact: true })).toBeVisible();
    await expect(card.getByText('photo', { exact: true })).toHaveCount(0);

    expect(errors.errors, errors.errors.join('\n')).toEqual([]);
  });

  test('progress update requires notes before it can be submitted', async ({ page }) => {
    await page.getByRole('button', { name: 'Update Progress' }).click();
    const submitBtn = page.getByRole('button', { name: 'Submit Update' });

    // Root cause fixed: this button had no required-field guard (unlike every
    // other dialog: Reject, Complete, Clarification, Reschedule) and could be
    // clicked with an empty note.
    await expect(submitBtn).toBeDisabled();

    await page.getByLabel('Progress Notes').fill('E2E: verified guard now blocks empty submit');
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();
    await expect(page.getByRole('button', { name: 'Update Progress' })).toBeVisible({ timeout: 10_000 }); // dialog closed
  });
});
