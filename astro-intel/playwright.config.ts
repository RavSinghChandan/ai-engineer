import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: a throwaway backend copy (e2e/start-backend.sh) plus `ng serve`.
// The app is opened as http://e2e.astro.test:4200 (mapped to this machine), not
// localhost: on localhost the login page auto-signs-in with the dev admin account,
// which hides the real sign-in flow and trips the failed-login lockout.
// Run with: npx playwright test   ·   report: npx playwright show-report
// `npm run e2e:live` sets E2E_LIVE=1: only the @live tests run, against the real
// DeepSeek API (paid, slow). The normal run skips them.
const LIVE = process.env['E2E_LIVE'] === '1';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://e2e.astro.test:4200',
    launchOptions: { args: ['--host-resolver-rules=MAP e2e.astro.test 127.0.0.1'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: LIVE
    ? [{ name: 'live', use: { ...devices['Desktop Chrome'] }, grep: /@live/, timeout: 600_000 }]
    : [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] }, grepInvert: /@live/ },
        { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@mobile/ },
      ],
  webServer: [
    {
      command: './e2e/start-backend.sh',
      url: 'http://localhost:8080/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx ng serve --host 127.0.0.1 --port 4200 --allowed-hosts',
      url: 'http://127.0.0.1:4200',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
