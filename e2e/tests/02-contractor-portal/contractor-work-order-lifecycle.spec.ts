import { test, expect } from '@playwright/test';
import { getContractorUser, loginAsContractor } from '../helpers/auth';
import { trackErrors } from '../helpers/api';
import { WO2_ID } from '../helpers/test-data';

test.beforeEach(async ({ page }) => {
  await loginAsContractor(page, getContractorUser());
});

test('contractor portal: accepting a pending work order updates its status', async ({ page }) => {
  const errors = trackErrors(page);

  await Promise.all([
    page.waitForResponse(r => r.url().includes('/api/ext/work-orders') && r.request().method() === 'GET'),
    page.goto('/work-orders?status=pending'),
  ]);
  const rows = page.locator('table tbody tr', { hasText: 'Pending' });
  const count = await rows.count();
  test.skip(count === 0, 'No pending work order in seed data for this user right now (already accepted by a previous run) — nothing to test.');

  await rows.first().getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/work-orders\/.+/);

  const acceptBtn = page.getByRole('button', { name: 'Accept', exact: true });
  await expect(acceptBtn).toBeVisible();
  await acceptBtn.click();

  // Status chip flips from "Awaiting Acceptance" and the Accept/Reject actions disappear.
  await expect(acceptBtn).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText(/accepted/i).first()).toBeVisible();

  expect(errors.errors, errors.errors.join('\n')).toEqual([]);
});

test('contractor portal: progress update requires notes before it can be submitted', async ({ page }) => {
  await page.goto(`/work-orders/${WO2_ID}`);
  await expect(page.getByRole('tab', { name: /Work Order Details/i })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Update Progress' }).click();
  const submitBtn = page.getByRole('button', { name: 'Submit Update' });

  // Root cause: this button had no required-field guard (unlike every other
  // dialog: Reject, Complete, Clarification, Reschedule) and could be clicked
  // with an empty note.
  await expect(submitBtn).toBeDisabled();

  await page.getByLabel('Progress Notes').fill('E2E: verified guard now blocks empty submit');
  await expect(submitBtn).toBeEnabled();
  await submitBtn.click();
  await expect(page.getByRole('button', { name: 'Update Progress' })).toBeVisible({ timeout: 10_000 }); // dialog closed
});
