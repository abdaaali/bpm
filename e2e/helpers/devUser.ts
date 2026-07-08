import fs from 'fs';
import path from 'path';
import type { APIRequestContext } from '@playwright/test';

// Reads seeded dev credentials from the repo's own Keycloak realm import fixture
// at runtime, instead of hardcoding any secret string in test source. This file
// is local dev-only seed data (infra/keycloak/realm-export.json), never real
// production secrets.
const REALM_EXPORT_PATH = path.resolve(__dirname, '../../infra/keycloak/realm-export.json');

export interface DevUser {
  username: string;
  password: string;
  email: string;
}

// Default to "admin" (role: admin, permissions: ['*'] per services/api-gateway/src/auth/permissions.ts)
// since the E2E suite spans process design (processes:design), publishing, and
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
// data via API calls; the actual "Login works" flow is tested through the real
// browser UI login in login.spec.ts, not via this token.
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
