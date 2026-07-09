import { test, expect } from '@playwright/test';
import { getContractorUser, loginAsContractor } from '../helpers/auth';
import { trackErrors, trackApiFailures } from '../helpers/api';

test.beforeEach(async ({ page }) => {
  await loginAsContractor(page, getContractorUser());
});

test('contractor portal: dashboard loads after login', async ({ page }) => {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/^Welcome, /)).toBeVisible();
});

test('contractor portal: main navigation works and key pages load without console/API errors', async ({ page }) => {
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

test('contractor portal: logout works', async ({ page }) => {
  await page.getByRole('button', { name: 'A', exact: true }).click(); // avatar initial for "Ahmed Al-Hassan"
  await page.getByText('Logout').click();
  await expect(page).toHaveURL(/\/login$/);
});
