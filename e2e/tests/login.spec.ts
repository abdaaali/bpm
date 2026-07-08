import { test, expect } from '@playwright/test';
import { getDevUser } from '../helpers/devUser';

// Flow 2: Login works — tested standalone with NO storageState, so this
// exercises the real unauthenticated -> Keycloak redirect -> back flow,
// independent of auth.setup.ts's cached session.
test.use({ storageState: { cookies: [], origins: [] } });

test('login works via Keycloak', async ({ page }) => {
  const user = getDevUser();

  await page.goto('/');
  await page.waitForURL(/\/realms\/[^/]+\/protocol\/openid-connect\/auth/, { timeout: 30_000 });

  await expect(page.locator('#username')).toBeVisible();
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#kc-login').click();

  await page.waitForURL(url => !/\/realms\//.test(url.pathname), { timeout: 30_000 });
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
  await expect(page.getByRole('main').getByRole('button', { name: 'My Work' })).toBeVisible();
});
