import type { Page } from '@playwright/test';
import { getContractorUser, trackErrors, trackApiFailures } from '../contractor/helpers';
import { getDevUser } from '../../helpers/devUser';

export { getContractorUser, trackErrors, trackApiFailures, getDevUser };

/** Connect screen -> pick a mode ("BPM Platform" or "Contractor Portal") -> Login screen. */
export async function connectToMode(page: Page, modeTitle: 'BPM Platform' | 'Contractor Portal') {
  await page.goto('/connect');
  await page.getByText(modeTitle, { exact: true }).click();
  await page.waitForURL(/\/login$/, { timeout: 10_000 });
}

export async function loginOnPwa(page: Page, username: string, password: string) {
  await page.getByLabel(/Email|Username/).fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15_000 });
}
