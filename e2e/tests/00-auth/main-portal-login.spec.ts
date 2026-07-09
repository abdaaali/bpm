import { test, expect } from '@playwright/test';
import { getDevUser, loginViaKeycloak } from '../helpers/auth';

// Tested standalone with NO storageState, so this exercises the real
// unauthenticated -> Keycloak redirect -> back flow, independent of
// main-portal-auth.setup.ts's cached session.
test.use({ storageState: { cookies: [], origins: [] } });

test('main portal: login redirects to dashboard', async ({ page }) => {
  const user = getDevUser();
  await loginViaKeycloak(page, user);
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
  await expect(page.getByRole('main').getByRole('button', { name: 'My Work' })).toBeVisible();
});
