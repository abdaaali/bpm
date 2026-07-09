import fs from 'fs';
import path from 'path';
import type { APIRequestContext, Page } from '@playwright/test';

// ── Main Portal (Keycloak) ──────────────────────────────────────────────────
// Reads seeded dev credentials from the repo's own Keycloak realm import fixture
// at runtime, instead of hardcoding any secret string in test source. This file
// is local dev-only seed data (infra/keycloak/realm-export.json), never real
// production secrets.
const REALM_EXPORT_PATH = path.resolve(__dirname, '../../../infra/keycloak/realm-export.json');

export interface DevUser {
  username: string;
  password: string;
  email: string;
}

// Default to "admin" (role: admin, permissions: ['*'] per services/api-gateway/src/auth/permissions.ts)
// since the main-portal suite spans process design (processes:design), publishing, and
// request submission — no single non-admin seeded role covers all of that.
export function getDevUser(username = process.env.E2E_USERNAME || 'admin'): DevUser {
  const realm = JSON.parse(fs.readFileSync(REALM_EXPORT_PATH, 'utf8'));
  const user = (realm.users || []).find((u: any) => u.username === username);
  if (!user) throw new Error(`Seeded dev user "${username}" not found in infra/keycloak/realm-export.json`);
  const cred = (user.credentials || []).find((c: any) => c.type === 'password');
  const password = process.env.E2E_PASSWORD || cred?.value;
  if (!password) throw new Error(`No password found for seeded dev user "${username}" in realm-export.json`);
  return { username: user.username, password, email: user.email };
}

export const KEYCLOAK_URL = process.env.E2E_KEYCLOAK_URL || 'http://localhost:8443';
export const KEYCLOAK_REALM = process.env.E2E_KEYCLOAK_REALM || 'bpm';
export const KEYCLOAK_CLIENT_ID = process.env.E2E_KEYCLOAK_CLIENT_ID || 'bpm-frontend';

// Direct Access Grant (Resource Owner Password) — used only to seed/verify test
// data via API calls; the actual "login works" flow is tested through the real
// browser UI login, not via this token.
export async function getAccessToken(request: APIRequestContext, user: DevUser): Promise<string> {
  const res = await request.post(
    `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/token`,
    {
      form: {
        grant_type: 'password',
        client_id: KEYCLOAK_CLIENT_ID,
        username: user.username,
        password: user.password,
      },
    },
  );
  if (!res.ok()) {
    throw new Error(`Keycloak token request failed: ${res.status()} ${await res.text()}`);
  }
  const body = await res.json();
  return body.access_token as string;
}

export function apiHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/** Real browser-driven Keycloak login (login-required redirect flow). */
export async function loginViaKeycloak(page: Page, user: DevUser) {
  await page.goto('/');
  await page.waitForURL(/\/realms\/[^/]+\/protocol\/openid-connect\/auth/, { timeout: 30_000 });
  await page.locator('#username').fill(user.username);
  await page.locator('#password').fill(user.password);
  await page.locator('#kc-login').click();
  await page.waitForURL(url => !/\/realms\//.test(url.pathname), { timeout: 30_000 });
}

// ── Contractor Portal (own JWT login form) ──────────────────────────────────
// Reads the seeded contractor demo password from the repo's own seed SQL comment
// at runtime, instead of hardcoding it a second time in test source (same approach
// as the Keycloak realm above). Local dev-only fixture data.
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

// ── Mobile PWA (dual-mode: BPM Platform via Keycloak, or Contractor Portal) ─
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
