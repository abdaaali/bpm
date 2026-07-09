import { test, expect } from '@playwright/test';

test('mobile PWA: connect screen shows both BPM Platform and Contractor Portal modes', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/connect$/); // no connection chosen yet -> Guard redirects here
  await expect(page.getByText('BPM Field')).toBeVisible();
  await expect(page.getByText('BPM Platform', { exact: true })).toBeVisible();
  await expect(page.getByText('Contractor Portal', { exact: true })).toBeVisible();
});

test('mobile PWA: connect screen no longer exposes a custom server field', async ({ page }) => {
  // Removed per design request — the PWA always uses the current host /
  // configured proxy; users must not see or edit a server URL. connection.ts
  // still models `server` internally (setConn always passes '' now), this
  // only asserts the UI control is gone.
  await page.goto('/connect');
  await expect(page.getByLabel(/server/i)).toHaveCount(0);
  await expect(page.getByText(/optional.*server|server.*optional/i)).toHaveCount(0);
});

test('mobile PWA: BPM login screen renders the blue brand identity', async ({ page }) => {
  await page.goto('/connect');
  await page.getByText('BPM Platform', { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('BPM PLATFORM')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  // Hero background reflects the BPM (blue) brand gradient, not Contractor's (orange).
  const bg = await page.getByTestId('login-hero').evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain('gradient');
  expect(bg).not.toContain('255, 152, 0'); // not the contractor orange (#ff9800)
});

test('mobile PWA: Contractor login screen renders the orange brand identity', async ({ page }) => {
  await page.goto('/connect');
  await page.getByText('Contractor Portal', { exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText('CONTRACTOR PORTAL')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible(); // contractor mode logs in with email, not username
});
