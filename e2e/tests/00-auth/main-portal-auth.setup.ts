import { test as setup, expect } from '@playwright/test';
import { getDevUser, loginViaKeycloak } from '../helpers/auth';

const authFile = '.auth/user.json';

// Real browser-driven Keycloak login (login-required flow), captured once as
// storageState and reused by every other main-portal test — the app relies on
// Keycloak's SSO session cookie, not app-side token storage, so storageState
// correctly reproduces "already logged in" on a fresh page.
setup('authenticate via Keycloak (seeded dev user)', async ({ page }) => {
  const user = getDevUser();
  await loginViaKeycloak(page, user);
  await expect(page).toHaveURL(/\/home/, { timeout: 30_000 });
  await page.context().storageState({ path: authFile });
});
