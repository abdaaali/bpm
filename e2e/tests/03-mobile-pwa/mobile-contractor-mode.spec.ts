import { test, expect } from '@playwright/test';
import { connectToMode, loginOnPwa, getContractorUser } from '../helpers/auth';
import { trackErrors, trackApiFailures } from '../helpers/api';

test('mobile PWA: contractor mode login works, main screens load, navigation works, no console/API errors', async ({ page }) => {
  const errors = trackErrors(page);
  const apiFailures = trackApiFailures(page);
  const user = getContractorUser();

  await connectToMode(page, 'Contractor Portal');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await loginOnPwa(page, user.email, user.password);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('BPM Field')).toBeVisible();

  // Contractor mode has 2 bottom-nav tabs: Work Orders (default) and Account.
  await expect(page.getByRole('list')).toBeVisible(); // work orders list container renders
  await page.getByRole('button', { name: 'Account' }).click();
  await expect(page.getByText('Switch connection')).toBeVisible();
  await expect(page.getByText('Sign out')).toBeVisible();

  await page.getByRole('button', { name: 'Work Orders' }).click();

  expect(errors.errors, errors.errors.join('\n')).toEqual([]);
  expect(apiFailures.failures, apiFailures.failures.join('\n')).toEqual([]);
});

test('mobile PWA: opening a work order from the list loads its detail without error', async ({ page }) => {
  const errors = trackErrors(page);
  await connectToMode(page, 'Contractor Portal');
  await loginOnPwa(page, getContractorUser().email, getContractorUser().password);
  await expect(page).toHaveURL(/\/$/);

  // isVisible() alone doesn't wait/retry -- it races the async GET /work-orders
  // fetch and can see "not rendered yet", wrongly skipping every run.
  // expect(...).toBeVisible() retries until the list actually renders (or times out).
  const firstRow = page.locator('.MuiListItemButton-root').first();
  const hasWorkOrders = await expect(firstRow).toBeVisible({ timeout: 8_000 }).then(() => true).catch(() => false);
  test.skip(!hasWorkOrders, 'No work orders visible for this contractor user right now.');

  await firstRow.click();
  await expect(page).toHaveURL(/\/wo\/.+/);
  await expect(page.locator('.MuiAppBar-root')).toBeVisible();

  expect(errors.errors, errors.errors.join('\n')).toEqual([]);
});

test('mobile PWA: invalid login fails gracefully', async ({ page }) => {
  await connectToMode(page, 'Contractor Portal');
  await page.getByLabel(/Email|Username/).fill('alpha.supervisor@alpha-field.example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: /Sign in/i }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/login$/); // stayed on login, no crash
});

test('mobile PWA: app remains usable after a reload', async ({ page }) => {
  await connectToMode(page, 'Contractor Portal');
  await loginOnPwa(page, getContractorUser().email, getContractorUser().password);
  await expect(page).toHaveURL(/\/$/);

  await page.reload();

  // A stale/broken service worker or manifest would leave the app on a blank
  // or crashed screen after reload instead of re-rendering the shell.
  await expect(page.getByText('BPM Field')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Work Orders' })).toBeVisible();
});
