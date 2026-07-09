import { defineConfig, devices } from '@playwright/test';

const MAIN_PORTAL_BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8080';
const CONTRACTOR_BASE_URL = process.env.E2E_CONTRACTOR_BASE_URL || 'http://localhost:8081';
const MOBILE_BASE_URL = process.env.E2E_MOBILE_BASE_URL || 'http://localhost:8082';
// api-gateway direct — the real /api/v1/processes|tasks surface these tests
// drive. A couple of orchestrator-only routes api-gateway doesn't proxy (e.g.
// the approval-result callback) are called via fully-qualified URLs in
// tests/helpers/api.ts (ORCHESTRATOR_URL), independent of this baseURL.
const BACKEND_WORKFLOW_BASE_URL = process.env.E2E_API_GATEWAY_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // flows share seeded process-definition state (serial by design)
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  use: {
    baseURL: MAIN_PORTAL_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // Keycloak-authenticated storageState setup, consumed only by main-portal.
    { name: 'setup', testDir: './tests/00-auth', testMatch: /\.setup\.ts$/ },
    {
      name: 'main-portal',
      testDir: './tests',
      testMatch: [/00-auth\/.*\.spec\.ts$/, /01-main-portal\/.*\.spec\.ts$/],
      use: { ...devices['Desktop Chrome'], baseURL: MAIN_PORTAL_BASE_URL, storageState: '.auth/user.json' },
      dependencies: ['setup'],
    },
    // Separate app, port 8081, own JWT login form — no Keycloak/storageState needed.
    {
      name: 'contractor-portal',
      testDir: './tests/02-contractor-portal',
      use: { ...devices['Desktop Chrome'], baseURL: CONTRACTOR_BASE_URL },
    },
    // Separate app, port 8082, dual-mode connect+login — tested at a mobile viewport.
    {
      name: 'mobile-pwa',
      testDir: './tests/03-mobile-pwa',
      use: { ...devices['Pixel 7'], baseURL: MOBILE_BASE_URL },
    },
    // Backend/API-only diagnostics against bpm-orchestrator directly — no browser.
    {
      name: 'backend-workflow',
      testDir: './tests/04-backend-workflow',
      use: { baseURL: BACKEND_WORKFLOW_BASE_URL },
    },
  ],
});
