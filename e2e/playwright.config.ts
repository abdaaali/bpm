import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:8080';
const CONTRACTOR_BASE_URL = process.env.E2E_CONTRACTOR_BASE_URL || 'http://localhost:8081';
const MOBILE_BASE_URL = process.env.E2E_MOBILE_BASE_URL || 'http://localhost:8082';

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
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    // frontend-portal (Keycloak-authenticated main portal)
    { name: 'setup', testDir: './tests', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      testDir: './tests',
      testIgnore: [/contractor\//, /mobile\//],
      use: { ...devices['Desktop Chrome'], storageState: '.auth/user.json' },
      dependencies: ['setup'],
    },
    // contractor-portal (separate app, port 8081, own JWT login form — no Keycloak/storageState needed)
    {
      name: 'contractor-portal',
      testDir: './tests/contractor',
      use: { ...devices['Desktop Chrome'], baseURL: CONTRACTOR_BASE_URL },
    },
    // mobile-pwa (separate app, port 8082, dual-mode connect+login — tested at a mobile viewport)
    {
      name: 'mobile-pwa',
      testDir: './tests/mobile',
      use: { ...devices['Pixel 7'], baseURL: MOBILE_BASE_URL },
    },
  ],
});
