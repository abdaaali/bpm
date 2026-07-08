import { test as setup, expect } from '@playwright/test';
import { getDevUser } from '../helpers/devUser';

const authFile = '.auth/user.json';

// Real browser-driven Keycloak login (login-required flow), captured once as
// storageState and reused by every other test in the "chromium" project — the
// app relies on Keycloak's SSO session cookie, not app-side token storage, so
// storageState correctly reproduces "already logged in" on a fresh page.
setup('authenticate via Keycloak (seeded dev user)', async ({ page }) => {
  const user = getDevUser();

  await page.goto('/');
  await page.waitForURL(/\/realms\/[^/]+\/protocol\/openid-connect\/auth/, { timeout: 30_000 });

  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#kc-login').click();

  await page.waitForURL(url => !/\/realms\//.test(url.pathname), { timeout: 30_000 });
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });

  await page.context().storageState({ path: authFile });
});
