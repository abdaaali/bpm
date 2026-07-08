import { test, expect } from '@playwright/test';

// Flow 1: app opens successfully. Flow 3: dashboard loads.
// Uses the storageState captured by auth.setup.ts (already authenticated).
test('app opens and dashboard loads', async ({ page }) => {
  await page.goto('/home');
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText('Pick an application to get started, or jump to what needs your attention.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'My Work' })).toBeVisible();
});
