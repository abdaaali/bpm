import { test, expect } from '@playwright/test';

// Uses the storageState captured by main-portal-auth.setup.ts (already authenticated).
test('main portal: dashboard loads for an authenticated user', async ({ page }) => {
  await page.goto('/home');
  await expect(page).toHaveURL(/\/home/);
  await expect(page.getByText('Pick an application to get started, or jump to what needs your attention.')).toBeVisible();
  await expect(page.getByRole('main').getByRole('button', { name: 'My Work' })).toBeVisible();
});
