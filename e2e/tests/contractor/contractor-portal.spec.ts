import { test, expect } from '@playwright/test';
import { getContractorUser, loginAsContractor, trackErrors, trackApiFailures } from './helpers';

test.beforeEach(async ({ page }) => {
  await loginAsContractor(page, getContractorUser());
});

test('dashboard loads after login', async ({ page }) => {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/^Welcome, /)).toBeVisible();
});

test('main navigation works and key pages load without console errors or failed API calls', async ({ page }) => {
  const errors = trackErrors(page);
  const apiFailures = trackApiFailures(page);

  await page.getByRole('button', { name: 'Work Orders' }).click();
  await expect(page).toHaveURL(/\/work-orders$/);
  await expect(page.getByRole('heading', { name: 'Work Orders' })).toBeVisible();

  await page.getByRole('button', { name: 'My Team' }).click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByRole('heading', { name: 'Team Overview' })).toBeVisible();

  await page.getByRole('button', { name: 'Notifications' }).click();
  await expect(page).toHaveURL(/\/notifications$/);
  await expect(page.getByRole('heading', { name: 'Notifications', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'My Profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible();

  await page.getByRole('button', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(/\/$/);

  expect(errors.errors, errors.errors.join('\n')).toEqual([]);
  expect(apiFailures.failures, apiFailures.failures.join('\n')).toEqual([]);
});

test('logout works', async ({ page }) => {
  await page.getByRole('button', { name: 'A', exact: true }).click(); // avatar initial for "Ahmed Al-Hassan"
  await page.getByText('Logout').click();
  await expect(page).toHaveURL(/\/login$/);
});

test('contractor work order flow: accept a pending work order if one exists', async ({ page }) => {
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
