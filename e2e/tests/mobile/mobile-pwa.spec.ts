import { test, expect } from '@playwright/test';
import { connectToMode, loginOnPwa, getContractorUser, getDevUser, trackErrors, trackApiFailures } from './helpers';

test('app opens at a mobile viewport and shows the connect screen with both modes', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/connect$/); // no connection chosen yet -> Guard redirects here
  await expect(page.getByText('BPM Field')).toBeVisible();
  await expect(page.getByText('BPM Platform', { exact: true })).toBeVisible();
  await expect(page.getByText('Contractor Portal', { exact: true })).toBeVisible();
});

test('contractor mode: login works, main screens load, navigation works, no console/API errors', async ({ page }) => {
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

test('contractor mode: opening a work order from the list loads its detail without error', async ({ page }) => {
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

test('regression: work order status/accept-button reflect real assignment_status, not always "pending"', async ({ page }) => {
  // Root cause fixed: WorkOrderDetail.tsx read `w.status` (a field the backend
  // never returns -- the column is `assignment_status`), so `st` was always ''
  // and the Accept button showed for every work order regardless of real state.
  // WO2 (alpha.tech1) is seeded 'in_progress', so Accept must NOT appear, and
  // the status chip must show the real status, not the 'open' fallback.
  await connectToMode(page, 'Contractor Portal');
  await loginOnPwa(page, 'alpha.tech1@alpha-field.example.com', getContractorUser().password);
  await page.goto('/wo/f3000000-0000-0000-0000-000000000002');

  await expect(page.getByText('in progress', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Accept' })).toHaveCount(0);
  await expect(page.getByText('open', { exact: true })).toHaveCount(0);
});

test('bpm mode: login works (admin, Keycloak), Cases screen loads', async ({ page }) => {
  const errors = trackErrors(page);
  const admin = getDevUser('admin');

  await connectToMode(page, 'BPM Platform');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await loginOnPwa(page, admin.username, admin.password);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('BPM Field')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cases' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Account' })).toBeVisible();

  expect(errors.errors, errors.errors.join('\n')).toEqual([]);
});

test('login fails gracefully with invalid credentials', async ({ page }) => {
  await connectToMode(page, 'Contractor Portal');
  await page.getByLabel(/Email|Username/).fill('alpha.supervisor@alpha-field.example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: /Sign in/i }).click();
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 10_000 });
  await expect(page).toHaveURL(/\/login$/); // stayed on login, no crash
});
