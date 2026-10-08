import { defineConfig, devices } from '@playwright/test';

// Pruebas E2E del portal. Localmente levantan `npm start`; en QA se ejecutan contra el
// ambiente desplegado definiendo BASE_URL.
const baseURL = process.env['BASE_URL'] ?? 'http://localhost:4200';
const enCI = !!process.env['CI'];

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: enCI,
  retries: enCI ? 2 : 0,
  reporter: enCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env['BASE_URL']
    ? undefined
    : { command: 'npm start', url: baseURL, reuseExistingServer: !enCI, timeout: 120_000 },
});
