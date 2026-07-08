import fs from 'fs';
import path from 'path';
import type { Page } from '@playwright/test';

// Reads the seeded contractor demo password from the repo's own seed SQL comment
// at runtime, instead of hardcoding it a second time in test source (same approach
// as e2e/helpers/devUser.ts for the Keycloak realm). Local dev-only fixture data.
const SEED_SQL_PATH = path.resolve(__dirname, '../../../infra/db/seeds-demo/004_contractor_demo.sql');

export interface ContractorUser { email: string; password: string; }

export function getContractorUser(email = process.env.E2E_CONTRACTOR_EMAIL || 'alpha.supervisor@alpha-field.example.com'): ContractorUser {
  const sql = fs.readFileSync(SEED_SQL_PATH, 'utf8');
  const match = sql.match(/Password for all external users:\s*(\S+)/);
  const password = process.env.E2E_CONTRACTOR_PASSWORD || match?.[1];
  if (!password) throw new Error('Could not find contractor demo password in infra/db/seeds-demo/004_contractor_demo.sql');
  return { email, password };
}

export async function loginAsContractor(page: Page, user: ContractorUser) {
  await page.goto('/login');
  await page.getByLabel('Email Address').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15_000 });
}

/** Collects console errors + uncaught page errors for the duration of a test. */
export function trackErrors(page: Page): { errors: string[] } {
  const state = { errors: [] as string[] };
  page.on('console', msg => { if (msg.type() === 'error') state.errors.push(`console.error: ${msg.text()}`); });
  page.on('pageerror', err => state.errors.push(`pageerror: ${err.message}`));
  return state;
}

/** Collects failed (4xx/5xx) API responses for the duration of a test. */
export function trackApiFailures(page: Page, pathPrefix = '/api/'): { failures: string[] } {
  const state = { failures: [] as string[] };
  page.on('response', res => {
    if (res.url().includes(pathPrefix) && res.status() >= 400) {
      state.failures.push(`${res.status()} ${res.request().method()} ${res.url()}`);
    }
  });
  return state;
}
